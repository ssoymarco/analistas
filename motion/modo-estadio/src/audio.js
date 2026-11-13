/* =====================================================================
   SOUNDTRACK — Web Audio API, OfflineAudioContext, 120 BPM, 16 s.
   Kick on every beat · tick on the click · rising hit on the dot landing
   · short low thud on the GOL pill · clean hit when the end card lands.
   Deterministic (seeded noise). Rendered to 16-bit WAV.
   ===================================================================== */
window.renderAudio = async function () {
  const SR = 48000, LOOK = 0.006;                // DynamicsCompressor pre-delay, trimmed at the end
  const NS = Math.round(SR * (DUR + LOOK));
  const ctx = new OfflineAudioContext(2, NS, SR);
  let seed = 0x0DDBA11;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const NB = (() => { const b = ctx.createBuffer(2, SR * 3, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; } return b; })();

  const master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
  master.connect(comp); comp.connect(ctx.destination);
  const verb = ctx.createConvolver();
  const ir = ctx.createBuffer(2, Math.floor(SR * 1.4), SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / d.length, 4.5) * 0.45; }
  verb.buffer = ir; const vs = ctx.createGain(); vs.gain.value = 0.3; vs.connect(verb); verb.connect(master);

  const env = (g, t, peak, a, d) => { g.gain.setValueAtTime(0.0001, Math.max(0, t)); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const out = (node, send = 0, pan = 0) => { const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(master); if (send) { const s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(vs); } };
  const noise = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = NB; s.start(Math.max(0, t), rnd() * 1.5, dur + 0.05); return s; };
  const filt = (type, f, Q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
  const osc = (type, f, t, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, Math.max(0, t)); o.start(Math.max(0, t)); o.stop(t + dur); return o; };

  function kick(t, v = 1) {
    const o = osc('sine', 150, t, 0.45); o.frequency.exponentialRampToValueAtTime(52, t + 0.06); o.frequency.exponentialRampToValueAtTime(44, t + 0.3);
    const g = ctx.createGain(); env(g, t, 0.85 * v, 0.002, 0.34); o.connect(g); out(g);
    const n = noise(t, 0.02), hp = filt('highpass', 3500), gn = ctx.createGain(); env(gn, t, 0.12 * v, 0.001, 0.012); n.connect(hp); hp.connect(gn); out(gn);
  }
  function hat(t, v = 0.08, len = 0.03, pan = 0.2) { const n = noise(t, len + 0.02), hp = filt('highpass', 8500), g = ctx.createGain(); env(g, t, v, 0.001, len); n.connect(hp); hp.connect(g); out(g, 0.04, pan); }
  function click(t) { // UI tick on the toggle click
    const o = osc('sine', 3400, t, 0.05); const g = ctx.createGain(); env(g, t, 0.22, 0.0008, 0.018); o.connect(g); out(g, 0.1);
    const n = noise(t, 0.01), bp = filt('bandpass', 5200, 1.5), gn = ctx.createGain(); env(gn, t, 0.3, 0.0005, 0.008); n.connect(bp); bp.connect(gn); out(gn);
    const o2 = osc('triangle', 1250, t + 0.03, 0.06); const g2 = ctx.createGain(); env(g2, t + 0.03, 0.08, 0.001, 0.03); o2.connect(g2); out(g2, 0.1);
  }
  function blip(t, f, v = 0.09, pan = 0) { const o = osc('triangle', f, t, 0.2); const g = ctx.createGain(); env(g, t, v, 0.002, 0.12); o.connect(g); out(g, 0.3, pan); }
  function pluck(t, f, v = 0.07, pan = 0) {
    const o = osc('sawtooth', f, t, 0.3), lp = filt('lowpass', 3000, 3); lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.18);
    const g = ctx.createGain(); env(g, t, v, 0.002, 0.2); o.connect(lp); lp.connect(g); out(g, 0.35, pan);
  }
  function whoosh(t, dur, f0, f1, v = 0.15, pan = 0) {
    const n = noise(t, dur + 0.05), bp = filt('bandpass', f0, 1.3); bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g); out(g, 0.2, pan);
  }
  function boop(t, f0, f1, dur = 0.16, v = 0.12) { const o = osc('sine', f0, t, dur + 0.05); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = ctx.createGain(); env(g, t, v, 0.004, dur); o.connect(g); out(g, 0.2); }
  function risingHit(t) { // into the dot landing on the graph
    const pre = 0.32;
    const o = osc('sine', 220, t - pre, pre + 0.02); o.frequency.exponentialRampToValueAtTime(880, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t - pre); g.gain.exponentialRampToValueAtTime(0.1, t - 0.01); g.gain.linearRampToValueAtTime(0, t + 0.01); o.connect(g); out(g, 0.2);
    whoosh(t - pre, pre, 600, 6000, 0.14);
    const n = noise(t, 0.4), lp = filt('lowpass', 7000, 0.8); lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    const gn = ctx.createGain(); env(gn, t, 0.32, 0.002, 0.32); n.connect(lp); lp.connect(gn); out(gn, 0.4);
    const s = osc('sine', 90, t, 0.5); s.frequency.exponentialRampToValueAtTime(48, t + 0.4); const gs = ctx.createGain(); env(gs, t, 0.6, 0.003, 0.42); s.connect(gs); out(gs);
    [880, 1318.5].forEach((f, i) => { const b = osc('sine', f, t, 0.8); const gb = ctx.createGain(); env(gb, t, 0.06, 0.002, 0.6); b.connect(gb); out(gb, 0.5, i ? 0.3 : -0.3); });
  }
  function thud(t) { // GOL pill: short, low
    const s = osc('sine', 75, t, 0.35); s.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = ctx.createGain(); env(g, t, 0.95, 0.002, 0.24); s.connect(g); out(g);
    const n = noise(t, 0.08), lp = filt('lowpass', 900, 1), gn = ctx.createGain(); env(gn, t, 0.35, 0.001, 0.06); n.connect(lp); lp.connect(gn); out(gn);
  }
  function fillHit(t) { // circle fills the frame
    const n = noise(t, 0.6), lp = filt('lowpass', 5000, 0.9); lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.45);
    const g = ctx.createGain(); env(g, t, 0.3, 0.003, 0.45); n.connect(lp); lp.connect(g); out(g, 0.5);
    const s = osc('sine', 60, t, 0.6); s.frequency.exponentialRampToValueAtTime(36, t + 0.5); const gs = ctx.createGain(); env(gs, t, 0.55, 0.003, 0.5); s.connect(gs); out(gs);
  }
  function tock(t, v = 0.2) { const n = noise(t, 0.05), bp = filt('bandpass', 2400, 6), g = ctx.createGain(); env(g, t, v, 0.0008, 0.04); n.connect(bp); bp.connect(g); out(g, 0.15); const o = osc('sine', 1600, t, 0.05); const go = ctx.createGain(); env(go, t, 0.05, 0.001, 0.03); o.connect(go); out(go); }
  function cleanHit(t) { // end card lands
    const notes = [220, 329.63, 440, 523.25, 659.25];
    notes.forEach((f, i) => { const o = osc('sine', f, t, 1.6); const o2 = osc('sine', f * 2.0, t, 0.6); const g = ctx.createGain(); env(g, t, 0.07, 0.004, 1.3); const g2 = ctx.createGain(); env(g2, t, 0.025, 0.002, 0.35); o.connect(g); o2.connect(g2); out(g, 0.5, (i - 2) * 0.15); out(g2, 0.5, (i - 2) * 0.15); });
    const s = osc('sine', 110, t, 0.7); s.frequency.exponentialRampToValueAtTime(55, t + 0.5); const gs = ctx.createGain(); env(gs, t, 0.55, 0.002, 0.55); s.connect(gs); out(gs);
    const n = noise(t, 0.05), hp = filt('highpass', 6000), gn = ctx.createGain(); env(gn, t, 0.18, 0.0005, 0.04); n.connect(hp); hp.connect(gn); out(gn, 0.3);
  }
  function bass(t, f, len = 0.2, v = 0.15) {
    const o = osc('sawtooth', f, t, len + 0.05), o2 = osc('sine', f / 2, t, len + 0.05);
    const lp = filt('lowpass', 800, 4); lp.frequency.setValueAtTime(1300, t); lp.frequency.exponentialRampToValueAtTime(200, t + len);
    const g = ctx.createGain(); env(g, t, v, 0.004, len); o.connect(lp); o2.connect(lp); lp.connect(g); out(g);
  }
  function swell(t0, t1, f0, f1, v) {
    const n = noise(t0, t1 - t0 + 0.05), bp = filt('bandpass', f0, 1.6); bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
    n.connect(bp); bp.connect(g); out(g, 0.3);
  }

  const B = BEAT;
  // groove: kick every beat, offbeat hats, offbeat bass (Am F C G | Am F C G)
  for (let k = 0; k < 32; k++) kick(k * B, (k === 6 || k === 23) ? 1.1 : 1);
  const prog8 = [110, 87.31, 130.81, 98, 110, 87.31, 130.81, 98];
  for (let k = 0; k < 32; k++) {
    const t = k * B + 0.25;
    if (k >= 2) hat(t, 0.075);
    if (k >= 12 && k < 15) hat(t - 0.125, 0.04, 0.02, -0.2);
    if (k >= 2 && !(k >= 20 && k < 22)) bass(t, prog8[Math.floor(k / 4)], 0.18, 0.13);
  }
  // OPEN
  click(0.5); whoosh(0.5, 0.25, 900, 3000, 0.07, 0.2);
  boop(1.12, 520, 1040, 0.24, 0.09); blip(1.38, 1760, 0.07);
  whoosh(1.4, 0.55, 500, 2600, 0.08, -0.2); blip(2.0, 1318.5, 0.06);
  // SPRING
  boop(2.5, 700, 1400, 0.3, 0.08);
  risingHit(3.0); blip(3.5, 2093, 0.06, 0.2);
  const penta = [880, 1046.5, 1174.7, 1318.5, 1568, 1760];
  for (let i = 0; i < 13; i++) pluck(3.2 + 0.1 * i, penta[i % 6], 0.035, (i % 2 ? 0.25 : -0.25));
  blip(4.0, 1568, 0.08); blip(4.06, 2349, 0.05);
  // SHAPE
  whoosh(4.98, 0.22, 800, 5000, 0.16); swell(5.1, 5.5, 300, 4000, 0.18); fillHit(5.5);
  whoosh(5.5, 0.4, 1800, 600, 0.06);
  thud(6.0);
  tock(6.5); tock(6.75, 0.16); tock(7.0);
  swell(7.0, 7.5, 4000, 400, 0.12);
  // TYPE RING
  for (let i = 0; i < 8; i++) pluck(7.5 + i * 0.0625, penta[(i * 2) % 6] * 0.5, 0.03, (i % 2 ? 0.3 : -0.3));
  blip(8.0, 1046.5, 0.06, -0.3); blip(8.5, 1174.7, 0.06, 0); blip(9.0, 1318.5, 0.06, 0.3);
  // HALFTONE
  swell(9.5, 10.98, 400, 7000, 0.16);
  whoosh(11.0, 0.4, 5000, 600, 0.1);
  cleanHit(11.5); blip(12.0, 1760, 0.06); blip(12.06, 2637, 0.04);
  // RETURN
  swell(14.0, 14.5, 6000, 500, 0.12); boop(14.0, 1400, 700, 0.4, 0.07);
  for (let i = 0; i < 6; i++) pluck(14.5 + i * 0.075, penta[5 - i], 0.03, (i % 2 ? 0.25 : -0.25));
  boop(14.98, 600, 1100, 0.3, 0.07);
  click(15.5); whoosh(15.5, 0.25, 3000, 900, 0.06, -0.2);

  const buf = await ctx.startRendering();
  const off = Math.round(SR * LOOK), NOUT = SR * DUR;
  const Lc = buf.getChannelData(0).subarray(off, off + NOUT), Rc = buf.getChannelData(1).subarray(off, off + NOUT);
  let pk = 0; for (let i = 0; i < NOUT; i++) pk = Math.max(pk, Math.abs(Lc[i]), Math.abs(Rc[i]));
  const gN = Math.pow(10, -1 / 20) / (pk || 1);
  const bytes = new ArrayBuffer(44 + NOUT * 4), dv = new DataView(bytes);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + NOUT * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  ws(36, 'data'); dv.setUint32(40, NOUT * 4, true);
  for (let i = 0, o = 44; i < NOUT; i++, o += 4) {
    dv.setInt16(o, Math.max(-32767, Math.min(32767, Math.round(Lc[i] * gN * 32767))), true);
    dv.setInt16(o + 2, Math.max(-32767, Math.min(32767, Math.round(Rc[i] * gN * 32767))), true);
  }
  const u8 = new Uint8Array(bytes); let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(bin), peak: pk };
};
