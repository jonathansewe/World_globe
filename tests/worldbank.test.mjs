// Unit test for the World Bank transform, using fixtures shaped like the real API.
// Usage: node --test tests/worldbank.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCountries } from '../scripts/fetch-worldbank.mjs';

// 150 filler countries so the "suspiciously few countries" guard doesn't trip.
const filler = Array.from({ length: 150 }, (_, i) => ({ id: `Q${String(i).padStart(2, '0')}`, region: { id: 'XYZ' } }));
const countryList = [
  { id: 'DEU', region: { id: 'ECS', value: 'Europe & Central Asia' } },
  { id: 'XKX', region: { id: 'ECS', value: 'Europe & Central Asia' } },
  { id: 'WLD', region: { id: 'NA', value: 'Aggregates' } },
  { id: 'EUU', region: { id: 'NA', value: 'Aggregates' } },
  ...filler,
];
const row = (iso3, value, date, id = 'SP.POP.TOTL') => ({
  indicator: { id, value: id === 'SP.POP.TOTL' ? 'Population, total' : 'Birth rate, crude (per 1,000 people)' },
  country: { id: iso3.slice(0, 2), value: iso3 },
  countryiso3code: iso3, date, value,
});
const data = {
  pop: { meta: { lastupdated: '2026-10-01' }, rows: [row('DEU', 83000000, '2024'), row('WLD', 8e9, '2024'), row('EUU', 4.5e8, '2024'), row('XKX', null, '2024'), row('', 1, '2024')] },
  cbr: { meta: { lastupdated: '2026-10-02' }, rows: [row('DEU', 8.4, '2023', 'SP.DYN.CBRT.IN'), row('XKX', 10.1, '2022', 'SP.DYN.CBRT.IN')] },
};

test('drops aggregates and blank codes', () => {
  const out = buildCountries(countryList, data);
  assert.equal(out.countries.WLD, undefined);
  assert.equal(out.countries.EUU, undefined);
  assert.equal(out.countries[''], undefined);
  assert.equal(out.aggregatesExcluded, 2);
});

test('keeps value and year, and treats null as no data (never 0)', () => {
  const out = buildCountries(countryList, data);
  assert.deepEqual(out.countries.DEU, { pop: { value: 83000000, year: 2024 }, cbr: { value: 8.4, year: 2023 } });
  assert.deepEqual(out.countries.XKX, { cbr: { value: 10.1, year: 2022 } });
});

test('records indicator names and last-updated dates', () => {
  const out = buildCountries(countryList, data);
  assert.equal(out.indicators.pop.lastupdated, '2026-10-01');
  assert.equal(out.indicators.cbr.name, 'Birth rate, crude (per 1,000 people)');
  assert.equal(out.license, 'CC BY 4.0');
});

test('is deterministic (same input, same JSON)', () => {
  assert.equal(JSON.stringify(buildCountries(countryList, data)), JSON.stringify(buildCountries(countryList, data)));
});

test('refuses a suspiciously short country list', () => {
  assert.throws(() => buildCountries(countryList.slice(0, 10), data), /Only/);
});
