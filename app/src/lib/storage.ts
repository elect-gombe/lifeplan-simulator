import type { Scenario } from "./types";

export const STORAGE_KEY = "asset-sim-state-v1";

/** Global (non-scenario) settings shared by all scenarios. */
export interface GlobalSettings {
  rr: number;
  hasRet: boolean;
  retAmt: number;
  PY: number;
  sirPct: number;
  inflationRate: number;
}

export interface SavedState extends GlobalSettings {
  scenarios: Scenario[];
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  rr: 4, hasRet: false, retAmt: 0, PY: 20, sirPct: 15.75, inflationRate: 1.5,
};

/** Legacy top-level fields (pre-scenario era) used as fallbacks during migration. */
interface LegacyFields {
  currentAge?: number;
  retirementAge?: number;
  currentAssetsMan?: number;
  salaryGrowthRate?: number;
  dcYears?: number;
  hasFurusato?: boolean;
}

// Raw persisted data is untyped by nature; keep `any` confined to this module.
/* eslint-disable @typescript-eslint/no-explicit-any */

export function migrateScenario(s: any, oldFields?: LegacyFields): Scenario {
  const events = (s.events || []).map((e: any) => ({
    ...e,
    propertyParams: e.propertyParams ? {
      loanStructure: "single", pairRatio: 50, deductionTarget: "self", danshinTarget: "self",
      ...e.propertyParams,
    } : undefined,
  }));

  // housingTimeline自動構築: 既存イベントから住居フェーズをマイグレーション
  let housingTimeline = s.housingTimeline;
  if (!housingTimeline && !s.linkedToBase) {
    const currentAge = s.currentAge ?? oldFields?.currentAge ?? 30;
    const ht: any[] = [];
    for (const e of events) {
      if (e.disabled) continue;
      if (e.type === "rent" && !e.parentId) ht.push({ startAge: e.age, type: "rent", rentMonthlyMan: Math.round((e.annualCostMan || 120) / 12) });
      else if (e.type === "property" && e.propertyParams) ht.push({ startAge: e.age, type: "own", propertyParams: e.propertyParams });
      else if (e.type === "relocation" && e.relocationParams) {
        const rp = e.relocationParams;
        if (rp.newHousingType === "rent") ht.push({ startAge: e.age, type: "rent", rentMonthlyMan: Math.round((rp.newRentAnnualMan || 120) / 12) });
        else if (rp.newPropertyParams) ht.push({ startAge: e.age, type: "own", propertyParams: rp.newPropertyParams });
      }
    }
    if (ht.length > 0) housingTimeline = ht;
    else housingTimeline = [{ startAge: currentAge, type: "rent", rentMonthlyMan: 10 }];
  }

  return {
    ...s,
    currentAge: s.currentAge ?? oldFields?.currentAge ?? 30,
    retirementAge: s.retirementAge ?? oldFields?.retirementAge ?? 65,
    simEndAge: s.simEndAge ?? 85,
    currentAssetsMan: s.currentAssetsMan ?? oldFields?.currentAssetsMan ?? 500,
    salaryGrowthRate: s.salaryGrowthRate ?? oldFields?.salaryGrowthRate ?? 2,
    years: s.years ?? oldFields?.dcYears ?? 35,
    hasFurusato: s.hasFurusato ?? oldFields?.hasFurusato ?? true,
    dependentDeductionHolder: s.dependentDeductionHolder ?? "self",
    pensionStartAge: s.pensionStartAge ?? 65,
    pensionWorkStartAge: s.pensionWorkStartAge ?? 22,
    dcReceiveMethod: s.dcReceiveMethod,
    housingTimeline,
    spouse: s.spouse ? {
      retirementAge: 65,
      ...s.spouse,
    } : { enabled: false, currentAge: 30, retirementAge: 65, incomeKF: [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, sirPct: 15.75, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22 },
    nisa: s.nisa ?? { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800, },
    balancePolicy: s.balancePolicy ?? { cashReserveMonths: 6, nisaPriority: true },
    overrideTracks: s.overrideTracks ?? [],
    excludedBaseEventIds: s.excludedBaseEventIds ?? [],
    events,
  };
}

/**
 * Normalize any parsed JSON blob (localStorage, URL hash, file, pasted text)
 * into a SavedState with defaults and per-scenario migration applied.
 * Throws if `raw` is not an object.
 */
export function parseSavedState(raw: unknown): SavedState {
  if (!raw || typeof raw !== "object") throw new Error("invalid saved state");
  const parsed = raw as any;
  const oldFields: LegacyFields = {
    currentAge: parsed.currentAge,
    retirementAge: parsed.retirementAge,
    currentAssetsMan: parsed.currentAssetsMan,
    salaryGrowthRate: parsed.salaryGrowthRate,
    dcYears: parsed.dcYears,
    hasFurusato: parsed.hasFurusato,
  };
  const d = DEFAULT_GLOBAL_SETTINGS;
  return {
    rr: parsed.rr ?? d.rr,
    hasRet: parsed.hasRet ?? d.hasRet,
    retAmt: parsed.retAmt ?? d.retAmt,
    PY: parsed.PY ?? d.PY,
    sirPct: parsed.sirPct ?? d.sirPct,
    inflationRate: parsed.inflationRate ?? d.inflationRate,
    scenarios: (parsed.scenarios || []).map((s: any) => migrateScenario(s, oldFields)),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function saveToStorage(state: SavedState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota / privacy mode */ }
}

export function loadFromStorage(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseSavedState(JSON.parse(raw));
  } catch { return null; }
}

export function exportJSON(state: SavedState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `asset-sim-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}

/** Parse pasted JSON text into a SavedState; returns null on any error. */
export function parseSavedStateText(text: string): SavedState | null {
  try { return parseSavedState(JSON.parse(text)); } catch { return null; }
}

export function importJSON(file: File): Promise<SavedState | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(parseSavedStateText(reader.result as string));
    reader.readAsText(file);
  });
}

// ---- URL sharing: gzip + URL-safe base64 ----

export async function encodeStateToURL(state: SavedState): Promise<string> {
  const json = JSON.stringify(state);
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = await new Response(stream).arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function decodeStateFromURL(encoded: string): Promise<SavedState | null> {
  try {
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const json = await new Response(stream).text();
    return parseSavedState(JSON.parse(json));
  } catch { return null; }
}
