/**
 * Feature flags — compile-time switches for gating features that aren't ready
 * for a given release.
 */

/**
 * Master switch for the premium / subscription feature (the HazteTitular
 * paywall and every entry point that leads to it).
 *
 * ⚠️  Kept FALSE for the v1.0 launch. Apple (App Store Review Guideline 3.1.1 /
 * 2.3.1) and Google both require a *working* In-App Purchase before an app may
 * surface any paywall or "upgrade to premium" UI. Showing plans/prices with no
 * purchasable product is a guaranteed rejection.
 *
 * Flip to TRUE in v1.1 ONLY AFTER:
 *   1. App Store Connect: subscription products created + "Ready to Submit".
 *   2. Google Play Console: subscription products created + active.
 *   3. Client: StoreKit / Play Billing purchase flow wired into HazteTitularScreen.
 *
 * When false, the Perfil screen hides: the level/tier badge, the app-icon
 * premium row, the "Es hora del cambio" promo banner, and the odds-lock upsell
 * (odds become a free toggle). HazteTitular becomes unreachable from the UI.
 */
export const PREMIUM_ENABLED = false;

/**
 * Master switch for betting / gambling content: the Caliente.mx banner ads, the
 * betting odds ("momios") display, and the AI predictions (which include betting
 * markets like "Doble Oportunidad" 1X/X2/12).
 *
 * ⚠️  Kept FALSE for the v1.0 launch. Apple rejected v1.0 under Guideline 2.3.6
 * because betting-odds + prediction content "related to real money gambling"
 * forces a "Yes" Gambling age rating (17+). We also have no signed Caliente
 * agreement yet. So for v1.0 we ship a clean scores+news app with NO betting
 * content → stays 13+, no gambling declaration.
 *
 * Flip to TRUE in v1.1 ONCE the Caliente agreement is signed — and at that point
 * ALSO set Gambling = Yes in the App Store Connect age rating (→ 17+) and declare
 * it on Google Play. When false: no Caliente banners, no momios/odds, no AI
 * predictions. Free community predictions (PredictionsCarousel) stay — they're a
 * poll, not real-money gambling.
 */
export const BETTING_CONTENT_ENABLED = false;
