// Entry point: the globe, the country panel (M1), World Bank statistics (M2)
// and the historical borders time slider (M3).
// globe.gl is loaded as a classic script before this module and exposes window.Globe.

const COLORS = {
  ocean: '#0b2545',
  land: 'rgba(120, 170, 140, 0.85)',
  hover: 'rgba(255, 200, 90, 0.95)',
  selected: 'rgba(255, 140, 60, 0.95)',
  side: 'rgba(30, 60, 50, 0.6)',
  stroke: 'rgba(20, 30, 30, 0.8)',
  noData: 'rgba(90, 90, 90, 0.85)',
  unnamed: 'rgba(110, 110, 110, 0.7)',
};
// Viridis, 5 classes: readable with the common forms of colour blindness.
const SCALE = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const PRESENT = new Date().getFullYear();
const PRECISION = { 1: 'Approximate', 2: 'Moderately precise', 3: 'Set by international law' };

const $ = (id) => document.getElementById(id);
const status = (msg) => { $('status').textContent = msg; $('status').hidden = !msg; };
const fmtInt = new Intl.NumberFormat('en-US');
const fmtShort = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

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
const getOptionalJSON = (url) => getJSON(url).catch(() => null);

// Fills a <dl> with label/value rows using textContent only (never innerHTML),
// so data can't inject markup. A value can be a { text, href } link.
function fillRows(dl, rows) {
  dl.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (value && typeof value === 'object') {
      const a = document.createElement('a');
      a.href = value.href;
      a.textContent = value.text;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      dd.append(a);
    } else {
      dd.textContent = value || 'None';
    }
    dl.append(dt, dd);
  }
}

// Same string, same colour: polities ruled by one power share its colour.
function colorFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `hsla(${h % 360}, 45%, 52%, 0.9)`;
}

// Quintile breaks from the real values, so every class has about as many countries.
function quintiles(values) {
  const v = [...values].sort((a, b) => a - b);
  return [1, 2, 3, 4].map((i) => v[Math.floor((i * v.length) / 5)]);
}
const classOf = (value, breaks) => breaks.filter((b) => value >= b).length;

