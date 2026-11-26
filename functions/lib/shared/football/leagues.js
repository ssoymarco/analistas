"use strict";
/**
 * shared/football/leagues.ts
 *
 * Single source of truth for the football league catalog, shared by the
 * Cloud Functions (sync budgets, notification priority) AND the app (league
 * ordering, standings zones, onboarding). The app imports this file directly
 * from `functions/src/shared/...`, so it MUST stay dependency-free: plain data
 * and pure functions only — no firebase, no react-native, no node imports.
 *
 * All IDs are API-Sports (api-football v3) league IDs. The previous provider's
 * (Sportmonks) IDs only survive in `SM_TO_AF_LEAGUE`, used once to migrate
 * users' saved favorites.
 *
 * Ordering: every league gets a popularity score 0-100. Curated leagues use
 * LEAGUE_POPULARITY (+ per-country overrides); the ~1,200 remaining API-Sports
 * leagues get a small heuristic score (0-4) so they always list AFTER every
 * curated league, top divisions of big football countries first and youth /
 * reserve / regional competitions last.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SM_TO_AF_LEAGUE = exports.LEAGUE_POPULARITY_BY_COUNTRY = exports.LEAGUE_POPULARITY = exports.COPYRIGHT_SENSITIVE_LEAGUE_IDS = exports.FOOTBALL_LEAGUES = void 0;
exports.getFootballLeague = getFootballLeague;
exports.fallbackLeagueScore = fallbackLeagueScore;
exports.getLeaguePopularity = getLeaguePopularity;
exports.compareLeagues = compareLeagues;
exports.isPriorityLeague = isPriorityLeague;
// ── Zone palette ─────────────────────────────────────────────────────────────
const CL = '#3b82f6'; // Champions League / ACL Elite / CAF CL / Libertadores
const EL = '#f97316'; // Europa League / Sudamericana / CAF Confederation
const ECL = '#a78bfa'; // Conference League
const REL = '#ef4444'; // Relegation
const REP = '#fbbf24'; // Relegation playoff / repechaje
const PRO = '#22c55e'; // Direct promotion (2nd div)
const PPO = '#86efac'; // Promotion playoff
const PO = '#06b6d4'; // Generic playoffs / liguilla / cuadrangulares
// ── Curated catalog ──────────────────────────────────────────────────────────
exports.FOOTBALL_LEAGUES = [
    // ── Américas — principales ─────────────────────────────────────────────────
    { id: 262, name: 'Liga MX', country: 'Mexico', flag: '🇲🇽',
        hasPlayoffs: true, playoffsLabel: 'Liguilla',
        // Top 8 qualify for Liguilla. Relegation is by cociente, not position.
        zones: [{ label: 'Liguilla', color: PO, from: 1, to: 8 }] },
    { id: 253, name: 'MLS', country: 'USA', flag: '🇺🇸',
        hasPlayoffs: true, playoffsLabel: 'Playoffs',
        zones: [{ label: 'Playoffs', color: PO, from: 1, to: 9 }] },
    { id: 128, name: 'Liga Profesional', country: 'Argentina', flag: '🇦🇷',
        zones: [
            { label: 'Copa Libertadores', color: CL, from: 1, to: 4 },
            { label: 'Copa Sudamericana', color: EL, from: 5, to: 8 },
            { label: 'Descenso', color: REL, from: 26, to: 28 },
        ] },
    { id: 71, name: 'Brasileirão Serie A', country: 'Brazil', flag: '🇧🇷',
        zones: [
            { label: 'Copa Libertadores', color: CL, from: 1, to: 6 },
            { label: 'Copa Sudamericana', color: EL, from: 7, to: 12 },
            { label: 'Descenso', color: REL, from: 17, to: 20 },
        ] },
    { id: 239, name: 'Liga BetPlay', country: 'Colombia', flag: '🇨🇴',
        hasPlayoffs: true, playoffsLabel: 'Cuadrangulares',
        zones: [
            { label: 'Cuadrangulares', color: PO, from: 1, to: 8 },
            { label: 'Descenso', color: REL, from: 19, to: 20 },
        ] },
    { id: 265, name: 'Primera División', country: 'Chile', flag: '🇨🇱',
        hasPlayoffs: true, playoffsLabel: 'Playoffs',
        zones: [
            { label: 'Playoffs', color: PO, from: 1, to: 8 },
            { label: 'Descenso', color: REL, from: 15, to: 16 },
        ] },
    { id: 268, name: 'Primera División', country: 'Uruguay', flag: '🇺🇾',
        zones: [
            { label: 'Copa Libertadores', color: CL, from: 1, to: 4 },
            { label: 'Copa Sudamericana', color: EL, from: 5, to: 8 },
            { label: 'Descenso', color: REL, from: 15, to: 16 },
        ] },
    { id: 250, name: 'División Profesional — Apertura', country: 'Paraguay', flag: '🇵🇾',
        zones: [
            { label: 'Copa Libertadores', color: CL, from: 1, to: 4 },
            { label: 'Copa Sudamericana', color: EL, from: 5, to: 8 },
        ] },
    { id: 252, name: 'División Profesional — Clausura', country: 'Paraguay', flag: '🇵🇾',
        zones: [
            { label: 'Copa Libertadores', color: CL, from: 1, to: 4 },
            { label: 'Copa Sudamericana', color: EL, from: 5, to: 8 },
        ] },
    { id: 281, name: 'Liga 1', country: 'Peru', flag: '🇵🇪',
        hasPlayoffs: true, playoffsLabel: 'Playoffs',
        zones: [
            { label: 'Copa Libertadores', color: CL, from: 1, to: 2 },
            { label: 'Copa Sudamericana', color: EL, from: 3, to: 4 },
            { label: 'Playoffs', color: PO, from: 5, to: 8 },
            { label: 'Descenso', color: REL, from: 17, to: 18 },
        ] },
    { id: 242, name: 'Liga Pro', country: 'Ecuador', flag: '🇪🇨',
        hasPlayoffs: true, playoffsLabel: 'Playoffs',
        zones: [
            { label: 'Copa Libertadores', color: CL, from: 1, to: 2 },
            { label: 'Copa Sudamericana', color: EL, from: 3, to: 4 },
            { label: 'Playoffs', color: PO, from: 5, to: 8 },
            { label: 'Descenso', color: REL, from: 15, to: 16 },
        ] },
    { id: 234, name: 'Liga Nacional', country: 'Honduras', flag: '🇭🇳',
        hasPlayoffs: true, playoffsLabel: 'Playoffs',
        zones: [
            { label: 'Playoffs', color: PO, from: 1, to: 8 },
            { label: 'Descenso', color: REL, from: 17, to: 18 },
        ] },
    // ── Américas — segundas divisiones + copas ─────────────────────────────────
    { id: 263, name: 'Liga de Expansión MX', country: 'Mexico', flag: '🇲🇽',
        hasPlayoffs: true, playoffsLabel: 'Playoffs',
        zones: [{ label: 'Playoffs', color: PO, from: 1, to: 8 }] },
    { id: 857, name: 'Campeón de Campeones', country: 'Mexico', flag: '🇲🇽', isCup: true },
    { id: 129, name: 'Primera Nacional', country: 'Argentina', flag: '🇦🇷',
        zones: [
            { label: 'Ascenso', color: PRO, from: 1, to: 4 },
            { label: 'Descenso', color: REL, from: 14, to: 15 },
        ] },
    { id: 72, name: 'Brasileirão Serie B', country: 'Brazil', flag: '🇧🇷',
        zones: [
            { label: 'Ascenso', color: PRO, from: 1, to: 4 },
            { label: 'Descenso', color: REL, from: 17, to: 20 },
        ] },
    { id: 73, name: 'Copa do Brasil', country: 'Brazil', flag: '🇧🇷', isCup: true },
    { id: 130, name: 'Copa Argentina', country: 'Argentina', flag: '🇦🇷', isCup: true },
    { id: 632, name: 'Supercopa do Brasil', country: 'Brazil', flag: '🇧🇷', isCup: true },
    { id: 866, name: 'MLS All-Star', country: 'USA', flag: '🇺🇸', isCup: true },
    // ── Europa — top 5 ─────────────────────────────────────────────────────────
    { id: 39, name: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 4 },
            { label: 'Europa League', color: EL, from: 5, to: 5 },
            { label: 'Conference League', color: ECL, from: 6, to: 6 },
            { label: 'Descenso', color: REL, from: 18, to: 20 },
        ] },
    { id: 140, name: 'LaLiga', country: 'Spain', flag: '🇪🇸',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 4 },
            { label: 'Europa League', color: EL, from: 5, to: 6 },
            { label: 'Conference League', color: ECL, from: 7, to: 7 },
            { label: 'Descenso', color: REL, from: 18, to: 20 },
        ] },
    { id: 78, name: 'Bundesliga', country: 'Germany', flag: '🇩🇪',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 4 },
            { label: 'Europa League', color: EL, from: 5, to: 5 },
            { label: 'Conference League', color: ECL, from: 6, to: 6 },
            { label: 'Repechaje', color: REP, from: 16, to: 16 },
            { label: 'Descenso', color: REL, from: 17, to: 18 },
        ] },
    { id: 135, name: 'Serie A', country: 'Italy', flag: '🇮🇹',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 4 },
            { label: 'Europa League', color: EL, from: 5, to: 5 },
            { label: 'Conference League', color: ECL, from: 6, to: 6 },
            { label: 'Descenso', color: REL, from: 18, to: 20 },
        ] },
    { id: 61, name: 'Ligue 1', country: 'France', flag: '🇫🇷',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 3 },
            { label: 'Europa League', color: EL, from: 4, to: 4 },
            { label: 'Conference League', color: ECL, from: 5, to: 5 },
            { label: 'Repechaje', color: REP, from: 16, to: 16 },
            { label: 'Descenso', color: REL, from: 17, to: 18 },
        ] },
    // ── Europa — segundas divisiones ───────────────────────────────────────────
    { id: 40, name: 'Championship', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        zones: [
            { label: 'Ascenso', color: PRO, from: 1, to: 2 },
            { label: 'Playoff ascenso', color: PPO, from: 3, to: 6 },
            { label: 'Descenso', color: REL, from: 22, to: 24 },
        ] },
    { id: 141, name: 'LaLiga Hypermotion', country: 'Spain', flag: '🇪🇸',
        zones: [
            { label: 'Ascenso', color: PRO, from: 1, to: 2 },
            { label: 'Playoff ascenso', color: PPO, from: 3, to: 6 },
            { label: 'Descenso', color: REL, from: 19, to: 22 },
        ] },
    { id: 79, name: '2. Bundesliga', country: 'Germany', flag: '🇩🇪',
        zones: [
            { label: 'Ascenso', color: PRO, from: 1, to: 2 },
            { label: 'Playoff ascenso', color: PPO, from: 3, to: 3 },
            { label: 'Repechaje', color: REP, from: 16, to: 16 },
            { label: 'Descenso', color: REL, from: 17, to: 18 },
        ] },
    { id: 136, name: 'Serie B', country: 'Italy', flag: '🇮🇹',
        zones: [
            { label: 'Ascenso', color: PRO, from: 1, to: 2 },
            { label: 'Playoff ascenso', color: PPO, from: 3, to: 8 },
            { label: 'Descenso', color: REL, from: 16, to: 20 },
        ] },
    { id: 62, name: 'Ligue 2', country: 'France', flag: '🇫🇷',
        zones: [
            { label: 'Ascenso', color: PRO, from: 1, to: 2 },
            { label: 'Playoff ascenso', color: PPO, from: 3, to: 3 },
            { label: 'Repechaje', color: REP, from: 16, to: 16 },
            { label: 'Descenso', color: REL, from: 17, to: 18 },
        ] },
    // ── Europa — otras ligas ───────────────────────────────────────────────────
    { id: 94, name: 'Liga Portugal', country: 'Portugal', flag: '🇵🇹',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 2 },
            { label: 'Europa League', color: EL, from: 3, to: 4 },
            { label: 'Conference League', color: ECL, from: 5, to: 5 },
            { label: 'Repechaje', color: REP, from: 16, to: 16 },
            { label: 'Descenso', color: REL, from: 17, to: 18 },
        ] },
    { id: 88, name: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 2 },
            { label: 'Europa League', color: EL, from: 3, to: 4 },
            { label: 'Conference League', color: ECL, from: 5, to: 6 },
            { label: 'Repechaje', color: REP, from: 16, to: 17 },
            { label: 'Descenso', color: REL, from: 18, to: 18 },
        ] },
    { id: 144, name: 'Pro League', country: 'Belgium', flag: '🇧🇪',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 2 },
            { label: 'Europa League', color: EL, from: 3, to: 4 },
            { label: 'Conference League', color: ECL, from: 5, to: 6 },
            { label: 'Descenso', color: REL, from: 16, to: 16 },
        ] },
    { id: 203, name: 'Süper Lig', country: 'Turkey', flag: '🇹🇷',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 2 },
            { label: 'Europa League', color: EL, from: 3, to: 4 },
            { label: 'Conference League', color: ECL, from: 5, to: 6 },
            { label: 'Descenso', color: REL, from: 16, to: 18 },
        ] },
    { id: 179, name: 'Premiership', country: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 1 },
            { label: 'Europa League', color: EL, from: 2, to: 3 },
            { label: 'Conference League', color: ECL, from: 4, to: 4 },
            { label: 'Repechaje', color: REP, from: 11, to: 11 },
            { label: 'Descenso', color: REL, from: 12, to: 12 },
        ] },
    { id: 119, name: 'Superliga', country: 'Denmark', flag: '🇩🇰',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 2 },
            { label: 'Europa League', color: EL, from: 3, to: 4 },
            { label: 'Conference League', color: ECL, from: 5, to: 5 },
            { label: 'Descenso', color: REL, from: 11, to: 12 },
        ] },
    { id: 235, name: 'Premier League', country: 'Russia', flag: '🇷🇺',
        zones: [
            { label: 'Repechaje', color: REP, from: 13, to: 14 },
            { label: 'Descenso', color: REL, from: 15, to: 16 },
        ] },
    { id: 113, name: 'Allsvenskan', country: 'Sweden', flag: '🇸🇪' },
    { id: 197, name: 'Super League', country: 'Greece', flag: '🇬🇷' },
    { id: 283, name: 'Liga I', country: 'Romania', flag: '🇷🇴' },
    // ── Europa — copas ─────────────────────────────────────────────────────────
    { id: 45, name: 'FA Cup', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', isCup: true },
    { id: 48, name: 'Carabao Cup', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', isCup: true },
    { id: 528, name: 'Community Shield', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', isCup: true },
    { id: 143, name: 'Copa del Rey', country: 'Spain', flag: '🇪🇸', isCup: true },
    { id: 556, name: 'Supercopa de España', country: 'Spain', flag: '🇪🇸', isCup: true },
    { id: 81, name: 'DFB Pokal', country: 'Germany', flag: '🇩🇪', isCup: true },
    { id: 529, name: 'Supercopa de Alemania', country: 'Germany', flag: '🇩🇪', isCup: true },
    { id: 137, name: 'Coppa Italia', country: 'Italy', flag: '🇮🇹', isCup: true },
    { id: 547, name: 'Supercopa de Italia', country: 'Italy', flag: '🇮🇹', isCup: true },
    { id: 66, name: 'Coupe de France', country: 'France', flag: '🇫🇷', isCup: true },
    { id: 526, name: 'Trofeo de Campeones', country: 'France', flag: '🇫🇷', isCup: true },
    // ── Asia, Medio Oriente, África, Oceanía ───────────────────────────────────
    { id: 307, name: 'Saudi Pro League', country: 'Saudi-Arabia', flag: '🇸🇦',
        zones: [
            { label: 'AFC Champions League Elite', color: CL, from: 1, to: 3 },
            { label: 'AFC Champions League', color: EL, from: 4, to: 4 },
            { label: 'Descenso', color: REL, from: 16, to: 18 },
        ] },
    { id: 98, name: 'J1 League', country: 'Japan', flag: '🇯🇵',
        zones: [
            { label: 'AFC Champions League Elite', color: CL, from: 1, to: 2 },
            { label: 'AFC Champions League', color: EL, from: 3, to: 3 },
            { label: 'Descenso', color: REL, from: 18, to: 20 },
        ] },
    { id: 292, name: 'K League 1', country: 'South-Korea', flag: '🇰🇷',
        zones: [
            { label: 'AFC Champions League Elite', color: CL, from: 1, to: 2 },
            { label: 'AFC Champions League', color: EL, from: 3, to: 3 },
            { label: 'Repechaje', color: REP, from: 10, to: 11 },
            { label: 'Descenso', color: REL, from: 12, to: 12 },
        ] },
    { id: 290, name: 'Persian Gulf Pro League', country: 'Iran', flag: '🇮🇷',
        zones: [
            { label: 'AFC Champions League Elite', color: CL, from: 1, to: 2 },
            { label: 'AFC Champions League', color: EL, from: 3, to: 3 },
            { label: 'Descenso', color: REL, from: 15, to: 16 },
        ] },
    { id: 169, name: 'Super League', country: 'China', flag: '🇨🇳' },
    { id: 305, name: 'Stars League', country: 'Qatar', flag: '🇶🇦' },
    { id: 233, name: 'Premier League', country: 'Egypt', flag: '🇪🇬',
        zones: [
            { label: 'CAF Champions League', color: CL, from: 1, to: 2 },
            { label: 'CAF Confederation Cup', color: EL, from: 3, to: 4 },
            { label: 'Descenso', color: REL, from: 18, to: 20 },
        ] },
    { id: 200, name: 'Botola Pro', country: 'Morocco', flag: '🇲🇦',
        zones: [
            { label: 'CAF Champions League', color: CL, from: 1, to: 2 },
            { label: 'CAF Confederation Cup', color: EL, from: 3, to: 3 },
            { label: 'Descenso', color: REL, from: 15, to: 16 },
        ] },
    { id: 188, name: 'A-League', country: 'Australia', flag: '🇦🇺' },
    // ── Clubes — internacionales ───────────────────────────────────────────────
    { id: 2, name: 'Champions League', country: 'Europe', flag: '⭐', isCup: true },
    { id: 3, name: 'Europa League', country: 'Europe', flag: '🟠', isCup: true },
    { id: 848, name: 'Conference League', country: 'Europe', flag: '🟢', isCup: true },
    { id: 531, name: 'Supercopa de Europa', country: 'Europe', flag: '⭐', isCup: true },
    { id: 13, name: 'Copa Libertadores', country: 'South America', flag: '🏆', isCup: true },
    { id: 11, name: 'Copa Sudamericana', country: 'South America', flag: '🏆', isCup: true },
    { id: 16, name: 'CONCACAF Champions Cup', country: 'North America', flag: '🏆', isCup: true },
    { id: 772, name: 'Leagues Cup', country: 'North America', flag: '🏆', isCup: true },
    { id: 17, name: 'AFC Champions League Elite', country: 'Asia', flag: '🏆', isCup: true },
    { id: 12, name: 'CAF Champions League', country: 'Africa', flag: '🏆', isCup: true },
    { id: 20, name: 'CAF Confederation Cup', country: 'Africa', flag: '🏆', isCup: true },
    { id: 15, name: 'Mundial de Clubes', country: 'World', flag: '🌍', isCup: true,
        searchAliases: ['club world cup', 'mundial de clubes', 'fifa club'] },
    { id: 1168, name: 'Copa Intercontinental', country: 'World', flag: '🌍', isCup: true },
    // ── Selecciones ────────────────────────────────────────────────────────────
    { id: 1, name: 'Mundial', country: 'World', flag: '🌍', isCup: true,
        hasPlayoffs: true, playoffsLabel: 'Eliminatoria',
        // Hidden aliases — let users find the tournament without displaying any
        // FIFA-trademarked term in the UI.
        searchAliases: [
            'copa del mundo', 'copa mundial', 'mundial de futbol', 'mundial de fútbol',
            'world cup', 'wc 2026', 'wc26', 'wc2026', 'fifa', 'mundial 2030', 'wc 2030',
        ] },
    { id: 9, name: 'Copa América', country: 'South America', flag: '🏆', isCup: true },
    { id: 4, name: 'Eurocopa', country: 'Europe', flag: '🏆', isCup: true },
    { id: 22, name: 'Copa Oro', country: 'North America', flag: '🏆', isCup: true },
    { id: 536, name: 'Liga de Naciones CONCACAF', country: 'North America', flag: '🏆', isCup: true },
    { id: 5, name: 'Liga de Naciones UEFA', country: 'Europe', flag: '🏆', isCup: true },
    { id: 31, name: 'Eliminatorias CONCACAF', country: 'North America', flag: '🌍', isCup: true },
    { id: 34, name: 'Eliminatorias CONMEBOL', country: 'South America', flag: '🌍', isCup: true },
    { id: 32, name: 'Eliminatorias UEFA', country: 'Europe', flag: '🌍', isCup: true },
    { id: 6, name: 'Copa Africana de Naciones', country: 'Africa', flag: '🏆', isCup: true },
    { id: 7, name: 'Copa Asiática', country: 'Asia', flag: '🏆', isCup: true },
    { id: 480, name: 'Juegos Olímpicos', country: 'World', flag: '🏅', isCup: true },
    // Added by the owner's selection (26-nov-2026).
    { id: 587, name: 'Mundial Sub-17', country: 'World', flag: '🌍', isCup: true,
        hasPlayoffs: true, playoffsLabel: 'Eliminatoria',
        searchAliases: ['mundial sub 17', 'mundial sub17', 'sub-17', 'sub 17', 'u17 world cup', 'world cup u17', 'u-17'] },
    { id: 913, name: 'Finalissima', country: 'World', flag: '🏆', isCup: true,
        searchAliases: ['finalisima', 'conmebol uefa'] },
    { id: 10, name: 'Amistosos Internacionales', country: 'World', flag: '🌍' },
    // ── Femenil ────────────────────────────────────────────────────────────────
    { id: 673, name: 'Liga MX Femenil', country: 'Mexico', flag: '🇲🇽',
        hasPlayoffs: true, playoffsLabel: 'Liguilla',
        zones: [{ label: 'Liguilla', color: PO, from: 1, to: 8 }] },
    { id: 142, name: 'Liga F', country: 'Spain', flag: '🇪🇸',
        zones: [
            { label: 'Champions League', color: CL, from: 1, to: 3 },
            { label: 'Descenso', color: REL, from: 15, to: 16 },
        ] },
    { id: 525, name: 'Champions League Femenil', country: 'Europe', flag: '🏆', isCup: true },
    { id: 8, name: 'Mundial Femenil', country: 'World', flag: '🌍', isCup: true,
        searchAliases: ['womens world cup', "women's world cup", 'mundial femenino'] },
];
const LEAGUE_BY_ID = new Map(exports.FOOTBALL_LEAGUES.map(l => [l.id, l]));
/** Curated config for a league, or undefined when it's not in the catalog. */
function getFootballLeague(id) {
    return LEAGUE_BY_ID.get(Number(id));
}
// ── Trademark-sensitive leagues ──────────────────────────────────────────────
// We must not display these competitions' official logo / English name; the
// UI renders the curated `name` + `flag` emoji instead.
exports.COPYRIGHT_SENSITIVE_LEAGUE_IDS = new Set([1, 8, 15, 587]);
// ── Popularity (ordering) ────────────────────────────────────────────────────
//
// Higher = listed earlier. Product order (owner's call, Nov 2026): Liga MX,
// Premier League, LaLiga, MLS, then the rest of the elite competitions.
//
//   S  (94-100): Liga MX, Mundial, Premier, LaLiga, MLS, Champions
//   A  (84-92):  Serie A, Bundesliga, Ligue 1, Europa, national-team majors
//   B  (75-82):  Brasileirão, Argentina, Libertadores, Saudi, CONCACAF comps
//   C  (65-73):  Conference, Portugal, Eredivisie, Sudamericana, big cups
//   D  (50-62):  Süper Lig, Belgium, national cups, secondary South America
//   E  (35-48):  Scotland, J1, Carabao, K League, Peru/Ecuador/Paraguay…
//   F  (22-32):  2nd divisions of top-5 Europe, Liga de Expansión MX…
//   G  (5-20):   Femenil, Russia, China, Egypt, Iran, Morocco, CAF
//   ── anything not listed: 0-4 via fallbackLeagueScore() ──
exports.LEAGUE_POPULARITY = {
    // ── S ──
    262: 100, // Liga MX
    1: 99, // Mundial (only has fixtures during World Cup cycles)
    39: 98, // Premier League
    140: 97, // LaLiga
    253: 96, // MLS
    2: 95, // UEFA Champions League
    // ── A ──
    15: 92, // Mundial de Clubes
    9: 92, // Copa América
    4: 92, // Eurocopa
    22: 90, // Copa Oro
    135: 90, // Serie A
    31: 88, // Eliminatorias CONCACAF
    78: 88, // Bundesliga
    61: 86, // Ligue 1
    3: 85, // UEFA Europa League
    34: 85, // Eliminatorias CONMEBOL
    // ── B ──
    71: 82, // Brasileirão Serie A
    128: 80, // Liga Profesional Argentina
    13: 80, // Copa Libertadores
    536: 80, // Liga de Naciones CONCACAF
    32: 78, // Eliminatorias UEFA
    5: 76, // Liga de Naciones UEFA
    16: 76, // CONCACAF Champions Cup
    913: 82, // Finalissima (campeón de América vs campeón de Europa: un partido)
    772: 76, // Leagues Cup
    307: 75, // Saudi Pro League
    // ── C ──
    848: 72, // UEFA Conference League
    94: 70, // Liga Portugal
    10: 70, // Amistosos Internacionales
    480: 70, // Juegos Olímpicos
    88: 68, // Eredivisie
    11: 66, // Copa Sudamericana
    531: 65, // Supercopa de Europa
    143: 65, // Copa del Rey
    45: 65, // FA Cup
    // ── D ──
    203: 62, // Süper Lig
    857: 60, // Campeón de Campeones
    556: 60, // Supercopa de España
    144: 60, // Pro League (Belgium)
    6: 60, // Copa Africana de Naciones
    7: 58, // Copa Asiática
    81: 58, // DFB Pokal
    137: 58, // Coppa Italia
    66: 57, // Coupe de France
    239: 56, // Liga BetPlay (Colombia)
    265: 55, // Primera División (Chile)
    268: 54, // Primera División (Uruguay)
    73: 54, // Copa do Brasil
    130: 53, // Copa Argentina
    632: 52, // Supercopa do Brasil
    17: 52, // AFC Champions League Elite
    1168: 50, // Copa Intercontinental
    528: 50, // Community Shield
    547: 50, // Supercopa de Italia
    // ── E ──
    179: 48, // Premiership (Scotland)
    529: 48, // Supercopa de Alemania
    98: 46, // J1 League
    587: 45, // Mundial Sub-17 (más alto en México: ver MX abajo)
    48: 45, // Carabao Cup
    526: 45, // Trofeo de Campeones (France)
    292: 43, // K League 1
    281: 41, // Liga 1 (Peru)
    242: 40, // Liga Pro (Ecuador)
    250: 40, // Paraguay Apertura
    252: 40, // Paraguay Clausura
    866: 38, // MLS All-Star
    113: 37, // Allsvenskan
    188: 36, // A-League
    197: 35, // Super League (Greece)
    // ── F ──
    40: 32, // Championship
    141: 30, // LaLiga Hypermotion
    79: 28, // 2. Bundesliga
    136: 28, // Serie B
    62: 27, // Ligue 2
    72: 26, // Brasileirão Serie B
    263: 25, // Liga de Expansión MX
    129: 25, // Primera Nacional (Argentina)
    119: 24, // Superliga (Denmark)
    283: 22, // Liga I (Romania)
    // ── G ──
    673: 20, // Liga MX Femenil
    8: 20, // Mundial Femenil
    525: 18, // Champions League Femenil
    142: 16, // Liga F (Spain)
    234: 15, // Liga Nacional (Honduras)
    235: 12, // Premier League (Russia)
    169: 12, // Super League (China)
    233: 10, // Premier League (Egypt)
    305: 10, // Stars League (Qatar)
    200: 8, // Botola Pro (Morocco)
    290: 8, // Persian Gulf Pro League (Iran)
    12: 7, // CAF Champions League
    20: 5, // CAF Confederation Cup
};
/**
 * Per-market overrides (ISO 3166-1 alpha-2 → leagueId → score). Missing pairs
 * fall back to LEAGUE_POPULARITY. Ported 1:1 from the pre-migration config.
 */
