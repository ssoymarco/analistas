// node preview.js outDir t1 t2 ...  -> renders single frames (no motion blur) for inspection
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [outDir, ...ts] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('file://' + path.join(__dirname, 'analistas-motion.html'));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  for (const t of ts) {
    await page.evaluate(t => window.seek(t), parseFloat(t));
    await page.screenshot({ path: path.join(outDir, `t_${parseFloat(t).toFixed(3)}.png`) });
  }
  await browser.close();
})();
