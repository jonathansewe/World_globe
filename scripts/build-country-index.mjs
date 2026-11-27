// Builds the present-day borders and the country join table from Natural Earth.
//
// Usage:
//   node scripts/build-country-index.mjs [path/to/ne_50m_admin_0_countries.geojson]
//
// Without a path, the file is downloaded from the pinned Natural Earth commit below.
// Outputs (both committed, both deployed):
//   public/data/countries-50m.json  simplified GeoJSON, only the fields the site needs
//   public/data/country-index.json  key -> { name, nameFr, iso3, fips, qid, ... }

import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const NE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const NE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_50m_admin_0_countries.geojson`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_GEO = join(ROOT, 'public/data/countries-50m.json');
const OUT_INDEX = join(ROOT, 'public/data/country-index.json');

// Natural Earth uses -99 for "no value". These overrides fix the known gaps.
// Each value here is a manual decision; `source` says how sure we are.
const OVERRIDES = {
  KOS: { iso3: 'XKX', source: 'World Bank / EU user-assigned code; ISO has none' },
  NOR: { fips: 'NO', source: 'FIPS 10-4' },
  ISR: { fips: 'IS', source: 'FIPS 10-4' },
  PSX: { fips: 'WE', fipsAlt: ['GZ'], source: 'FIPS 10-4 West Bank (WE) and Gaza Strip (GZ); confirm against GDELT in M5' },
  SDS: { fips: 'OD', source: 'FIPS 10-4 South Sudan; confirm against GDELT in M5' },
  CYN: { fips: null, note: 'No FIPS code of its own; GDELT counts it under Cyprus (CY)?' },
  SOL: { fips: null, note: 'No FIPS code of its own; GDELT counts it under Somalia (SO)?' },
  KAS: { fips: null, note: 'Disputed area (Siachen Glacier); no FIPS code' },
};

const clean = (v) => (v === undefined || v === null || v === '-99' || v === -99 || v === '' ? null : v);

async function loadSource(path) {
  if (path) return JSON.parse(await readFile(path, 'utf8'));
  const res = await fetch(NE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${NE_URL}`);
  return res.json();
}

const src = await loadSource(process.argv[2]);

// Pass 1: count ISO_A3_EH so duplicates (Australia and two of its dependencies) are detected.
const isoCount = {};
for (const f of src.features) {
  const iso = clean(f.properties.ISO_A3_EH);
  if (iso) isoCount[iso] = (isoCount[iso] || 0) + 1;
}

const index = {};
for (const f of src.features) {
  const p = f.properties;
  const adm = p.ADM0_A3;
  const o = OVERRIDES[adm] || {};
  let iso3 = 'iso3' in o ? o.iso3 : clean(p.ISO_A3_EH);
  // A dependency that shares its sovereign's ISO code is not that country.
  if (iso3 && isoCount[iso3] > 1 && iso3 !== adm) iso3 = null;
  // Join key: the ISO code when it is ours alone, otherwise Natural Earth's ADM0_A3.
  const key = iso3 || adm;
  if (index[key]) throw new Error(`Duplicate join key ${key} (${p.NAME} and ${index[key].name})`);
  index[key] = {
    name: p.NAME,
    nameFr: clean(p.NAME_FR),
    type: p.TYPE,
    sovereign: p.SOVEREIGNT,
    iso3,
    adm0: adm,
    fips: 'fips' in o ? o.fips : clean(p.FIPS_10),
    ...(o.fipsAlt ? { fipsAlt: o.fipsAlt } : {}),
    qid: clean(p.WIKIDATAID),
    ...(o.source || o.note ? { override: o.source || o.note } : {}),
  };
  // Keep only what the browser needs on each feature.
  f.properties = { key, name: p.NAME };
}

// Simplify with mapshaper (keeps small islands, fixes ring order) and cut coordinate precision.
const tmp = await mkdtemp(join(tmpdir(), 'ne-'));
const raw = join(tmp, 'in.json');
await writeFile(raw, JSON.stringify(src));
execFileSync('npx', ['mapshaper', raw, '-simplify', '25%', 'keep-shapes', '-o', OUT_GEO, 'precision=0.001', 'format=geojson'], { stdio: 'inherit' });

const sorted = Object.fromEntries(Object.keys(index).sort().map((k) => [k, index[k]]));
await writeFile(OUT_INDEX, JSON.stringify({ source: `Natural Earth 50m admin 0, commit ${NE_COMMIT}`, countries: sorted }, null, 1) + '\n');
console.log(`Wrote ${Object.keys(sorted).length} countries to ${OUT_INDEX}`);