exports.LEAGUE_POPULARITY_BY_COUNTRY = {
    // 🇲🇽 México — primary audience. Top 4 already in the global table.
    MX: {
        31: 95, // Eliminatorias CONCACAF — El Tri
        22: 94, // Copa Oro — El Tri
        536: 93, // Liga de Naciones CONCACAF — El Tri
        16: 86, // CONCACAF Champions Cup — clubes de Liga MX
        772: 87, // Leagues Cup
        13: 88, // Copa Libertadores
        307: 88, // Saudi Pro League — efecto Cristiano
        857: 84, // Campeón de Campeones
        10: 84, // Amistosos (El Tri juega muchos)
        587: 91, // Mundial Sub-17 — El Tri Sub-17 (entra en el primer bloque de la pantalla)
        45: 78, // FA Cup
        673: 71, // Liga MX Femenil
        525: 69, // Champions League Femenil
        263: 66, // Liga de Expansión MX
    },
    // 🇦🇷 Argentina
    AR: {
        128: 99, // Liga Profesional
        13: 92, // Copa Libertadores
        34: 94, // Eliminatorias CONMEBOL
        9: 96, // Copa América
        11: 80, // Copa Sudamericana
        130: 78, // Copa Argentina
        253: 84, // MLS — efecto Messi
        307: 78, // Saudi Pro League
    },
    // 🇧🇷 Brasil
    BR: {
        71: 99, // Brasileirão Serie A
        13: 92, // Copa Libertadores
        34: 94, // Eliminatorias CONMEBOL
        9: 96, // Copa América
        11: 82, // Copa Sudamericana
        73: 80, // Copa do Brasil
        632: 70, // Supercopa do Brasil
    },
    // 🇺🇸 USA — MLS first, Liga MX right behind (LATAM diaspora)
    US: {
        253: 100, // MLS
        262: 99, // Liga MX
        772: 88, // Leagues Cup
        135: 88, // Serie A
        16: 80, // CONCACAF Champions Cup
        307: 80, // Saudi Pro League
        536: 85, // Liga de Naciones CONCACAF
        22: 90, // Copa Oro
    },
    // 🇪🇸 España
    ES: {
        140: 100, // LaLiga
        143: 88, // Copa del Rey
        556: 85, // Supercopa de España
        4: 96, // Eurocopa
        141: 62, // LaLiga Hypermotion
        525: 80, // Champions League Femenil
        142: 65, // Liga F
    },
    // 🏴 Reino Unido
    GB: {
        39: 100, // Premier League
        45: 90, // FA Cup
        48: 75, // Carabao Cup
        40: 72, // Championship
        4: 96, // Eurocopa
    },
};
/** Countries whose non-curated leagues still deserve to list first among the rest. */
const MAJOR_FOOTBALL_COUNTRIES = new Set([
    'Mexico', 'England', 'Spain', 'Germany', 'Italy', 'France', 'USA', 'Brazil',
    'Argentina', 'Portugal', 'Netherlands', 'Colombia', 'Belgium', 'Scotland',
]);
/** Youth, reserve, women's, amateur and regional competitions — always last. */
const MINOR_COMPETITION_RE = /\b(u-?1[5-9]|u-?2[0-3]|sub-?\d{2}|youth|junior|juvenil|primavera|reserve|reserves|reserva|res\.|ii\b|b team|women|woman|femenin|feminine|female|frauen|ladies|damallsvenskan|amateur|regional|regionalliga|oberliga|county|group [a-z0-9]+|grupo [a-z0-9]+|serie [d-z]\b|tercera|cuarta|fourth|fifth|play-?offs? \d|qualification)\b/i;
/**
 * Heuristic 0-4 score for leagues outside LEAGUE_POPULARITY. Always below every
 * curated league (min curated score is 5), so the owner's ordering is preserved.
 */
