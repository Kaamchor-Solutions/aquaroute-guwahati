# AquaRoute Guwahati

Live rain, the localities known to waterlog, and a plain verdict on whether the route
you are about to drive goes through one.

## Run it

```bash
npm install
npm run db:reset     # creates the local reports database
npm run dev          # http://127.0.0.1:8099
```

No build step, no `.env`, no API keys. One Cloudflare account, and only for the reports.

## What it costs

Nothing, at any traffic level. Four services, no keys:

| Service | Does | Limit |
|---|---|---|
| Open-Meteo | current + 12h rainfall | none published |
| OpenFreeMap | vector map tiles | none |
| Nominatim | place name to coordinates | 1 request/second |
| OSRM demo | driving routes | 1 request/second, non-commercial |

They all send `Access-Control-Allow-Origin: *`. That single fact is why the map, the
rainfall and the routing need no server at all.

The one exception is community reports, which need a shared place to live: a small
Cloudflare Worker with a D1 database. **If it is unreachable the app still works** and
simply shows no reports. That is deliberate, not luck.

## Community reports

Anyone can post water at a point: a severity, an optional note, an optional photo. Live
reports appear as markers, open into a photo view, and count against a route within 130 m
of it. Somebody standing in the water an hour ago is better evidence than an outline
traced last year, so a live report outranks the drawn polygons.

**Photos are re-encoded through a canvas in the browser before they are sent.** That
produces a brand new file and leaves every EXIF tag behind, including the GPS position and
the device identifiers your camera writes into every picture. This is the privacy
mechanism; the smaller file is a side effect. The interface tells the reporter so.

Six things guard an endpoint anyone on the internet can post a photo to:

| Guard | Value |
|---|---|
| Photo ceiling | 220 KB, enforced on the server as well as the page |
| Expiry | 12 hours, then the row is **deleted**, not hidden |
| Community flags | 3 hides the report, and its photo then 404s |
| Rate limit | 6 reports per hour, per salted IP hash |
| Deletion | only the phone that posted it, via a one-time token |
| Geography | coordinates outside Greater Guwahati are refused |
| Storage | the JPEG lives in D1 as a BLOB, so there is no second service |

## Languages

English and Assamese, switched with the button at the top right of the rain card. The
choice is remembered in the browser, because somebody who reads Assamese should not have
to pick it again every time it rains.

Everything switches: the interface, the messages, the flood zone names and depth
descriptions, and the place labels on the map itself where OpenMapTiles carries an
Assamese name for them. The strings live in `public/i18n.js`; the zone translations live
alongside the English in `public/data/flood-zones.geojson` as `name_as`, `typicalDepth_as`
and `note_as`, because those are data rather than interface.

Two things are deliberate. Measurements keep Western digits, because every figure here is
set in a monospaced face and lines up in a column that mixed numeral systems would break.
And the Assamese display type is Noto Sans Bengali rather than the Latin serif, which has
no glyphs for the script at all; the italic emphasis in the verdict becomes weight,
because Assamese has no italic tradition.

**These translations should be read by a native speaker before a real audience sees them.**
They follow the vocabulary already used in the Jorhat build so the two apps agree with each
other, but they are careful translations rather than authoritative ones.

## Accounts

Reading the map needs nothing. No sign-up, no cookie banner, nothing. That is the point:
somebody trying to get home in heavy rain will not stop to make an account.

Posting a report needs one, and there is a real trade behind that. What it buys is that
you can take your own report down from any phone rather than only the one you posted it
from, and that posting rubbish costs an email address rather than nothing.

Two ways in: an email and password, or **Sign in with Google**. Google Sign-In is free and
needs no billing account, which is what separates it from Google Maps. It is off until a
client ID is configured, and the button simply does not appear until then, so nothing is
ever shown broken. `GOOGLE-SIGNIN-SETUP.md` has the ten minutes of console clicking.

The email address ties the two together. Register with a password, press the Google button
later with the same address, and you get the same account and the same reports. Start with
Google and there is no password at all, and the password form says so rather than letting
you guess at one you never set.

There is no email confirmation and no password reset, because both need a mail service and
this app deliberately runs with no API keys anywhere.

What is stored, and what is not:

- **Not your password.** A PBKDF2-SHA256 hash of it over 300,000 iterations with a random
  salt for each user. It cannot be turned back into your password. Workers caps a single
  PBKDF2 call at 100,000 iterations, and only in production, never locally, so the work is
  chained: three passes, each feeding the next.
- **Not a usable session token.** The cookie holds a random token; the table holds only
  its SHA-256 hash. Somebody who reads the whole database still cannot sign in as you.
- The cookie is HttpOnly, so no script on the page can read it, and Secure over HTTPS.
- **Nothing in a Google token is believed until it is checked.** The Worker verifies the
  signature against Google's published keys, that the token was issued for this
  application and not another one, and that it has not expired. A token signed with the
  wrong key, one with the algorithm set to `none`, and a malformed one are all refused,
  and none of them creates an account.

Eight failed sign-ins from one network in fifteen minutes and the form starts refusing.
An unknown email and a wrong password give exactly the same answer, so nobody can use the
form to find out who has an account.

If you are demonstrating this, the interesting part is not the login box. It is that all
of it is Web Crypto, which the runtime ships with, in one file with no dependencies. The
authentication libraries people reach for first all need a framework this app does not
have.

---

## Deleting your own report

Posting returns a one-time secret that only that browser ever sees. It is stored
locally and required to delete the report, compared in constant time on the server, so
only the author can remove one. Nobody has to create an account for an app they may use
once, in the rain.

Your own pins carry a ring, and opening one offers **Delete my report** instead of
**Not accurate**.

The honest limit: clear your browser data, or post from a different phone, and you lose
the ability to delete that report. It still expires by itself after twelve hours.