async function start() {
  if (!hasWebGL() || typeof window.Globe !== 'function') {
    status('');
    $('fallback').hidden = false;
    return;
  }

  const [geo, index, wb, history] = await Promise.all([
    getJSON('data/countries-50m.json'),
    getJSON('data/country-index.json'),
    getOptionalJSON('data/countries.json'), // created by the World Bank refresh Action
    getOptionalJSON('data/history-index.json'),
  ]);
  const countries = index.countries;
  const presentFeatures = geo.features;
  const years = history?.years ?? [];
  const snapshotCache = new Map(); // year -> features, filled lazily

  let mode = 'present'; // or a snapshot year (number)
  let colorBy = 'none';
  let breaks = null;
  let hovered = null;
  let selected = null;

  const statsFor = (f) => wb?.countries?.[countries[f.properties.key]?.iso3] ?? null;
  const baseColor = (f) => {
    if (mode !== 'present') {
      const p = f.properties;
      const owner = p.SUBJECTO || p.NAME;
      return owner ? colorFor(owner) : COLORS.unnamed;
    }
    if (colorBy === 'none' || !breaks) return COLORS.land;
    const v = statsFor(f)?.[colorBy]?.value;
    return v === undefined ? COLORS.noData : SCALE[classOf(v, breaks)];
  };
  const capColor = (f) => (f === selected ? COLORS.selected : f === hovered ? COLORS.hover : baseColor(f));
  const altitude = (f) => (f === selected || f === hovered ? 0.012 : 0.006);
  // Approximate historical borders get a fainter edge than borders set by treaty.
  const strokeColor = (f) => {
    if (mode === 'present') return COLORS.stroke;
    const p = f.properties.BORDERPRECISION;
    return p === 3 ? 'rgba(10, 15, 15, 0.9)' : p === 2 ? 'rgba(10, 15, 15, 0.55)' : 'rgba(10, 15, 15, 0.25)';
  };
  const refresh = () => globe.polygonCapColor(capColor).polygonAltitude(altitude).polygonStrokeColor(strokeColor);

  const historyName = (p) => p.NAME || 'Unnamed / unknown polity';
  const labelFor = (f) => {
    if (mode === 'present') return countries[f.properties.key]?.name || f.properties.name;
    const p = f.properties;
    return p.SUBJECTO && p.SUBJECTO !== p.NAME ? `${historyName(p)} · under ${p.SUBJECTO}` : historyName(p);
  };

  function showPresentPanel(f) {
    const key = f.properties.key;
    const info = countries[key] || { name: f.properties.name };
    $('panel-name').textContent = info.name;
    $('panel-name-fr').textContent = info.nameFr && info.nameFr !== info.name ? `French: ${info.nameFr}` : '';
    const s = statsFor(f);
    const show = (stat, fmt) => (stat ? `${fmt(stat.value)} (${stat.year})` : 'No data');
    if (wb) {
      fillRows($('panel-stats'), [
        ['Population', show(s?.pop, (v) => fmtInt.format(v))],
        ['Birth rate', show(s?.cbr, (v) => `${v.toFixed(1)} per 1,000 people`)],
      ]);
    } else {
      fillRows($('panel-stats'), [['Statistics', 'Not loaded yet']]);
    }
    fillRows($('panel-codes'), [
      ['ISO 3166 code', info.iso3 || 'None (not an ISO country)'],
      ['FIPS 10-4 code', info.fips || 'None'],
      ['Wikidata', info.qid ? { text: info.qid, href: `https://www.wikidata.org/wiki/${encodeURIComponent(info.qid)}` } : 'None'],
      ['Type', info.type],
      ['Join key', key],
    ]);
    $('panel-credit').textContent = wb
      ? 'Statistics: World Bank, World Development Indicators (CC BY 4.0). Borders and codes: Natural Earth (public domain).'
      : 'Borders and codes: Natural Earth (public domain).';
    $('panel').hidden = false;
  }

  function showHistoryPanel(f) {
    const p = f.properties;
    $('panel-name').textContent = historyName(p);
    $('panel-name-fr').textContent = `Borders of ${mode}`;
    $('panel-stats').replaceChildren();
    fillRows($('panel-codes'), [
      ['Controlled by', p.SUBJECTO || 'Unknown'],
      ['Part of', p.PARTOF || 'Unknown'],
      ['Border precision', PRECISION[p.BORDERPRECISION] || 'Unknown'],
      ['Map year', String(mode)],
    ]);
    $('panel-credit').textContent = `${history.credit}. Present-day statistics are hidden on historical maps.`;
    $('panel').hidden = false;
  }

  // Kept as a named function: globe.gl's onPolygonClick() is a setter only, so the
  // smoke test and select() call this directly instead of reading it back.
  function handleClick(f) {
    selected = f;
    refresh();
    if (mode === 'present') showPresentPanel(f);
    else showHistoryPanel(f);
  }

  const el = $('globe');
  const globe = window.Globe()(el)
    .backgroundColor('#02040a')
    .showAtmosphere(true)
    .atmosphereColor('#7fb3ff')
    .polygonsData(presentFeatures)
    .polygonCapColor(capColor)
    .polygonSideColor(() => COLORS.side)
    .polygonStrokeColor(strokeColor)
    .polygonAltitude(altitude)
    // No animated transitions: map switches and hovers apply at once.
    // (Don't raise polygonCapCurvatureResolution above the default 5°: at 10° large
    // shapes like the Russian Empire render with holes.)
    .polygonsTransitionDuration(0)
    .onPolygonHover((f) => {
      hovered = f;
      el.style.cursor = f ? 'pointer' : 'grab';
      const label = $('hover-label');
      label.textContent = f ? labelFor(f) : '';
      label.hidden = !f;
      refresh();
    })
    .onPolygonClick((f) => handleClick(f));

  globe.globeMaterial().color.set(COLORS.ocean);
  globe.controls().autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  globe.controls().autoRotateSpeed = 0.3;
  el.addEventListener('pointerdown', () => { globe.controls().autoRotate = false; }, { once: true });

  const resize = () => globe.width(window.innerWidth).height(window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  const closePanel = () => {
    $('panel').hidden = true;
    selected = null;
    refresh();
  };
  $('panel-close').addEventListener('click', closePanel);

  // ---- M2: colour countries by a statistic -------------------------------------------
  function setColorBy(value) {
    colorBy = value;
    const legend = $('legend');
    if (value === 'none' || !wb) {
      breaks = null;
      legend.hidden = true;
      refresh();
      return;
    }
    const values = Object.values(wb.countries).map((c) => c[value]?.value).filter((v) => v !== undefined);
    breaks = quintiles(values);
    const fmt = value === 'pop' ? (v) => fmtShort.format(v) : (v) => v.toFixed(1);
    const bounds = [Math.min(...values), ...breaks, Math.max(...values)];
    legend.replaceChildren();
    const title = document.createElement('p');
    title.className = 'small';
    title.textContent = value === 'pop' ? 'Population' : 'Births per 1,000 people';
    legend.append(title);
    const rows = SCALE.map((c, i) => [c, `${fmt(bounds[i])} – ${fmt(bounds[i + 1])}`]);
    rows.push([COLORS.noData, 'No data']);
    for (const [color, text] of rows) {
      const row = document.createElement('div');
      row.className = 'legend-row small';
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = color;
      const t = document.createElement('span');
      t.textContent = text;
      row.append(sw, t);
      legend.append(row);
    }
    const credit = document.createElement('p');
    credit.className = 'small muted';
    credit.textContent = 'World Bank, WDI (CC BY 4.0). Most recent year per country.';
    legend.append(credit);
    legend.hidden = false;
    refresh();
  }
  const colorSelect = $('color-by');
  colorSelect.disabled = !wb;
  if (!wb) colorSelect.title = 'Statistics are not loaded yet';
  colorSelect.addEventListener('change', () => setColorBy(colorSelect.value));

  // ---- M3: historical borders time slider ---------------------------------------------
  const slider = $('year');
  slider.min = String(years[0] ?? PRESENT);
  slider.max = String(PRESENT);
  slider.value = String(PRESENT);
  if (!years.length) $('timebar').hidden = true;

  // The latest snapshot at or before the chosen year; the slider's end means "present".
  const snapshotFor = (year) => (year >= PRESENT ? 'present' : [...years].reverse().find((y) => y <= year) ?? years[0]);
  const stops = () => [...years, PRESENT];

  async function loadSnapshot(year) {
    if (!snapshotCache.has(year)) {
      snapshotCache.set(year, getJSON(`${history.folder}/world_${year}.json`).then((g) => g.features));
    }
    return snapshotCache.get(year);
  }

  let pending = 0;
  async function setYear(year) {
    const y = Math.max(Number(slider.min), Math.min(PRESENT, Math.round(year)));
    slider.value = String(y);
    const target = snapshotFor(y);
    const label = target === 'present' ? 'Present day' : String(y);
    $('year-label').textContent = label;
    slider.setAttribute('aria-valuetext', target === 'present' ? 'Present day' : `Year ${y}, showing borders of ${target}`);
    $('snapshot-note').textContent = target === 'present'
      ? 'Borders: Natural Earth (2022)'
      : `Showing borders of ${target}${target !== y ? ` (nearest earlier map to ${y})` : ''}`;
    if (target === mode) return;

    const ticket = ++pending;
    let features;
    if (target === 'present') {
      features = presentFeatures;
    } else {
      status('Loading map…');
      try {
        features = await loadSnapshot(target);
      } catch (err) {
        snapshotCache.delete(target);
        status(`Could not load the ${target} map: ${err.message}`);
        return;
      }
    }
    if (ticket !== pending) return; // a newer slider move won
    status('');
    mode = target;
    hovered = null;
    closePanel();
    colorSelect.disabled = mode !== 'present' || !wb;
    $('legend').hidden = mode !== 'present' || colorBy === 'none';
    globe.polygonsData(features);
    refresh();
  }

  slider.addEventListener('input', () => setYear(Number(slider.value)));
  // Arrow keys step one snapshot, Home/End jump to the first map and the present.
  slider.addEventListener('keydown', (e) => {
    const s = stops();
    const cur = Number(slider.value);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = s.find((y) => y > cur) ?? PRESENT;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = [...s].reverse().find((y) => y < cur) ?? s[0];
    else if (e.key === 'Home') next = s[0];
    else if (e.key === 'End') next = PRESENT;
    if (next === null) return;
    e.preventDefault();
    setYear(next);
  });

  // ---- About dialog ------------------------------------------------------------------
  if (history) $('about-history-source').href = `${history.folder}/SOURCE.md`;
  $('about-link').addEventListener('click', (e) => {
    e.preventDefault();
    $('about').showModal();
  });

  // Exposed for the smoke test and for debugging in the console.
  window.__worldGlobe = {
    globe, countries, features: presentFeatures, wb, years,
    select: (key) => {
      const f = (mode === 'present' ? presentFeatures : globe.polygonsData()).find((x) => (x.properties.key ?? x.properties.NAME) === key);
      if (f) handleClick(f);
      return Boolean(f);
    },
    setYear,
    current: () => ({ mode, features: globe.polygonsData() }),
  };

  status('');
}

start().catch((err) => {
  console.error(err);
  status(`Could not load the globe: ${err.message}`);
});
