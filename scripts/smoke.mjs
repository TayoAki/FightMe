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
const I = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, L: 16, H: 32, S: 64, J: 128, G: 256, D: 512 };
const step = (n, p1 = 0, p2 = -1) => page.evaluate(([n, a, b]) => window.fightme.test.frames(n, a, b), [n, p1, p2]);
// a list of [frames, p1, p2]
const steps = async (list) => {
  for (const [n, a = 0, b = -1] of list) await step(n, a, b);
};
const settle = async (name) => {
  await wait(700);
  await shot(name);
};
const setState = (fn) => page.evaluate(fn);

if (scenario === 'all' || scenario === 'menus') {
  await page.goto(base);
  await wait(1200);
  await tap('Enter');
  await wait(300);
  await shot('menu-select');
  await tap('KeyD');
  await wait(300);
  await shot('menu-select-tag');
  // menus read keys once per rendered frame, so give each tap a frame of its own
  const slowTap = async (k) => {
    await tap(k, 200);
    await wait(900);
  };
  await slowTap('KeyI');
  for (let i = 0; i < 3; i++) await slowTap('KeyS');
  await slowTap('Enter');
  await shot('menu-howto');
}

if (scenario === 'all' || scenario === 'training') {
  await page.goto(base);
  await wait(1500);
  await page.evaluate(() => window.fightme.test.start('training', ['street', 'tag'], [0, 1]));
  await step(40);
  await settle('arena-idle');
  // homing dash in, then the light string
  await steps([[1, I.D], [24], [1, I.L], [3]]);
  await settle('arena-dash-jab');
  await steps([[40]]);
  // circle round with a side dash
  await steps([[1, I.UP | I.D], [10]]);
  await settle('arena-sidedash');
  await steps([[40], [30, I.LEFT], [1, I.S], [18]]);
  await settle('arena-fireball');
  await steps([[90], [1, I.H | I.S], [24]]);
  await settle('arena-drive-impact-windup');
  await steps([[16]]);
  await settle('arena-drive-impact-hit');
  await steps([[120]]);
  await setState(() => (window.fightme.test.state().fighters[0].superMeter = 30000));
  await steps([[1, I.LEFT | I.S | I.G], [20]]);
  await settle('arena-beam-super');
  await steps([[30]]);
  await settle('arena-beam-hit');
  await steps([[90]]);
  await page.keyboard.press('KeyH');
  await steps([[1, I.RIGHT], [1, I.RIGHT | I.H], [10]]);
  await settle('arena-hitboxes');
  await page.keyboard.press('KeyH');
}

if (scenario === 'all' || scenario === 'versus') {
  await page.goto(base);
  await wait(1500);
  await page.evaluate(() => window.fightme.test.start('versus', ['tag', 'street'], [2, 4]));
  await step(30);
  await settle('versus-intro');
  await steps([[80, 0, 0], [24, I.RIGHT, 0]]);
  // the Tag team calls its partner in
  await steps([[1, I.L | I.H, 0], [26, 0, 0]]);
  await settle('versus-assist');
  await steps([[90, 0, 0], [20, I.RIGHT, 0]]);
  // Volt Upper launcher, then juggle
  await steps([[1, I.H, 0], [16, 0, 0]]);
  await settle('versus-launch');
  await steps([[14, 0, 0], [1, I.L, 0], [10, 0, 0], [1, I.L, 0], [6, 0, 0]]);
  await settle('versus-juggle');
  await steps([[60, 0, 0], [1, I.H | I.S, 0], [8, 0, 0]]);
  await settle('versus-tag-swap');
  await steps([[120, 0, 0]]);
  // both fire beams: a clash
  await setState(() => {
    const m = window.fightme.test.state();
    m.fighters[0].superMeter = 30000;
    m.fighters[1].superMeter = 30000;
    m.fighters[0].x = -25000;
    m.fighters[0].z = 0;
    m.fighters[1].x = 25000;
    m.fighters[1].z = 0;
  });
  await steps([[30, 0, 0], [1, I.S | I.G, I.RIGHT | I.S | I.G], [60, 0, 0]]);
  await settle('versus-beam-clash');
  for (let i = 0; i < 40; i++) await step(2, i % 2 ? I.L : I.H, 0);
  await steps([[20, 0, 0]]);
  await settle('versus-clash-win');
}

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
server.close();
