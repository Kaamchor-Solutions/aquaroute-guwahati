/* AquaRoute Guwahati
 *
 * Everything here runs in the browser. There is no server, no database, no key.
 * All four services it talks to send Access-Control-Allow-Origin: *, which is
 * the only reason a static page can do this at all.
 *
 *   Open-Meteo   live rain + 12h forecast     no key
 *   OpenFreeMap  vector map tiles             no key, no usage cap
 *   Nominatim    place name -> coordinates    no key, 1 request/second
 *   OSRM         driving routes + alternates  no key, 1 request/second
 */

const GUWAHATI = { lon: 91.7362, lat: 26.1445 };

// Rain thresholds, in mm/h. Below WATCH the streets cope; above MONSOON the
// known hollows start filling within the hour.
const WATCH = 0.6;
const MONSOON = 2.5;

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const STYLE = 'https://tiles.openfreemap.org/styles/positron';

const $ = (id) => document.getElementById(id);

/* Zone names and depths are data, not interface, so they carry their own
   Assamese alongside the English rather than going through the string table.
   Falls back to English if a translation is missing, which is the right way
   round: a name in the wrong language beats a blank. */
const zf = (props, field) => (lang() === 'as' && props[field + '_as']) || props[field];
const fmtKm = (m) => (m / 1000).toFixed(1) + ' km';
const fmtMin = (s) => Math.round(s / 60) + ' min';

let map = null, mapReady = false, zones = null, routes = [], chosen = 0;

/* ------------------------------------------------------------------ map */
function startMap() {
  try {
    map = new maplibregl.Map({
      container: 'map',
      style: STYLE,
      center: [GUWAHATI.lon, GUWAHATI.lat],
      zoom: 12.2,
      attributionControl: { compact: true },
    });
  } catch {
    // No WebGL. Old phone, blacklisted driver, or a locked-down browser.
    return mapUnavailable();
  }
  if (innerWidth >= 860) {
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  }
  map.on('load', () => {
    mapReady = true;
    paintZoneLayers();
    drawReports();
    // MapLibre shows the attribution expanded until the map is first touched.
    // Over a frosted panel it reads as a smudge, so collapse it to its button
    // now. The credit is one tap away, which is the form MapLibre ships.
    document.querySelector('.maplibregl-ctrl-attrib')
      ?.classList.remove('maplibregl-compact-show');
  });
  map.on('error', (e) => console.warn('map:', e?.error?.message || e));

  /* MapLibre parses vector tiles inside Web Workers. Where those are blocked -
     a strict corporate proxy, a locked-down browser, a very old phone - the map
     never fires `load` and simply sits there blank forever. Say so instead. */
  setTimeout(() => { if (!mapReady) mapUnavailable(true); }, 12000);
}

function mapUnavailable(timedOut) {
  const el = document.getElementById('map');
  if (!el || el.querySelector('.map-down')) return;
  const why = timedOut
    ? t('map_timeout')
    : t('map_down');
  const p = document.createElement('p');
  p.className = 'map-down';
  p.textContent = why + ' Everything else still works: check a route below and read the '
                + 'verdict, and the waterlogging zones are listed there too.';
  el.appendChild(p);
}

/* The flood zones are the product. They must never depend on the map drawing,
   because a phone with no working WebGL still deserves a route verdict. So the
   data is fetched on its own and the list renders immediately; the map layers
   are added later, only if and when the map becomes ready. */
async function loadZones() {
  try {
    zones = await fetch('data/flood-zones.geojson').then((r) => r.json());
  } catch {
    $('zoneList').innerHTML = '<li class="zone-fail">' + t('zones_failed') + '</li>';
    return;
  }
  listZones();
  paintZoneLayers();
}

/* Runs on whichever finishes last, the map or the data. Both guards matter. */
function paintZoneLayers() {
  if (!mapReady || !zones || map.getSource('zones')) return;

  // Push the basemap back so our own data is the loudest thing on it.
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol') continue;
    if (/water|ocean|river/i.test(layer.id) && layer.paint) continue;
    try { map.setPaintProperty(layer.id, layer.type + '-opacity', 0.72); } catch { /* not all layers take it */ }
  }

  map.addSource('zones', { type: 'geojson', data: zones });

  map.addLayer({
    id: 'zone-fill', type: 'fill', source: 'zones',
    paint: {
      'fill-color': ['match', ['get', 'severity'], 'severe', '#c8402c', '#b07407'],
      'fill-opacity': 0.14,
    },
  });
  map.addLayer({
    id: 'zone-line', type: 'line', source: 'zones',
    paint: {
      'line-color': ['match', ['get', 'severity'], 'severe', '#c8402c', '#b07407'],
      'line-width': 1.6, 'line-dasharray': [2.5, 1.6], 'line-opacity': 0.9,
    },
  });
  map.addLayer({
    id: 'zone-label', type: 'symbol', source: 'zones',
    layout: {
      'text-field': lang() === 'as'
        ? ['coalesce', ['get', 'name_as'], ['get', 'name']]
        : ['get', 'name'],
      'text-size': 11.5, 'text-max-width': 9, 'text-font': ['Noto Sans Regular'],
    },
    paint: { 'text-color': '#8f2c1c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
  });

  localiseBasemap();

  map.addSource('route', { type: 'geojson', data: empty() });
  map.addLayer({
    id: 'route-casing', type: 'line', source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.95 },
  });
  map.addLayer({
    id: 'route-line', type: 'line', source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['case', ['get', 'hazard'], '#c8402c', '#0f6b50'],
      'line-width': 5,
    },
  });

  map.on('click', 'zone-fill', (e) => {
    const p = e.features[0].properties;
    new maplibregl.Popup({ closeButton: false, offset: 12 })
      .setLngLat(e.lngLat)
      .setHTML(`<strong>${esc(zf(p, 'name'))}</strong><br>${esc(zf(p, 'note'))}`)
      .addTo(map);
  });
  map.on('mouseenter', 'zone-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'zone-fill', () => { map.getCanvas().style.cursor = ''; });
}

