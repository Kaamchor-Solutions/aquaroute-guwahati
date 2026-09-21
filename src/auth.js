/**
 * Accounts for AquaRoute, built on what the Workers runtime already provides.
 *
 * There is no auth library here on purpose. NextAuth needs Next.js, which this
 * app is not, and Auth.js would pull a bundler into a project that has no build
 * step. Everything below is Web Crypto, which the runtime ships with.
 *
 * The four rules this file exists to keep:
 *
 *   1. A password is never stored. PBKDF2 with a random salt is, and the
 *      iteration count is stored per user so it can be raised later without
 *      invalidating anybody.
 *   2. A usable session token is never stored either. The cookie carries the
 *      token; the table carries its SHA-256 hash. A leaked database does not
 *      let anyone sign in as anyone.
 *   3. Every comparison of a secret is constant time.
 *   4. Sign-in failures are counted and slowed down, because an unthrottled
 *      login form is a password guessing machine.
 *
 * Sign in with Google was added in v7. It is genuinely free and needs no
 * billing account, unlike Google Maps. The token it hands the browser is
 * verified here against Google's published keys rather than trusted, because a
 * token the client gives us is just a string until we have checked who signed
 * it, that it was meant for us, and that it has not expired.
 */

// Workers refuses a single PBKDF2 call above 100,000 iterations outright:
//   NotSupportedError: iteration counts above 100000 are not supported
// It is a hard platform ceiling, and it does not apply locally, so this only
// shows up once you deploy. The work is therefore chained instead: each pass
// feeds its output in as the next pass's password, so three passes cost an
// attacker three times as much as one. OWASP asks for 600,000 for
// PBKDF2-SHA256; 300,000 is what fits inside a free Worker's CPU budget, and
// the count is stored per user so it can be raised without locking anyone out.
const MAX_PER_CALL = 100_000;
const ITERATIONS = 300_000;
const SESSION_DAYS = 30;
const MAX_FAILS = 8;                 // per window, per IP
const FAIL_WINDOW = 15 * 60;         // seconds
const MIN_PASSWORD = 10;

const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (bytes) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

/** Always walks the whole string, so timing reveals nothing about the secret. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const sha256Hex = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/* ------------------------------------------------------------- passwords */

async function derive(password, saltHex, iterations) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  let material = enc.encode(password);
  let remaining = iterations;
  let bits = null;

  while (remaining > 0) {
    const round = Math.min(remaining, MAX_PER_CALL);
    const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
    bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: round }, key, 256,
    );
    material = new Uint8Array(bits);
    remaining -= round;
  }

  return hex(bits);
}

export async function hashPassword(password) {
  const saltHex = randomHex(16);
  return { hash: await derive(password, saltHex, ITERATIONS), salt: saltHex, iterations: ITERATIONS };
}

export async function verifyPassword(password, user) {
  const attempt = await derive(password, user.pw_salt, user.pw_iterations);
  return safeEqual(attempt, user.pw_hash);
}

/* -------------------------------------------------------------- throttle */

async function whoHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  return (await sha256Hex((env.REPORTER_SALT || 'aquaroute-local-salt') + ip)).slice(0, 20);
}

async function tooManyFailures(request, env) {
  const who = await whoHash(request, env);
  await env.DB.prepare(`DELETE FROM login_attempts WHERE at < ?`).bind(now() - FAIL_WINDOW).run();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM login_attempts WHERE who = ? AND at > ?`,
  ).bind(who, now() - FAIL_WINDOW).first();
  return (row?.n ?? 0) >= MAX_FAILS;
}

async function recordFailure(request, env) {
  await env.DB.prepare(`INSERT INTO login_attempts (who, at) VALUES (?, ?)`)
    .bind(await whoHash(request, env), now()).run();
}

/* -------------------------------------------------------------- sessions */

export async function createSession(env, userId) {
  const token = randomHex(32);
  const expires = now() + SESSION_DAYS * 86400;
  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
  ).bind(await sha256Hex(token), userId, now(), expires).run();
  return { token, expires };
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Returns the signed-in user, or null. Cheap enough to call on every request. */
export async function currentUser(request, env) {
  const token = readCookie(request, 'aq_session');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;

  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256Hex(token), now()).first();

  if (!row) return null;
  return { id: row.id, email: row.email, name: row.display_name };
}

export async function destroySession(request, env) {
  const token = readCookie(request, 'aq_session');
  if (token) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`)
      .bind(await sha256Hex(token)).run();
  }
}

