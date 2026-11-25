// ── DataMigrationGate ────────────────────────────────────────────────────────
// Holds back everything that reads saved team / league / player ids until
// those ids are in the current data source's id space.
//
// On the first launch of a build that reads the new data, the lists saved by
// an older build are translated in place (services/football/legacyMigration).
// That is a handful of AsyncStorage operations — a few milliseconds, once per
// install; afterwards the gate only reads one flag. A provider mounting before
// it finished would load ids that point at the wrong teams.
import React, { useEffect, useState } from 'react';
import { ensureLocalMigration } from '../services/football/legacyMigration';

/** Never keep the app blank over a storage hiccup. */
const MAX_WAIT_MS = 3000;

export const DataMigrationGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const open = () => { if (!done) { done = true; setReady(true); } };
    const timer = setTimeout(open, MAX_WAIT_MS);
    ensureLocalMigration().finally(() => { clearTimeout(timer); open(); });
    return () => { done = true; clearTimeout(timer); };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
};