const empty = () => ({ type: 'FeatureCollection', features: [] });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------- rainfall */
async function checkRain() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${GUWAHATI.lat}&longitude=${GUWAHATI.lon}`
            + `&current=precipitation,temperature_2m,apparent_temperature,relative_humidity_2m`
            + `&hourly=precipitation&forecast_days=2&timezone=Asia%2FKolkata`;
  try {
    const d = await fetch(url).then((r) => r.json());
    const now = d.current?.precipitation ?? 0;

    // Only look forward from the current hour, never at rain already past.
    const i0 = d.hourly.time.findIndex((t) => t >= d.current.time.slice(0, 13));
    const start = i0 < 0 ? 0 : i0;
    const next12 = d.hourly.precipitation.slice(start, start + 12);
    const hours = d.hourly.time.slice(start, start + 12);
    const peak = Math.max(...next12);
    const total = next12.reduce((a, b) => a + b, 0);

    lastRain = { hours, mm: next12, total, peak, now };
    paintForecast(hours, next12, total, peak);
    setMode(now, peak, total);
    paintConditions(d.current);
  } catch {
    $('status').dataset.mode = 'clear';
    $('statusLine').textContent = t('rain_unavailable');
    $('statusSub').textContent = t('rain_unavailable_sub');
    $('rainStats').textContent = '';
    $('rainPeak').textContent = '·';
  }
}

/* Temperature, what it feels like, and humidity. Open-Meteo was checked against
   MET Norway for this location and the two agreed to within a degree, so the
   figure is trustworthy; it simply was never displayed before. */
/* The rain card grows and shrinks with its forecast line, and the map controls
   are pinned below it, so its height has to be measured rather than guessed at
   in the stylesheet. */
function measureRain() {
  const h = $('status').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--rain-h', Math.round(h) + 'px');
}

/* The forecast detail starts closed on a short screen and open on a tall one,
   because on a 550 px window the rain card and the panel would otherwise meet
   in the middle and leave no map at all. Once somebody chooses, their choice
   wins on that device from then on. */
const RAIN_KEY = 'aquaroute.forecast';
function setRainOpen(open, remember) {
  $('status').dataset.open = open ? '1' : '0';
  $('rainMore').setAttribute('aria-expanded', String(open));
  if (remember) { try { localStorage.setItem(RAIN_KEY, open ? '1' : '0'); } catch { /* fine */ } }
  // The transition runs for 320ms and the controls below are pinned to the
  // card's height, so remeasure at the end rather than at the start.
  measureRain();
  setTimeout(measureRain, 340);
}

function initRain() {
  let saved = null;
  try { saved = localStorage.getItem(RAIN_KEY); } catch { /* fine */ }
  setRainOpen(saved !== null ? saved === '1' : innerHeight >= 760, false);
}

$('rainMore').addEventListener('click', () =>
  setRainOpen($('status').dataset.open === '0', true));

/* The route panel folds the same way. Only the verdict sentence stays, because
   that is the answer; the supporting line and the route cards are the working
   out. Once a route has been chosen on a short screen this closes itself, since
   that is exactly when somebody wants to look at the map instead. */
function setRouteOpen(open) {
  $('panelRoute').dataset.open = open ? '1' : '0';
  $('routeMore').setAttribute('aria-expanded', String(open));
}

$('routeMore').addEventListener('click', () => {
  const open = $('panelRoute').dataset.open === '0';
  setRouteOpen(open);
  if (routes.length && routes[chosen]) setTimeout(() => select(chosen), 340);
});

addEventListener('resize', () => { measureRain(); });

function paintConditions(cur) {
  if (!cur || cur.temperature_2m == null) { $('rainStats').textContent = ''; return; }
  const bits = [Math.round(cur.temperature_2m) + '\u00b0C'];
  if (cur.apparent_temperature != null && Math.abs(cur.apparent_temperature - cur.temperature_2m) >= 1) {
    bits.push(t('rain_feels') + ' ' + Math.round(cur.apparent_temperature) + '\u00b0');
  }
  if (cur.relative_humidity_2m != null) {
    bits.push(t('rain_humidity') + ' ' + Math.round(cur.relative_humidity_2m) + '%');
  }
  $('rainStats').textContent = bits.join('  \u00b7  ');
  lastConditions = cur;
  measureRain();
}
let lastConditions = null;
let lastRain = null;

/* The one place the app decides how alarmed to be. Forecast, not just now:
   a dry minute with 5 mm arriving in forty is not "all clear". */
function setMode(now, peak, total) {
  const el = $('status');
  const line = $('statusLine');
  const sub = $('statusSub');

  $('rainPeak').textContent = peak.toFixed(1);

  if (now >= MONSOON || peak >= MONSOON) {
    el.dataset.mode = 'monsoon';
    line.innerHTML = t(now >= MONSOON ? 'mode_monsoon_now' : 'mode_monsoon_soon');
    sub.textContent = t('mode_monsoon_sub');
  } else if (now >= WATCH || peak >= WATCH) {
    el.dataset.mode = 'watch';
    line.innerHTML = t(now >= WATCH ? 'mode_watch_now' : 'mode_watch_soon');
    sub.textContent = t('mode_watch_sub');
  } else {
    el.dataset.mode = 'clear';
    line.innerHTML = t('mode_clear');
    sub.textContent = total > 0
      ? total.toFixed(1) + ' mm ' + (lang() === 'as' ? 'অহা বাৰ ঘণ্টাত।' : 'expected in twelve hours.')
      : t('mode_clear_sub_none');
  }
}

function paintForecast(hours, mm, total, peak) {
  // Scaling to the peak alone means a dry twelve hours renders as twelve
  // identical stubs, which reads as a broken rule rather than as "no rain".
  // A floor of 1.5 mm keeps a light shower visible and a dry day honestly flat,
  // and the baseline track behind each bar shows there is a chart here at all.
  const max = Math.max(peak, 1.5);
  const dry = peak < 0.05;

  $('bars').dataset.dry = dry ? '1' : '';
  $('bars').innerHTML = hours.map((iso, i) => {
    const h = dry ? 0 : Math.max(0.04, mm[i] / max).toFixed(3);
    const cls = peak > 0 && mm[i] >= peak ? ' peak' : (mm[i] >= WATCH ? ' wet' : '');
    const hh = iso.slice(11, 13);
    return `<div class="bar${cls}" title="${hh}:00, ${mm[i].toFixed(1)} mm">
              <div class="bar-fill" style="--h:${h}"></div>
            </div>`;
  }).join('');

  requestAnimationFrame(measureRain);
  $('forecastFoot').textContent = total > 0
    ? total.toFixed(1) + ' mm ' + (lang() === 'as'
        ? 'মুঠ, সৰ্বোচ্চ ' + peak.toFixed(1) + ' mm/h।'
        : 'in total, peaking at ' + peak.toFixed(1) + ' mm/h.')
    : t('mode_clear_sub_none');
}

/* ------------------------------------------------------- flood geometry */

/* Ray casting. A point is inside when a line drawn east from it crosses the
   outline an odd number of times. No library needed for this. */
function inPolygon([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* Test every point OSRM gave us against every zone.
   The brief called for bounding boxes. A box around a curved road flags streets
   that never flood, so the whole feature stops being believed. Point in polygon
   costs the same and tells the truth. */
function hitZones(coords) {
  const hits = [];
  if (!zones) return hits;
  for (const f of zones.features) {
    const ring = f.geometry.coordinates[0];
    let n = 0;
    for (const c of coords) if (inPolygon(c, ring)) n++;
    if (n > 0) hits.push({ ...f.properties, points: n, share: n / coords.length });
  }
  return hits.sort((a, b) => b.points - a.points);
}

/* ------------------------------------------------------------- geocoding */
/* A typed "lat, lon" routes straight through. Sending coordinates to a
   place-name search just produces a confusing "not found". */
const asCoords = (s) => {
  const m = s.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  return m ? { lat: +m[1], lon: +m[2], label: 'Your location' } : null;
};

async function geocode(q) {
  const direct = asCoords(q);
  if (direct) return direct;
  const url = `${NOMINATIM}?q=${encodeURIComponent(q + ', Guwahati, Assam')}&format=json&limit=1`;
  const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const j = await r.json();
  if (!j.length) throw new Error(`Could not find "${q}" in Guwahati.`);
  return { lon: +j[0].lon, lat: +j[0].lat, label: j[0].display_name.split(',').slice(0, 2).join(',') };
}

/* ---------------------------------------------------------------- routing */
async function plan(e) {
  e?.preventDefault();
  const btn = $('goBtn'), label = $('goLabel'), msg = $('msg');
  const from = $('fromInput').value.trim();
  const to = $('toInput').value.trim();
  if (!from || !to) return;

  btn.disabled = true; btn.dataset.busy = '1';
  label.textContent = t('finding') + '…';
  setRouteOpen(true);
  msg.textContent = ''; msg.removeAttribute('data-tone');
  $('results').hidden = true;

  try {
    const a = await geocode(from);
    // Nominatim asks for no more than one request a second. Only wait if we
    // actually have to ask it twice.
    if (!asCoords(from) && !asCoords(to)) await new Promise((r) => setTimeout(r, 1100));
    const b = await geocode(to);

    const url = `${OSRM}/${a.lon},${a.lat};${b.lon},${b.lat}`
              + `?overview=full&geometries=geojson&alternatives=true&steps=false`;
    const d = await fetch(url).then((r) => r.json());
    if (d.code !== 'Ok' || !d.routes?.length) throw new Error(t('verdict_none'));

    routes = d.routes.map((r, i) => {
      const coords = r.geometry.coordinates;
      const hits = hitZones(coords);
      return {
        i, coords, hits,
        distance: r.distance, duration: r.duration,
        clear: hits.length === 0,
        name: i === 0 ? 'Fastest route' : `Alternative ${i}`,
      };
    });

    // A clear route wins even when it is slower. That is the entire point.
    routes.sort((x, y) => (x.clear === y.clear) ? x.duration - y.duration : (x.clear ? -1 : 1));
    showRoutes();
    select(0);
  } catch (err) {
    msg.textContent = err.message || t('verdict_none_sub');
    msg.dataset.tone = 'bad';
  } finally {
    btn.disabled = false; delete btn.dataset.busy;
    label.textContent = t('find_route');
  }
}

/* The verdict, as a sentence.

   The design mocks up two routes side by side, a dry one and a wet one. Real
   OSRM usually returns exactly one route for a Guwahati pair, so this has to
   carry four different truths rather than assume the pretty case. It is never
   allowed to imply a detour exists when it does not. */
function verdictSentence() {
  const line = $('verdictLine');
  const sub = $('verdictSub');

  if (!routes.length) {
    line.textContent = t('verdict_none');
    sub.textContent = t('verdict_none_sub');
    return;
  }

  const clear = routes.filter((r) => r.clear);
  const fastest = routes.reduce((x, y) => (y.duration < x.duration ? y : x), routes[0]);
  const named = (r) => (r.hits[0] ? zf(r.hits[0], 'name') : t('live_report'));

  if (clear.length === routes.length) {
    line.innerHTML = t('verdict_all_clear_a')
                   + '<span class="clear-said">' + t('verdict_all_clear_em') + '</span>'
                   + t('verdict_all_clear_b');
    const trip = fmtKm(fastest.distance) + ', ' + fmtMin(fastest.duration) + '.';
    sub.textContent = routes.length > 1 ? t('verdict_take_quick') + trip : trip;
    return;
  }

  if (!clear.length) {
    line.innerHTML = t(routes.length > 1 ? 'verdict_every_way' : 'verdict_only_way')
                   + '<em>' + esc(named(fastest)) + '</em>.';
    sub.textContent = t('verdict_no_detour');
    return;
  }

  const dry = clear.reduce((x, y) => (y.duration < x.duration ? y : x), clear[0]);
  const cost = Math.round((dry.duration - fastest.duration) / 60);
  line.innerHTML = t('verdict_quickest') + '<em>' + esc(named(fastest)) + '</em>.';
  sub.textContent = cost > 0
    ? t('verdict_costs') + cost + ' ' + t(cost === 1 ? 'minute' : 'minutes') + '.'
    : t('verdict_costs_free');
}

function showRoutes() {
  const box = $('results');

  // Dry first, then quickest, so the card you should take reads first.
  const order = routes.map((r, i) => i).sort((x, y) => {
    if (routes[x].clear !== routes[y].clear) return routes[x].clear ? -1 : 1;
    return routes[x].duration - routes[y].duration;
  });

  box.dataset.one = routes.length === 1 ? '1' : '';
  box.innerHTML = order.map((i, slot) => {
    const r = routes[i];
    const live = r.live || [];
    const bits = [];
    if (r.hits.length) bits.push(r.hits.length + ' ' + t(r.hits.length > 1 ? 'tag_zones' : 'tag_zone'));
    if (live.length) bits.push(live.length + ' ' + t(live.length > 1 ? 'tag_reports' : 'tag_report'));

    return '<button class="route" type="button" data-i="' + i + '"'
         + ' data-v="' + (r.clear ? 'clear' : 'hazard') + '"'
         + ' aria-pressed="' + (slot === 0) + '">'
         + '<div class="route-tag">' + (r.clear ? t('tag_dry') : esc(bits.join(t('tag_and')))) + '</div>'
         + '<div class="route-time">' + fmtMin(r.duration) + '</div>'
         + '<div class="route-km">' + fmtKm(r.distance) + '</div>'
         + '</button>';
  }).join('');

  box.hidden = false;
  $('routeMore').hidden = false;
  verdictSentence();
  box.querySelectorAll('.route').forEach((el) =>
    el.addEventListener('click', () => {
      select(+el.dataset.i);
      // Tapping a route means "show me this one", whatever the screen size.
      setRouteOpen(false);
      setTimeout(() => select(chosen), 340);
    }));

  select(order[0]);
  // Short screen: the answer is on the card and the route is on the map, so
  // give the map the room rather than the working out.
  if (innerHeight < 760) setRouteOpen(false);
  $('msg').textContent = '';
  $('msg').removeAttribute('data-tone');

  // The route is the answer, so collapse the editor and make sure it is on screen.
  setPlanOpen(false);
  labelOd();
  showTab('route');
}

/* Whatever the cards are doing, the route has to stay legible: never leave less
   than 40 percent of the screen for it to be drawn into. */
function fitPadding() {
  const vh = innerHeight;
  let top = $('status').getBoundingClientRect().height + 26;
  let bottom = innerWidth < 860 ? panelHeight() + 92 : 60;
  const budget = vh * 0.6;
  if (top + bottom > budget) {
    const k = budget / (top + bottom);
    top = Math.round(top * k);
    bottom = Math.round(bottom * k);
  }
  return { top, bottom, left: innerWidth < 860 ? 36 : 448, right: 36 };
}

function select(i) {
  chosen = i;
  const r = routes[i];
  if (!r) return;
  document.querySelectorAll('.route').forEach((el) =>
    el.setAttribute('aria-pressed', String(+el.dataset.i === i)));

  if (!mapReady || !map.getSource('route')) return;
  map.getSource('route').setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { hazard: !r.clear },
      geometry: { type: 'LineString', coordinates: r.coords },
    }],
  });

  const lons = r.coords.map((c) => c[0]), lats = r.coords.map((c) => c[1]);
  map.fitBounds(
    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    {
      // Measured against the glass actually on screen, so the line never ends
      // up hidden under the rain card or behind the panel. Clamped, because
      // with both cards expanded on a short screen the two paddings together
      // exceeded the viewport and fitBounds answered by zooming the route down
      // to a squiggle in the middle of nowhere.
      padding: fitPadding(),
      duration: 700,
    },
  );
}

/* ------------------------------------------------------------------ zones */
function listZones() {
  $('zoneList').innerHTML = zones.features.map((f) => {
    const p = f.properties;
    return `<li><button class="zone" type="button" data-id="${p.id}">
              <span class="zone-dot" data-s="${p.severity}"></span>
              <span class="zone-name">${esc(zf(p, 'name'))}</span>
              <span class="zone-depth">${esc(zf(p, 'typicalDepth'))}</span>
            </button></li>`;
  }).join('');

  $('zoneList').querySelectorAll('.zone').forEach((el) => el.addEventListener('click', () => {
    if (!mapReady) return;
    if (innerWidth < 860) showTab(null);        // let the map have the screen
    const f = zones.features.find((x) => x.properties.id === el.dataset.id);
    const ring = f.geometry.coordinates[0];
    const lons = ring.map((c) => c[0]), lats = ring.map((c) => c[1]);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 120, duration: 700 });
  }));

  $('provenance').innerHTML =
    '<b>' + t('zones_unverified') + '</b>' + t('zones_provenance');
}

/* ------------------------------------------------------------------- misc */
function locate() {
  const btn = $('locateBtn');
  if (!navigator.geolocation) { $('msg').textContent = t('no_geo'); return; }
  btn.dataset.busy = '1';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      delete btn.dataset.busy;
      $('fromInput').value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      new maplibregl.Marker({ color: '#4fa8ff' })
        .setLngLat([pos.coords.longitude, pos.coords.latitude]).addTo(map);
      map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14 });
    },
    () => {
      delete btn.dataset.busy;
      $('msg').textContent = t('geo_refused');
      $('msg').dataset.tone = 'bad';
    },
    { enableHighAccuracy: true, timeout: 9000 },
  );
}

/* ------------------------------------------------------------------- boot */
$('planForm').addEventListener('submit', plan);
$('locateBtn').addEventListener('click', locate);
$('swapBtn').addEventListener('click', () => {
  const a = $('fromInput'); const b = $('toInput');
  [a.value, b.value] = [b.value, a.value];
});
/* ------------------------------------------------------------------ tabs
   Four destinations, one panel visible at a time. Report is not a place: it
   opens the composer and leaves the tab where it was, because reporting is an
   errand you run and come back from. */
const PANELS = { route: 'panelRoute', zones: 'panelZones', you: 'panelYou' };
let activeTab = 'route';

function panelHeight() {
  const el = document.querySelector('.panel:not([hidden])');
  return el ? el.getBoundingClientRect().height + 24 : 110;
}

/* Passing null hides every panel, which is how the map gets the whole screen. */
function showTab(tab) {
  if (tab && tab !== 'report') activeTab = tab;
  for (const name of Object.keys(PANELS)) $(PANELS[name]).hidden = name !== tab;
  document.querySelectorAll('#tabbar button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

/* The origin and destination line doubles as the button that opens the editor. */
function setPlanOpen(open) {
  $('planForm').hidden = !open;
  $('odBtn').setAttribute('aria-expanded', String(open));
  $('odBtn').querySelector('.od-edit').textContent = t(open ? 'close' : 'edit');
}

function labelOd() {
  const trim = (v) => v.trim().replace(/,\s*guwahati$/i, '');
  const from = trim($('fromInput').value);
  const to = trim($('toInput').value);
  $('odLabel').textContent = from && to ? from + ' → ' + to : t('where_going');
}
$('tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  const tab = b.dataset.tab;
  if (tab === 'report') { openComposer(); return; }
  // Tapping the tab you are already on puts the map back.
  showTab($(PANELS[tab]).hidden ? tab : null);
});

$('odBtn').addEventListener('click', () => setPlanOpen($('planForm').hidden));
$('fromInput').addEventListener('change', labelOd);
$('toInput').addEventListener('change', labelOd);

startMap();
loadZones();
checkRain();
setInterval(checkRain, 10 * 60 * 1000);

/* ==========================================================================
   Community reports
   --------------------------------------------------------------------------
   Everything above this line runs against public APIs with no server. This
   section is the one part that needs one, because a report from you has to
   reach me. If the report server is unreachable the app carries on without it.
   ========================================================================== */

const REPORT_TTL_LABEL = '12 hours';
const NEAR_ROUTE_M = 130;          // how close a report must be to count against a route
const MAX_EDGE = 1400;             // longest side of an uploaded photo
const MAX_BYTES = 220 * 1024;

let reports = [];
let repMarkers = [];
let draft = { lat: null, lon: null, severity: null, photo: null };
let ghostMarker = null;

/* ------------------------------------------------------------- fetching */
async function loadReports() {
  try {
    const d = await fetch('/api/reports').then((r) => r.json());
    if (!d.ok) return;
    reports = d.reports || [];
    drawReports();
    paintLiveCount();
    if (routes.length) { rescoreRoutes(); showRoutes(); select(chosen); }
  } catch {
    /* No server, or offline. The map, the rain and the routing all still work. */
  }
}

function drawReports() {
  if (!map) return;
  repMarkers.forEach((m) => m.remove());
  repMarkers = reports.map((r) => {
    const el = document.createElement('div');
    el.className = 'rep-marker';
    el.dataset.s = r.severity;
    el.dataset.photo = r.has_photo ? '1' : '0';
    if (isMine(r.id)) el.dataset.mine = '1';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', r.severity + ' water reported ' + ago(r.created_at));
    el.innerHTML = '<span></span>';
    const open = () => openReport(r);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    return new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map);
  });
}

function paintLiveCount() {
  let el = document.getElementById('liveCount');
  if (!el) {
    el = document.createElement('span');
    el.id = 'liveCount';
    el.className = 'live-count';
    const h = $('zonesH');
    if (h) h.appendChild(el);
  }
  if (!el) return;
  if (!reports.length) { el.textContent = ''; return; }
  el.innerHTML = '<span class="live-dot"></span>' + reports.length + ' '
               + t(reports.length > 1 ? 'live_reports' : 'live_report');
}

const ago = (stamp) => {
  const m = Math.max(0, Math.round((Date.now() / 1000 - stamp) / 60));
  if (m < 1) return t('just_now');
  if (m < 60) return m + ' ' + t('min_ago');
  return Math.round(m / 60) + ' ' + t('h_ago');
};

/* ------------------------------------------------- reports vs the route */

/* Rough metres between two lon/lat points. Accurate enough at city scale. */
function metres(a, b) {
  const dx = (a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180);
  const dy = (a[1] - b[1]) * 110540;
  return Math.hypot(dx, dy);
}

/* Somebody standing in the water an hour ago is better evidence than a polygon
   drawn last year, so a live report counts against a route in its own right. */
function reportsNear(coords) {
  const near = [];
  for (const r of reports) {
    if (r.severity === 'passable') continue;
    if (coords.some((c) => metres(c, [r.lon, r.lat]) < NEAR_ROUTE_M)) near.push(r);
  }
  return near;
}

function rescoreRoutes() {
  for (const r of routes) {
    r.live = reportsNear(r.coords);
    r.clear = r.hits.length === 0 && r.live.length === 0;
  }
  routes.sort((x, y) => (x.clear === y.clear) ? x.duration - y.duration : (x.clear ? -1 : 1));
  routes.forEach((r, i) => { r.name = i === 0 ? 'Best route' : 'Alternative ' + i; });
}

/* ------------------------------------------------------------- composer */
function openComposer() {
  // Reporting is open to everyone, signed in or not. Signing in only buys
  // cross-phone management of your own reports via "My reports".
  draft = { lat: null, lon: null, severity: null, photo: null };
  $('composerMsg').textContent = '';
  $('shotPreview').hidden = true;
  $('shotEmpty').hidden = false;
  $('shotNote').hidden = true;
  $('noteInput').value = '';
  document.querySelectorAll('#sevRow button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  $('composer').hidden = false;
  $('whereText').textContent = t('finding_you') + '…';

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => setDraftPoint(p.coords.latitude, p.coords.longitude, t('using_location')),
      () => {
        $('whereText').textContent = t('no_location');
        showGhost(map.getCenter().lat, map.getCenter().lng);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  } else {
    showGhost(map.getCenter().lat, map.getCenter().lng);
  }
}

function setDraftPoint(lat, lon, label) {
  draft.lat = lat; draft.lon = lon;
  $('whereText').textContent = label || (lat.toFixed(5) + ', ' + lon.toFixed(5));
  showGhost(lat, lon);
}

function showGhost(lat, lon) {
  draft.lat = lat; draft.lon = lon;
  if (!map) return;
  if (!ghostMarker) {
    const el = document.createElement('div');
    el.className = 'pin-ghost';
    ghostMarker = new maplibregl.Marker({ element: el, draggable: true });
    ghostMarker.on('dragend', () => {
      const p = ghostMarker.getLngLat();
      draft.lat = p.lat; draft.lon = p.lng;
      $('whereText').textContent = p.lat.toFixed(5) + ', ' + p.lng.toFixed(5);
    });
  }
  ghostMarker.setLngLat([lon, lat]).addTo(map);
  map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), duration: 500 });
}

function closeComposer() {
  $('composer').hidden = true;
  $('composer').classList.remove('picking');
  if (ghostMarker) ghostMarker.remove();
}

/* ------------------------------------------------------------ the photo
   Drawing the picture onto a canvas and re-encoding produces a brand new file.
   Every EXIF tag the camera wrote is left behind, and that includes the GPS
   position of whoever took it and the phone's identifiers. That is the point of
   doing it this way; the smaller file is a bonus. */
async function handleShot(file) {
  if (!file) return;
  const note = $('shotNote');
  note.hidden = false;
  note.textContent = t('shrinking') + '…';

  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();

    let q = 0.72;
    let url = c.toDataURL('image/jpeg', q);
    while (url.length * 0.75 > MAX_BYTES && q > 0.32) {
      q -= 0.1;
      url = c.toDataURL('image/jpeg', q);
    }
    if (url.length * 0.75 > MAX_BYTES) throw new Error('still too large');

    draft.photo = url;
    $('shotPreview').src = url;
    $('shotPreview').hidden = false;
    $('shotEmpty').hidden = true;
    note.textContent = w + '×' + h + ', ' + Math.round((url.length * 0.75) / 1024)
                     + ' KB. Location and device details removed.';
  } catch {
    note.textContent = t('photo_failed');
    draft.photo = null;
  }
}

/* -------------------------------------------------------------- sending */
async function sendReport() {
  const btn = $('composerSend');
  const label = $('sendLabel');
  const msg = $('composerMsg');
  msg.textContent = '';
  msg.removeAttribute('data-tone');

  if (draft.lat == null) {
    msg.textContent = t('need_pin');
    msg.dataset.tone = 'bad';
    return;
  }
  if (!draft.severity) {
    msg.textContent = t('need_sev');
    msg.dataset.tone = 'bad';
    return;
  }

  btn.disabled = true;
  label.textContent = t('posting') + '…';
  try {
    const r = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lat: draft.lat, lon: draft.lon, severity: draft.severity,
        note: $('noteInput').value.trim(), photo: draft.photo,
      }),
    });
    if (!(r.headers.get('content-type') || '').includes('application/json')) {
      throw new Error('Report server not reachable here. Run `npx wrangler dev` for the local Worker + D1, or deploy with `npx wrangler deploy`.');
    }
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'That did not post.');
    rememberMine(d.id, d.del_token);
    myIds.add(d.id);
    closeComposer();
    await loadReports();
    // The thank-you lives in the Route panel, so make sure that is the panel
    // on screen. Otherwise posting from the Zones tab looks like nothing at all
    // happened.
    showTab('route');
    $('msg').textContent = t('report_thanks');
    $('msg').removeAttribute('data-tone');
  } catch (e) {
    msg.textContent = e.message;
    msg.dataset.tone = 'bad';
  } finally {
    btn.disabled = false;
    label.textContent = t('post_report');
  }
}

/* ------------------------------------------------------------ ownership
   No accounts, so the phone remembers which reports it posted, along with the
   one-time token that proves it. Clear your browser data and you lose the
   ability to delete them, which is the honest trade for not making you sign up. */
const MINE_KEY = 'aquaroute.mine';

function myReports() {
  try { return JSON.parse(localStorage.getItem(MINE_KEY) || '{}'); } catch { return {}; }
}
function rememberMine(id, token) {
  if (!id || !token) return;
  try {
    const m = myReports(); m[id] = token;
    localStorage.setItem(MINE_KEY, JSON.stringify(m));
  } catch { /* private browsing: they simply will not be able to delete it */ }
}
function forgetMine(id) {
  try { const m = myReports(); delete m[id]; localStorage.setItem(MINE_KEY, JSON.stringify(m)); }
  catch { /* nothing useful to do */ }
}
/* Two ways a report can be yours: this browser still holds the one-time token it
   was handed, or you are signed in as the account that posted it. The second
   works from any phone, which is the point of having accounts at all. */
const isMine = (id) => Boolean(myReports()[id]) || myIds.has(id);

async function deleteMine(id) {
  const token = myReports()[id];
  if (!token && !myIds.has(id)) return false;
  try {
    const r = await fetch('/api/reports/' + id, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ del_token: token || '' }),
    });
    const d = await r.json();
    if (r.ok && d.ok) { forgetMine(id); myIds.delete(id); return true; }
  } catch { /* fall through */ }
  return false;
}

/* --------------------------------------------------------- viewing one */
const BLANK_PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
let viewing = null;

function openReport(r) {
  viewing = r;
  const words = { passable: t('sev_passable'), slow: t('sev_slow_going'), impassable: t('sev_impassable') };
  $('viewerMeta').textContent = words[r.severity] + ' · ' + ago(r.created_at)
                              + (r.note ? ' · “' + r.note + '”' : '');
  const img = $('viewerImg');
  if (r.has_photo) {
    img.hidden = false;
    img.src = r.photo_url || ('/photo/' + r.id);
  } else {
    img.hidden = true;
    img.src = BLANK_PX;
  }
  const flagBtn = $('viewerFlag');
  if (isMine(r.id)) {
    flagBtn.innerHTML = '<svg class="ic"><use href="#i-close"/></svg> ' + t('delete_mine');
    flagBtn.dataset.mine = '1';
  } else {
    flagBtn.innerHTML = '<svg class="ic"><use href="#i-flag"/></svg> ' + t('not_accurate');
    delete flagBtn.dataset.mine;
  }
  $('viewer').hidden = false;
}

async function removeViewing() {
  if (!viewing) return;
  const ok = await deleteMine(viewing.id);
  $('viewerMeta').textContent = t(ok ? 'deleted_ok' : 'deleted_fail');
  setTimeout(() => { $('viewer').hidden = true; loadReports(); }, 1200);
}

async function flagViewing() {
  if (!viewing) return;
  try {
    const r = await fetch('/api/reports/' + viewing.id + '/flag', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    $('viewerMeta').textContent = r.ok ? t('flag_thanks') : (d.error || t('deleted_fail'));
    setTimeout(() => { $('viewer').hidden = true; loadReports(); }, 1400);
  } catch { /* nothing useful to tell the user here */ }
}

/* ------------------------------------------------------------- accounts
   Sessions live in an HttpOnly cookie, which means nothing on this page can
   read it. That is deliberate: a script injected into the page cannot walk off
   with somebody's login. The only way to know who you are is to ask the
   server, so that is what this does. */
let session = null;
let myIds = new Set();
let authMode = 'login';

async function refreshSession() {
  try {
    const d = await fetch('/api/auth/me').then((r) => r.json());
    session = d.user || null;
  } catch { session = null; }
  paintAccount();
  await loadMyIds();
}

async function loadMyIds() {
  myIds = new Set();
  if (!session) return;
  try {
    const d = await fetch('/api/my/reports').then((r) => r.json());
    if (d.ok) myIds = new Set(d.reports.map((r) => r.id));
  } catch { /* the map still works without this */ }
}

function paintAccount() {
  $('accountWho').textContent = session ? (session.name || session.email) : t('not_signed_in');
  $('accountAction').textContent = t(session ? 'sign_out' : 'sign_in');
  $('myReportsBtn').hidden = !session;
  $('account').dataset.on = session ? '1' : '';
}

function openAuth(why) {
  $('authMsg').textContent = '';
  $('authMsg').removeAttribute('data-tone');
  $('authWhy').textContent = why || t('auth_why');
  $('authPassword').value = '';
  $('auth').hidden = false;
  setTimeout(() => $('authEmail').focus(), 60);
}

function setAuthMode(mode) {
  authMode = mode;
  const making = mode === 'register';
  $('authH').textContent = t(making ? 'auth_title_new' : 'auth_title');
  $('authLabel').textContent = t(making ? 'create_account' : 'sign_in');
  $('authName').hidden = !making;
  $('authNameLabel').hidden = !making;
  $('authHint').hidden = !making;
  $('authPassword').setAttribute('autocomplete', making ? 'new-password' : 'current-password');
  document.querySelectorAll('#authTabs button').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.tab === mode)));
}

async function submitAuth(e) {
  e.preventDefault();
  const btn = $('authSubmit');
  const msg = $('authMsg');
  msg.textContent = '';
  msg.removeAttribute('data-tone');
  btn.disabled = true;
  const was = $('authLabel').textContent;
  $('authLabel').textContent = t('one_moment') + '\u2026';

  try {
    // Served statically (no /api here) the server answers with index.html, which
    // JSON parsing chokes on. Fail clearly instead of leaking "Unexpected token '<'".
    const r = await fetch('/api/auth/' + authMode, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: $('authEmail').value.trim(),
        password: $('authPassword').value,
        name: $('authName').value.trim(),
      }),
    });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error('Auth server not reachable. Run `npx wrangler dev` (local Worker + D1) or deploy with `npx wrangler deploy`.');
    }
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'That did not work.');
    session = d.user;
    paintAccount();
    await loadMyIds();
    $('auth').hidden = true;
    $('authPassword').value = '';
    drawReports();
    $('msg').textContent = t('signed_in_as') + (session.name || session.email) + '.';
    $('msg').removeAttribute('data-tone');
  } catch (err) {
    const raw = String((err && err.message) || err || '');
    msg.textContent = (raw.includes('<!DOCTYPE') || raw.includes("Unexpected token '<'"))
      ? 'Auth server not reachable. Run `npx wrangler dev` (local Worker + D1) or deploy with `npx wrangler deploy`.'
      : raw;
    msg.dataset.tone = 'bad';
  } finally {
    btn.disabled = false;
    $('authLabel').textContent = was;
  }
}

async function signOut() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* leaving anyway */ }
  session = null;
  myIds = new Set();
  paintAccount();
  drawReports();
  $('msg').textContent = t('signed_out');
}

/* ------------------------------------------------------- my reports view */
async function openMine() {
  const list = $('mineList');
  list.innerHTML = '';
  const wait = document.createElement('li');
  wait.className = 'mine-empty';
  wait.textContent = t('fetching') + '\u2026';
  list.appendChild(wait);
  $('mine').hidden = false;

  let reports = [];
  try {
    const d = await fetch('/api/my/reports').then((r) => r.json());
    if (!d.ok) throw new Error(d.error || 'Could not fetch those.');
    reports = d.reports;
  } catch (e) {
    wait.textContent = e.message;
    return;
  }

  myIds = new Set(reports.map((r) => r.id));
  list.innerHTML = '';

  if (!reports.length) {
    const li = document.createElement('li');
    li.className = 'mine-empty';
    li.textContent = t('mine_empty');
    list.appendChild(li);
    return;
  }

  const words = { passable: t('sev_passable'), slow: t('sev_slow_going'), impassable: t('sev_impassable') };
  for (const r of reports) {
    const li = document.createElement('li');
    li.className = 'mine-row';

    const body = document.createElement('div');
    const head = document.createElement('b');
    head.textContent = words[r.severity] || r.severity;
    const meta = document.createElement('span');
    meta.textContent = ago(r.created_at) + (r.note ? ' · “' + r.note + '”' : '')
                     + (r.has_photo ? ' · ' + t('photo') : '');
    body.append(head, meta);

    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'link';
    show.textContent = t('show');
    show.addEventListener('click', () => {
      $('mine').hidden = true;
      if (map) map.flyTo({ center: [r.lon, r.lat], zoom: 16, duration: 700 });
      openReport(r);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'link danger';
    del.textContent = t('take_down');
    del.addEventListener('click', async () => {
      del.disabled = true;
      del.textContent = t('removing') + '\u2026';
      const ok = await deleteMine(r.id);
      if (ok) { li.remove(); loadReports(); if (!list.children.length) openMine(); }
      else { del.disabled = false; del.textContent = t('wont_delete'); }
    });

    li.append(body, show, del);
    list.appendChild(li);
  }
}

/* ----------------------------------------------------------------- wire */
$('accountAction').addEventListener('click', () => (session ? signOut() : openAuth()));
$('myReportsBtn').addEventListener('click', openMine);
$('authClose').addEventListener('click', () => { $('auth').hidden = true; });
$('authCancel').addEventListener('click', () => { $('auth').hidden = true; });
$('authForm').addEventListener('submit', submitAuth);
$('authTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) { setAuthMode(b.dataset.tab); $('authMsg').textContent = ''; }
});
$('mineClose').addEventListener('click', () => { $('mine').hidden = true; });

$('composerClose').addEventListener('click', closeComposer);
$('composerCancel').addEventListener('click', closeComposer);
$('composerSend').addEventListener('click', sendReport);
$('shotInput').addEventListener('change', (e) => handleShot(e.target.files[0]));

$('sevRow').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sev]');
  if (!b) return;
  draft.severity = b.dataset.sev;
  document.querySelectorAll('#sevRow button').forEach((x) =>
    x.setAttribute('aria-pressed', String(x === b)));
});

/* "Move the pin" hides the sheet so the whole map is reachable, then one tap
   places the pin and brings the sheet back. */
$('pickOnMap').addEventListener('click', () => {
  $('composer').classList.add('picking');
  const once = (e) => {
    setDraftPoint(e.lngLat.lat, e.lngLat.lng);
    $('composer').classList.remove('picking');
    map.off('click', once);
  };
  map.on('click', once);
});

$('viewerClose').addEventListener('click', () => { $('viewer').hidden = true; });
$('viewerFlag').addEventListener('click', () =>
  ($('viewerFlag').dataset.mine ? removeViewing() : flagViewing()));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('viewer').hidden) $('viewer').hidden = true;
  else if (!$('mine').hidden) $('mine').hidden = true;
  else if (!$('auth').hidden) $('auth').hidden = true;
  else if (!$('composer').hidden) closeComposer();
});

/* ------------------------------------------------------- sign in with Google

   Free, and unlike Google Maps it needs no billing account. The page asks the
   server whether a client id is configured and stays quiet if not, so a
   deployment without one shows no broken button.

   The token Google hands us goes straight to the Worker. Nothing here trusts
   it; the Worker checks the signature, the audience and the expiry before it
   will create a session. */
async function setupGoogle() {
  let clientId = null;
  try {
    const cfg = await fetch('/api/config').then((r) => r.json());
    clientId = cfg.googleClientId;
  } catch { /* no config, no button */ }
  if (!clientId) return;

  await new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client';
    sc.async = true;
    sc.onload = res;
    sc.onerror = rej;
    document.head.appendChild(sc);
  }).catch(() => null);

  if (!window.google?.accounts?.id) return;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: onGoogleCredential,
    cancel_on_tap_outside: true,
  });
  renderGoogleButton();
  $('gwrap').hidden = false;
}

function renderGoogleButton() {
  const host = $('gbtn');
  if (!host || !window.google?.accounts?.id) return;
  host.innerHTML = '';
  window.google.accounts.id.renderButton(host, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    width: Math.min(360, Math.max(240, host.clientWidth || 300)),
    locale: lang() === 'as' ? 'as' : 'en',
  });
}

async function onGoogleCredential(response) {
  const msg = $('authMsg');
  msg.textContent = '';
  msg.removeAttribute('data-tone');
  try {
    const r = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'That did not work.');
    session = d.user;
    paintAccount();
    await loadMyIds();
    $('auth').hidden = true;
    drawReports();
    $('msg').textContent = t('signed_in_as') + (session.name || session.email) + '.';
    $('msg').removeAttribute('data-tone');
  } catch (err) {
    msg.textContent = err.message;
    msg.dataset.tone = 'bad';
  }
}

/* ------------------------------------------------------------- language */

/* Anything already painted from data has to be repainted, because translating
   the static markup does not touch a zone list or a verdict that was built in
   JavaScript minutes ago. i18n.js calls this after it swaps the strings. */
/* The basemap's own place names, not ours. OpenMapTiles ships localised name
   fields; Assamese exists for the larger places and is missing for many small
   ones, so this coalesces down to the default rather than leaving holes. */
function localiseBasemap() {
  if (!mapReady) return;
  const field = lang() === 'as'
    ? ['coalesce', ['get', 'name:as'], ['get', 'name:bn'], ['get', 'name']]
    : ['coalesce', ['get', 'name:en'], ['get', 'name']];
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol' || layer.id.startsWith('zone')) continue;
    try {
      const current = map.getLayoutProperty(layer.id, 'text-field');
      if (current === undefined) continue;
      // Only layers that actually label a place name. Road shields and the
      // like label `ref`, and replacing those leaves an empty label box sitting
      // on the map with nothing in it.
      if (!JSON.stringify(current).includes('"name"')) continue;
      map.setLayoutProperty(layer.id, 'text-field', field);
    } catch { /* not every symbol layer carries a label */ }
  }
}

function onLanguageChange() {
  localiseBasemap();
  if (mapReady && map.getLayer('zone-label')) {
    map.setLayoutProperty('zone-label', 'text-field',
      lang() === 'as' ? ['coalesce', ['get', 'name_as'], ['get', 'name']] : ['get', 'name']);
  }
  if (zones) listZones();
  if (reports.length) { drawReports(); paintLiveCount(); }
  if (routes.length) { verdictSentence(); showRoutes(); } else {
    $('verdictLine').textContent = t('verdict_idle');
    $('verdictSub').textContent = '';
  }
  paintAccount();
  setAuthMode(authMode);
  setPlanOpen(!$('planForm').hidden);
  labelOd();
  if (lastConditions) paintConditions(lastConditions);
  if (lastRain) { setMode(lastRain.now, lastRain.peak, lastRain.total);
                  paintForecast(lastRain.hours, lastRain.mm, lastRain.total, lastRain.peak); }
  renderGoogleButton();
  $('satBtn').setAttribute('aria-label', t('satellite'));
  $('centreBtn').setAttribute('aria-label', t('recentre'));
}

$('langBtn').addEventListener('click', () => applyLang(lang() === 'en' ? 'as' : 'en'));

/* ---------------------------------------------------------- map controls */

/* Esri's imagery is free to use with attribution and needs no key, which keeps
   the promise that this app runs without an account anywhere. */
const SAT_SOURCE = {
  type: 'raster',
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  maxzoom: 19,
  attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
};
/* Standard OpenStreetMap raster (the tile set people leave good reviews for:
   familiar cartography, no WebGL cost, no key, ODbL). Offered as a base-map
   choice over the OpenFreeMap vector style; same OSM data underneath. */
const OSM_SOURCE = {
  type: 'raster',
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  tileSize: 256,
  maxzoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
let satOn = false;
let osmOn = false;

function ensureBaseLayer(id, source) {
  if (!map.getSource(id)) {
    map.addSource(id, source);
    map.addLayer({ id: id, type: 'raster', source: id, paint: { 'raster-opacity': 0 } },
      'zone-fill');
  }
}

function toggleOSM() {
  if (!mapReady) return;
  osmOn = !osmOn;
  if (osmOn && satOn) toggleSatellite(); // one base at a time
  $('osmBtn').setAttribute('aria-pressed', String(osmOn));
  ensureBaseLayer('osm', OSM_SOURCE);
  map.setPaintProperty('osm', 'raster-opacity', osmOn ? 1 : 0);
  // Hide the vector streets under OSM raster so labels don't double-print.
  for (const layer of map.getStyle().layers) {
    if (layer.id === 'osm' || layer.id === 'sat' || layer.id.startsWith('zone') || layer.id.startsWith('route')) continue;
    if (layer.type === 'symbol') {
      try { map.setLayoutProperty(layer.id, 'visibility', osmOn ? 'none' : 'visible'); } catch { /* skip */ }
      continue;
    }
    try { map.setPaintProperty(layer.id, layer.type + '-opacity', osmOn ? 0 : 0.72); } catch { /* skip */ }
  }
}

function toggleSatellite() {
  if (!mapReady) return;
  satOn = !satOn;
  if (satOn && osmOn) { osmOn = false; $('osmBtn').setAttribute('aria-pressed', 'false'); if (map.getLayer('osm')) map.setPaintProperty('osm', 'raster-opacity', 0); }
  $('satBtn').setAttribute('aria-pressed', String(satOn));

  if (satOn && !map.getSource('sat')) {
    map.addSource('sat', SAT_SOURCE);
    // Under our own data, over the basemap, so zones and routes stay readable.
    map.addLayer({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-opacity': 0 } },
      'zone-fill');
  }
  if (map.getLayer('sat')) {
    map.setPaintProperty('sat', 'raster-opacity', satOn ? 1 : 0);
  }
  // The basemap push-back only makes sense over vector streets.
  for (const layer of map.getStyle().layers) {
    if (layer.id === 'sat' || layer.id.startsWith('zone') || layer.id.startsWith('route')) continue;
    if (layer.type === 'symbol') continue;
    try { map.setPaintProperty(layer.id, layer.type + '-opacity', satOn ? 0 : 0.72); } catch { /* skip */ }
  }
}

$('satBtn').addEventListener('click', toggleSatellite);
$('osmBtn').addEventListener('click', toggleOSM);
$('centreBtn').addEventListener('click', () => {
  if (!mapReady) return;
  if (routes.length && routes[chosen]) select(chosen);
  else map.flyTo({ center: [GUWAHATI.lon, GUWAHATI.lat], zoom: 12.2, duration: 700 });
});

setAuthMode('login');
labelOd();
setPlanOpen(false);
applyLang(lang());
initRain();
setRouteOpen(true);
refreshSession();
setupGoogle();
loadReports();
setInterval(loadReports, 30 * 1000);
