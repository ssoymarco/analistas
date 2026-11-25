import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform, NativeModules } from 'react-native';
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';

const RC_IOS_KEY = 'appl_KztCtepDGxgNLhSoRNPuWKuFvHc';
const RC_ANDROID_KEY = 'goog_eDySEBlsPgJVVfOnOWtmwIomDEj';

// ── Native-module guard (OTA cross-runtime safety) ───────────────────────────
// `react-native-purchases` is a NATIVE module — it only exists in binaries
// built with it (runtime 1.3.0 / build 38+). This same JS bundle is also
// OTA-published to the runtime-1.2.3 public build, which does NOT contain the
// native module. Statically importing + calling Purchases there would CRASH
// the app on launch. So we detect the native module (`NativeModules.RNPurchases`)
// and lazy-require the JS only when present; otherwise the provider degrades to
// a free-tier no-op (isProUser=false) and never touches native code.
const PURCHASES_AVAILABLE = !!(NativeModules as { RNPurchases?: unknown }).RNPurchases;
let Purchases: typeof import('react-native-purchases').default | null = null;
let LOG_LEVEL: typeof import('react-native-purchases').LOG_LEVEL | null = null;
if (PURCHASES_AVAILABLE) {
  try {
    const mod = require('react-native-purchases');
    Purchases = mod.default ?? mod;
    LOG_LEVEL = mod.LOG_LEVEL;
  } catch {
    Purchases = null;
  }
}

interface SubscriptionContextValue {
  isProUser: boolean;
  isLoading: boolean;
  monthlyPackage: PurchasesPackage | null;
  yearlyPackage: PurchasesPackage | null;
  /** true solo cuando la tienda ENTREGÓ productos comprables. Si Apple/Google
   *  no devuelven offerings (suscripciones sin aprobar, acuerdo de pagos
   *  incompleto, outage), toda la UI de premium debe ocultarse — un paywall
   *  con botón muerto es lo que vieron los usuarios de 1.3.0 el 4 jul 2026.
   *  Auto-sana: en cuanto la tienda responda, premium aparece sin OTA. */
  storeReady: boolean;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  isProUser: false,
  isLoading: true,
  monthlyPackage: null,
  yearlyPackage: null,
  storeReady: false,
  purchasePackage: async () => false,
  restorePurchases: async () => false,
});

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isProUser, setIsProUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [yearlyPackage, setYearlyPackage] = useState<PurchasesPackage | null>(null);

  useEffect(() => {
    // Native module absent (runtime 1.2.3 build) → stay on the free tier, never
    // call native. See the PURCHASES_AVAILABLE guard at the top of the file.
    if (!Purchases) {
      setIsLoading(false);
      return;
    }

    const apiKey = Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;
    if (!apiKey) {
      setIsLoading(false);
      return;
    }

    if (__DEV__ && LOG_LEVEL) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      // En dev, RevenueCat loguea errores vía console.error → LogBox pinta un
      // full-screen rojo en cada arranque ("Error fetching offerings" — ruido
      // de sandbox/StoreKit en dev builds). Ruteamos su log a console.log:
      // misma visibilidad en Metro, sin pantalla roja. Solo afecta __DEV__.
      try {
        (Purchases as unknown as {
          setLogHandler?: (h: (level: string, msg: string) => void) => void;
        }).setLogHandler?.((level, msg) => {
          console.log(`[RevenueCat:${level}] ${msg}`);
        });
      } catch {}
    }
    Purchases.configure({ apiKey });

    const init = async () => {
      try {
        const [customerInfo, offerings] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);

        setIsProUser(!!customerInfo.entitlements.active['pro']);

        const current = offerings.current;
        if (current) {
          setMonthlyPackage(current.monthly ?? null);
          setYearlyPackage(current.annual ?? null);
        }
      } catch {
        // falla silencioso — usuario se queda en tier gratuito
      } finally {
        setIsLoading(false);
      }
    };

    init();

    Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
      setIsProUser(!!info.entitlements.active['pro']);
    });
  }, []);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    if (!Purchases) return false;
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = !!customerInfo.entitlements.active['pro'];
      setIsProUser(active);
      return active;
    } catch (e: any) {
      if (e.userCancelled) return false;
      throw e;
    }
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!Purchases) return false;
    try {
      const customerInfo = await Purchases.restorePurchases();
      const active = !!customerInfo.entitlements.active['pro'];
      setIsProUser(active);
      return active;
    } catch {
      return false;
    }
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        isProUser, isLoading, monthlyPackage, yearlyPackage,
        storeReady: !!(monthlyPackage || yearlyPackage),
        purchasePackage, restorePurchases,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
