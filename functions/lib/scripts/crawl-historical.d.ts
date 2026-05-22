/**
 * crawl-historical.ts
 *
 * One-shot crawl that pulls every historical season we have API access to
 * (Pro plan + Historical Data add-on) into Firestore, so the app can serve
 * past fixtures, standings and topscorers without ever calling SportMonks
 * again for that data.
 *
 * Coverage per league (51 leagues total):
 *   • All seasons returned by /seasons?filters=seasonLeagues:{leagueId}
 *   • Fixtures → matches/{matchId}            (full participants + scores)
 *   • Standings → standings/{seasonId}
 *   • Topscorers → topscorers/{seasonId}
 *
 * What we deliberately SKIP (fetched on-demand later if a user opens that
 * specific past match): lineups, events, detailed stats, odds, predictions.
 *
 * Resilience:
 *   • Idempotent — every write uses .set({merge:true}); re-running picks
 *     up where it left off.
 *   • Progress file (.crawl-progress.json) tracks finished {leagueId}_{seasonId}
 *     pairs so a Ctrl-C or network blip never costs more than the
 *     in-flight season.
 *   • Per-season errors are caught and logged; the crawl never aborts
 *     for one bad league.
 *
 * Rate limit: 600ms pause between SportMonks calls (~100 req/min) keeps
 * us at ~3% of the Pro plan's 3,000/hour-per-entity ceiling.
 *
 * Setup (one-time):
 *   1. Download a Firebase service account key from
 *      console.firebase.google.com/project/analistas-8ba26/settings/serviceaccounts/adminsdk
 *      Save it as functions/.crawl-service-account.json (gitignored).
 *   2. export GOOGLE_APPLICATION_CREDENTIALS="$PWD/functions/.crawl-service-account.json"
 *      export SPORTMONKS_TOKEN="<your-token>"
 *
 * Run:
 *   cd functions && npm run crawl
 */
export {};