function fallbackLeagueScore(meta) {
    if (!meta)
        return 0;
    if (MINOR_COMPETITION_RE.test(meta.name))
        return 0;
    if (meta.country === 'World')
        return 3;
    const major = MAJOR_FOOTBALL_COUNTRIES.has(meta.country);
    if (meta.type === 'League')
        return major ? 4 : 2;
    return major ? 2 : 1;
}
/**
 * Popularity score for a league (higher = earlier). Country override first,
 * then the global table, then the heuristic for uncatalogued leagues.
 *
 * @example
 *   getLeaguePopularity(262)               // 100 — Liga MX
 *   getLeaguePopularity(253, 'US')         // 100 — MLS for US users
 *   getLeaguePopularity(9999, undefined, { name: 'Liga II', country: 'Romania', type: 'League' }) // 2
 */
function getLeaguePopularity(leagueId, country, meta) {
    const id = Number(leagueId);
    if (country) {
        const v = exports.LEAGUE_POPULARITY_BY_COUNTRY[country]?.[id];
        if (typeof v === 'number')
            return v;
    }
    const g = exports.LEAGUE_POPULARITY[id];
    if (typeof g === 'number')
        return g;
    return fallbackLeagueScore(meta);
}
/**
 * Comparator for sorting leagues/matches by popularity (desc), then by
 * country and name so the uncatalogued tail is stable and readable.
 */
