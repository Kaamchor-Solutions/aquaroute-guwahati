# PRD: AquaRoute Guwahati

> **Revision 5.** Every external claim in revision 1 was tested against the live
> service before this was written. Corrections are marked **CHANGED**; things
> revision 1 did not know are marked **NEW**. Verified 28 Aug 2026.
>
> Revision 5 adds accounts for reporters. Section 9c is the whole of it, and it
> reverses a decision revision 3 argued for, which is worth reading as a pair.
>
> **Revision 7** adds Sign in with Google, Assamese, live temperature, and a
> satellite layer. It also records a decision not taken: Google Maps was asked
> for and rejected, and section 11 says why in full.
>
> **Revision 6 rebuilds the interface from a Claude Design handoff.** The design
> was mocked up in HTML and CSS from this PRD and screenshots of the running app,
> and offered three directions. The light one was chosen. Section 6 is rewritten;
> nothing below it changed, because the redesign touched only the presentation.

---

## 1. Overview

**Problem.** During the monsoon, specific Guwahati localities flood within an hour of
heavy rain, and they flood in the same places every year. General mapping tools route
people straight into them, because a road that is under half a metre of water is still,
as far as the map knows, a road.

**Solution.** A phone-sized web page that checks live and forecast rainfall for Guwahati,
holds a map of the localities known to waterlog, and tells you plainly whether the route
you are about to drive passes through one.

**AI Build Summary:**
> Build a mobile-first web app with no build step. The map, rainfall and routing run
> entirely in the browser; a small Cloudflare Worker with a D1 database exists only so
> community reports can be shared, and the app must degrade cleanly when it is
> unreachable. The page shows a MapLibre GL JS
> map of Guwahati styled from OpenFreeMap vector tiles. Load flood-zone polygons from a
> local GeoJSON file. Poll Open-Meteo for current and 12-hour forecast precipitation and
> drive a three-state alert (Clear / Watch / Monsoon) from the **forecast**, not just the
> current reading. Geocode place names with Nominatim and fetch driving routes from the
> OSRM demo server with `alternatives=true`. Test every route coordinate against every
> flood polygon with a ray-casting point-in-polygon check; rank clear routes above fast
> ones. When every available route crosses a zone, say so rather than inventing a detour.
> Let anyone post a water report with a severity, an optional note and an optional photo.
> Re-encode the photo through a canvas in the browser before upload: that strips the EXIF
> GPS position and device identifiers, and is the privacy mechanism, not a compression
> trick. Cap it at 220 KB and enforce that on the server too. Delete every report after
> twelve hours, hide one at three community flags, and allow six reports per hour per
> salted IP hash. Count live reports against a route within 130 m, ranked above the drawn
> polygons. No API keys anywhere. All four public services send
> `Access-Control-Allow-Origin: *`, which is why only the reports need a server.

---

## 2. Goals & Success Metrics

**Primary goal:** a commuter checks the app before setting off and does not end up in
standing water they could have driven around.

**Success metrics:**
- Time from page load to a route verdict: under 15 seconds
- Page weight on first load, excluding map tiles: under 250 KB
- Cost to run at any traffic level: zero

**Anti-goals:**
- Not a moderated platform. Reports are public and unreviewed. They expire after twelve
  hours and three community flags hide one. That is the whole moderation story, said
  plainly rather than implied.
- Not a navigation app. It does not do turn-by-turn or track you as you drive.
- Not an authority. It shows a reputation map, not a drainage survey.
- Not a general India app. Guwahati only, on purpose.

---

## 3. Scope & Constraints

**In scope:** live and forecast rainfall, three alert states, flood-zone map, place-name
routing, route hazard verdict, alternative comparison, zone browser, **community reports
with photo evidence**.

**Out of scope:** user accounts, saved journeys, notifications, turn-by-turn, public
transport, offline use, staffed moderation.

