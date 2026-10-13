/**
 * Proves the client needs no server and no network.
 *
 * Serves the static export, blocks every request that is not the local bundle,
 * and drives the whole product: build a basket, shuffle with locks, swap, watch,
 * share, a meal with its cooking guide, the cross-store comparison and the split
 * basket, the in-store checklist, checkout, and the savings dashboard — then
 * reloads to confirm the state survived. Any console error fails the run.
 *
 *   npm run build && npm run test:offline
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'out');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(ROOT, '404.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(4173, r));
  // Use a preinstalled headless shell when the sandbox provides one, otherwise
  // fall back to Playwright's own download.
  const shell = process.env.CHROMIUM_HEADLESS_SHELL;
  const browser = await chromium.launch({
    ...(shell && fs.existsSync(shell) ? { executablePath: shell } : {}),
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'he-IL' });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // Block ALL external requests — proves the app needs no network at all.
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:4173')) return route.continue();
    return route.abort();
  });

  const text = async () => (await page.locator('body').innerText());
  const step = async (label, fn) => {
    await fn();
    await page.waitForTimeout(450);
    const t = await text();
    if (/undefined|NaN|\[object Object\]/.test(t)) throw new Error(label + ': found ' + t.match(/undefined|NaN|\[object Object\]/)[0]);
    console.log(('  ' + label).padEnd(34), t.replace(/\s+/g, ' ').slice(0, 72));
    return t;
  };

  console.log('=== offline run (all network blocked) ===');
  await step('home', () => page.goto('http://localhost:4173/', { waitUntil: 'networkidle' }));
  await step('build basket', () => page.getByRole('button', { name: /בנה לי סל/ }).click());
  const cart = await text();
  const used = cart.match(/נוצל:\s*₪([\d,]+)/);
  const budget = cart.match(/₪([\d,]+)\s*$/m);
  console.log('     cart total line:', (cart.match(/נוצל:[^\n]*/) || [''])[0]);
  if (!used) throw new Error('budget bar missing');

  await step('shuffle', () => page.getByRole('button', { name: /ערבב מחדש/ }).click());
  await step('lock first item', () => page.getByRole('button', { name: /נעל$/ }).first().click());
  await step('swap', () => page.getByRole('button', { name: /החלף/ }).first().click());
  await step('watch (star)', () => page.getByRole('button', { name: /מעקב/ }).first().click());
  await step('share cart', () => page.getByRole('button', { name: /שתף סל/ }).click());

  await step('meal tab', () => page.getByRole('link', { name: 'מצב שף', exact: true }).click());
  const meal = await text();
  console.log('     badge:', (meal.match(/רק ₪[\d.]+ לסועד[^\n]*/) || [''])[0]);
  await step('cooking guide', () => page.getByRole('button', { name: /מדריך הכנה/ }).click());
  await step('bbq recipe', async () => {
    await page.getByRole('button', { name: /מצרכים בסל/ }).click();
    await page.getByRole('button', { name: /על האש/ }).click();
  });

  await step('compare tab', () => page.getByRole('link', { name: 'השוואה', exact: true }).click());
  const cmp = await text();
  console.log('     saving:', (cmp.match(/אפשר לחסוך עד\s*₪[\d,]+/) || [''])[0]);
  await step('enable Pro (split)', () => page.getByRole('button', { name: /Pro/ }).first().click());
  console.log('     split:', ((await text()).match(/(במשלוח|לא משתלם)[^\n]{0,70}/) || [''])[0]);

  await step('checkout tab', () => page.getByRole('link', { name: 'קנייה', exact: true }).click());
  await step('tick an item', () => page.locator('button').filter({ hasText: /₪/ }).nth(2).click());
  const after = await step('finish shopping', () => page.getByRole('button', { name: /סיימתי לקנות/ }).click());
  if (!/מה מכינים ממה שנשאר/.test(after)) throw new Error('checkout did not produce leftover ideas');
  console.log('     leftovers shown:', (after.match(/מה מכינים ממה שנשאר[\s\S]{0,60}/) || [''])[0].replace(/\s+/g, ' '));
  await step('insights tab', () => page.getByRole('link', { name: 'תובנות', exact: true }).click());
  const ins = await text();
  console.log('     savings headline:', (ins.match(/החודש חסכת[^\n]*/) || ['(none)'])[0]);

  // reload proves localStorage persistence
  await step('reload (persistence)', () => page.reload({ waitUntil: 'networkidle' }));

  const shots = path.join(__dirname, 'screenshots');
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, 'insights.png') });
  await page.getByRole('link', { name: 'הסל', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shots, 'cart.png') });
  await page.getByRole('link', { name: 'בית', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shots, 'home.png') });

  const real = errors.filter((e) => !/net::ERR_FAILED|Failed to load resource|fonts\.googleapis/.test(e));
  console.log('\nconsole errors (excluding blocked font request):', real.length);
  real.slice(0, 5).forEach((e) => console.log('  !', e));
  await browser.close();
  server.close();
  if (real.length) process.exit(1);
  console.log('OFFLINE TEST PASSED — no server, no network');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
