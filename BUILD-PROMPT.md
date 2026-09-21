# The build prompt

Paste everything between the lines into a fresh Claude Code session, in an empty
folder. It will interview you first, then build.

Keep the interview. A prompt that starts writing immediately will guess your city,
your flood spots and your map library, and you will spend longer correcting it
than answering four questions.

---

I want to build a flood-avoidance web app for commuters in my city, and I am not a
programmer. Explain what you are doing as you go, in plain language.

**Before you write any code, interview me.** Ask the questions below in small
groups, wait for my answers, then show me a short plan for my approval. Do not
create files until I approve the plan.

## What I want to end up with

During heavy rain, specific streets in my city flood in the same places every
year. General mapping apps route people straight into them, because a road under
half a metre of water is still, as far as the map knows, a road.

I want a phone-sized page that checks live and forecast rainfall, holds a map of
the places known to flood, and tells me plainly whether the route I am about to
drive passes through one. Anyone should also be able to report water they are
standing in, with a photo.

**It must cost nothing to run.** No paid APIs, no API keys I have to buy, no
subscriptions. If something I ask for needs a paid service, tell me before you
build it, not after.

## Interview me about these

**1. The city**
- Which city, and its centre coordinates
- Which localities are known for waterlogging, by name
- What language the interface should be in

**2. The flood zones**
- Ask me whether I already have flood-zone data, or whether you should draw
  approximate polygons around the localities I name
- If you draw them, tell me clearly that they are guesses and must be corrected by
  someone who knows those streets. Build that admission into the interface, not
  just the README

**3. Accounts and access**
- Ask me to run `npx wrangler whoami` and paste the output, so you know whether I
  am signed in to Cloudflare and which account you are working in
- Confirm my Node version with `node --version`
- Ask whether I want to run locally only, or deploy to a public address today
- Tell me the reporting feature needs a database, and that the map, rainfall and
  routing do not

**4. How much you should explain**
- Ask whether I want a running commentary, or a summary at the end of each stage

Then show me your plan and wait.

## The services to use, and one trap to avoid

All free, none need a key:

- **Open-Meteo** for current and hourly forecast rainfall
- **OpenFreeMap** for map tiles
- **Nominatim** for turning a place name into coordinates
- **OSRM demo server** for driving routes

**Check first, then tell me:** fetch each of those once and confirm it returns
`Access-Control-Allow-Origin: *`. If they all do, the map, rainfall and routing
need no server at all and the page can call them directly from the browser. Say so
out loud, because it changes the whole shape of the build.

**The trap: MapLibre GL JS, not Leaflet.** OpenFreeMap serves *vector* tiles.
Leaflet is a raster-tile library and cannot draw them. Plenty of tutorials pair
those two names in one sentence; the sentence is wrong. Use MapLibre.

**Respect the rate limits in code.** Nominatim and OSRM both ask for no more than
one request per second. Wait between the two geocode calls, and skip the wait when
a field already holds coordinates.

## How to build it

**Rainfall drives a three-state alert: Clear, Watch, Monsoon.**
Drive it from the **forecast**, not only the current reading. A dry minute with
5 mm arriving in forty is not "all clear", and an app that says it is will not be
trusted twice.

**Check routes with point-in-polygon, not bounding boxes.**
OSRM returns fifty or more coordinates per route. Test every one against every
flood polygon with a ray-casting check, about thirty lines and no library. A box
drawn around a curved zone flags streets that never flood, and a few false alarms
are all it takes for people to stop believing the app.

**Be honest when there is no good route.**
Ask OSRM for alternatives, test each, and rank clear routes above fast ones. But
the demo server often returns only one route for a city pair. When everything it
offers crosses a zone, say exactly that. Do not invent a detour that does not
exist.

**Never couple data loading to the map loading.**
Fetch the flood zones on their own and render the list immediately; add the map
layers later, only if and when the map becomes ready. If you load the zones inside
the map's `load` event, then a phone with no working WebGL shows a flood app with
no floods in it. Add a timeout that says so plainly if the map has not drawn in
about twelve seconds.

## The reporting feature

Anyone can post water at a point: a severity, an optional note, an optional photo.
This is the only part that needs a server, because a report from me has to reach
other people. Use a Cloudflare Worker with a D1 database.

**Re-encode the photo through a canvas in the browser before uploading.** That
produces a brand new file and leaves every EXIF tag behind, including the GPS
position and device identifiers the camera writes into every picture. Somebody
reporting flooding outside their own house would otherwise be publishing their
home address. Tell the user in the interface that you did this. The smaller file
is a side effect, not the reason.

Then guard the endpoint, because anyone on the internet can post to it:

- a hard size ceiling, enforced **on the server** as well as in the page
- delete every report after twelve hours; flood water is not a permanent fact
  about a street, and expiry also limits how long anything anyone uploads can sit
  on the map
- three community flags hide a report
- a few reports per hour per reporter, counted against a **salted hash** of the IP
  so the table never holds anything that maps back to a person
- refuse coordinates outside the city

**Live reports outrank drawn polygons.** Somebody standing in water an hour ago is
better evidence than an outline traced last year, so a report near a route should
count against it and change the ranking.

**Let people delete a report they posted, without making them sign up.** When a
report is created, return a one-time secret to that browser and store it alongside
the row. The browser keeps it; deletion requires it, compared in constant time. Show
"Delete my report" instead of "Not accurate" when the phone holds the token for that
report, and mark those pins so they are easy to find. Tell the user plainly that
clearing their browser data loses this ability.

## Accounts

Reading the map must need no account at all. Somebody trying to get home in heavy rain
is not going to stop and sign up, and that person is who the app is for.

