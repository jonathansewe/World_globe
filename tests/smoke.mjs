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
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

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
