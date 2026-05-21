# Team logo overrides

Drop PNGs in this directory to override SportMonks' team logos when their
CDN is out of date (e.g. a rebrand SportMonks hasn't picked up yet).

## Convention

- **Filename**: `<sportmonks_team_id>.png`
- **Size**: 256×256 recommended, transparent background, square crop
- **Format**: PNG (SVGs exported to PNG work; React Native doesn't load
  raw SVGs without extra deps)

## Wiring a new override

After dropping the file:

1. Open `src/utils/teamLogoOverrides.ts`
2. Add an entry to `OVERRIDE_ASSETS`:

   ```ts
   const OVERRIDE_ASSETS: Record<string, number | string> = {
     '2626': require('../../assets/team-logos/2626.png'), // Cruz Azul — 2024 rebrand
   };
   ```

3. Save. The override applies everywhere a Team object is created
   (matches, standings, team detail, recent fixtures).

## Finding a team's SportMonks ID

- Browse the live SportMonks team URL the app uses:
  `https://cdn.sportmonks.com/images/soccer/teams/{X}/{ID}.png` — the
  `ID` segment is the team_id.
- Or `grep -rn "TeamName" src/` — most teams are seeded in
  OnboardingScreen / FavoritosScreen with their `smId`.

## Notes

- This is a client-side data-layer override. SportMonks data is left
  untouched; only the rendered URL is swapped.
- Changing a bundled asset requires a new build (or an EAS Update push).
  If you need hot-swap-able logos, the override map also accepts plain
  URL strings — point to your own CDN / CMS / Firebase Storage.
