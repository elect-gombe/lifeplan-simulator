export interface Keyframe {
  age: number;
  value: number;
}

export interface PropertyParams {
  priceMan: number;         // 物件価格（万円）
  downPaymentMan: number;   // 頭金（万円）
  loanYears: number;
  rateType: "fixed" | "variable";
  fixedRate: number;        // %
  variableInitRate: number; // %
  variableRiskRate: number; // %
  variableRiseAfter: number; // 年
  maintenanceMonthlyMan: number; // 管理費（万円/月）
  taxAnnualMan: number;     // 固定資産税（万円/年）
  hasLoanDeduction: boolean;
}

export interface DeathParams {
  expenseReductionPct: number;     // 生活費削減率（%）例: 70 = 7割に
  hasDanshin: boolean;              // 団信加入（住宅ローン免除）
  survivorPensionManPerYear: number; // 遺族年金（万円/年）
  incomeProtectionManPerMonth: number; // 収入保障保険（万円/月）
  incomeProtectionUntilAge: number;   // 保障期間（何歳まで）
}

export interface CarParams {
  priceMan: number;
  loanYears: number;       // 0 = 一括購入
  loanRate: number;        // %
  maintenanceAnnualMan: number;
  insuranceAnnualMan: number;
  replaceEveryYears: number; // 買い替えサイクル（0=一度のみ）
}

export interface LifeEvent {
  id: number;
  age: number;
  type: string;
  label: string;
  oneTimeCostMan: number;
  annualCostMan: number;
  durationYears: number;
  parentId?: number;
  ageOffset?: number;
  // Structured params for complex events (parent only)
  propertyParams?: PropertyParams;
  carParams?: CarParams;
  deathParams?: DeathParams;
}

// Computed cost breakdown for a single year from a structured event
export interface EventYearCost {
  label: string;
  icon: string;
  color: string;
  amount: number;         // 円/年（正=支出、負=収入/控除）
  detail?: string;        // e.g. "残高2800万 × 0.7%"
  isPhaseChange?: boolean; // true if this is a phase transition (e.g. rate change, deduction end)
  phaseLabel?: string;     // e.g. "金利上昇 0.5%→1.5%"
}

// Timeline sub-markers derived from structured events (for display)
export interface TimelineMarker {
  age: number;
  label: string;
  icon: string;
  color: string;
  parentEventId: number;
}

// Resolve effective age of an event, considering offset from parent
export function resolveEventAge(event: LifeEvent, allEvents: LifeEvent[]): number {
  if (event.parentId != null && event.ageOffset != null) {
    const parent = allEvents.find(e => e.id === event.parentId);
    if (parent) return parent.age + event.ageOffset;
  }
  return event.age;
}

export const LINKABLE_TRACKS = [
  "incomeKF", "expenseKF", "dcTotalKF", "companyDCKF", "idecoKF",
] as const;
export type TrackKey = typeof LINKABLE_TRACKS[number];
export const DEFAULT_OVERRIDE_TRACKS: TrackKey[] = ["dcTotalKF", "companyDCKF", "idecoKF"];

export interface Scenario {
  id: number;
  name: string;
  currentAssetsMan: number;
  incomeKF: Keyframe[];
  expenseKF: Keyframe[];     // 基本生活費（万円/月）
  dcTotalKF: Keyframe[];
  companyDCKF: Keyframe[];
  idecoKF: Keyframe[];
  salaryGrowthRate: number;
  // Events: own events + which base events to include
  events: LifeEvent[];
  excludedBaseEventIds: number[];  // IDs of base events to exclude in this scenario
  linkedToBase: boolean;
  overrideTracks: TrackKey[];
  years: number;
  hasFurusato: boolean;
}

