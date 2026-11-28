// M3 memory check: drags the slider end to end 10 times and compares the JS heap
// after garbage collection. Slow in a GPU-less container (about 30 map builds per
// pass), so it is not part of `npm test`. Run it on a real machine: npm run test:memory
// It measures the JS heap only; GPU memory still needs Chrome DevTools on a real device.

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8124;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', 'public'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__worldGlobe, null, { timeout: 120000 });
  const heap = await page.evaluate(async () => {
    const idle = () => new Promise((r) => setTimeout(r, 50));
    const yrs = [...window.__worldGlobe.years, new Date().getFullYear()];
    for (const y of yrs) { await window.__worldGlobe.setYear(y); await idle(); }
    window.gc();
    const before = performance.memory.usedJSHeapSize;
    for (let i = 0; i < 10; i++) for (const y of (i % 2 ? [...yrs].reverse() : yrs)) { await window.__worldGlobe.setYear(y); await idle(); }
    window.gc();
    return { before, after: performance.memory.usedJSHeapSize };
  });
  const mb = (heap.after - heap.before) / 1024 / 1024;
  console.log(`${mb <= 50 ? 'PASS' : 'FAIL'}  10 end-to-end drags grow the JS heap by ${mb.toFixed(1)} MB (limit 50)`);
  process.exitCode = mb <= 50 ? 0 : 1;
} finally {
  await browser.close();
  server.kill();
}
