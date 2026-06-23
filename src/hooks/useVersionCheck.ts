import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getDoc, doc } from 'firebase/firestore';
import Constants from 'expo-constants';
import { db } from '../services/firebase';

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type UpdateStatus = 'none' | 'optional' | 'required';

export interface VersionCheckResult {
  status: UpdateStatus;
  storeUrl: string;
  latestVersion: string;
}

export function useVersionCheck(): VersionCheckResult {
  const [result, setResult] = useState<VersionCheckResult>({
    status: 'none',
    storeUrl: '',
    latestVersion: '',
  });

  useEffect(() => {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    getDoc(doc(db, '_meta', 'appVersion'))
      .then(snap => {
        if (!snap.exists()) return;
        const data = snap.data();
        const pd = data[platform];
        if (!pd) return;

        const current = Constants.expoConfig?.version ?? '0.0.0';
        const { minVersion, latestVersion, storeUrl } = pd as {
          minVersion: string;
          latestVersion: string;
          storeUrl: string;
        };

        if (compareVersions(current, minVersion) < 0) {
          setResult({ status: 'required', storeUrl, latestVersion });
        } else if (compareVersions(current, latestVersion) < 0) {
          setResult({ status: 'optional', storeUrl, latestVersion });
        }
      })
      .catch(() => {});
  }, []);

  return result;
}
