// ── The public website the app links to ──────────────────────────────────────
//
// Every link the app shares or opens on the site is built here, so the domain
// lives in one place and each link points to a page that really exists.
//
// Checked against the live site on 26-nov-2026:
//   /            → the matches page (also where unknown paths end up)
//   /ligas       → list of leagues
//   /league/{slug} for the eight slugs in LEAGUE_PAGES; any other id shows
//                  "Liga no encontrada", so leagues without a page link to /ligas
//   https://get.analistasapp.com → download page (sends each phone to its store)
//
// ⚠️ SITE_HOST has no "www": on that date `www.analistasapp.com` answered with
// Cloudflare error 522 (the site isn't served on that name) while
// `analistasapp.com` worked. Once www serves the site, switch it here — this is
// the only place.

export const SITE_HOST = 'analistasapp.com';
export const SITE_URL = `https://${SITE_HOST}`;

/** Download page: redirects each device to its own store. */
export const DOWNLOAD_URL = 'https://get.analistasapp.com';

/** League pages the site has, by API-Sports league id. */
const LEAGUE_PAGES: Record<number, string> = {
  262: 'liga-mx',
  39: 'premier-league',
  140: 'la-liga',
  78: 'bundesliga',
  135: 'serie-a',
  61: 'ligue-1',
  71: 'brasileirao',
  2: 'champions-league',
};

/** The site page to share for a league: its own page when there is one, else the leagues list. */
export function leagueShareUrl(leagueId: number | string | null | undefined): string {
  const slug = LEAGUE_PAGES[Number(leagueId)];
  return slug ? `${SITE_URL}/league/${slug}` : `${SITE_URL}/ligas`;
}
