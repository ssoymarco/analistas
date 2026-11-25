/**
 * sync-league-seasons.ts
 *
 * Resolución DINÁMICA liga→temporada actual. Mata la clase de bug del
 * 11-jul-2026: los `currentSeasonId` hardcodeados (functions/src/config.ts y
 * src/config/leagues.ts) se quedaron apuntando a las temporadas 2025/26
 * terminadas, así que la app mostraba tablas viejas, "Sin partidos próximos"
 * y calendarios de la temporada pasada — cuando SM ya tenía 2026/27 completa.
 *
 * Qué hace (programada 2×/día + callable admin para correrla on-demand):
 *   1. Por cada liga de LEAGUES pregunta a SM su temporada vigente
 *      (`include=currentSeason`).
 *   2. Escribe el mapa en `_meta/leagueSeasons` — el cliente y las demás
 *      Cloud Functions lo leen vía getCurrentSeasonMap() con fallback al
 *      hardcode de config.ts.
 *   3. Si detecta CAMBIO de temporada (SM ≠ lo último registrado), crawlea el
 *      calendario completo de la temporada nueva → matches/{id} + reconstruye
 *      season_fixtures/{seasonId}. Así el calendario de liga y los próximos
 *      partidos por equipo existen en Firestore desde el día uno, sin esperar
 *      a que la ventana de 15 días de syncFixtures los alcance.
 *
 * El doc _meta/leagueSeasons es legible por el cliente (firestore.rules) —
 * regla de oro: doc nuevo que el cliente lee → rules en el MISMO cambio.
 */
export declare function syncLeagueSeasonsHandler(): Promise<{
    checked: number;
    changed: number;
    crawledFixtures: number;
}>;
/**
 * Mapa liga→temporada actual: `_meta/leagueSeasons` con fallback al hardcode
 * de config.ts. Cachea 10 min por instancia — syncStandings/syncTeams/etc.
 * lo consultan una vez por corrida.
 */
export declare function getCurrentSeasonMap(): Promise<Map<number, number>>;
