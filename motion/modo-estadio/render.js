// Full render: soundtrack -> WAV, 60 fps x 3 subframes (Playwright), ffmpeg tmix + mux.
//   node render.js [framesDir] [outDir] [workers]
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const HTML = 'file://' + path.join(__dirname, 'modo-estadio.html');
const FPS = 60, SUB = 3, DUR = 16, NF = FPS * DUR, SUBDT = 1 / 240;   // subframes 1/240 s apart (270° shutter with in-page sampling)

async function openPage() {
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(HTML);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  return { browser, page };
}
async function worker(dir, f0, f1) {
  const { browser, page } = await openPage();
  for (let f = f0; f < f1; f++) for (let k = 0; k < SUB; k++) {
    const t = f / FPS + (k - (SUB - 1) / 2) * SUBDT;
    await page.evaluate(t => window.seek(t, 4), t);
    await page.screenshot({ path: path.join(dir, `sub_${String(f * SUB + k).padStart(5, '0')}.png`) });
  }
  await browser.close();
}
(async () => {
  const dir = process.argv[2] || path.join(__dirname, 'frames');
  const outDir = process.argv[3] || path.join(__dirname, 'out');
  const nW = parseInt(process.argv[4] || '4');
  if (process.argv[5] === '--child') { await worker(dir, +process.argv[6], +process.argv[7]); return; }
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
  const T0 = Date.now();
  const wav = path.join(outDir, 'modo-estadio-soundtrack.wav');
  { const { browser, page } = await openPage(); const r = await page.evaluate(() => window.renderAudio());
    fs.writeFileSync(wav, Buffer.from(r.b64, 'base64')); console.log('audio rendered, raw peak', r.peak.toFixed(3)); await browser.close(); }
  const per = Math.ceil(NF / nW);
  await Promise.all([...Array(nW).keys()].map(w => new Promise((res, rej) => {
    const p = spawn(process.execPath, [__filename, dir, outDir, String(nW), '--child', String(w * per), String(Math.min(NF, (w + 1) * per))], { stdio: 'inherit' });
    p.on('exit', c => c === 0 ? res() : rej(new Error('worker ' + w)));
  })));
  console.log('frames done', ((Date.now() - T0) / 1000).toFixed(1), 's');
  const mp4 = path.join(outDir, 'modo-estadio.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS * SUB), '-i', path.join(dir, 'sub_%05d.png'), '-i', wav,
    '-filter_complex', `[0:v]tmix=frames=${SUB}:weights='1 1 1',select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-tune', 'animation',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '256k', '-t', String(DUR), '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  console.log('wrote', mp4, ((Date.now() - T0) / 1000).toFixed(1), 's');
})();
