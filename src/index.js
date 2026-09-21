/**
 * AquaRoute Guwahati - the report server.
 *
 * The map, the rainfall and the routing never touch this file: they run in the
 * browser against public APIs. This Worker exists for one reason only, which is
 * that a report from you has to be visible to me. Sharing needs a shared place.
 *
 * If this Worker is unreachable the app degrades cleanly: no reports, everything
 * else still works. That is deliberate.
 *
 * What protects an endpoint that anybody on the internet can post a photo to:
 *   1. photos are re-encoded in the browser, which strips EXIF (and therefore
 *      the GPS coordinates and device id your camera writes into every picture)
 *   2. a hard 220 KB ceiling, enforced again here, never only in the client
 *   3. every report expires after twelve hours
 *   4. three community flags hide a report
 *   5. six reports per hour per reporter
 *   6. the coordinates must be inside Guwahati
 *   7. signing in is optional, but it lets you manage your reports from any phone
 *
 * Reporting needs no account, which is the friendliest thing about the app:
 * during a flood the person who most needs this is the one least likely to stop
 * and sign up. Accounts buy two things back for those who want one: a reporter
 * can see and manage everything they have posted from any phone, and a bad actor
 * costs an email address rather than nothing. Reading the map needs no account
 * either.
 */

import {
  currentUser, register, login, logout, me, myReports, googleSignIn,
} from './auth.js';

const TTL_HOURS = 12;
const MAX_PHOTO = 220 * 1024;
const MAX_NOTE = 160;
const RATE_LIMIT = 6;              // reports per reporter per hour
const HIDE_AT_FLAGS = 3;
const SEVERITIES = new Set(['passable', 'slow', 'impassable']);

// Greater Guwahati, generously drawn. A report outside this is not a mistake we
// should store - it is either a bug or someone playing.
const BOUNDS = { minLat: 26.00, maxLat: 26.30, minLon: 91.45, maxLon: 92.00 };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const bad = (message, status = 400) => json({ ok: false, error: message }, status);

const now = () => Math.floor(Date.now() / 1000);

/** Salted hash of the caller's IP. Used only to count reports per hour.
 *  Salted so the table never holds anything that maps back to a person. */
