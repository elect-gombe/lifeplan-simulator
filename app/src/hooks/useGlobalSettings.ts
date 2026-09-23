import { useCallback, useState } from "react";
import type { GlobalSettings, SavedState } from "../lib/storage";
import { DEFAULT_GLOBAL_SETTINGS } from "../lib/storage";

/**
 * Holds the global (non-scenario) settings as a single object.
 * `applySavedState` replaces every duplicated "setRR/setHasRet/..." cascade.
 */
export function useGlobalSettings(initial: GlobalSettings | null | undefined) {
  const [settings, setSettings] = useState<GlobalSettings>(() => ({
    ...DEFAULT_GLOBAL_SETTINGS,
    ...(initial ? pickGlobal(initial) : {}),
  }));

  const update = useCallback(<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const applySavedState = useCallback((data: SavedState) => {
    setSettings(pickGlobal(data));
  }, []);

  return { settings, update, applySavedState };
}

function pickGlobal(s: GlobalSettings): GlobalSettings {
  return { rr: s.rr, hasRet: s.hasRet, retAmt: s.retAmt, PY: s.PY, sirPct: s.sirPct, inflationRate: s.inflationRate };
}