function compareLeagues(a, b, userCountry) {
    const pa = getLeaguePopularity(a.id, userCountry, a);
    const pb = getLeaguePopularity(b.id, userCountry, b);
    if (pa !== pb)
        return pb - pa;
    if (a.country !== b.country)
        return a.country.localeCompare(b.country);
    return a.name.localeCompare(b.name);
}
/** Leagues the backend treats as high priority (faster syncs, scheduled standings). */
function isPriorityLeague(leagueId) {
    return (exports.LEAGUE_POPULARITY[Number(leagueId)] ?? 0) >= 20;
}
// ── Legacy provider mapping (one-time favorites migration) ───────────────────
//
// Sportmonks league id → API-Sports league id. Covers every Sportmonks id the
// old app or backend ever used (the old app and backend disagreed on a few:
// Egypt 806/830, Uruguay 687/770, Paraguay 702/755, Peru 708/764 — both kept).
// Verified against API-Sports /leagues on 2026-11-25.
exports.SM_TO_AF_LEAGUE = {
    8: 39, 564: 140, 82: 78, 384: 135, 301: 61,
    9: 40, 567: 141, 85: 79, 387: 136, 304: 62,
    462: 94, 72: 88, 208: 144, 600: 203, 501: 179, 271: 119, 486: 235,
    806: 233, 830: 233, 860: 200,
    24: 45, 570: 143, 109: 81, 390: 137, 307: 66, 27: 48,
    743: 262, 779: 253, 636: 128, 648: 71, 672: 239, 663: 265,
    687: 268, 770: 268, 702: 250, 755: 250, 708: 281, 764: 281,
    696: 242, 734: 234,
    749: 263, 645: 129, 651: 72, 654: 73,
    944: 307, 968: 98, 1034: 292, 902: 290,
    2: 2, 5: 3, 2286: 848,
    1122: 13, 1116: 11, 1111: 16, 1741: 536, 1107: 12, 1108: 20,
    732: 1, 1082: 10,
    1579: 673, 1568: 142, 1419: 525,
    3211: 772, 1328: 531, 1452: 1168, 1085: 17, 642: 130, 1798: 632, 3213: 866,
    573: 113, 1356: 188, 325: 197, 474: 283, 989: 169, 938: 305,
};
//# sourceMappingURL=leagues.js.map