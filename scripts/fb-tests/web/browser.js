// Playwright helpers for the web UI harness: a phone-sized page with optional seeded AsyncStorage.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS_DIR || __dirname + '/../.build/shots';
require('fs').mkdirSync(SHOTS, { recursive: true });
async function open({ storage = {}, tz = 'America/Mexico_City' } = {}) {
  // Crests and photos come from the provider's CDN: go through the proxy when the environment has one.
  const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {};
  const ctxOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DSF) || 1, timezoneId: tz, locale: 'es-MX', hasTouch: true, isMobile: true };
  // PROFILE_DIR keeps one browser profile between runs (same signed-in guest, same saved data).
  let browser, ctx;
  if (process.env.PROFILE_DIR) {
    ctx = await chromium.launchPersistentContext(process.env.PROFILE_DIR, { ...proxy, ...ctxOptions });
    browser = { close: () => ctx.close() };
  } else {
    browser = await chromium.launch(proxy);
    ctx = await browser.newContext(ctxOptions);
  }
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, storage);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + String(e.stack || e).slice(0, 600)));
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|favicon|ERR_|net::/.test(t)) errors.push('console.error ' + t.slice(0, 500)); } });
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:8090/', { waitUntil: 'load' });
  const shot = async name => { await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n');
  // Stack screens stay mounted underneath: click the topmost visible match.
  const tap = async (label, opts = {}) => {
    const all = page.getByText(label, { exact: opts.exact ?? false });
    const deadline = Date.now() + (opts.timeout ?? 8000);
    for (;;) {
      const n = await all.count();
      const order = opts.last ? [...Array(n).keys()].reverse() : [...Array(n).keys()];
      for (const i of order) {
        const l = all.nth(i);
        if (!(await l.isVisible().catch(() => false))) continue;
        await l.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
        const box = await l.boundingBox().catch(() => null);
        if (!box || box.y < 0 || box.y > 844 || box.x < 0 || box.x > 390) continue;
        const onTop = await page.evaluate(([x, y, txt]) => { const el = document.elementFromPoint(x, y); return !!el && (el.innerText || '').includes(txt); }, [box.x + box.width / 2, box.y + box.height / 2, label]);
        if (!onTop) continue;
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        return;
      }
      if (Date.now() > deadline) throw new Error('locator.waitFor: no visible "' + label + '"');
      await page.waitForTimeout(300);
    }
  };
  return { browser, page, errors, shot, text, tap, wait: ms => page.waitForTimeout(ms) };
}
module.exports = { open };
