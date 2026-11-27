// Builds the historical border snapshots (600 → 2010) for the M3 time slider.
//
// Usage: node scripts/build-history.mjs
//
// Downloads each snapshot from aourednik/historical-basemaps at a PINNED commit,
// simplifies it with mapshaper and writes:
//   public/data/history/<folder>/world_<year>.json   simplified GeoJSON (cached for a year)
//   public/data/history/<folder>/SOURCE.md           what was changed and from where (GPL-3.0)
//   public/data/history/<folder>/LICENSE.txt         GPL-3.0 text shipped with the data
//   public/data/history-index.json                   years + folder (short cache, so it can move)
//
// The folder name contains the upstream commit and BUILD. The files are served with a
// one-year immutable cache, so any change to the commit or the settings MUST change the
// folder name: bump BUILD when you change SIMPLIFY or the kept fields.

import { mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const COMMIT = '4b5039e50d8d2464b065bd76ad6086cd4597108d';
const BUILD = 'v1';
const SIMPLIFY = '20%'; // share of removable points kept (mapshaper Visvalingam)
const FIELDS = ['NAME', 'SUBJECTO', 'PARTOF', 'BORDERPRECISION'];
export const YEARS = [600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650,
  1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER = `${COMMIT.slice(0, 7)}-${BUILD}`;
const OUT_DIR = join(ROOT, 'public/data/history', FOLDER);
const MAPSHAPER = join(ROOT, 'node_modules/.bin/mapshaper');
const url = (y) => `https://raw.githubusercontent.com/aourednik/historical-basemaps/${COMMIT}/geojson/world_${y}.geojson`;

const mapshaperVersion = execFileSync(MAPSHAPER, ['-v'], { encoding: 'utf8' }).trim();
const tmp = join(tmpdir(), `history-${Date.now()}`);
await mkdir(tmp, { recursive: true });
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const stats = [];
for (const year of YEARS) {
  const res = await fetch(url(year));
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} ${url(year)}`);
  const raw = join(tmp, `world_${year}.geojson`);
  await writeFile(raw, Buffer.from(await res.arrayBuffer()));
  const out = join(OUT_DIR, `world_${year}.json`);
  execFileSync(MAPSHAPER, [
    '-i', raw,
    '-filter-fields', FIELDS.join(','),
    '-simplify', SIMPLIFY, 'keep-shapes',
    '-o', out, 'format=geojson', 'precision=0.001',
  ], { stdio: 'pipe' });
  const geo = JSON.parse(await readFile(out, 'utf8'));
  // Tiny shapes can collapse to a null or empty geometry when simplified and rounded, and
  // globe.gl crashes on those. Put the original shape back (rounded to 0.0001°)
  // so no polity is dropped. mapshaper keeps feature order, so index i matches.
  const source = JSON.parse(await readFile(raw, 'utf8'));
  if (source.features.length !== geo.features.length) throw new Error(`${year}: feature count changed`);
  const round = (c) => (typeof c === 'number' ? Math.round(c * 1e4) / 1e4 : c.map(round));
  let restored = 0;
  geo.features.forEach((f, i) => {
    if (f.geometry?.coordinates?.length) return; // null or empty both mean "collapsed"
    const src = source.features[i];
    if ((src.properties.NAME ?? null) !== (f.properties.NAME ?? null)) throw new Error(`${year}: feature ${i} order mismatch`);
    f.geometry = { type: src.geometry.type, coordinates: round(src.geometry.coordinates) };
    restored++;
  });
  if (restored) await writeFile(out, JSON.stringify(geo));
  const unnamed = geo.features.filter((f) => !f.properties.NAME).length;
  stats.push({ year, features: geo.features.length, unnamed, restored });
  console.log(`${year}: ${geo.features.length} polygons, ${unnamed} unnamed, ${restored} restored`);
}

await copyFile(join(ROOT, 'LICENSE'), join(OUT_DIR, 'LICENSE.txt'));
await writeFile(join(OUT_DIR, 'SOURCE.md'), `# Source of these files

These files are a **modified version** of the historical world maps in
[aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps),
© André Ourednik and contributors, licensed under **GPL-3.0** (see LICENSE.txt).
They are distributed under the same license.

- **Upstream commit:** \`${COMMIT}\`
- **Upstream files:** \`geojson/world_<year>.geojson\` for ${YEARS.length} years (${YEARS[0]} to ${YEARS.at(-1)})
- **Changes made:** kept only the fields ${FIELDS.map((f) => `\`${f}\``).join(', ')}; simplified with
  mapshaper ${mapshaperVersion} (\`-simplify ${SIMPLIFY} keep-shapes\`, coordinates rounded to 0.001°).
- **Built by:** \`scripts/build-history.mjs\` in https://github.com/jonathansewe/World_globe

The upstream README calls these maps a work in progress. Many regions have no name:

| Year | Polygons | Unnamed | Restored unsimplified* |
|---|---|---|---|
${stats.map((s) => `| ${s.year} | ${s.features} | ${s.unnamed} | ${s.restored} |`).join('\n')}

\* Shapes so small that simplification erased them; their original outline is kept instead, rounded to 0.0001°.
`);

await writeFile(join(ROOT, 'public/data/history-index.json'), JSON.stringify({
  folder: `data/history/${FOLDER}`,
  commit: COMMIT,
  years: YEARS,
  credit: 'Historical borders © André Ourednik and contributors, GPL-3.0',
  sourceUrl: 'https://github.com/aourednik/historical-basemaps',
}, null, 1) + '\n');
await rm(tmp, { recursive: true, force: true });
console.log(`Wrote ${YEARS.length} snapshots to ${OUT_DIR}`);
