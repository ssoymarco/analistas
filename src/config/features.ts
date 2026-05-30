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