/* The cookie the browser gets. HttpOnly means page scripts cannot read it, so a
   cross-site scripting bug cannot walk off with somebody's session. */
function sessionCookie(token, expires, secure) {
  return [
    `aq_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Max-Age=${SESSION_DAYS * 86400}`,
  ].filter(Boolean).join('; ');
}

const clearCookie = (secure) =>
  ['aq_session=', 'Path=/', 'HttpOnly', 'SameSite=Lax', secure ? 'Secure' : '', 'Max-Age=0']
    .filter(Boolean).join('; ');

/* ------------------------------------------------------------- endpoints */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const bad = (message, status = 400) => json({ ok: false, error: message }, status);

const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const isSecure = (request) => new URL(request.url).protocol === 'https:';

export async function register(request, env) {
  let body;
  try { body = await request.json(); } catch { return bad('That did not arrive properly.'); }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim().slice(0, 60);

  if (!looksLikeEmail(email)) return bad('That does not look like an email address.');
  if (password.length < MIN_PASSWORD) {
    return bad(`Please use at least ${MIN_PASSWORD} characters. Length matters more than symbols.`);
  }

  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
  if (existing) return bad('There is already an account with that email. Try signing in.');

  const { hash, salt, iterations } = await hashPassword(password);
  const id = randomHex(12);
  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, pw_hash, pw_salt, pw_iterations,
                        created_at, last_seen, has_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).bind(id, email, name || null, hash, salt, iterations, now(), now()).run();

  const { token, expires } = await createSession(env, id);
  return json({ ok: true, user: { id, email, name: name || null } }, 200,
    { 'set-cookie': sessionCookie(token, expires, isSecure(request)) });
}

export async function login(request, env) {
  if (await tooManyFailures(request, env)) {
    return bad('Too many attempts. Wait a few minutes and try again.', 429);
  }

  let body;
  try { body = await request.json(); } catch { return bad('That did not arrive properly.'); }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const user = await env.DB.prepare(
    `SELECT id, email, display_name, pw_hash, pw_salt, pw_iterations, has_password
       FROM users WHERE email = ?`,
  ).bind(email).first();

  // Telling somebody their password is wrong when they never set one just makes
  // them try harder. This leaks only what they already know about themselves.
  if (user && !user.has_password) {
    return bad('That account signs in with Google. Use the Google button instead.', 409);
  }

  // Same message and similar work either way, so this cannot be used to find
  // out which email addresses have accounts.
  const ok = user ? await verifyPassword(password, user)
                  : await verifyPassword(password, { pw_hash: '0'.repeat(64), pw_salt: '0'.repeat(32), pw_iterations: ITERATIONS });

  if (!user || !ok) {
    await recordFailure(request, env);
    return bad('That email and password do not match.', 401);
  }

  await env.DB.prepare(`UPDATE users SET last_seen = ? WHERE id = ?`).bind(now(), user.id).run();
  const { token, expires } = await createSession(env, user.id);
  return json({ ok: true, user: { id: user.id, email: user.email, name: user.display_name } }, 200,
    { 'set-cookie': sessionCookie(token, expires, isSecure(request)) });
}

export async function logout(request, env) {
  await destroySession(request, env);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(isSecure(request)) });
}

export async function me(request, env) {
  const user = await currentUser(request, env);
  return json({ ok: true, user });
}

/** Every report this account has posted, newest first. */
export async function myReports(request, env) {
  const user = await currentUser(request, env);
  if (!user) return bad('Please sign in.', 401);

  const { results } = await env.DB.prepare(
    `SELECT id, lat, lon, severity, note, created_at, expires_at, flags,
            (photo IS NOT NULL) AS has_photo
       FROM reports
      WHERE user_id = ? AND expires_at >= ?
      ORDER BY created_at DESC`,
  ).bind(user.id, now()).all();

  return json({ ok: true, reports: results });
}