**Technical constraints:**
- Web only, phone-first. Portrait, one hand, outdoors, often at dusk in rain.
- **CHANGED in v3:** shared reports need shared storage, so there is now a small
  Cloudflare Worker with a D1 database. The map, rainfall and routing still run wholly
  in the browser and keep working when the Worker is unreachable.
- No build step. The source that is written is the source that ships.
- Zero recurring cost, including at scale.

---

## 4. Jobs to Be Done

| Priority | Job |
|---|---|
| **J1** | When rain starts and I need to leave, I want to know whether my usual route floods, so I do not get stuck in it. |
| **J2** | When it is dry right now but the sky looks bad, I want to know whether to leave immediately or wait, so I can time my journey. |
| **J3** | When my route does cross a bad spot, I want to see whether any other way avoids it, so I can decide whether the detour is worth it. |
| **J4** | When I am new to Guwahati, I want to know which areas to avoid in the rain, so I learn the city's pattern. |
| **J5** | When I am standing in front of water that is not on the map, I want to warn the people behind me, so they turn around before they reach it. |
| **J6** | When someone says a road is flooded, I want to see a photo, so I can judge for myself rather than take their word. |
| **J7** | When the water I reported has drained, or I got it wrong, I want to take my report down, so nobody drives the long way round for nothing. |

---

## 5. User Stories

| ID | Role | Action | Benefit | JTBD |
|---|---|---|---|---|
| US1 | Commuter | See at a glance whether it is raining and what is coming | so I know how careful to be | J1, J2 |
| US2 | Commuter | See the twelve-hour rainfall shape | so I can time my journey | J2 |
| US3 | Commuter | Type a start and destination | so I can check my actual route | J1 |
| US4 | Commuter | Use my current location as the start | so I do not have to type it | J1 |
| US5 | Commuter | Get a plain verdict on each route | so I can decide in seconds | J1, J3 |
| US6 | Commuter | See which zones a route crosses and how bad they are | so I can judge the risk myself | J3 |
| US7 | Newcomer | Browse the known zones on a map | so I learn the city | J4 |
| US8 | Local resident | Understand where the flood data comes from | so I know how much to trust it | J4 |
| US9 | Anyone stuck | Post water at my location with a severity and a photo | so others avoid it | J5 |
| US10 | Commuter | See live reports on the map and open the photo | so I judge the water myself | J6 |
| US11 | Commuter | Have live reports counted against my route, not only old polygons | so the verdict reflects today | J1, J5 |
| US12 | Anyone | Flag a report that is wrong | so bad information comes off the map | J6 |
| US13 | Reporter | Know my photo carries neither my location nor my device id | so I can report without exposing myself | J5 |
| US14 | Reporter | Delete a report I posted | so a stale or mistaken warning does not stand | J7 |
| US15 | Commuter | Collapse the panel and see the whole map | so I can look at the route I just asked for | J1, J3 |

---

## 6. Proposed Experience

**Direction, revised in v6: "Daylight".** The map is still the product and the interface
still stays out of its way, but the shell is now frosted white glass over a light map
rather than a dark chrome. Three semantic colours, each meaning exactly one thing:
**blue is rain data, red is flood hazard, green is a way that is clear.** Nothing else is
coloured.

**This reverses revision 1's reasoning, and the reversal was a deliberate choice rather
than a drift.** The original argument was that a commuter outdoors at dusk in heavy rain
wants a dark screen. That argument is real, and it is why the app shipped dark. What it
missed is that the basemap underneath was OpenFreeMap *positron*, which is a pale style:
the app was a dark interface floating on a light map, and the two never belonged to each
other. Daylight makes the shell agree with the map. The counter-argument, glare at night,
is noted here rather than buried, and is the first thing to revisit if people complain.

**The verdict is a sentence, not a label.** The largest text on the screen is a line of
Instrument Serif that says what the water is doing on your way, with the zone named in
italic red inside it. Figures are monospaced so they line up and never read as prose.

