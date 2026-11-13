# Analistas — "Modo Estadio" (16 s, 120 BPM, 1080x1920, 60 fps)

- `out/modo-estadio.mp4` — final video (H.264 + AAC), loops seamlessly (first and last frame are pixel-identical).
- `out/modo-estadio-soundtrack.wav` — soundtrack written with the Web Audio API (OfflineAudioContext), 48 kHz.
- `out/stills/` — toggle, graph, kinetic type and end-card stills.
- `modo-estadio.html` — the single-file piece: `window.seek(t)` draws any instant on one canvas, `window.renderAudio()` renders the WAV.
- `src/template.html`, `src/audio.js` — sources; `build.js` inlines `../../motion-assets/logo.svg` as native vector subpaths.

Rebuild / re-render (Playwright + ffmpeg):

    node build.js
    node render.js /tmp/frames ./out 4          # audio, 960 frames x 3 subframes, tmix, mux
    node preview.js /tmp/pv 0.7 4.7 8.75 12.75  # stills
