// ── NetworkContext ─────────────────────────────────────────────────────────────
// Tracks real-time connectivity using @react-native-community/netinfo.
// Provides { isConnected, isOffline } to any component in the tree.
//
// Usage:
//   const { isOffline } = useNetwork();

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkContextType {
  /** null = still checking on mount */
  isConnected: boolean | null;
  /** true only when we know for certain there's no connection */
  isOffline: boolean;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: null,
  isOffline: false,
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    // Immediate check on mount
    NetInfo.fetch().then((state: NetInfoState) => {
      setIsConnected(state.isConnected ?? false);
    }).catch(() => {
      setIsConnected(true); // assume online if check fails
    });

    // Subscribe to all future changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected ?? false);
    });

    return unsubscribe;
  }, []);

  return (
    <NetworkContext.Provider
      value={{
        isConnected,
        isOffline: isConnected === false,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextType {
  return useContext(NetworkContext);
}
