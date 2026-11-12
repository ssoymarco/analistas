// Full render: soundtrack (OfflineAudioContext -> WAV), 60 fps x 3 subframes (Playwright),
// tmix motion blur + mux with ffmpeg.
//   node render.js [framesDir] [outDir] [workers]
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const HTML = 'file://' + path.join(__dirname, 'analistas-motion.html');
const FPS = 60, SUB = 3, DUR = 10, NF = FPS * DUR;

async function openPage() {
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(HTML);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  return { browser, page };
}

async function worker(framesDir, f0, f1) {
  const { browser, page } = await openPage();
  for (let f = f0; f < f1; f++) {
    for (let k = 0; k < SUB; k++) {
      const t = f / FPS + (k - (SUB - 1) / 2) / (FPS * SUB); // subframes centred on the frame time
      await page.evaluate(t => window.seek(t), t);
      await page.screenshot({ path: path.join(framesDir, `sub_${String(f * SUB + k).padStart(5, '0')}.png`) });
    }
  }
  await browser.close();
}

(async () => {
  const framesDir = process.argv[2] || path.join(__dirname, 'frames');
  const outDir = process.argv[3] || path.join(__dirname, 'out');
  const nW = parseInt(process.argv[4] || '4');
  if (process.argv[5] === '--child') { // child worker
    await worker(framesDir, parseInt(process.argv[6]), parseInt(process.argv[7]));
    return;
  }
  fs.mkdirSync(framesDir, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();
  // 1. audio
  {
    const { browser, page } = await openPage();
    const r = await page.evaluate(() => window.renderAudio());
    fs.writeFileSync(path.join(outDir, 'analistas-soundtrack.wav'), Buffer.from(r.b64, 'base64'));
    console.log('audio rendered, raw peak', r.peak.toFixed(3));
    await browser.close();
  }
  // 2. frames in parallel processes
  const per = Math.ceil(NF / nW);
  await Promise.all([...Array(nW).keys()].map(w => new Promise((res, rej) => {
    const a = w * per, b = Math.min(NF, (w + 1) * per);
    const p = spawn(process.execPath, [__filename, framesDir, outDir, String(nW), '--child', String(a), String(b)], { stdio: 'inherit' });
    p.on('exit', c => c === 0 ? res() : rej(new Error('worker ' + w + ' failed')));
  })));
  console.log('frames done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  // 3. ffmpeg: 180 fps subframes -> tmix (3) -> 60 fps, mux audio
  const mp4 = path.join(outDir, 'analistas-motion.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-framerate', String(FPS * SUB), '-i', path.join(framesDir, 'sub_%05d.png'),
    '-i', path.join(outDir, 'analistas-soundtrack.wav'),
    '-filter_complex', `[0:v]tmix=frames=${SUB}:weights='1 1 1',select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a', '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-tune', 'animation',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '256k', '-t', String(DUR), '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  console.log('wrote', mp4, 'total', ((Date.now() - t0) / 1000).toFixed(1), 's');
})();
