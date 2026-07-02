/**
 * analistas-download — Smart app-store redirect + landing page
 *
 * iOS     → App Store
 * Android → Google Play
 * Desktop → Landing page completa con mockup, features y QR
 *
 * Deploy: cd workers/analistas-download && npx wrangler deploy
 * Route:  get.analistas.app  (CNAME → analistas-download.workers.dev)
 */

const APP_STORE_URL  = 'https://apps.apple.com/app/id6767097258';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.analistas';
const PAGE_URL       = 'https://get.analistasapp.com';

export default {
  async fetch(request: Request): Promise<Response> {
    const ua = request.headers.get('User-Agent') ?? '';

    if (/iPhone|iPad|iPod/i.test(ua)) {
      return Response.redirect(APP_STORE_URL, 302);
    }
    if (/Android/i.test(ua)) {
      return Response.redirect(PLAY_STORE_URL, 302);
    }

    return new Response(buildPage(PAGE_URL), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};

// ── SVG helpers ────────────────────────────────────────────────────────────────

function appleSvg(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.36.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.39-1.32 2.76-2.54 3.99zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="#000"/>
  </svg>`;
}

function googleSvg(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3.18 23.76c.3.17.65.18.96.03l11.37-6.56-2.5-2.5-9.83 9z" fill="#EA4335"/>
    <path d="M21.54 10.27L18.9 8.76l-2.79 2.79 2.79 2.79 2.67-1.54a1.5 1.5 0 000-2.53z" fill="#FBBC04"/>
    <path d="M3.18.24C2.86.07 2.5.1 2.22.3L13.05 11.13l2.5-2.5L3.18.24z" fill="#4285F4"/>
    <path d="M2.22.3A1.5 1.5 0 002 1.15v21.7c0 .3.07.58.22.81l.96-.95L12.06 12l-9-9-.84-.84V.3z" fill="#34A853"/>
  </svg>`;
}

function storeBtns(): string {
  return `
  <div class="store-btns">
    <a class="store-btn" href="${APP_STORE_URL}" target="_blank" rel="noopener">
      ${appleSvg()}
      <div class="store-btn-text">
        <span class="store-btn-label">Descarga en</span>
        <span class="store-btn-name">App Store</span>
      </div>
    </a>
    <a class="store-btn" href="${PLAY_STORE_URL}" target="_blank" rel="noopener">
      ${googleSvg()}
      <div class="store-btn-text">
        <span class="store-btn-label">Disponible en</span>
        <span class="store-btn-name">Google Play</span>
      </div>
    </a>
  </div>`;
}

// ── Page builder ───────────────────────────────────────────────────────────────

function buildPage(pageUrl: string): string {
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=000000&bgcolor=ffffff&data=${encodeURIComponent(pageUrl)}`;

  return /* html */`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Analistas — Fútbol en tiempo real</title>
  <meta name="description" content="Resultados, goles, estadísticas y notificaciones del fútbol en tiempo real. Descarga Analistas gratis." />
  <meta property="og:title" content="Analistas — Resultados Fútbol" />
  <meta property="og:description" content="El fútbol en tu bolsillo. Descarga gratis." />
  <meta property="og:image" content="https://analistas.app/og-image.png" />
  <meta name="theme-color" content="#0D0D0D" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:      #0D0D0D;
      --surface: #1A1A1A;
      --card:    #1E1E1E;
      --accent:  #00E096;
      --live:    #FF453A;
      --text:    #FFFFFF;
      --text2:   #8E8E93;
      --border:  #2C2C2E;
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      overflow-x: hidden;
    }

    /* ── Header ──────────────────────────────── */
    header {
      position: sticky; top: 0; z-index: 100;
      backdrop-filter: blur(20px);
      background: rgba(13,13,13,0.88);
      border-bottom: 1px solid var(--border);
      padding: 0 40px;
      height: 64px;
      display: flex; align-items: center; justify-content: space-between;
    }

    .header-logo {
      display: flex; align-items: center; gap: 10px;
      text-decoration: none;
    }

    .logo-icon {
      width: 36px; height: 36px;
      background: var(--accent);
      border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      font-size: 17px; font-weight: 900; color: var(--bg);
    }

    .logo-name { font-size: 18px; font-weight: 700; color: var(--text); }

    .header-cta {
      background: var(--accent); color: var(--bg);
      padding: 9px 22px; border-radius: 100px;
      font-size: 14px; font-weight: 700;
      text-decoration: none; transition: opacity 0.15s;
    }
    .header-cta:hover { opacity: 0.85; }

    /* ── Hero ────────────────────────────────── */
    .hero {
      min-height: calc(100dvh - 64px);
      display: flex; align-items: center;
      padding: 72px 5% 60px;
      gap: 64px;
      max-width: 1100px; margin: 0 auto;
    }

    .hero-left { flex: 1; min-width: 0; }

    .badge {
      display: inline-flex; align-items: center; gap: 7px;
      background: rgba(0,224,150,0.1);
      border: 1px solid rgba(0,224,150,0.25);
      color: var(--accent);
      font-size: 12px; font-weight: 600;
      padding: 5px 13px; border-radius: 100px;
      margin-bottom: 24px; letter-spacing: 0.3px;
    }

    .badge-dot {
      width: 6px; height: 6px;
      background: var(--accent); border-radius: 50%;
      animation: blink 2s infinite;
    }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

    h1 {
      font-size: clamp(40px, 6vw, 68px);
      font-weight: 900; line-height: 1.04;
      letter-spacing: -2.5px; margin-bottom: 20px;
    }
    h1 em { font-style: normal; color: var(--accent); }

    .hero-desc {
      font-size: 18px; color: var(--text2);
      margin-bottom: 36px; max-width: 420px; line-height: 1.65;
    }

    .store-btns {
      display: flex; gap: 12px; flex-wrap: wrap;
      margin-bottom: 48px;
    }

    .store-btn {
      display: flex; align-items: center; gap: 10px;
      background: var(--text); color: var(--bg);
      padding: 13px 20px; border-radius: 14px;
      text-decoration: none; transition: transform 0.15s, opacity 0.15s;
    }
    .store-btn:hover { transform: translateY(-2px); opacity: 0.9; }
    .store-btn svg { flex-shrink: 0; }

    .store-btn-text { text-align: left; }
    .store-btn-label {
      font-size: 10px; font-weight: 600; color: #48484A;
      text-transform: uppercase; letter-spacing: 0.5px; display: block;
    }
    .store-btn-name {
      font-size: 16px; font-weight: 700; display: block; line-height: 1.2;
    }

    .stats-row { display: flex; gap: 24px; flex-wrap: wrap; }
    .stat-link {
      display: flex; align-items: center; gap: 10px;
      text-decoration: none; color: var(--text);
      transition: opacity 0.15s;
    }
    .stat-link:hover { opacity: 0.75; }
    .stat-num { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
    .stat-label { font-size: 12px; color: var(--text2); margin-top: 1px; }

    /* ── Phone mockup ───────────────────────── */
    .hero-right { flex-shrink: 0; position: relative; }

    .glow {
      position: absolute; top: -100px; right: -100px;
      width: 360px; height: 360px;
      background: radial-gradient(circle, rgba(0,224,150,0.13) 0%, transparent 70%);
      pointer-events: none;
    }

    .phone {
      width: 280px; height: 560px;
      background: #111;
      border-radius: 44px;
      border: 1.5px solid #2C2C2E;
      position: relative; overflow: hidden;
      box-shadow: 0 60px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04);
    }

    .phone::before {
      content: '';
      position: absolute; top: 0; left: 50%;
      transform: translateX(-50%);
      width: 96px; height: 28px;
      background: #111;
      border-radius: 0 0 20px 20px;
      z-index: 10;
    }

    .phone-screen {
      padding: 44px 14px 14px;
      height: 100%;
      display: flex; flex-direction: column; gap: 10px;
    }

    .phone-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 6px;
    }
    .phone-title { font-size: 18px; font-weight: 800; }
    .phone-date  { font-size: 11px; color: var(--text2); }

    .match-card {
      background: var(--card);
      border-radius: 14px;
      padding: 11px 13px;
    }
    .match-card.dim2 { opacity: 0.55; }
    .match-card.dim3 { opacity: 0.28; }

    .match-league {
      font-size: 9px; color: var(--text2);
      text-transform: uppercase; letter-spacing: 0.6px;
      margin-bottom: 9px;
      display: flex; align-items: center; gap: 5px;
    }
    .live-dot {
      width: 5px; height: 5px;
      border-radius: 50%; background: var(--live);
      animation: blink 1.4s infinite;
    }

    .score-row {
      display: flex; align-items: center; justify-content: space-between;
    }
    .team {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      flex: 1;
    }
    .team-flag { font-size: 22px; line-height: 1; }
    .team-name { font-size: 9px; color: var(--text2); text-align: center; }

    .score-center { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .score-num { font-size: 26px; font-weight: 900; letter-spacing: -1px; }
    .minute { font-size: 9px; color: var(--live); font-weight: 700; }

    /* ── Features ───────────────────────────── */
    .features {
      padding: 80px 5%;
      max-width: 1100px; margin: 0 auto;
    }

    .section-label {
      font-size: 12px; font-weight: 600; color: var(--accent);
      text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 12px;
    }

    .section-title {
      font-size: clamp(28px, 4vw, 42px);
      font-weight: 800; letter-spacing: -1px;
      margin-bottom: 48px;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .feature-card {
      background: var(--surface);
      border-radius: 20px;
      padding: 28px 24px;
      border: 1px solid var(--border);
      transition: border-color 0.2s;
    }
    .feature-card:hover { border-color: rgba(0,224,150,0.3); }

    .feature-icon {
      width: 44px; height: 44px;
      background: rgba(0,224,150,0.1);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; margin-bottom: 16px;
    }

    .feature-title { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
    .feature-desc  { font-size: 14px; color: var(--text2); line-height: 1.55; }

    /* ── Download section ───────────────────── */
    .download-section {
      margin: 0 auto 80px;
      max-width: 1060px;
      padding: 0 5%;
    }

    .download-inner {
      background: var(--surface);
      border-radius: 28px;
      border: 1px solid var(--border);
      padding: 56px 56px;
      display: flex; align-items: center; gap: 64px;
    }

    .download-left { flex: 1; }
    .download-left h2 {
      font-size: clamp(24px, 3vw, 38px);
      font-weight: 800; letter-spacing: -1px; margin-bottom: 12px;
    }
    .download-left p { font-size: 16px; color: var(--text2); margin-bottom: 28px; }

    .download-right {
      flex-shrink: 0;
      display: flex; flex-direction: column; align-items: center; gap: 12px;
    }

    .qr-wrap {
      background: #fff;
      padding: 14px; border-radius: 18px;
    }
    .qr-wrap img { display: block; width: 170px; height: 170px; }
    .qr-label { font-size: 12px; color: var(--text2); text-align: center; }

    /* ── Footer ─────────────────────────────── */
    footer {
      border-top: 1px solid var(--border);
      padding: 24px 40px;
      display: flex; justify-content: space-between; align-items: center;
      max-width: 1100px; margin: 0 auto;
    }
    .footer-copy { font-size: 13px; color: var(--text2); }
    .footer-links { display: flex; gap: 20px; }
    .footer-links a { font-size: 13px; color: var(--text2); text-decoration: none; }
    .footer-links a:hover { color: var(--text); }

    /* ── Responsive ──────────────────────────── */
    @media (max-width: 800px) {
      header { padding: 0 20px; }

      .hero {
        flex-direction: column; padding: 40px 20px 40px;
        gap: 40px; min-height: auto;
        text-align: center;
      }
      .hero-right { order: -1; }
      .hero-desc { margin-left: auto; margin-right: auto; }
      .store-btns { justify-content: center; }
      .stats-row { justify-content: center; gap: 24px; }

      .phone { width: 230px; height: 460px; }

      .download-inner {
        flex-direction: column; text-align: center;
        padding: 40px 28px; gap: 36px;
      }
      .store-btns { justify-content: center; }

      footer { flex-direction: column; gap: 12px; padding: 20px; }
    }
  </style>
</head>
<body>

<!-- ── Header ── -->
<header>
  <a class="header-logo" href="#">
    <div class="logo-icon">A</div>
    <span class="logo-name">Analistas</span>
  </a>
  <a class="header-cta" href="#download">Descargar gratis</a>
</header>

<!-- ── Hero ── -->
<section class="hero">
  <div class="hero-left">
    <div class="badge">
      <span class="badge-dot"></span>
      Mundial 2026 en tiempo real
    </div>

    <h1>El fútbol<br />en tu <em>bolsillo.</em></h1>

    <p class="hero-desc">
      Resultados en vivo, notificaciones inteligentes y estadísticas de las mejores ligas del mundo.
    </p>

    ${storeBtns()}

    <div class="stats-row">
      <a class="stat-link" href="https://www.facebook.com/SomosAnalistas" target="_blank" rel="noopener">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.883v2.258h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
        <div>
          <div class="stat-num">4.1M</div>
          <div class="stat-label">Facebook</div>
        </div>
      </a>
      <a class="stat-link" href="https://www.instagram.com/somosanalistas/" target="_blank" rel="noopener">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="url(#ig)"><defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#F58529"/><stop offset="50%" stop-color="#DD2A7B"/><stop offset="100%" stop-color="#8134AF"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        <div>
          <div class="stat-num">1.1M</div>
          <div class="stat-label">Instagram</div>
        </div>
      </a>
      <a class="stat-link" href="https://www.tiktok.com/@somosanalistas/" target="_blank" rel="noopener">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/></svg>
        <div>
          <div class="stat-num">360K</div>
          <div class="stat-label">TikTok</div>
        </div>
      </a>
      <a class="stat-link" href="https://x.com/somosanalistas_" target="_blank" rel="noopener">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        <div>
          <div class="stat-num">233K</div>
          <div class="stat-label">X</div>
        </div>
      </a>
      <a class="stat-link" href="https://youtube.com/analistas" target="_blank" rel="noopener">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        <div>
          <div class="stat-num">72K</div>
          <div class="stat-label">YouTube</div>
        </div>
      </a>
    </div>
  </div>

  <div class="hero-right">
    <div class="glow"></div>
    <div class="phone">
      <div class="phone-screen">
        <div class="phone-header">
          <span class="phone-title">Partidos</span>
          <span class="phone-date">Hoy</span>
        </div>

        <div class="match-card">
          <div class="match-league">
            <span class="live-dot"></span>
            Mundial 2026 · EN VIVO
          </div>
          <div class="score-row">
            <div class="team">
              <div class="team-flag">🇲🇽</div>
              <div class="team-name">México</div>
            </div>
            <div class="score-center">
              <div class="score-num">2 · 1</div>
              <div class="minute">67'</div>
            </div>
            <div class="team">
              <div class="team-flag">🇦🇷</div>
              <div class="team-name">Argentina</div>
            </div>
          </div>
        </div>

        <div class="match-card dim2">
          <div class="match-league">
            <span class="live-dot"></span>
            Liga MX · EN VIVO
          </div>
          <div class="score-row">
            <div class="team">
              <div class="team-flag">🦅</div>
              <div class="team-name">América</div>
            </div>
            <div class="score-center">
              <div class="score-num">0 · 0</div>
              <div class="minute">23'</div>
            </div>
            <div class="team">
              <div class="team-flag">🐐</div>
              <div class="team-name">Chivas</div>
            </div>
          </div>
        </div>

        <div class="match-card dim3">
          <div class="match-league">Premier League · 20:45</div>
          <div class="score-row">
            <div class="team">
              <div class="team-flag">🔴</div>
              <div class="team-name">Arsenal</div>
            </div>
            <div class="score-center">
              <div class="score-num" style="font-size:16px;color:#8E8E93;">vs</div>
            </div>
            <div class="team">
              <div class="team-flag">🔵</div>
              <div class="team-name">City</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── Features ── -->
<section class="features">
  <div class="section-label">Por qué Analistas</div>
  <h2 class="section-title">Todo lo que el fútbol<br />merece tener</h2>
  <div class="features-grid">
    <div class="feature-card">
      <div class="feature-icon">⚡</div>
      <div class="feature-title">Resultados en vivo</div>
      <p class="feature-desc">Marcadores actualizados cada 15 segundos. Nunca te pierdas un gol ni un minuto de acción.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">🔔</div>
      <div class="feature-title">Notificaciones inteligentes</div>
      <p class="feature-desc">Goles, inicio de partido, medio tiempo y más. Solo lo que importa, sin spam.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">⭐</div>
      <div class="feature-title">Equipos favoritos</div>
      <p class="feature-desc">Sigue tus equipos y ligas favoritas. Tu feed personalizado, a tu medida.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">📰</div>
      <div class="feature-title">Noticias del fútbol</div>
      <p class="feature-desc">Las últimas noticias, transferencias y análisis directamente en la app.</p>
    </div>
  </div>
</section>

<!-- ── Download ── -->
<section class="download-section" id="download">
  <div class="download-inner">
    <div class="download-left">
      <div class="section-label">Descarga gratuita</div>
      <h2>Disponible en iOS<br />y Android</h2>
      <p>Sin costo. Sin suscripción. Solo fútbol.</p>
      ${storeBtns()}
    </div>
    <div class="download-right">
      <div class="qr-wrap">
        <img src="${qr}" alt="Escanea para descargar Analistas" />
      </div>
      <span class="qr-label">Escanea con tu cámara</span>
    </div>
  </div>
</section>

<!-- ── Footer ── -->
<footer>
  <span class="footer-copy">© 2026 Analistas. Todos los derechos reservados.</span>
  <div class="footer-links">
    <a href="https://somosanalistas.com/politica-privacidad/">Privacidad</a>
    <a href="https://analistasapp.com">Sitio web</a>
  </div>
</footer>

</body>
</html>`;
}
