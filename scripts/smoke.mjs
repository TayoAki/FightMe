// Smoke test: serves dist/, opens it in headless Chromium, plays a few scripted inputs and saves
// screenshots. Usage: npm run build && node scripts/smoke.mjs [outDir] [scenario]
//   scenario: all (default) | poses | title | training | versus
// Set CHROMIUM=/path/to/chrome if Playwright's own browser isn't installed.

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('dist');
const out = resolve(process.argv[2] || 'shots');
const scenario = process.argv[3] || 'all';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = join(root, url.pathname === '/' ? 'index.html' : url.pathname);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const fps = async () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// block Google Fonts so the test runs offline
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
// software WebGL in a headless browser renders slowly, so taps are long enough to land on separate frames
const tap = async (key, hold = 90) => {
  await page.keyboard.down(key);
  await wait(hold);
  await page.keyboard.up(key);
  await wait(160);
};
// a quick sequence of held keys, one group per ~frame
const seqKeys = async (groups, frameMs = 18) => {
  let held = [];
  for (const g of groups) {
    for (const k of held) if (!g.includes(k)) await page.keyboard.up(k);
    for (const k of g) if (!held.includes(k)) await page.keyboard.down(k);
    held = g;
    await wait(frameMs);
  }
  for (const k of held) await page.keyboard.up(k);
};

if (scenario === 'all' || scenario === 'poses') {
  await page.goto(base + '?poses');
  await wait(1500);
  await shot('poses');
}
if (scenario.startsWith('poses=')) {
  await page.goto(base + '?' + scenario);
  await wait(1500);
  await shot('poses-some');
}

if (scenario === 'all' || scenario === 'title' || scenario === 'training' || scenario === 'versus') {
  await page.goto(base);
  await wait(3000);
  console.log('title fps', await fps());
  await shot('title');
}

// input bits (see src/sim/input.ts)
const I = { U: 1, D: 2, L: 4, R: 8, B1: 16, B2: 32, B3: 64, B4: 128, B5: 256, B6: 512 };
const step = (n, p1 = 0, p2 = -1) => page.evaluate(([n, a, b]) => window.fightme.test.frames(n, a, b), [n, p1, p2]);
// a list of [frames, p1, p2]
const steps = async (list) => {
  for (const [n, a = 0, b = -1] of list) await step(n, a, b);
};
const settle = async (name) => {
  await wait(700);
  await shot(name);
};

if (scenario === 'all' || scenario === 'training') {
  await page.goto(base);
  await wait(1500);
  await page.evaluate(() => window.fightme.test.start('training', ['street', 'iron'], [0, 1]));
  await step(40);
  await settle('fight-idle');
  await steps([[24, I.R], [8]]);
  await steps([[1, I.B1], [3]]);
  await settle('fight-jab');
  await steps([[30]]);
  await steps([[1, I.D | I.B5], [3, I.D], [1, I.D | I.R], [1, I.R | I.B3], [16]]);
  await settle('fight-fireball');
  await steps([[90]]);
  await steps([[1, I.B3 | I.B6], [24]]);
  await settle('fight-drive-impact-windup');
  await steps([[16]]);
  await settle('fight-drive-impact-hit');
  await steps([[120]]);
  await page.evaluate(() => (window.fightme.test.state().fighters[0].superMeter = 30000));
  await steps([[1, I.D], [1, I.D | I.R], [1, I.R], [1, I.D], [1, I.D | I.R], [1, I.R | I.B1], [20]]);
  await settle('fight-super-freeze');
  await steps([[50]]);
  await settle('fight-super-hit');
}

if (scenario === 'all' || scenario === 'versus') {
  await page.goto(base);
  await wait(1500);
  await page.evaluate(() => window.fightme.test.start('versus', ['iron', 'street'], [2, 3]));
  await step(30);
  await settle('versus-intro');
  await steps([[80], [36, I.R]]);
  await steps([[1, I.D | I.R | I.B2], [18]]);
  await settle('versus-launch');
  await steps([[20]]);
  await steps([[1, I.B1], [4], [1, I.B2], [10]]);
  await settle('versus-juggle');
  await steps([[30], [1, I.B4], [5], [1, I.B2], [8]]);
  await settle('versus-tornado');
  await steps([[120]]);
  await page.keyboard.press('KeyH');
  await steps([[30, I.R], [1, I.R | I.B2], [12]]);
  await settle('versus-wall');
}

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
server.close();