Posting a report does need one. Ask me about this before you build it, because it is a
real trade and I want to have made it deliberately: an account means a reporter can take
a report down from any phone rather than only the one they posted from, and it means
posting rubbish costs an email address instead of nothing.

Do not reach for an authentication library. The obvious ones need a framework this app
does not have, and pulling one in would mean rebuilding the app around it. Everything
below is in the Workers runtime already.

- Store a PBKDF2-SHA256 hash of the password with a random salt for each user, and store
  the iteration count alongside it so it can be raised later. Never store the password.
  Expect a surprise here: Workers refuses a single PBKDF2 call above 100,000 iterations,
  and the limit only applies once deployed, so it works locally and fails live. Chain the
  passes rather than lowering the count.
- Put a long random token in an HttpOnly, SameSite=Lax cookie, Secure over HTTPS, and
  store only its SHA-256 hash. A leaked database must not let anyone sign in as anyone.
- Compare every secret in constant time.
- Count failed sign-ins and return 429 after a handful. Say so plainly in the reply.
- Give the same answer for an unknown email as for a wrong password, so the form cannot
  be used to find out who has an account.
- One flag per account per report. Three flags hide a report, so one person must not be
  able to supply all three.
- Keep the old one-time delete token working as well, so reports posted before accounts
  existed can still be removed.

No email confirmation and no password reset. Both need a mail service, which needs a
key, and this whole app runs on one free account with no keys. Say that out loud rather
than pretending it is finished.

---

## Design

Phone first, one hand, outdoors, often at dusk in rain. Pick light or dark from
that scene and tell me why you picked it.

Whichever you pick, **check it against the basemap you actually chose**. This app
shipped dark on the dusk-and-rain argument, then had to be rebuilt light, because
the tiles underneath were a pale style the whole time and a dark shell never
belonged to them. The reasoning was fine; nobody held it up against the map.

**The map is the product, so do not let a panel eat the screen.** Give the app a
small number of destinations, show one panel at a time over the map, and let the
user dismiss it to get the map back. Four is enough here: the route, the zones,
reporting, and the account.

Reporting is an errand, not a destination: it should open, take the report, and
hand the user back to wherever they were.

**Write the verdict as a sentence, not a label.** "Your quickest way runs straight
through Ganeshguri" tells somebody what to do. A red chip reading "2 ZONES" makes
them work it out. Set that sentence large and name the flooded place inside it.

If you use a draggable bottom sheet instead, one trap: a drag also fires a click
when the finger lifts, which will toggle the sheet straight back to where it
started unless you swallow that click.

Use exactly three meaningful colours and give each one job: one for rain data, one
for flood hazard, one for a route that is clear. Nothing else gets colour.

Draw the icons as SVG at one stroke weight. No emoji standing in for an icon set.

**Watch the `hidden` attribute.** It is only a user-agent `display: none`, so any
CSS rule of yours that sets `display` on the same element silently beats it. Ship
`[hidden] { display: none !important; }` or your dialogs will render on page load.

## How I want you to work

- Get something on screen early. A working map in twenty minutes beats a perfect
  data model in an hour.
- After each stage, tell me what to open to see it working myself.
- **Take a screenshot and look at it before you tell me a screen is done.** If you
  have Chrome or Edge on this machine you can do it headlessly. Do not describe a
  page you have not seen.
- If something does not work, say so plainly. Do not tell me it works until you
  have run it.
- Comment the code for someone who does not program.
- Write me a README covering how to run it, where the flood data comes from, and
  what will go wrong at a live demo.

## When you are finished, verify. Do not assume.

For the accounts specifically, prove all of this rather than telling me it works: that
posting without signing in is refused, that a short password is refused, that a second
account on the same email is refused, that the password is nowhere in the database in
readable form, that a wrong password and an unknown email give the same answer, that too
many attempts get throttled, that signing out ends the session on the server, and that
one signed-in account cannot delete or double-flag another's report.

Run these yourself and show me the output:

- Fetch live rainfall for my city and show me the numbers
- Confirm each flood polygon contains its own centre point
- Confirm a point far outside the city hits no zone
- Fetch a real route and show which zones it crosses, with counts
- Post a report with a photo, then fetch the photo back and confirm it is
  **byte-identical** to what was sent
- Post a report without a photo
- Try to post from outside the city, with a bad severity, with a non-image file,
  and with an oversized photo. All four must be refused
- Exceed the rate limit and show me the refusal
- Flag a report three times and confirm it disappears and its photo 404s
- Delete a report with the wrong token and confirm it is refused and survives
- Delete it with the correct token and confirm it is gone
- Delete the same report twice and confirm the second attempt is harmless
- Screenshot the page at phone width and at desktop width, and look at both

Every item on that list is there because it actually broke while this was being
built. The two that looked completely fine from the outside were a dialog
rendering on page load, and a photo that uploaded successfully and came back zero
bytes long.

---

## Notes for whoever is teaching with this

**The zero-cost claim is the lesson.** Have the room check the CORS headers
themselves before anyone writes code. Discovering that four public services will
talk directly to a browser is the moment people understand what "no backend"
actually means.

**Two corrections carry the most weight.** Leaflet cannot draw vector tiles, and a
rainfall trigger that only looks at the current minute will tell people it is safe
to leave forty minutes before a downpour. Both are the kind of mistake that looks
completely reasonable in a specification.

**If time is short, cut the reporting feature.** The map, the rainfall states and
the route verdict are the product, and they need no server at all. Reporting adds
a database, a photo pipeline and a moderation conversation, which is a second
session's worth of material.