## Weather

Open-Meteo, no key, no account. It gives current rainfall, the twelve-hour forecast, and
since v7 the temperature, what it feels like, and humidity.

The figures were checked against MET Norway for the same coordinates rather than taken on
trust: 28.1 against 28.8 degrees, 93 against 93.7 percent humidity, and identical
precipitation. Within a degree, from two independent forecasting models, which is as much
agreement as is available. The data was always right; it simply was not being shown.

Feels-like earns its place here. In Guwahati's humidity the apparent temperature runs
several degrees above the real one, and that is the number people actually experience, so
both are displayed when they differ by a degree or more.

## The map

MapLibre with OpenFreeMap vector tiles, no key, no cap, no card. The two buttons on the
right toggle **satellite imagery** (Esri World Imagery, free with attribution, also no key)
and **recentre**, which returns to Guwahati or refits the current route.

Google Maps was considered and rejected. It requires a billing account with a card on file
before it will issue a working key, which would end this app's ability to run on free
accounts with nothing to sign up for. The free stack is not a compromise here; it is the
thing that makes the app giveable.

## The interface

Four destinations in a floating tab bar: **Route**, **Zones**, **Report**, **You**. One
panel shows at a time, over the map, and tapping the tab you are already on dismisses it
so the map has the whole screen. Report is not a place of its own: it opens the composer
and hands you back to wherever you were.

The look is called Daylight. It came from a Claude Design handoff that was mocked up from
this project's own PRD and screenshots, offered three directions, and the light one was
picked. Frosted white glass over a pale map, the verdict written as a sentence in
Instrument Serif with the flooded zone named in italic red, and every figure monospaced.

The app used to be dark, on the argument that a commuter outdoors at dusk in heavy rain
wants a dark screen. That argument is a real one. What it missed is that the map
underneath was always the pale *positron* style, so a dark shell never belonged to it.
Glare at night is the honest cost, and it is the first thing to revisit if anyone
complains.

Above 860px the panels become a left column and the map takes the rest. Nothing reflows
below that.

### How much map you actually get

Both cards fold. The rain card keeps the headline, the peak figure and the temperature and
folds away the twelve-hour bars; the route card keeps the verdict sentence and folds away
the supporting line and the route cards. Each has a small handle, each remembers your
choice, and tapping a route folds the detail on its own, because that tap means "show me
this one".

This was a real bug rather than a preference. The panel's ceiling used to be
`100vh - 240px`, which is fine on a tall phone and catastrophic on a short window: at
550px the rain card took 44 percent, the panel took 52 percent, and **the unobstructed map
band was exactly zero.** The two cards met in the middle. The ceiling is now a share of the
viewport as well as a subtraction, the type steps down below 700px of height, and the
forecast starts folded on a short screen.

Measured, unobstructed, with a route on screen:

| Viewport | Before | After |
|---|---|---|
| 390 x 550 | 0% | 41% |
| 390 x 640 | 0% | 43% |
| 390 x 844 | 26% | 24%, and 45% once you tap a route |

The tall phone gives up a little because there is room to show the answer in full, which is
what you want right after asking for it.

**There is no staffed moderation.** For a neighbourhood tool with twelve-hour expiry that
is a defensible position. For anything larger it is not, and a real deployment needs a
person with a delete button.

## The flood zones are not survey data

`data/flood-zones.geojson` holds five polygons drawn around localities with a public
reputation for waterlogging. **Nobody official has checked them.** The file says
`"status": "UNVERIFIED"` and the interface tells users the same thing.

If you know these streets, fix them:

1. Open <https://geojson.io>
2. Drag `data/flood-zones.geojson` in
3. Drag the outlines to where the water actually reaches
4. Save over the file and reload

The properties each zone carries:

```json
{
  "id": "ganeshguri",
  "name": "Ganeshguri, under the flyover",
  "severity": "severe | moderate",
  "note": "what actually happens here, in plain words",
  "typicalDepth": "deep enough to stall a small car"
}
```

Write `typicalDepth` as a human phrase. A fake precise number invites trust the data has
not earned.

## How the hazard check works

OSRM returns the route as a list of coordinates, usually fifty or more. Each one is
tested against each flood polygon by ray casting: a point is inside when a line drawn
east from it crosses the outline an odd number of times. Thirty lines of code, no
library.

The original brief called for bounding-box intersection. A box around a curved zone
flags streets that never flood, and a few false alarms are all it takes for people to
stop believing the app.

## Three things worth knowing before you demo it

**OSRM usually returns only one route here.** Tested on real Guwahati pairs, two of
three returned exactly one route even with alternatives requested. When the only route
crosses a zone, the app says so rather than inventing a detour. Do not promise
rerouting.

**Rainfall is city-wide, flooding is street-level.** One reading cannot know that one
locality caught the cloudburst. The copy says "should be clear", never "is clear".

**The OSRM demo server is not a product.** Non-commercial, one request per second, and
access can be withdrawn without a reason. Fine for a class or a neighbourhood. Real
traffic means self-hosting OSRM.

## Files

```
wrangler.jsonc   Worker and D1 config
schema.sql       the reports table
src/index.js     report API, photo serving, rate limits
public/
  index.html     markup and the drawn icon set
  styles.css     tokens, three semantic colours, every state
  app.js         rain, routing, polygon tests, reporting
  data/flood-zones.geojson   the five zones, edit this not the code
```

## Deploying

```bash
npx wrangler d1 create aquaroute      # paste the id into wrangler.jsonc
npm run db:reset:remote
npx wrangler secret put REPORTER_SALT # any long random phrase
npm run deploy
```

`REPORTER_SALT` is what keeps the rate-limit column from being a list of IP addresses.
Set it before you take a single real report.
