# AquaRoute Guwahati — End-to-End Build Guide

> Upload this single file to a coding agent (or follow it yourself) to rebuild
> the app from an empty folder. No paid APIs, no API keys, no build step.
> Target: a phone-sized flood-avoidance PWA for Guwahati commuters, running on
> the Cloudflare free tier (Worker + D1).

---

## 1. What you are building

During monsoon, the same Guwahati streets flood every year. General mapping apps
route people straight into them — a road under half a metre of water is still,
as far as the map knows, a road.

The app is one page that:

1. Shows **live + 12-hour forecast rainfall** over Guwahati (headline verdict).
2. Holds a **map of known waterlogging zones** (hand-drawn polygons, honestly
   labelled UNVERIFIED in the UI).
3. Takes **From → To**, routes via OSRM, and gives a **plain-sentence verdict**
   on whether the route crosses water (zones + live community reports).
4. Lets anyone **report flooding with a photo** (12-hour expiry, community
   flagging, optional sign-in for cross-phone management).
5. Speaks **English + Assamese**, remembers the choice.

Non-goals: no rerouting around floods (OSRM usually returns one route here —
say so, never invent a detour), no staffed moderation, no precise depth numbers
(write `typicalDepth` as human phrases like "deep enough to stall a small car").

---

## 2. Architecture (read this before writing code)

```
public/                  static frontend, zero build step, zero keys
  index.html             markup: map, rain card, map controls, 3 panels,
                         tabbar, composer/auth/mine modals, photo viewer
  styles.css             "Daylight" theme: frosted white glass over pale map
  app.js                 ALL browser logic (~1500 lines, no dependencies
                         except MapLibre + Google GIS, both via CDN)
  i18n.js                en/as string tables + lang() / applyLang()
  data/flood-zones.geojson  5 zone polygons, each with name/note/severity/
                             typicalDepth + name_as/typicalDepth_as/note_as
src/
  index.js               Cloudflare Worker: ONLY the shared report API + static
  auth.js                accounts in Web Crypto, no auth library (NextAuth needs
                         Next.js; this app has no build step)
schema.sql               reports table (photos as BLOB, 12h expiry)
schema-auth.sql          users / sessions / login_attempts / report_flags
schema-google.sql        adds google_sub + has_password to users
wrangler.jsonc           Worker + D1 + static assets config
```

The golden rule: **map, rain, routing, and zone geometry run 100% in the
browser** against public `Access-Control-Allow-Origin: *` APIs. The Worker
exists for one reason — a report from one phone must reach another phone.
If the Worker is down, the app degrades cleanly (no reports, everything else
works). Build the frontend first and it must be fully usable with no server.

---

## 3. Free services (all four, no keys, no accounts)