**Structure.** Four destinations in a floating tab bar: Route, Zones, Report, You. One
panel is visible at a time and tapping the active tab dismisses it, which is how the map
gets the whole screen. Report is not a place: it opens the composer and hands you back to
where you were. This replaces the draggable bottom sheet, which had to carry the planner,
the results, the zone list and the account row all at once.

**The one authored moment** is still the shift into Monsoon Mode, but it is quieter: the
peak figure changes colour, green through amber to red, and the headline changes with it.
The layout never moves.

**States:**

| State | What the user sees |
|---|---|
| Loading | "Checking the sky over Guwahati…" |
| Clear | Green mark, "Streets should be clear" |
| Watch | Amber mark, "Rain expected today" |
| Monsoon | Blue pulsing mark, "Raining hard right now" |
| Weather unreachable | "Rainfall unavailable. Route checking still works. Treat every zone as risky." |
| Place not found | "Could not find X in Guwahati." |
| No route | "No driving route between those two places." |
| All routes flooded | "Every route we can find crosses a known waterlogging zone. We are not going to invent a detour that does not exist." |
| Location refused | "Location was refused. Type a place name instead." |
| Before you ask | "Pick where you are going and I will tell you what the water is doing on the way." |
| A dry way exists | "Your quickest way runs straight through *Ganeshguri*." plus what the detour costs |
| Nothing is clear | "Every way we can find runs through *X*." and no invented detour |
| Only one route exists | "The only way we can find runs through *X*." One card, not a fake pair |
| Everything is clear | "Nothing is reported anywhere on your way." |
| Panel dismissed | Tapping the active tab hides the panel and gives the map the screen |
| Viewing your own report | The action reads "Delete my report" rather than "Not accurate" |
| Deleted | "Deleted. It is off the map." |
| Delete refused | "That could not be deleted from this phone." |

**Accessibility:** visible focus rings on every control, aria-labels on icon-only
buttons, `aria-live` on the results region, `prefers-reduced-motion` honoured, body text
at 7.1:1 contrast and secondary text at 4.9:1.

---

## 7. Component Inventory

| Component | Type | Description |
|---|---|---|
| `MapCanvas` | Display | MapLibre map, basemap dimmed so data reads first |
| `ZoneLayers` | Display | Fill, dashed outline and label per flood polygon |
| `RouteLayer` | Display | Casing plus coloured line, red or green by verdict |
| `StatusBar` | Display | The three-state rain alert |
| `ForecastPanel` | Display | Twelve-hour bar chart, collapsible |
| `PlanForm` | Form | From, To, locate, swap, submit |
| `RouteCard` | Action | One per route: distance, time, verdict, zones crossed |
| `ZoneList` | Navigation | Tappable list of zones, flies the map to each |
| `ProvenanceNote` | Display | States plainly that the outlines are unverified |
| `TabBar` | Layout | Four destinations, frosted, floating. Left column above 860px |
| `Panel` | Layout | One card at a time over the map. Tapping the active tab dismisses it |
| `OriginDestination` | Action | The route line doubles as the button that opens the editor |
| `LanguageToggle` | Action | Top right of the rain card. English and Assamese, remembered |
| `MapControls` | Action | Satellite and recentre, in the band below the rain card |
| `OwnReportPin` | Display | Your own reports carry a ring so you can find them |

---

## 8. Data Models