/* ------------------------------------------------------- sign in with Google

   Google hands the browser a signed JWT. We must not believe a word of it until
   we have checked three things: that Google signed it (RS256, against the keys
   they publish), that it was issued for this application and not some other
   one, and that it has not expired. Skipping the audience check is the classic
   mistake: any valid Google token from any app would then log somebody in.

   No library. Web Crypto verifies RSASSA-PKCS1-v1_5 and Google publishes the
   keys as a JWKS we can import directly. */

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];

/* Google rotates these keys. The response carries a cache-control max-age, and
   honouring it keeps us from fetching the set on every single sign-in. */
let certCache = { keys: null, until: 0 };

async function googleKeys() {
  if (certCache.keys && Date.now() < certCache.until) return certCache.keys;
  const res = await fetch(GOOGLE_CERTS);
  if (!res.ok) throw new Error('Could not reach Google to check that sign-in.');
  const body = await res.json();
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  certCache = {
    keys: body.keys,
    until: Date.now() + (maxAge ? Number(maxAge[1]) : 3600) * 1000,
  };
  return certCache.keys;
}

const b64url = (s) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(pad + '='.repeat((4 - pad.length % 4) % 4)), (c) => c.charCodeAt(0));
};

/** Returns the token's claims, or throws. Never returns unverified claims. */
async function verifyGoogleToken(idToken, clientId) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('That sign-in token was malformed.');

  const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));

  if (header.alg !== 'RS256') throw new Error('That sign-in token used an algorithm we do not accept.');

  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('That sign-in token was signed with a key we do not know.');

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    b64url(parts[2]),
    enc.encode(parts[0] + '.' + parts[1]),
  );
  if (!ok) throw new Error('That sign-in token failed its signature check.');

  // Signature alone is not enough. These three are the ones that matter.
  if (!GOOGLE_ISS.includes(claims.iss)) throw new Error('That token did not come from Google.');
  if (claims.aud !== clientId) throw new Error('That token was issued for a different application.');
  if (!claims.exp || claims.exp < now()) throw new Error('That sign-in expired. Try again.');

  if (!claims.email) throw new Error('That Google account did not share an email address.');
  if (claims.email_verified === false) {
    throw new Error('That Google account has an unverified email, so we cannot match it to an account.');
  }
  return claims;
}

/* An account is the same account however you prove you own it. Matching on the
   verified email is what lets somebody who registered with a password later use
   the Google button, and the other way round, without ending up with two. */
export async function googleSignIn(request, env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) return bad('Sign in with Google is not configured on this deployment.', 501);

  let body;
  try { body = await request.json(); } catch { return bad('That did not arrive properly.'); }

  let claims;
  try {
    claims = await verifyGoogleToken(body.credential, clientId);
  } catch (err) {
    return bad(err.message, 401);
  }

  const email = String(claims.email).trim().toLowerCase();
  const name = String(claims.name || '').trim().slice(0, 60) || null;
  const t = now();

  let user = await env.DB.prepare(
    `SELECT id, email, display_name, google_sub FROM users WHERE google_sub = ? OR email = ?`,
  ).bind(claims.sub, email).first();

  if (user) {
    // Link the Google identity on first use, and fill in a name if we never had one.
    await env.DB.prepare(
      `UPDATE users SET google_sub = ?, last_seen = ?, display_name = COALESCE(display_name, ?)
        WHERE id = ?`,
    ).bind(claims.sub, t, name, user.id).run();
  } else {
    // A Google-only account still needs something in pw_hash, so it gets bytes
    // no password can produce. has_password = 0 is what the code actually reads.
    const id = randomHex(12);
    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, pw_hash, pw_salt, pw_iterations,
                          created_at, last_seen, google_sub, has_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).bind(id, email, name, randomHex(32), randomHex(16), ITERATIONS, t, t, claims.sub).run();
    user = { id, email, display_name: name };
  }

  const { token, expires } = await createSession(env, user.id);
  return json({ ok: true, user: { id: user.id, email, name: user.display_name || name } }, 200,
    { 'set-cookie': sessionCookie(token, expires, isSecure(request)) });
}