export interface YearResult {
  age: number;
  gross: number;
  grossMan: number;
  // Expenses
  baseLivingExpense: number;
  eventOnetime: number;
  eventOngoing: number;
  totalExpense: number;
  // Tax
  incomeTax: number;
  residentTax: number;
  socialInsurance: number;
  takeHomePay: number;
  // DC/iDeCo
  dcMonthly: number;
  companyDC: number;
  idecoMonthly: number;
  annualContribution: number;
  selfDCContribution: number;
  // Savings
  incomeTaxSaving: number;
  residentTaxSaving: number;
  socialInsuranceSaving: number;
  annualBenefit: number;
  annualNetBenefit: number;
  // Wealth
  cumulativeDCAsset: number;
  cumulativeReinvest: number;
  annualNetCashFlow: number;
  cumulativeSavings: number;
  totalWealth: number;
  // Furusato
  furusatoLimit: number;
  furusatoDonation: number;
  pensionLossAnnual: number;
  // Dependents & allowances
  childCount: number;
  dependentDeduction: number;  // 扶養控除合計（円）
  childAllowance: number;     // 児童手当合計（円/年）
  // Housing loan balance (for graph)
  loanBalance: number;
  // Active events & cost breakdown
  activeEvents: LifeEvent[];
  eventCostBreakdown: EventYearCost[];
}

export interface ScenarioResult {
  scenario: Scenario;
  yearResults: YearResult[];
  totalC: number;
  assetFV: number;
  fvB: number;
  lPL: number;
  pvPL: number;
  dcRetDed: number;
  exitDelta: number;
  finalAssetNet: number;
  finalWealth: number;
  finalScore: number;
  multiPhase: boolean;
  hasFuru: boolean;
}

export interface BaseResult {
  bTI: number;
  bMR: number;
  bFL: number;
  depDed: number;
  spouseDed: number;
  lifeDed: number;
  housingLoanDed: number;
  hasDepSetting: boolean;
  hasSpouseSetting: boolean;
  hasLifeSetting: boolean;
  hasHousingSetting: boolean;
  hasAnyTaxDetailSetting: boolean;
}

export interface TaxOpts {
  dependentsCount: number;
  hasSpouseDeduction: boolean;
  lifeInsuranceDeduction: number;
}

export function resolveKF(keyframes: Keyframe[], age: number, fallback: number): number {
  let val = fallback;
  for (const kf of keyframes) {
    if (kf.age <= age) val = kf.value;
    else break;
  }
  return val;
}

export function sortKF(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.age - b.age);
}

export function isEventActive(e: LifeEvent, age: number, allEvents?: LifeEvent[]): boolean {
  const eAge = allEvents ? resolveEventAge(e, allEvents) : e.age;
  if (age < eAge) return false;
  if (e.durationYears <= 0) return true;
  return age < eAge + e.durationYears;
}

export const EVENT_TYPES: Record<string, { label: string; icon: string; color: string; defaultAnnual: number; defaultOnetime: number; defaultDuration: number }> = {
  child:     { label: "子供",       icon: "👶", color: "#f59e0b", defaultAnnual: 50,  defaultOnetime: 50,  defaultDuration: 0 },
  education: { label: "教育費",     icon: "🎓", color: "#8b5cf6", defaultAnnual: 120, defaultOnetime: 0,   defaultDuration: 4 },
  property:  { label: "住宅購入",   icon: "🏠", color: "#3b82f6", defaultAnnual: 120, defaultOnetime: 500, defaultDuration: 35 },
  car:       { label: "車",         icon: "🚗", color: "#10b981", defaultAnnual: 30,  defaultOnetime: 300, defaultDuration: 7 },
  marriage:  { label: "結婚",       icon: "💍", color: "#ec4899", defaultAnnual: 0,   defaultOnetime: 300, defaultDuration: 0 },
  insurance: { label: "保険",       icon: "🛡️", color: "#6366f1", defaultAnnual: 24,  defaultOnetime: 0,   defaultDuration: 0 },
  travel:    { label: "旅行・趣味", icon: "✈️", color: "#14b8a6", defaultAnnual: 30,  defaultOnetime: 0,   defaultDuration: 0 },
  rent:      { label: "家賃",       icon: "🏢", color: "#64748b", defaultAnnual: 120, defaultOnetime: 0,   defaultDuration: 0 },
  death:     { label: "死亡",       icon: "⚰️", color: "#1e293b", defaultAnnual: 0,   defaultOnetime: 0,   defaultDuration: 0 },
  custom:    { label: "カスタム",   icon: "📌", color: "#78716c", defaultAnnual: 0,   defaultOnetime: 0,   defaultDuration: 0 },
};