```typescript
interface MyReports {          // browser storage only, never sent anywhere
  [reportId: string]: string;  // the one-time delete token for that report
}

interface User {               // users table
  id: string;                  // 24 hex characters, random
  email: string;               // unique, compared without regard to case
  display_name: string | null; // shown in the app; the email never is
  pw_hash: string;             // PBKDF2-SHA256, 300,000 iterations, hex
  pw_salt: string;             // 16 random bytes, hex, one per user
  pw_iterations: number;       // stored per user so it can be raised later
  created_at: number;
  last_seen: number | null;
}

interface Session {            // sessions table
  token_hash: string;          // SHA-256 of the cookie value. Never the value
  user_id: string;
  created_at: number;
  expires_at: number;          // 30 days
}

interface FloodZone {          // one GeoJSON Feature in data/flood-zones.geojson
  id: string;
  name: string;
  severity: 'severe' | 'moderate';
  note: string;                // what actually happens here, in plain words
  typicalDepth: string;        // human phrase, never a fake precise number
  geometry: GeoJSON.Polygon;   // lon,lat ring
}

interface RouteVerdict {
  coords: [number, number][];  // straight from OSRM
  distance: number;            // metres
  duration: number;            // seconds
  hits: { name: string; note: string; points: number; share: number }[];
  clear: boolean;              // hits.length === 0
}

type RainMode = 'clear' | 'watch' | 'monsoon';   // thresholds 0.6 and 2.5 mm/h
```

---

## 9. API / Integration Surface

**CHANGED, almost no backend.** Revision 1 implied an application layer for everything.
Only the reports need one: **all four public services return
`Access-Control-Allow-Origin: *`**, so the browser calls them directly. Hosting is a
static file drop.

| Service | Purpose | Key | Verified |
|---|---|---|---|
| Open-Meteo | Current + hourly precipitation | none | 200 in 0.77 s |
| OpenFreeMap | Vector map tiles and style | none | 200, no usage cap |
| Nominatim | Place name to coordinates | none | 200, **1 req/sec** |
| OSRM demo | Driving routes and alternatives | none | 200 in 0.6 s |

**Rate limits that shape the code:** Nominatim and OSRM both ask for no more than one
request per second. The app waits 1.1 s between the two geocode calls, and skips that
wait when a field already contains coordinates.

---

## 9b. Community reports, added in v3