async function reporterId(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const salt = env.REPORTER_SALT || 'aquaroute-local-salt';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip));
  return [...new Uint8Array(buf)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const newId = () =>
  [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Old reports are deleted, not merely hidden. Nothing anybody uploads sits
 *  around after it has stopped being useful. */
async function sweep(env) {
  await env.DB.prepare(`DELETE FROM reports WHERE expires_at < ?`).bind(now()).run();
}

// ------------------------------------------------------------------ handlers

async function listReports(env) {
  await sweep(env);
  const { results } = await env.DB.prepare(
    `SELECT id, lat, lon, severity, note, created_at, expires_at, flags,
            (photo IS NOT NULL) AS has_photo
       FROM reports
      WHERE hidden = 0 AND expires_at >= ?
      ORDER BY created_at DESC
      LIMIT 300`,
  ).bind(now()).all();

  return json({ ok: true, reports: results, server_time: now() });
}

async function createReport(request, env) {
  // Reporting is open to everyone. A signed-in reporter gets their user id
  // stored alongside the report so it shows up under "My reports" on any
  // phone; an anonymous reporter is identified only by the one-time delete
  // token handed back to the phone that posted it.
  const user = await currentUser(request, env);

  let body;
  try {
    body = await request.json();
  } catch {
    return bad('That report was not readable.');
  }

  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  const severity = String(body?.severity || '');
  const note = String(body?.note || '').trim().slice(0, MAX_NOTE);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad('That report had no location.');
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lon < BOUNDS.minLon || lon > BOUNDS.maxLon) {
    return bad('That spot is outside Guwahati. This map only covers Guwahati.');
  }
  if (!SEVERITIES.has(severity)) return bad('Choose how bad the water is.');

  // Photo arrives as a data URL from a canvas re-encode, so it carries no EXIF.
  let photo = null, photoType = null;
  if (body.photo) {
    const m = String(body.photo).match(/^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return bad('That photo was not in a format we accept.');
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    if (bin.byteLength > MAX_PHOTO) {
      return bad('That photo is too large. Try again and it will be shrunk automatically.');
    }
    // D1 stores a BLOB from an ArrayBuffer. Handing it the Uint8Array itself
    // silently writes an empty value: the insert succeeds, the row exists, and
    // the photo comes back zero bytes long.
    photo = bin.buffer;
    photoType = m[1];
  }

  const who = await reporterId(request, env);
  // Signed-in reporters are counted per account, so a hostel or an office does
  // not run out of reports because one person nearby was busy. Anonymous
  // reporters are counted per network hash, which is the only identifier there is.
  const recent = user
    ? await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM reports WHERE user_id = ? AND created_at > ?`,
      ).bind(user.id, now() - 3600).first()
    : await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND created_at > ?`,
      ).bind(who, now() - 3600).first();
  if ((recent?.n ?? 0) >= RATE_LIMIT) {
    return bad('That is a lot of reports in one hour. Give it a while.', 429);
  }

  const t = now();
  const id = newId();
  // Returned exactly once, to the phone that posted this. That phone keeps it and
  // can delete the report later. It is how you get "only the author may remove
  // this" without ever asking anybody to make an account.
  const delToken = newId() + newId();
  // user_id is null for anonymous reports. Older databases created before
  // accounts existed have no user_id column at all; fall back to the original
  // shape rather than failing the insert.
  try {
    await env.DB.prepare(
      `INSERT INTO reports (id, lat, lon, severity, note, photo, photo_type,
                            created_at, expires_at, reporter, del_token, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, lat, lon, severity, note || null, photo, photoType, t,
           t + TTL_HOURS * 3600, who, delToken, user ? user.id : null).run();
  } catch (e) {
    if (!/user_id|no such column/i.test(String(e && e.message || e))) throw e;
    await env.DB.prepare(
      `INSERT INTO reports (id, lat, lon, severity, note, photo, photo_type,
                            created_at, expires_at, reporter, del_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, lat, lon, severity, note || null, photo, photoType, t,
           t + TTL_HOURS * 3600, who, delToken).run();
  }

  await sweep(env);
  return json({ ok: true, id, del_token: delToken, expires_at: t + TTL_HOURS * 3600 });
}

/** Three flags hide a report. A signed-in account can only flag a report once,
 *  so one person cannot hide something on their own; anonymous flags are
 *  counted without that deduplication, because there is no account to key on.
 *  A wrong report during a flood is worse than a missing one. */
async function flagReport(request, env, id) {
  const user = await currentUser(request, env);

  if (user) {
    const already = await env.DB.prepare(
      `SELECT 1 FROM report_flags WHERE report_id = ? AND user_id = ?`,
    ).bind(id, user.id).first();
    if (already) return bad('You have already flagged this one.', 409);
  }

  const row = await env.DB.prepare(`SELECT flags FROM reports WHERE id = ?`).bind(id).first();
  if (!row) return bad('That report is already gone.', 404);

  if (user) {
    await env.DB.prepare(
      `INSERT INTO report_flags (report_id, user_id, at) VALUES (?, ?, ?)`,
    ).bind(id, user.id, now()).run();
  }

  const flags = (row.flags ?? 0) + 1;
  await env.DB.prepare(
    `UPDATE reports SET flags = ?, hidden = ? WHERE id = ?`,
  ).bind(flags, flags >= HIDE_AT_FLAGS ? 1 : 0, id).run();

  return json({ ok: true, flags, hidden: flags >= HIDE_AT_FLAGS });
}

/** Delete a report. Two ways to prove it is yours: the one-time token the
 *  posting phone was handed, or being signed in as the account that posted it.
 *  The token path stays so reports made before accounts existed, and any report
 *  open in a tab from before you signed in, can still be removed. */
async function deleteReport(request, env, id) {
  let body = {};
  try { body = await request.json(); } catch { /* token may come in the query */ }
  const url = new URL(request.url);
  const given = String(body.del_token || url.searchParams.get('t') || '');

  const row = await env.DB.prepare(
    `SELECT del_token, user_id FROM reports WHERE id = ?`,
  ).bind(id).first();
  if (!row) return json({ ok: true, already: true });     // gone is gone

  const user = await currentUser(request, env);
  const isOwner = !!(user && row.user_id && user.id === row.user_id);
  const hasToken = !!row.del_token && safeEqual(String(row.del_token), given);

  if (!isOwner && !hasToken) {
    return bad('Only the person who posted this report can remove it.', 403);
  }

  await env.DB.prepare(`DELETE FROM reports WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

/** Constant-time compare, so the token cannot be guessed a character at a time. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function servePhoto(env, id) {
  const row = await env.DB.prepare(
    `SELECT photo, photo_type FROM reports WHERE id = ? AND hidden = 0 AND expires_at >= ?`,
  ).bind(id, now()).first();

  if (!row?.photo) return new Response('Not found', { status: 404 });

  // Coming back out, D1 may hand us an ArrayBuffer or a plain array of bytes
  // depending on the driver. Uint8Array copes with both.
  const bytes = new Uint8Array(row.photo);
  if (!bytes.byteLength) return new Response('Not found', { status: 404 });

  return new Response(bytes, {
    headers: {
      'content-type': row.photo_type || 'image/jpeg',
      // Safe to cache hard: the id is random and the row is deleted on expiry.
      'cache-control': 'public, max-age=3600',
      'content-security-policy': "default-src 'none'; img-src 'self'",
      'x-content-type-options': 'nosniff',
    },
  });
}

// -------------------------------------------------------------------- router

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // The page asks what it is allowed to offer rather than hard-coding it,
      // so a deployment with no Google client id simply hides the button
      // instead of showing one that fails when pressed. The client id is public
      // by design; the secret half is never involved in this flow.
      if (path === '/api/config' && request.method === 'GET') {
        return json({ ok: true, googleClientId: env.GOOGLE_CLIENT_ID || null });
      }

      if (path === '/api/auth/google'   && request.method === 'POST') return googleSignIn(request, env);
      if (path === '/api/auth/register' && request.method === 'POST') return register(request, env);
      if (path === '/api/auth/login'    && request.method === 'POST') return login(request, env);
      if (path === '/api/auth/logout'   && request.method === 'POST') return logout(request, env);
      if (path === '/api/auth/me'       && request.method === 'GET')  return me(request, env);
      if (path === '/api/my/reports'    && request.method === 'GET')  return myReports(request, env);

      if (path === '/api/reports' && request.method === 'GET') return listReports(env);
      if (path === '/api/reports' && request.method === 'POST') return createReport(request, env);

      const flag = path.match(/^\/api\/reports\/([0-9a-f]{18})\/flag$/);
      if (flag && request.method === 'POST') return flagReport(request, env, flag[1]);

      const del = path.match(/^\/api\/reports\/([0-9a-f]{18})$/);
      if (del && request.method === 'DELETE') return deleteReport(request, env, del[1]);

      const photo = path.match(/^\/photo\/([0-9a-f]{18})$/);
      if (photo && request.method === 'GET') return servePhoto(env, photo[1]);

      if (path === '/') return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error(err);
      return bad('Something failed on our side.', 500);
    }
  },
};