| Service | URL / usage | Limits |
|---|---|---|
| Open-Meteo | `https://api.open-meteo.com/v1/forecast?latitude=26.1445&longitude=91.7362&current=precipitation,temperature_2m,apparent_temperature,relative_humidity_2m&hourly=precipitation&forecast_days=2&timezone=Asia%2FKolkata` | none published |
| OpenFreeMap vector tiles | style `https://tiles.openfreemap.org/styles/positron`, MapLibre GL 4.7.1 via unpkg CDN | none |
| Nominatim geocode | `https://nominatim.openstreetmap.org/search?q=<text>, Guwahati, Assam&format=json&limit=1` | 1 req/second — wait 1100 ms between the two lookups when both need it |
| OSRM routing | `https://router.project-osrm.org/route/v1/driving/<lon>,<lat>;<lon>,<lat>?overview=full&geometries=geojson&alternatives=true&steps=false` | 1 req/s, non-commercial demo — do not promise production routing |
| OSM raster (base-map option) | `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, attribution `© OpenStreetMap contributors`, maxzoom 19 | ≤2 req/s, informational use |
| Esri satellite (toggle) | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | free with attribution, no key |

---

## 4. Exact constants (do not guess these)

- Centre: `GUWAHATI = { lon: 91.7362, lat: 26.1445 }`, zoom `12.2`
- Report bounds (reject outside): lat `26.00–26.30`, lon `91.45–92.00`
- Rain thresholds (mm/h): `WATCH = 0.6`, `MONSOON = 2.5`
- Report TTL: 12 h, then row is **deleted**, not hidden
- Rate limit: 6 reports / reporter / hour (signed-in: per account; anon: per salted IP hash)
- Flags: 3 hides a report (signed-in: one flag per account per report)
- Photo: canvas re-encode → JPEG, longest edge 1400 px, quality steps 0.72→0.32, ceiling `220 * 1024` bytes, enforced server-side too. Re-encoding strips EXIF (GPS + device id) — say so in the UI
- Note: max 160 chars. Severity: `passable | slow | impassable`
- Report IDs: 18 hex chars; delete tokens: 36 hex chars, compared constant-time
- Route scoring: a report counts against a route if severity ≠ passable and within 130 m of any route coordinate (rough equirectangular metres is fine at city scale)
- Sessions: 30 days, cookie `aq_session`, HttpOnly, SameSite=Lax, Secure on https. DB stores only SHA-256 of the token
- Passwords: PBKDF2-SHA256, **300,000 iterations chained as 3 × 100,000** (Workers throws above 100k per call — production-only ceiling, never local), 16-byte hex salt per user, min length 10
- Login throttle: 8 failures / 15 min / IP-hash; unknown-email and wrong-password give the identical message

---

## 5. Build order (do it in this sequence, verify each stage)

### Stage A — static shell + map
`public/index.html` + `styles.css`: fullscreen `#map`, rain header card, `.mapctl`
controls (OSM / satellite / recentre), panels `panelRoute/panelZones/panelYou`,
floating tabbar (Route/Zones/Report/You), composer modal, auth modal, my-reports
modal, photo viewer. Start MapLibre with the positron style, centre + zoom above,
`attributionControl: { compact: true }`. If WebGL fails or `load` never fires
within 12 s, show a `.map-down` message — the verdict logic must never depend on
the map object.

### Stage B — flood zones (data, not code)
`public/data/flood-zones.geojson`: ~5 polygons around known waterlogging
localities. Properties per feature: `id, name, severity (severe|moderate), note,
typicalDepth` + `name_as, typicalDepth_as, note_as`. Mark provenance
UNVERIFIED in data and UI. Render: zones list (click flies to bounds), map
fill (severe `#c8402c` @ 0.14, moderate `#b07407`), dashed outline, labels
(English `name`, Assamese coalesce `name_as → name`).

### Stage C — rain
Fetch Open-Meteo URL from §3 every 10 min. Mode from current + peak-12h:
`≥2.5 monsoon / ≥0.6 watch / else clear`. Peak figure big, 12 bars (floor scale
1.5 mm so dry days read honestly flat), temperature + feels-like (show when they
differ ≥1°) + humidity. Foldable card, remembers choice in localStorage.

### Stage D — routing + verdict
Geocode: `lat,lon` typed input routes straight through (regex
`^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$`); otherwise Nominatim (+1100 ms gap if
both inputs need lookup). Route via OSRM. Point-in-polygon by ray casting over
every OSRM coordinate vs every zone ring (bounding boxes are banned — false
alarms kill trust). Verdict as a sentence covering 4 truths: all clear / only
route is wet / a dry alternative exists at +N min / no routes. Dry routes sort
first even when slower. Never imply a detour exists.

### Stage E — base-map options
Keep vector default. Add OSM raster source + `osm` layer inserted **below**
`zone-fill` at opacity 0, toggled by a mapctl button: when on, set raster
opacity 1 and hide vector streets (paint opacity 0, symbol layers
`visibility: none`) so labels don't double-print. Satellite (Esri) works the
same way. Toggles are mutually exclusive.

### Stage F — reports (frontend half)
Composer: geolocate → draggable ghost pin + "move the pin" map-pick mode;
severity buttons; photo input → `createImageBitmap` → canvas scale → JPEG loop
to ≤220 KB; note field. Markers by severity; own reports get a ring
(localStorage `id→del_token` map + server cross-phone ids). Viewer: photo (or
hidden), `Not accurate` flag vs `Delete my report` for owners. Rescore routes
with 130 m rule after every load.