**The one feature that needs a server.** A report from you has to reach me, and sharing
needs a shared place. Everything else still runs in the browser.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/reports` | Live reports, newest first, expired ones already swept |
| POST | `/api/reports` | Post one: lat, lon, severity, optional note, optional photo |
| POST | `/api/reports/{id}/flag` | Community flag. Three hides it |
| DELETE | `/api/reports/{id}` | Remove a report. Requires the token issued when it was posted |
| GET | `/photo/{id}` | The JPEG, served straight from D1 |

**Photos are stored as a BLOB in D1.** R2 is the textbook answer, but it is not enabled on
this account and needs its own signup. A photo capped at 220 KB against a 5 GB free tier is
comfortable, and it keeps the entire product on one service.

**Seven things guard an endpoint that anyone on the internet can post a photo to:**

1. **The photo is re-encoded through a canvas in the browser.** That produces a brand new
   file and leaves every EXIF tag behind, including the GPS position and the device
   identifiers your camera writes into every picture. This is the privacy mechanism. The
   smaller file is a side effect.
2. A hard 220 KB ceiling, enforced on the server as well as in the page. A client-side
   limit is a convenience, never a control.
3. Every report is **deleted** after twelve hours. Flood water is not a permanent fact
   about a street, so a stale report is worse than none at all. Expiry also bounds storage
   and limits how long anything anyone uploads can sit on the map.
4. Three community flags hide a report, and its photo then returns 404.
5. Six reports per hour per reporter, counted against a **salted hash** of the IP, so the
   table never holds anything that maps back to a person.
6. Coordinates outside Greater Guwahati are refused outright.
7. **Since v5, you have to be signed in to post at all.** Reading still needs nothing.
   Section 9c has the reasoning.

**Live reports outrank drawn polygons.** Somebody standing in the water an hour ago is
better evidence than an outline traced last year, so a report within 130 m of a route
counts against that route in its own right and changes the ranking.

**Deleting your own report, without accounts. Superseded in v5, kept because the
mechanism is still in the code and still runs first.** Posting returns a one-time secret that
only that phone ever sees. The phone keeps it, the server keeps the row, and deletion
requires the secret, compared in constant time. Only the author can remove a report, and
nobody is asked to sign up for an app they may use once, in the rain.

The trade is stated plainly to the user. The proof lives in that browser, so clearing site
data, or posting from another phone, loses the ability to delete. The report still expires
by itself after twelve hours.

That last paragraph is exactly why v5 added accounts. Being signed in is now the second
and better proof of ownership, and it works from any phone.

**Known limitation, stated rather than buried:** there is no staffed moderation. For a
neighbourhood tool with twelve-hour expiry that is defensible. For anything larger it is
not, and a real deployment needs a person with a delete button.

---

## 9c. Accounts, added in v5

**This reverses a decision the previous revision defended, so the reasoning matters
more than the feature.** Revision 3 argued that a flood app should ask nothing of the
person using it, and issued a one-time delete token instead of a login. That argument
still holds for reading the map, and reading still needs no account. It stops holding
for posting, for two reasons that only showed up once reports existed:

1. **A delete token lives in one browser.** Post from your phone in the rain, and you
   cannot take that report down from your laptop an hour later. Clear your site data and
   you cannot take it down at all. People post the wrong thing and want it gone, and the
   app had no answer.
2. **Anonymous posting costs nothing to abuse.** The IP rate limit is the only brake,
   and an IP is shared by a whole office and changed by a walk down the road. An account
   is a small cost to a real reporter and a real one to somebody posting rubbish.

**What it deliberately does not do.** No email confirmation, no password reset, no
social sign-in, no profile. Each of those needs a mail service, which needs a key, which
breaks the promise that this whole product runs on one free account with no keys.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Email, password, optional name. Signs you in at once |
| POST | `/api/auth/login` | Signs you in |
| POST | `/api/auth/logout` | Ends the session on the server, not only in the browser |
| GET | `/api/auth/me` | Who you are, or null |
| GET | `/api/my/reports` | Everything this account has live, newest first |

**Why not NextAuth or Auth.js.** They were the first thing considered, and they need a
framework: Next.js, SvelteKit, Qwik or Express. This app is a plain HTML page and one
Cloudflare Worker with no build step and no dependencies, so adopting either would mean
rebuilding the app around the library. The library is the right answer for an app that
already has a framework, and the wrong one here. What it would have provided is written
out below instead, in about two hundred lines of Web Crypto.

**How it is kept safe:**

1. **The password is never stored.** PBKDF2-SHA256 over 300,000 iterations with a
   16-byte random salt per user. bcrypt and argon2 are the usual choices and neither
   runs in a Worker; PBKDF2 is in the runtime already.
2. **Workers refuses more than 100,000 iterations in a single call**, and says so with
   `NotSupportedError: iteration counts above 100000 are not supported`. The limit does
   not apply when you run the Worker locally, so it appears for the first time on
   deployment, which makes it a good thing to have hit in front of a room. The work is
   chained instead: three passes of 100,000, each feeding its output in as the next
   pass's password, which costs an attacker three times what one pass would. OWASP asks
   for 600,000 for PBKDF2-SHA256; 300,000 is what fits comfortably in a free Worker.
3. **The iteration count is stored per user**, so it can be raised later without locking
   anybody out.
4. **A usable session token is never stored either.** The cookie carries a 32-byte
   random token; the table holds only its SHA-256 hash. Someone who reads the whole
   database still cannot sign in as anybody.
5. **The cookie is HttpOnly, SameSite=Lax, and Secure over HTTPS.** HttpOnly means no
   script on the page can read it, so a cross-site scripting bug cannot walk off with
   somebody's login. It is also why the page has to ask the server who it is.
6. **Every secret comparison is constant time**, so nothing can be guessed a character
   at a time by watching how long a reply takes.
7. **Eight failed sign-ins per network in fifteen minutes returns 429.** An unthrottled
   login form is a password guessing machine.
8. **A wrong email and a wrong password give the same message and do the same work**,
   so the form cannot be used to find out who has an account.
9. **One flag per account per report.** Flagging needed an account for this reason as
   much as any other: three flags hide a report, and one person could previously supply
   all three.

**The delete token stays.** Both proofs of ownership are accepted, so reports posted
before accounts existed, and any page still open from before you signed in, can still be
removed.

---

## 10. Corrections to Revision 1

**CHANGED. Leaflet cannot render the tiles revision 1 specified.**
§5 said "Leaflet.js with OpenFreeMap / OpenStreetMap vector tiles". OpenFreeMap serves
`application/vnd.mapbox-vector-tile`; Leaflet is a raster-tile library and cannot draw
it. The two halves of that sentence contradict each other.
**Now: MapLibre GL JS with OpenFreeMap vector tiles.** Smooth zoom, styleable layers,
and no tile-usage restriction.

**CHANGED. The rain trigger was looking the wrong way.**
§4.1 fired on `current precipitation > 0`. Tested live, Open-Meteo reported 0.0 mm
falling with 5.0 mm arriving in the next hour. Revision 1 would have said "all clear"
forty minutes before a downpour.
**Now: three states driven by the twelve-hour forecast as well as the current reading.**

**CHANGED. Bounding boxes would have made the app untrustworthy.**
§6 Phase 3 specified "bounding-box intersection". A box drawn around a curved flood zone
flags streets that never flood; a few false alarms and nobody believes the app again.
**Now: ray-casting point-in-polygon against every route coordinate.** OSRM returns 50+
points per route, so the test is precise and needs no library.

**NEW. OSRM usually offers only one route in Guwahati.**
Tested three real pairs with `alternatives=true` and again with `alternatives=3`: two of
three returned **exactly one route**, and where two came back, both crossed the same
zone. The "suggest an alternative" promise in §4.3 cannot always be kept.
**Now: the app ranks clear routes above fast ones, and when every route it can find is
flooded it says exactly that instead of inventing a detour.** This is a product decision,
not a bug.

**NEW. The flood polygons did not exist.**
Revision 1 said "hardcoded JSON polygon coordinates" without saying where they come
from. They come from a person drawing them. Locality centres were resolved through
Nominatim, but the results are landmarks, not flood extents: "Anil Nagar" returns a
clinic, "Zoo Road" a hotel.
**Now: five polygons drawn around those centres, shipped as an editable GeoJSON file
carrying `"status": "UNVERIFIED"`, and the interface tells the user so.**

---

## 11. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Page | Plain HTML, CSS, vanilla JS | No build step; every line readable |
| Map | MapLibre GL JS 4.7 | The only way to draw the chosen tiles |
| Tiles | OpenFreeMap `positron` | Free, no key, no usage cap |
| Weather | Open-Meteo | Free, no key, forecast included |
| Geocoding | Nominatim | Free, no key |
| Routing | OSRM demo server | Free, no key, returns alternatives |
| Hosting | Any static host | It is four files and a folder |

| Reports | Cloudflare Worker + D1 | The only part needing a server. One account, no keys |
| Accounts | Web Crypto in the Worker | PBKDF2 and SHA-256 are in the runtime. No library |
| Google sign-in | Google Identity Services | Free, no billing account. Token verified in the Worker |
| Satellite | Esri World Imagery | Free with attribution, no key |
| Language | Plain object in `i18n.js` | English and Assamese. No framework, no build step |

**Runtime dependencies: MapLibre alone**, plus Google's sign-in script when and only when
a client ID is configured. One Cloudflare account carries the reports and the accounts.
Still no API keys anywhere, and still nothing to install on the server.

### Google Maps, asked for and rejected in v7

Worth writing down, because the request was reasonable and the answer is not obvious.

Google Maps Platform is not free in the sense that matters here. Google's own getting
started page says **"you must set up a billing account to set up a Cloud project"**, so a
card is mandatory before any key works at all. The old universal 200 dollar monthly credit
was withdrawn and replaced with per-product free allowances that do not pool: roughly
10,000 map loads a month for Dynamic Maps, then charges. Replacing the routing and the
place search as well would add two more billed products.

Against that, the current stack costs nothing, needs no card, has no monthly ceiling, and
requires no signup at all. For an app whose entire premise is that a person in Guwahati can
run it and give it away, and for a workshop where thirty people may fork it, a shared key
attached to somebody's card is a genuinely bad idea.

**Sign in with Google is a different product and is genuinely free**, with no billing
account required. Taking one and not the other is the correct reading, not an inconsistency.

### Weather accuracy, checked rather than assumed

Open-Meteo was verified against MET Norway for the same coordinates: 28.1 against 28.8
degrees, 93 against 93.7 percent humidity, identical precipitation. Two independent models
agreeing to within a degree is as much confirmation as is available without a ground
station. The data was always correct. What was missing was that the app never displayed
temperature at all, which v7 fixes, including apparent temperature, since in this humidity
it runs several degrees above the real reading and is the figure people actually feel.

---

## 12. File Structure

```
aquaroute-guwahati/
├── index.html                 markup and the drawn icon set
├── styles.css                 tokens, three semantic colours, all states
├── wrangler.jsonc             Worker and D1 config
├── schema.sql                 the reports table
├── schema-auth.sql            users, sessions, flags, failed sign-ins
├── src/index.js               report API, photo serving, rate limits
├── src/auth.js                passwords, sessions, throttling
└── public/
    ├── index.html             markup and the drawn icon set
    ├── styles.css             tokens, three semantic colours, every state
    ├── app.js                 rain, routing, polygon tests, reporting, accounts
    └── data/flood-zones.geojson   the five zones, edit this not the code
