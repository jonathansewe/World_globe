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

const size = (p) => readFile(p).then((b) => gzipSync(b).length);
const total = (await Promise.all([
  'public/index.html', 'public/src/main.js', 'public/src/style.css',
  'public/vendor/globe.gl-2.46.2.min.js', 'public/data/countries-50m.json', 'public/data/country-index.json',
].map(size))).reduce((a, b) => a + b, 0);
console.log(`Initial page weight: ${(total / 1024 / 1024).toFixed(2)} MB gzipped (limit 1.5)`);
check(total <= 1.5 * 1024 * 1024, 'Initial page weight over 1.5 MB gzipped');

console.log(`${geo.features.length} features checked.`);
if (errors.length) { console.error('FAILED:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('All data checks passed.');
