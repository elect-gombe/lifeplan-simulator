import type { Scenario } from "./types";
import { DEFAULT_OVERRIDE_TRACKS, DEFAULT_DC_RECEIVE_METHOD } from "./types";

export const MAX_SCENARIOS = 4;
export const SCENARIO_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

/** Scenario with the transient UI-only hint used by TimelineChart → HousingSection. */
export type ScenarioWithUIHints = Scenario & { _housingEditIdx?: number };

export function mkScenario(id: number): Scenario {
  const isBase = id === 0;
  return {
    id, name: `シナリオ${"ABCD"[id] || "X"}`,
    currentAge: 30, retirementAge: 65, simEndAge: 85,
    currentAssetsMan: 500,
    incomeKF: isBase ? [{ age: 30, value: 700 }] : [],
    expenseKF: isBase ? [{ age: 30, value: 15 }] : [],
    dcTotalKF: isBase ? [{ age: 30, value: 55000 }] : [],
    companyDCKF: isBase ? [{ age: 30, value: 0 }] : [],
    idecoKF: isBase ? [{ age: 30, value: 0 }] : [],
    salaryGrowthRate: 2,
    events: [], excludedBaseEventIds: [],
    housingTimeline: isBase ? [{ startAge: 30, type: "rent", rentMonthlyMan: 10 }] : undefined,
    linkedToBase: !isBase,
    overrideTracks: [],
    years: 35, hasFurusato: true,
    dependentDeductionHolder: "self",
    pensionStartAge: 65, pensionWorkStartAge: 22,
    // Linked scenarios inherit the receive method from base (undefined on purpose).
    dcReceiveMethod: isBase ? DEFAULT_DC_RECEIVE_METHOD : (undefined as unknown as Scenario["dcReceiveMethod"]),
    spouse: { enabled: isBase, currentAge: 28, retirementAge: 65, incomeKF: isBase ? [{ age: 28, value: 500 }] : [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, sirPct: 15.75, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22 },
    nisa: { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800, },
    balancePolicy: { cashReserveMonths: 6, nisaPriority: true },
  };
}

/** Initial scenario set shown when nothing is persisted. */
export function initialScenarios(): Scenario[] {
  return [mkScenario(0), mkScenario(1)];
}

/** New empty scenario appended after `existing`. 2nd and later are linked to A. */
export function createAdditionalScenario(existing: Scenario[]): Scenario {
  const id = Date.now() + existing.length;
  const linked = existing.length > 0;
  return {
    ...mkScenario(existing.length),
    id,
    name: `シナリオ${String.fromCharCode(65 + existing.length)}`,
    linkedToBase: linked,
    overrideTracks: linked ? [...DEFAULT_OVERRIDE_TRACKS] : [],
    events: [],
    excludedBaseEventIds: [],
  };
}

/**
 * Duplicate `existing[i]`.
 * Copying from base (i=0) yields a linked scenario that inherits everything;
 * otherwise the copy keeps the source's link settings and own data.
 */
export function duplicateScenario(existing: Scenario[], i: number): Scenario {
  const src = existing[i];
  const isFromBase = i === 0;
  return {
    ...mkScenario(existing.length),
    id: Date.now(),
    name: `${src.name} コピー`,
    linkedToBase: isFromBase ? true : src.linkedToBase,
    overrideTracks: isFromBase ? [...DEFAULT_OVERRIDE_TRACKS] : [...(src.overrideTracks || [])],
    overrideSettings: src.overrideSettings ? [...src.overrideSettings] : undefined,
    spouseOverrideTracks: src.spouseOverrideTracks ? [...src.spouseOverrideTracks] : undefined,
    // リンク時: イベント・住居は空（ベースから継承）。非リンク時: コピー
    events: isFromBase ? [] : [...(src.events || []).map(e => ({ ...e, id: Date.now() + Math.round(Math.random() * 100000) }))],
    excludedBaseEventIds: isFromBase ? [] : [...(src.excludedBaseEventIds || [])],
    disabledBaseEventIds: src.disabledBaseEventIds ? [...src.disabledBaseEventIds] : undefined,
    housingTimeline: isFromBase ? undefined : src.housingTimeline ? [...src.housingTimeline] : undefined,
    // 非リンク設定をコピー
    ...(isFromBase ? {} : {
      currentAge: src.currentAge, retirementAge: src.retirementAge, simEndAge: src.simEndAge,
      currentAssetsMan: src.currentAssetsMan, selfGender: src.selfGender,
      salaryGrowthRate: src.salaryGrowthRate, years: src.years,
      hasFurusato: src.hasFurusato, dependentDeductionHolder: src.dependentDeductionHolder,
      pensionStartAge: src.pensionStartAge, pensionWorkStartAge: src.pensionWorkStartAge,
      incomeKF: [...src.incomeKF], expenseKF: [...src.expenseKF],
      dcTotalKF: [...src.dcTotalKF], companyDCKF: [...src.companyDCKF], idecoKF: [...src.idecoKF],
      dcReceiveMethod: src.dcReceiveMethod, siParams: src.siParams,
      spouse: src.spouse ? { ...src.spouse } : undefined,
      nisa: src.nisa ? { ...src.nisa } : undefined,
      balancePolicy: src.balancePolicy ? { ...src.balancePolicy } : undefined,
      dcReturnRate: src.dcReturnRate, nisaReturnRate: src.nisaReturnRate,
      taxableReturnRate: src.taxableReturnRate, cashInterestRate: src.cashInterestRate,
    }),
  };
}

/** True when scenario A is still the untouched default (drives the "はじめる" wizard CTA). */
export function isPristineScenario(s: Scenario | undefined): boolean {
  return !!s &&
    s.events.filter(e => !e.parentId).length === 0 &&
    s.currentAssetsMan === 500 &&
    s.incomeKF.length === 1 && s.incomeKF[0].value === 700;
}
