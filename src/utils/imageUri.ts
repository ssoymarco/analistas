/**
 * imageUri.ts — single source of truth for "is this string something a
 * React Native `<Image source={{ uri }} />` can render?"
 *
 * Background: every place in the app that switches between rendering a team
 * crest as an image or as text/emoji needs to know whether the value at
 * hand is a URI. The historical check was `s.startsWith('http')`, which
 * works perfectly in DEV (Metro serves bundled assets from
 * `http://localhost:8081/assets/...`) but BREAKS IN PRODUCTION for any
 * asset that came through `require(...)` + `Image.resolveAssetSource()` —
 * those resolve to `file://...` on iOS production builds, which the
 * `http` check rejects and the renderer falls back to `<Text>`,
 * printing the entire URI as a string in the UI.
 *
 * This was found 2026-05-22 with the Cruz Azul logo override (which uses a
 * bundled PNG override). In TestFlight production builds the user saw
 * `file:///private/var/containers/Bundle/Application/.../2626.png` rendered
 * as text where the team name should have been.
 *
 * Schemes covered: http / https (remote URLs), file (iOS bundle production),
 * asset (Android bundle production), data (inline base64). All are renderable
 * by `<Image source={{ uri }} />`.
 *
 * For anything else (emoji strings like "⚽", short codes, empty) the
 * caller should render as `<Text>`.
 */
const URI_SCHEME_RE = /^(https?|file|asset|data):/i;

export function isImageUri(s: string | null | undefined): boolean {
  if (!s) return false;
  return URI_SCHEME_RE.test(s);
}
