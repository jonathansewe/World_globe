// Checks the generated data. Exits with code 1 on any failure.
// Usage: node scripts/validate-data.mjs

import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const geo = JSON.parse(await readFile('public/data/countries-50m.json', 'utf8'));
const { countries } = JSON.parse(await readFile('public/data/country-index.json', 'utf8'));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// Every feature has a non-empty, unique key that exists in the index.
const seen = new Set();
const unmatched = [];
for (const f of geo.features) {
  const k = f.properties.key;
  check(k, `Feature without key: ${f.properties.name}`);
  check(!seen.has(k), `Duplicate key on map: ${k}`);
  seen.add(k);
  if (!countries[k]) unmatched.push(`${k} (${f.properties.name})`);
}
check(unmatched.length === 0, `Features missing from index: ${unmatched.join(', ')}`);
check(geo.features.length === Object.keys(countries).length, 'Map and index have different counts');

// The Natural Earth traps named in PLAN.md M1.
const expect = { FRA: 'France', NOR: 'Norway', XKX: 'Kosovo' };
for (const [k, name] of Object.entries(expect)) check(countries[k]?.name === name, `${k} should be ${name}`);
check(countries.DEU?.fips === 'GM', 'Germany FIPS should be GM');
check(countries.DEU?.qid === 'Q183', 'Germany Q-id should be Q183');
check(!('-99' in countries), 'A -99 key leaked through');

// List, never hide, the entries that lack a code.
for (const field of ['iso3', 'fips', 'qid']) {
  const missing = Object.entries(countries).filter(([, c]) => !c[field]).map(([k, c]) => `${k} ${c.name}`);
  console.log(`No ${field} (${missing.length}): ${missing.join('; ') || 'none'}`);
}

// M2: World Bank statistics. The file only exists once the refresh Action has run.
const WB_AGGREGATES = 'AFE AFW ARB CEB CSS EAP EAR EAS ECA ECS EMU EUU FCS HIC HPC IBD IBT IDA IDB IDX INX LAC LCN LDC LIC LMC LMY LTE MEA MIC MNA NAC OED OSS PRE PSS PST SAS SSA SSF SST TEA TEC TLA TMN TSA TSS UMC WLD'.split(' ');
let wb = null;
try { wb = JSON.parse(await readFile('public/data/countries.json', 'utf8')); } catch { console.log('countries.json not present yet (created by the World Bank refresh Action).'); }
if (wb) {
  const keys = Object.keys(wb.countries);
  const agg = keys.filter((k) => WB_AGGREGATES.includes(k));
  check(agg.length === 0, `Aggregates in countries.json: ${agg.join(', ')}`);
  check(keys.length >= 180, `Only ${keys.length} countries in countries.json`);
  for (const [k, c] of Object.entries(wb.countries)) {
    for (const [ind, v] of Object.entries(c)) {
      check(typeof v.value === 'number' && v.value > 0, `${k} ${ind}: value must be a positive number, got ${v.value}`);
      check(Number.isInteger(v.year) && v.year >= 1960 && v.year <= new Date().getFullYear(), `${k} ${ind}: bad year ${v.year}`);
    }
  }
  check(wb.license === 'CC BY 4.0', 'countries.json must carry the CC BY 4.0 license');
  // Map features whose code has no World Bank values. Listed, never hidden.
  const noData = Object.entries(countries).filter(([, c]) => !c.iso3 || !wb.countries[c.iso3]?.pop).map(([k, c]) => `${k} ${c.name}`);
  console.log(`No World Bank population (${noData.length}): ${noData.join('; ')}`);
}

// M3: historical border snapshots.
const hist = JSON.parse(await readFile('public/data/history-index.json', 'utf8'));
check(hist.years.length === 32 && hist.years[0] === 600 && hist.years.at(-1) === 2010, 'history-index.json must list the 32 snapshots 600..2010');
let biggest = 0;
for (const y of hist.years) {
  const file = `public/${hist.folder}/world_${y}.json`;
  const buf = await readFile(file);
  const gz = gzipSync(buf).length;
  biggest = Math.max(biggest, gz);
  check(gz <= 400 * 1024, `${file} is ${(gz / 1024).toFixed(0)} KB gzipped (limit 400)`);
  const g = JSON.parse(buf);
  const bad = g.features.filter((f) => !f.geometry || !f.geometry.coordinates?.length).length;
  check(bad === 0, `${file}: ${bad} features without geometry`);
}
const sourceMd = await readFile(`public/${hist.folder}/SOURCE.md`, 'utf8');
check(sourceMd.includes(hist.commit), 'SOURCE.md must name the pinned upstream commit');
check(hist.folder.includes(hist.commit.slice(0, 7)), 'History folder name must contain the pinned commit (immutable cache)');
console.log(`History: ${hist.years.length} snapshots, largest ${(biggest / 1024).toFixed(0)} KB gzipped (limit 400).`);

const size = (p) => readFile(p).then((b) => gzipSync(b).length);
const total = (await Promise.all([
  'public/index.html', 'public/src/main.js', 'public/src/style.css',
  'public/vendor/globe.gl-2.46.2.min.js', 'public/data/countries-50m.json', 'public/data/country-index.json', 'public/data/history-index.json',
].map(size))).reduce((a, b) => a + b, 0);
console.log(`Initial page weight: ${(total / 1024 / 1024).toFixed(2)} MB gzipped (limit 1.5)`);
check(total <= 1.5 * 1024 * 1024, 'Initial page weight over 1.5 MB gzipped');

console.log(`${geo.features.length} features checked.`);
if (errors.length) { console.error('FAILED:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('All data checks passed.');