### Stage G — Worker + D1 (backend half)
`src/index.js` endpoints: `GET /api/config` (public Google client id or null),
`POST /api/auth/google|register|login|logout`, `GET /api/auth/me`,
`GET /api/my/reports`, `GET /api/reports`, `POST /api/reports`,
`POST /api/reports/:id/flag`, `DELETE /api/reports/:id`, `GET /photo/:id`.
Photos stored as D1 BLOB + `photo_type` (NOT R2 — avoids a second signup; a busy
day is tens of MB against a 5 GB free tier). Sweep expired rows on write.
`src/auth.js`: Web-Crypto-only accounts per §4 constants. Google: verify GIS JWT
RS256 against `https://www.googleapis.com/oauth2/v3/certs` (cache by max-age),
check `iss ∈ {https://accounts.google.com, accounts.google.com}`,
`aud === GOOGLE_CLIENT_ID`, `exp`, verified email; match/link accounts on email.
`wrangler.jsonc`: name, `main: src/index.js`, `compatibility_date`, assets
`./public` with `run_worker_first: ["/api/*", "/photo/*"]`, `vars:
{ GOOGLE_CLIENT_ID: "" }` (empty = button hidden), D1 binding `DB`.

### Stage H — i18n
`i18n.js` with full `en` + `as` tables covering every string; interface font
Noto Sans Bengali for Assamese; measurements keep Western digits; basemap
labels coalesce `name:as → name:bn → name` (Assamese) else `name:en → name`.
Repaint data-driven views (zone list, verdict, markers, account) on switch.

---

## 6. Run locally

```bash
npm install -g wrangler   # or npx wrangler
npx wrangler d1 execute aquaroute --local --file=schema.sql
npx wrangler d1 execute aquaroute --local --file=schema-auth.sql
npx wrangler d1 execute aquaroute --local --file=schema-google.sql
npx wrangler dev --port 8787   # Worker + static + local D1
```

Share with a friend without deploying:

```bash
cloudflared tunnel --url http://localhost:8787
# → https://<random>.trycloudflare.com (dies when the laptop sleeps)
```

Google sign-in (optional, free, no card — see `GOOGLE-SIGNIN-SETUP.md`): create
the OAuth client, add the localhost + tunnel URLs to Authorised JavaScript
origins, put the client ID in `wrangler.jsonc` (`vars.GOOGLE_CLIENT_ID`) for
deploy or `.dev.vars` locally.

---

## 7. Deploy (free tier)

```bash
npx wrangler d1 create aquaroute      # paste id into wrangler.jsonc
npx wrangler d1 execute aquaroute --remote --file=schema.sql
npx wrangler d1 execute aquaroute --remote --file=schema-auth.sql
npx wrangler d1 execute aquaroute --remote --file=schema-google.sql
npx wrangler secret put REPORTER_SALT  # any long random phrase, salts IP hashes
npx wrangler deploy                    # → https://<name>.<account>.workers.dev
```

`REPORTER_SALT` must be set before the first real report.

---

## 8. Verification checklist (all must pass)

1. `node --check public/app.js` clean; page loads with **no server** (map + rain + routing work, reports silently absent).
2. `curl localhost:8787/api/reports` → `{"ok":true,"reports":[]}`.
3. Register → post report with photo → visible in Zones count + within-130 m route verdict → delete own report → gone.
4. Wrong-password ×8 → throttled; unknown email ≡ wrong password message.
5. Forged Google tokens (wrong key, `alg:none`, malformed) all refused, none creates an account.
6. Expired/3-flagged reports disappear; photo URL 404s after.
7. OSM + satellite toggles never hide zones/routes; Assamese switch repaints list, verdict, markers.
8. Tunnel URL loads page + API from another network.

---

## 9. Pitfalls that already bit once

- PBKDF2 >100k iterations throws **only in production** Workers — chain passes.
- D1 wants an `ArrayBuffer` for BLOBs, not `Uint8Array` (silent empty photo).
- Static hosts answer `/api/*` with `index.html` — guard `content-type` before `.json()`, else `Unexpected token '<'`.
- OSM raster needs its attribution and gentle request rates; Nominatim/OSRM hard 1 req/s.
- Assamese has no italic and the Latin serif has no Assamese glyphs — use weight + Noto Sans Bengali.
- Short viewports: cap panel heights as a share of viewport, fold cards, or the map band hits 0%.
