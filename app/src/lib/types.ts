export interface Keyframe {
  age: number;
  value: number;
}

// DC/iDeCo受取方法
export interface DCReceiveMethod {
  type: "lump_sum" | "annuity" | "combined"; // 一時金 | 年金 | 併用
  annuityYears: number;     // 年金受取期間（5/10/15/20年）
  annuityStartAge: number;  // 年金受取開始年齢（60-75）
  combinedLumpSumRatio: number; // 併用時の一時金割合（%）
}

export type LoanStructure = "single" | "pair"; // 単独ローン | ペアローン

export interface PropertyParams {
  priceMan: number;         // 物件価格（万円）
  downPaymentMan: number;   // 頭金（万円）
  loanYears: number;
  repaymentType: "equal_payment" | "equal_principal"; // 元利均等 | 元金均等
  rateType: "fixed" | "variable";
  fixedRate: number;        // %
  variableInitRate: number; // %
  variableRiskRate: number; // %
  variableRiseAfter: number; // 年
  maintenanceMonthlyMan: number; // 管理費（万円/月）
  taxAnnualMan: number;     // 固定資産税（万円/年）
  hasLoanDeduction: boolean;
  loanStructure: LoanStructure;    // 単独 or ペアローン
  pairRatio: number;               // ペアローン時の本人負担割合 (0-100%)
  deductionTarget: "self" | "spouse" | "both"; // 住宅ローン控除の対象
  danshinTarget: "self" | "spouse" | "both";   // 団信の対象
}

export interface InsuranceParams {
  insuranceType: "term_life" | "income_protection";
  premiumMonthlyMan: number;    // 保険料（万円/月）
  lumpSumPayoutMan: number;     // 死亡一時金（万円）— term_life
  monthlyPayoutMan: number;     // 月額保障（万円/月）— income_protection
  payoutUntilAge: number;       // 保障期間（歳まで）
  coverageEndAge: number;       // 保険期間（何歳まで保険料を払うか）
}

export interface SpouseConfig {
  enabled: boolean;
  currentAge: number;
  retirementAge: number;        // 配偶者の退職予定年齢
  incomeKF: Keyframe[];         // 年収KF（万円）
  expenseKF: Keyframe[];        // 配偶者分の生活費KF（万円/月）— 空の場合は世帯共通
  dcTotalKF: Keyframe[];        // DC合計KF（円/月）
  companyDCKF: Keyframe[];      // 会社DC KF（円/月）
  idecoKF: Keyframe[];          // iDeCo KF（円/月）
  salaryGrowthRate: number;     // 昇給率（%）
  sirPct: number;               // 社保料率（%）
  hasFurusato: boolean;         // ふるさと納税
  pensionStartAge?: number;     // 年金受給開始年齢
  pensionWorkStartAge?: number; // 就職年齢
  dcReceiveMethod?: DCReceiveMethod;
}

export interface NISAConfig {
  enabled: boolean;
  accounts: 1 | 2;             // 口座数（1=本人のみ, 2=夫婦2口座）
  annualLimitMan: number;       // 1人あたり年間投資枠（万円）default 360
  lifetimeLimitMan: number;     // 1人あたり生涯投資枠（万円）default 1800
  returnRate: number;           // 運用利回り（%）NISA=非課税, 特定口座=20.315%課税
  spouseAnnualLimitMan?: number;   // 配偶者の年間枠（未設定なら本人と同じ）
  spouseLifetimeLimitMan?: number; // 配偶者の生涯枠（未設定なら本人と同じ）
}

