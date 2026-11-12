# Analistas — "El escudo es el dato" (10 s motion piece)

- `out/analistas-motion.mp4` — final video, 1080x1920, 60 fps, H.264 + AAC, 10.0 s, loops seamlessly.
- `out/analistas-soundtrack.wav` — the soundtrack (Web Audio API, OfflineAudioContext), 48 kHz.
- `analistas-motion.html` — the single-file piece. `window.seek(t)` renders any instant; `window.renderAudio()` renders the WAV.
- `src/template.html` — source; `build.js` inlines `../motion-assets/logo.svg` as native vector subpaths.

Rebuild / re-render (needs Playwright + ffmpeg):

    node build.js
    node render.js /tmp/frames ./out 4     # audio, 600 frames x 3 subframes, tmix motion blur, mux
    node preview.js /tmp/pv 0.3 2.3 6.3    # single still frames for checking
