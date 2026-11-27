// Browser smoke test for M1. Starts a local server on public/, opens the page in
// headless Chromium and checks the globe, the panel, the phone layout and the WebGL fallback.
// Usage: node tests/smoke.mjs

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8123;
const URL = `http://localhost:${PORT}/`;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', 'public'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });

// The test machine has no GPU, so WebGL runs in software (SwiftShader). There, globe.gl's
// render loop can take so long per frame that the page stops answering for 20 s or more.
// The checks below test data and layout, not frame rate, so the render loop is paused
// as soon as the app exposes the globe. Frame rate must be checked on a real phone.
const pauseRenderLoop = () => {
  const iv = setInterval(() => {
    if (window.__worldGlobe) { window.__worldGlobe.globe.pauseAnimation(); clearInterval(iv); }
  }, 20);
};
const newPage = async (opts) => {
  const page = await browser.newPage(opts);
  await page.addInitScript(pauseRenderLoop);
  return page;
};

try {
  // Desktop
  const page = await newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => window.__worldGlobe, null, { timeout: 30000 });
  check('Globe loads', true, `${Date.now() - t0} ms (software WebGL, not representative of a real device)`);
  const n = await page.evaluate(() => window.__worldGlobe.features.length);
  check('All 242 Natural Earth features drawn', n === 242, `${n} features`);

  for (const [key, want] of [['FRA', 'FRA'], ['NOR', 'NOR'], ['XKX', 'XKX']]) {
    await page.evaluate((k) => window.__worldGlobe.select(k), key);
    const shown = await page.locator('#panel-codes dd').first().textContent();
    check(`Panel shows ${want}`, shown === want, `ISO cell: ${shown}`);
  }
  // M2: statistics in the panel (only once the refresh Action has created countries.json).
  const hasWb = await page.evaluate(() => Boolean(window.__worldGlobe.wb));
  if (hasWb) {
    await page.evaluate(() => window.__worldGlobe.select('DEU'));
    const statText = await page.locator('#panel-stats').textContent();
    check('M2: panel shows population and birth rate with a year', /Population[\d,]+ \(\d{4}\)/.test(statText) && /Birth rate[\d.]+ per 1,000 people \(\d{4}\)/.test(statText), statText);
    const credit = await page.locator('#panel-credit').textContent();
    check('M2: World Bank CC BY 4.0 credit shown', credit.includes('World Bank') && credit.includes('CC BY 4.0'), credit);
    await page.evaluate(() => window.__worldGlobe.select('TWN'));
    const twn = await page.locator('#panel-stats').textContent();
    check('M2: Taiwan shows "No data", never 0', twn.includes('No data') && !/Population0/.test(twn), twn);
    await page.selectOption('#color-by', 'pop');
    const legend = await page.locator('#legend').textContent();
    check('M2: choropleth legend shows real-value classes and No data', /\d/.test(legend) && legend.includes('No data'), legend.slice(0, 120));
    await page.selectOption('#color-by', 'none');
  } else {
    check('M2: countries.json present', false, 'not created yet by the refresh Action; M2 UI checks skipped');
  }

  // M3: historical borders.
  const namesAt = (y) => page.evaluate(async (yr) => {
    await window.__worldGlobe.setYear(yr);
    const c = window.__worldGlobe.current();
    return { mode: c.mode, names: c.features.map((f) => f.properties.NAME || f.properties.name) };
  }, y);
  const at600 = await namesAt(600);
  check('M3: 600 has Eastern Roman and Sasanian empires', at600.mode === 600 && at600.names.includes('Eastern Roman Empire') && at600.names.includes('Sasanian Empire'));
  const at1914 = await namesAt(1914);
  check('M3: 1914 has Austro-Hungarian Empire', at1914.names.includes('Austro-Hungarian Empire'));
  const at1945 = await namesAt(1945);
  check('M3: 1945 has Austria and Hungary separately', at1945.names.includes('Austria') && at1945.names.includes('Hungary'));
  const at2010 = await namesAt(2010);
  check('M3: 2010 has Sudan but no South Sudan', at2010.names.includes('Sudan') && !at2010.names.includes('South Sudan'));
  const atNow = await namesAt(new Date().getFullYear());
  check('M3: present day has Sudan and South Sudan', atNow.mode === 'present' && atNow.names.includes('Sudan') && atNow.names.includes('S. Sudan'), atNow.names.filter((n) => /Sudan/.test(n)).join(', '));
  await namesAt(1850);
  const note = await page.locator('#snapshot-note').textContent();
  check('M3: 1850 snaps to the 1815 map and says so', note.includes('Showing borders of 1815'), note);

  // Switching between cached snapshots.
  await namesAt(600);
  const tSwitch = await page.evaluate(async () => { const t = performance.now(); await window.__worldGlobe.setYear(1914); await window.__worldGlobe.setYear(600); return performance.now() - t; });
  check('M3: switching cached snapshots takes <= 1 s', tSwitch <= 1000, `${Math.round(tSwitch)} ms for two switches (data swap only; render loop paused)`);

  // Keyboard and ARIA.
  await page.focus('#year');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const afterRight = await page.inputValue('#year');
  await page.keyboard.press('End');
  const afterEnd = await page.inputValue('#year');
  await page.keyboard.press('Home');
  const afterHome = await page.inputValue('#year');
  check('M3: keyboard Home / ArrowRight / End step snapshots', afterRight === '700' && afterEnd === String(new Date().getFullYear()) && afterHome === '600', `${afterRight}, ${afterEnd}, ${afterHome}`);
  const aria = await page.evaluate(() => [document.querySelector('#year').getAttribute('aria-label'), document.querySelector('#year').getAttribute('aria-valuetext')]);
  check('M3: slider has an ARIA label and the current year', Boolean(aria[0]) && /600/.test(aria[1]), aria.join(' | '));

  // Memory: drag end to end 10 times, then compare the JS heap after garbage collection.
  const heap = await page.evaluate(async () => {
    const yrs = [...window.__worldGlobe.years, new Date().getFullYear()];
    for (const y of yrs) await window.__worldGlobe.setYear(y); // warm the cache first
    window.gc(); const before = performance.memory.usedJSHeapSize;
    for (let i = 0; i < 10; i++) for (const y of (i % 2 ? [...yrs].reverse() : yrs)) await window.__worldGlobe.setYear(y);
    window.gc(); return { before, after: performance.memory.usedJSHeapSize };
  });
  const growMb = (heap.after - heap.before) / 1024 / 1024;
  check('M3: 10 end-to-end drags grow the JS heap by <= 50 MB', growMb <= 50, `${growMb.toFixed(1)} MB (JS heap only; GPU memory not measured)`);

  // About: GPL notice and links.
  await page.click('#about-link');
  const about = await page.locator('#about').textContent();
  const links = await page.locator('#about a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check('M3: About shows GPL-3.0 notice, LICENSE and source links', about.includes('GNU General Public License v3.0') && links.some((h) => h.endsWith('/LICENSE')) && links.includes('https://github.com/aourednik/historical-basemaps') && links.some((h) => h.endsWith('SOURCE.md')), links.join(' '));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__worldGlobe.setYear(new Date().getFullYear()));

  await page.screenshot({ path: 'test-results/desktop.png' });
  check('No console errors (desktop)', errors.length === 0, errors.join(' | '));

  // Phone (390 px wide)
  const phone = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto(URL);
  await phone.waitForFunction(() => window.__worldGlobe, null, { timeout: 30000 });
  await phone.evaluate(() => window.__worldGlobe.select('BFA'));
  const box = await phone.locator('#panel').boundingBox();
  const sideways = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('Phone: panel is a bottom sheet', box && Math.round(box.y + box.height) === 844 && Math.round(box.width) === 390, JSON.stringify(box));
  check('Phone: no sideways scroll', !sideways);
  await phone.screenshot({ path: 'test-results/phone.png' });

  // WebGL disabled
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  const noGl = await ctx.newPage();
  await noGl.goto(URL);
  await noGl.waitForTimeout(1500);
  check('WebGL off: fallback message shown', await noGl.locator('#fallback').isVisible());
} finally {
  await browser.close();
  server.kill();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