```

---

## 13. Acceptance Criteria

**Rain**
- [x] Open-Meteo returns current and hourly precipitation for 26.1445, 91.7362
- [x] Mode is chosen from the forecast peak as well as the current reading
- [x] Forecast bars cover the next twelve hours from the current hour, never past hours
- [x] Weather failure leaves routing working and says so

**Zones**
- [x] Five polygons load and draw, coloured by severity
- [x] Each zone's centroid tests as inside its own polygon *(all 5 pass)*
- [x] A point outside the city hits no zone
- [x] Tapping a zone flies the map to it
- [x] The interface states that the outlines are unverified

**Routing**
- [x] A place name resolves through Nominatim; a "lat, lon" string skips it
- [x] OSRM returns a route for real Guwahati pairs *(3/3 tested)*
- [x] Every route coordinate is tested against every zone
- [x] Routes with no hits rank above faster routes with hits
- [x] Zones crossed are named in the result
- [x] When no clear route exists the app says so and offers nothing false

**Community reports**
- [x] A report posts with lat, lon, severity, note and photo
- [x] The photo returns byte-identical (63,928 bytes sent and received, valid JPEG)
- [x] A report without a photo works
- [x] Coordinates outside Guwahati are refused
- [x] An unknown severity is refused
- [x] A non-image data URL is refused
- [x] A photo over 220 KB is refused by the server, not only the page
- [x] The seventh report in an hour returns 429
- [x] Three flags hide a report, and its photo then 404s
- [x] Posting returns a delete token
- [x] Deleting with the wrong token returns 403 and the report survives
- [x] Deleting with the correct token removes it
- [x] Deleting the same report twice is harmless
- [x] Only your own reports offer a delete action
- [x] Reports are deleted at twelve hours, not merely hidden
- [x] Live reports change the route ranking
- [x] The app still works when the report server is unreachable

**Google sign-in** *(all passing)*
- [x] With no client ID configured the button does not render and the endpoint returns 501
- [x] `/api/config` reports the client ID so the page never shows a button that cannot work
- [x] A token signed with an attacker's own key is refused, even with the right issuer and audience
- [x] A token with `alg` set to `none` is refused
- [x] A malformed token is refused
- [x] None of those attempts creates an account
- [x] A Google account matching an existing email links to it rather than making a second
- [x] Password sign-in on a Google-only account says so instead of failing as a wrong password

**Languages** *(all passing)*
- [x] Every visible string switches to Assamese, including zone names and depth descriptions
- [x] A sweep for Latin text while Assamese is selected returns nothing but place names on the basemap
- [x] The choice survives a reload
- [x] Nothing overflows a 390 px screen in either language
- [x] Map labels switch where OpenMapTiles carries an Assamese name and fall back where it does not

**Accounts** *(25 checks, all passing)*
- [x] Posting without a session returns 401
- [x] A malformed email is refused
- [x] A password under ten characters is refused
- [x] Registering sets an HttpOnly cookie and signs you in at once
- [x] A second account on the same email is refused
- [x] The password appears nowhere in the database in readable form
- [x] Signing in works whatever case the email is typed in
- [x] A wrong password returns 401 with the same wording as an unknown email
- [x] Eight failed attempts in fifteen minutes returns 429 on the ninth
- [x] Signing out deletes the session on the server, not just the cookie
- [x] `/api/my/reports` without a session returns 401
- [x] `/api/my/reports` lists exactly this account's live reports
- [x] The owner can delete their report with no token, from any browser
- [x] A different signed-in account cannot delete it
- [x] Flagging without a session returns 401
- [x] The same account cannot flag the same report twice
- [x] The report composer opens the sign-in panel instead when signed out
- [x] Nothing in the account row or the panels overflows a 390 px screen

**Craft**
- [x] Icons are drawn SVG at one stroke weight, no emoji
- [x] Focus is visible on every control
- [x] Mechanical design detector reports no findings
- [x] No animation of layout properties

---

## 14. Open Questions & Risks

- **Risk: the polygons are guesses.** They are drawn around localities with a public
  reputation, not surveyed. *Mitigation: shipped as an editable file, flagged UNVERIFIED
  in the UI. Someone who knows these streets should redraw them at geojson.io.*
- **Risk: OSRM's demo server is not a product.** One request per second, non-commercial
  only, no uptime guarantee, and access "may be withdrawn at any time without giving a
  reason." *Mitigation: fine at classroom and neighbourhood scale. Real traffic means
  self-hosting OSRM, which is free software on a paid server.*
- **Risk: alternatives are scarce.** Often only one route exists. *Mitigation: the app
  is honest about it. Do not promise rerouting in the marketing.*
- **Risk: rainfall is city-wide, flooding is street-level.** One reading for all of
  Guwahati cannot know that one locality got the cloudburst. *Mitigation: the copy says
  "should be clear", never "is clear".*
- **Risk: unmoderated public photo uploads.** Anyone can post anything. Twelve-hour
  expiry, flags, rate limiting and a size cap reduce the exposure. They do not remove it.
  *Mitigation for any real deployment: a named person with a delete button and a takedown
  route.*
- **Risk: delete rights live in browser storage.** Clearing site data, or switching
  phones, loses the ability to delete a report you posted. *Mitigation: twelve-hour
  expiry means nothing is permanent anyway. Accounts would fix it and cost far more than
  the problem is worth.*
- **Q:** Should a report have to be near the person posting it? The pin is draggable
  anywhere in Guwahati today, which is useful and also abusable.
- **Q:** Assamese and Hindi interface copy? The audience is local; English-only is a
  real limitation.

---

## 15. Rollout & Next Steps

**MVP, built and running:** rain states, forecast panel, zone map, geocoded routing,
polygon hazard test, route ranking, zone browser, provenance note, community reports with
photo evidence, flagging, author deletion and expiry.

**Phase 2:**
1. Get the five polygons reviewed by someone who drives these roads
2. Assamese and Hindi copy
3. Add zones: Hatigaon, Rukminigaon and Chandmari are candidates
4. A shareable link that encodes from and to
5. Self-hosted OSRM if usage ever justifies it

**Next steps:**
1. Open the page, check the rain state against the sky outside
2. Correct the polygons
3. Deploy to any static host and test on a real phone in real rain
