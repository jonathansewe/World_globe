// Fetches country statistics from the World Bank Indicators API v2 and writes
// public/data/countries.json. Runs in a scheduled GitHub Action (see
// .github/workflows/refresh-worldbank.yml), not in the browser.
//
// Usage: node scripts/fetch-worldbank.mjs
//
// The output has no fetch timestamp on purpose: if the World Bank data hasn't
// changed, the file comes out byte-for-byte identical and the Action commits nothing.

import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.worldbank.org/v2';
export const INDICATORS = {
  pop: 'SP.POP.TOTL', // Population, total
  cbr: 'SP.DYN.CBRT.IN', // Birth rate, crude (per 1,000 people)
};
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/data/countries.json');

// Turns raw API responses into the file the site reads. Pure function, so
// tests/worldbank.test.mjs can check it with fixtures instead of the network.
//   countryList: the rows of /v2/country (used to tell countries from aggregates)
//   indicatorData: { pop: { meta, rows }, cbr: { meta, rows } }
export function buildCountries(countryList, indicatorData) {
  const realCountries = new Set();
  const aggregates = new Set();
  for (const c of countryList) {
    if (!c?.id) continue;
    if (c.region?.id === 'NA') aggregates.add(c.id);
    else realCountries.add(c.id);
  }
  if (realCountries.size < 150) throw new Error(`Only ${realCountries.size} countries in /v2/country; expected about 217`);

  const countries = {};
  const indicators = {};
  for (const [short, id] of Object.entries(INDICATORS)) {
    const { meta, rows } = indicatorData[short];
    indicators[short] = {
      id,
      name: rows.find((r) => r.indicator?.id === id)?.indicator?.value ?? id,
      lastupdated: meta?.lastupdated ?? null,
    };
    for (const r of rows) {
      const iso3 = r.countryiso3code;
      if (!iso3 || !realCountries.has(iso3)) continue; // drops aggregates and blanks
      if (r.value === null || r.value === undefined) continue; // "No data", never 0
      const year = Number(r.date);
      if (!Number.isInteger(year)) continue;
      (countries[iso3] ??= {})[short] = { value: r.value, year };
    }
  }

  // Sorted keys make the output stable, so an unchanged API gives an unchanged file.
  const sorted = Object.fromEntries(Object.keys(countries).sort().map((k) => [k, countries[k]]));
  return {
    source: 'World Bank, World Development Indicators',
    license: 'CC BY 4.0',
    url: 'https://data.worldbank.org/',
    indicators,
    aggregatesExcluded: aggregates.size,
    countries: sorted,
  };
}

async function getJSON(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'world-globe-data-refresh (github.com/jonathansewe/World_globe)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      // The API reports errors as [{ message: [...] }] with HTTP 200.
      if (!Array.isArray(body) || body.length < 2) throw new Error(`Unexpected response: ${JSON.stringify(body).slice(0, 200)}`);
      return body;
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// Follows the API's paging until every row is collected.
async function getAllPages(path) {
  const sep = path.includes('?') ? '&' : '?';
  const [meta, firstRows] = await getJSON(`${API}${path}${sep}format=json&per_page=400&page=1`);
  const rows = [...(firstRows ?? [])];
  for (let page = 2; page <= (meta.pages ?? 1); page++) {
    const [, more] = await getJSON(`${API}${path}${sep}format=json&per_page=400&page=${page}`);
    rows.push(...(more ?? []));
  }
  return { meta, rows };
}

async function main() {
  const { rows: countryList } = await getAllPages('/country');
  const indicatorData = {};
  for (const [short, id] of Object.entries(INDICATORS)) {
    // mrnev=1: the most recent non-empty value for each country.
    indicatorData[short] = await getAllPages(`/country/all/indicator/${id}?mrnev=1`);
  }
  const out = buildCountries(countryList, indicatorData);
  const n = Object.keys(out.countries).length;
  if (n < 180) throw new Error(`Only ${n} countries have data; refusing to overwrite the file`);
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote ${OUT}: ${n} countries, ${out.aggregatesExcluded} aggregates excluded.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