export interface BalancePolicy {
  cashReserveMonths: number;    // 生活防衛資金（月数）
  nisaPriority: boolean;        // 余剰はNISA優先
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

export type EventTarget = "self" | "spouse";

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
  target?: EventTarget;           // 対象者（death/insurance用: "self"=本人, "spouse"=配偶者）
  // Structured params for complex events (parent only)
  propertyParams?: PropertyParams;
  carParams?: CarParams;
  deathParams?: DeathParams;
  insuranceParams?: InsuranceParams;
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
  // 本人年齢
  currentAge: number;         // 本人の現在年齢
  retirementAge: number;      // 本人の退職予定年齢
  simEndAge: number;          // シミュレーション終了年齢(デフォ85)
  currentAssetsMan: number;
  incomeKF: Keyframe[];
  expenseKF: Keyframe[];     // 基本生活費（万円/月）
  dcTotalKF: Keyframe[];
  companyDCKF: Keyframe[];
  idecoKF: Keyframe[];
  salaryGrowthRate: number;
  // Events: own events + which base events to include
  events: LifeEvent[];
  excludedBaseEventIds: number[];
  linkedToBase: boolean;
  overrideTracks: TrackKey[];
  years: number;             // DC通算期間
  hasFurusato: boolean;
  dependentDeductionHolder: "self" | "spouse";
  // 公的年金
  pensionStartAge: number;          // 受給開始年齢（デフォ65）
  pensionWorkStartAge: number;      // 就職年齢（厚生年金加入開始、デフォ22）
  // DC/iDeCo受取方法
  dcReceiveMethod: DCReceiveMethod;
  // Spouse
  spouse?: SpouseConfig;
  // NISA / Balance policy
  nisa?: NISAConfig;
  balancePolicy?: BalancePolicy;
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
  cumulativeDCAsset: number;      // 世帯合計
  selfDCAsset: number;            // 本人DC資産
  spouseDCAsset: number;          // 配偶者DC資産
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
  // 公的年金・遺族年金
  selfPensionIncome: number;    // 本人の年金収入
  spousePensionIncome: number;  // 配偶者の年金収入
  pensionTax: number;           // 年金にかかる税
  survivorIncome: number;       // 遺族年金+収入保障保険（手取りに含まれる）
  // Housing loan balance (for graph)
  loanBalance: number;
  // NISA / 特定口座 / Cash split
  nisaContribution: number;
  nisaWithdrawal: number;
  nisaAsset: number;           // 世帯合計（時価）
  selfNISAAsset: number;       // 本人NISA（時価）
  spouseNISAAsset: number;     // 配偶者NISA（時価）
  selfNISACostBasis: number;   // 本人NISA元本（簿価）
  spouseNISACostBasis: number; // 配偶者NISA元本（簿価）
  nisaGain: number;            // NISA含み益（時価−簿価）
  taxableContribution: number;
  taxableWithdrawal: number;
  taxableAsset: number;        // 特定口座（税引前評価額）
  taxableGain: number;         // 特定口座の含み益
  cashSavings: number;
  // Spouse (individual breakdown — same framework as 本人)
  spouseGross: number;
  spouseIncomeTax: number;
  spouseResidentTax: number;
  spouseSocialInsurance: number;
  spouseDCContribution: number;
  spouseIDeCoContribution: number;
  spouseIncomeTaxSaving: number;
  spouseResidentTaxSaving: number;
  spouseFurusatoLimit: number;
  spouseFurusatoDonation: number;
  spouseTakeHome: number;
  // Insurance
  insurancePremiumTotal: number;
  insurancePayoutTotal: number;
  // Active events & cost breakdown
  activeEvents: LifeEvent[];
  eventCostBreakdown: EventYearCost[];
}

export interface DCReceiveDetail {
  method: string;
  lumpSumAmount: number;      // 一時金受取額
  lumpSumTax: number;         // 一時金にかかる税
  annuityAnnual: number;      // 年金年額（税引前）
  annuityTotalTax: number;    // 年金にかかる総税額
  annuityYears: number;       // 受取年数
  annuityStartAge: number;    // 受取開始年齢
  totalTax: number;           // 合計税額
  netAmount: number;          // 手取り合計
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
  dcReceiveDetail: DCReceiveDetail;       // 本人
  spouseDCReceiveDetail?: DCReceiveDetail; // 配偶者
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
  insurance: { label: "保険",       icon: "🛡️", color: "#6366f1", defaultAnnual: 0,  defaultOnetime: 0,   defaultDuration: 0 },
  travel:    { label: "旅行・趣味", icon: "✈️", color: "#14b8a6", defaultAnnual: 30,  defaultOnetime: 0,   defaultDuration: 0 },
  rent:      { label: "家賃",       icon: "🏢", color: "#64748b", defaultAnnual: 120, defaultOnetime: 0,   defaultDuration: 0 },
  death:     { label: "死亡",       icon: "⚰️", color: "#1e293b", defaultAnnual: 0,   defaultOnetime: 0,   defaultDuration: 0 },
  custom:    { label: "カスタム",   icon: "📌", color: "#78716c", defaultAnnual: 0,   defaultOnetime: 0,   defaultDuration: 0 },
};
