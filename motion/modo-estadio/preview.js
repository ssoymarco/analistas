// node preview.js outDir [--blur] t1 t2 ... -> still frames for inspection
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  let [outDir, ...ts] = process.argv.slice(2);
  let K = 1; if (ts[0] === '--blur') { K = 4; ts = ts.slice(1); }
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('file://' + path.join(__dirname, 'modo-estadio.html'));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  for (const t of ts) {
    await page.evaluate(([t, K]) => window.seek(t, K), [parseFloat(t), K]);
    await page.screenshot({ path: path.join(outDir, `t_${parseFloat(t).toFixed(3).padStart(6, '0')}.png`) });
  }
  await browser.close();
})();
