// Entry point: draws the globe with present-day borders and the country panel.
// globe.gl is loaded as a classic script before this module and exposes window.Globe.

const COLORS = {
  ocean: '#0b2545',
  land: 'rgba(120, 170, 140, 0.85)',
  hover: 'rgba(255, 200, 90, 0.95)',
  selected: 'rgba(255, 140, 60, 0.95)',
  side: 'rgba(30, 60, 50, 0.6)',
  stroke: 'rgba(20, 30, 30, 0.8)',
};

const $ = (id) => document.getElementById(id);
const status = (msg) => { $('status').textContent = msg; $('status').hidden = !msg; };

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// Builds the panel with textContent only (never innerHTML), so data can't inject markup.
function showPanel(key, info) {
  $('panel-name').textContent = info.name;
  $('panel-name-fr').textContent = info.nameFr && info.nameFr !== info.name ? `French: ${info.nameFr}` : '';
  const dl = $('panel-codes');
  dl.replaceChildren();
  const rows = [
    ['ISO 3166 code', info.iso3 || 'None (not an ISO country)'],
    ['FIPS 10-4 code', info.fips || 'None'],
    ['Wikidata', info.qid],
    ['Type', info.type],
    ['Join key', key],
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (label === 'Wikidata' && value) {
      const a = document.createElement('a');
      a.href = `https://www.wikidata.org/wiki/${encodeURIComponent(value)}`;
      a.textContent = value;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      dd.append(a);
    } else {
      dd.textContent = value || 'None';
    }
    dl.append(dt, dd);
  }
  $('panel').hidden = false;
}

async function start() {
  if (!hasWebGL() || typeof window.Globe !== 'function') {
    status('');
    $('fallback').hidden = false;
    return;
  }

  const [geo, index] = await Promise.all([
    getJSON('data/countries-50m.json'),
    getJSON('data/country-index.json'),
  ]);
  const countries = index.countries;

  let hovered = null;
  let selected = null;
  const capColor = (f) => (f === selected ? COLORS.selected : f === hovered ? COLORS.hover : COLORS.land);
  const altitude = (f) => (f === selected || f === hovered ? 0.012 : 0.006);

  const el = $('globe');
  const globe = window.Globe()(el)
    .backgroundColor('#02040a')
    .showAtmosphere(true)
    .atmosphereColor('#7fb3ff')
    .polygonsData(geo.features)
    .polygonCapColor(capColor)
    .polygonSideColor(() => COLORS.side)
    .polygonStrokeColor(() => COLORS.stroke)
    .polygonAltitude(altitude)
    .polygonsTransitionDuration(150)
    .onPolygonHover((f) => {
      hovered = f;
      el.style.cursor = f ? 'pointer' : 'grab';
      const label = $('hover-label');
      label.textContent = f ? countries[f.properties.key]?.name || f.properties.name : '';
      label.hidden = !f;
      globe.polygonCapColor(capColor).polygonAltitude(altitude);
    })
    .onPolygonClick((f) => {
      selected = f;
      globe.polygonCapColor(capColor).polygonAltitude(altitude);
      const key = f.properties.key;
      showPanel(key, countries[key] || { name: f.properties.name });
    });

  globe.globeMaterial().color.set(COLORS.ocean);
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.3;
  el.addEventListener('pointerdown', () => { globe.controls().autoRotate = false; }, { once: true });

  const resize = () => globe.width(window.innerWidth).height(window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  $('panel-close').addEventListener('click', () => {
    $('panel').hidden = true;
    selected = null;
    globe.polygonCapColor(capColor).polygonAltitude(altitude);
  });

  // Exposed for the smoke test and for debugging in the console.
  window.__worldGlobe = { globe, countries, features: geo.features, select: (key) => {
    const f = geo.features.find((x) => x.properties.key === key);
    if (f) globe.onPolygonClick()(f);
    return Boolean(f);
  } };

  status('');
}

start().catch((err) => {
  console.error(err);
  status(`Could not load the globe: ${err.message}`);
});
