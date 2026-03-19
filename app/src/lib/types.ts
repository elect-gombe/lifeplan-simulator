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

// 繰上返済エントリ
export interface PrepaymentEntry {
  age: number;
  amountMan: number;
  type: "shorten" | "reduce"; // 期間短縮型 | 返済額軽減型
  target?: "self" | "spouse"; // ペアローン時: どちらのローンに充てるか（未設定=本人）
}

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
  // Phase 1: 繰上返済
  prepayments?: PrepaymentEntry[];
  // Phase 2: 売却
  saleAge?: number;           // 売却年齢
  salePriceMan?: number;      // 売却価格（万円）。未設定時は購入価格×上昇率で計算
  appreciationRate?: number;  // 年間価値変動率（%）
  saleIsResidence?: boolean;  // 居住用か（デフォルトtrue=3000万特別控除適用）
  saleCostRate?: number;      // 売却費用率（%）デフォルト4%（仲介手数料+印紙等）
  // Phase 4: 借換
  refinance?: {
    age: number;
    newRate: number;
    newLoanYears: number;
    costMan: number; // 借換手数料（万円）
  };
}

export interface InsuranceParams {
  insuranceType: "term_life" | "income_protection";
  premiumMonthlyMan: number;    // 保険料（万円/月）
  lumpSumPayoutMan: number;     // 死亡一時金（万円）— term_life
  monthlyPayoutMan: number;     // 月額保障（万円/月）— income_protection
  payoutUntilAge: number;       // 保障期間（歳まで）
  coverageEndAge: number;       // 保険期間（何歳まで保険料を払うか）
}

// 社会保険料の詳細パラメータ
export interface SocialInsuranceParams {
  healthInsuranceRate: number;      // 健康保険料率（被保険者負担分, %）例: 3.97
  nursingInsuranceRate: number;     // 介護保険料率（被保険者負担分, %）例: 1.00
  childSupportRate: number;         // 子ども・子育て支援金率（被保険者負担分, %）例: 0.10
}

export const DEFAULT_SI_PARAMS: SocialInsuranceParams = {
  healthInsuranceRate: 5.00,   // 協会けんぽ全国平均相当
  nursingInsuranceRate: 0.80,  // 介護保険 被保険者負担
  childSupportRate: 0.10,      // 子ども・子育て支援金
};

// 厚生年金（全国一律、定数）
export const PENSION_INSURANCE_RATE = 9.15;        // 被保険者負担 %
export const PENSION_MONTHLY_CAP = 650000;         // 標準報酬月額上限（円）
export const EMPLOYMENT_INSURANCE_RATE = 0.60;     // 雇用保険 被保険者負担 %
export const NURSING_INSURANCE_MIN_AGE = 40;       // 介護保険 対象開始年齢
export const NURSING_INSURANCE_MAX_AGE = 65;       // 介護保険 対象終了年齢

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
  sirPct: number;               // 社保料率（%）— レガシー（siParamsがあればそちら優先）
  siParams?: SocialInsuranceParams; // 社保詳細パラメータ
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
  // Phase 8: 引出戦略のカスタマイズ
  withdrawalOrder?: ("taxable" | "spouseNisa" | "selfNisa")[];
}

// 住居タイムライン（住居フェーズの配列）
export interface HousingPhase {
  startAge: number;
  type: "rent" | "own";
  rentMonthlyMan?: number;        // 賃貸時の月額家賃（万円）
  propertyParams?: PropertyParams; // 購入時の物件設定
}

// Phase 5: 住み替え（リロケーション）
export interface RelocationParams {
  movingCostMan: number;               // 引越費用（万円）
  newHousingType: "purchase" | "rent";
  newPropertyParams?: PropertyParams;   // 新居購入時
  newRentAnnualMan?: number;           // 賃貸時の年間家賃（万円）
  newRentDurationYears?: number;       // 賃貸期間（年）
}

// Phase 6: 贈与税
export interface GiftParams {
  giftType: "calendar" | "settlement"; // 暦年課税 | 相続時精算課税
  amountMan: number;
  recipientRelation: "lineal" | "other"; // 直系尊属 | その他
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

// DC/iDeCo受取方法のデフォルト値
export const DEFAULT_DC_RECEIVE_METHOD: DCReceiveMethod = {
  type: "lump_sum", annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50,
};

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
  relocationParams?: RelocationParams;  // Phase 5: 住み替え
  giftParams?: GiftParams;              // Phase 6: 贈与税
  disabled?: boolean;  // true=計算から除外（UIではグレーアウト表示）
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
  selfAmount?: number;    // ペアローン等: 本人分（未設定=amount全額が本人）
  spouseAmount?: number;  // ペアローン等: 配偶者分（未設定=0）
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

// Linkable scalar settings (scenario settings section)
export const LINKABLE_SETTINGS = [
  "currentAge", "retirementAge", "simEndAge", "currentAssetsMan", "selfGender",
  "years", "dependentDeductionHolder",
  "pensionStartAge", "pensionWorkStartAge",
] as const;
export type SettingKey = typeof LINKABLE_SETTINGS[number];

export interface Scenario {
  id: number;
  name: string;
  selfGender?: "male" | "female"; // 本人の性別（中高齢寡婦加算の判定に使用）
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
  disabledBaseEventIds?: number[];
  linkedToBase: boolean;
  overrideTracks: TrackKey[];
  overrideSettings?: SettingKey[];
  spouseOverrideTracks?: TrackKey[];
  years: number;             // DC通算期間
  hasFurusato: boolean;
  dependentDeductionHolder: "self" | "spouse";
  // 公的年金
  pensionStartAge: number;          // 受給開始年齢（デフォ65）
  pensionWorkStartAge: number;      // 就職年齢（厚生年金加入開始、デフォ22）
  // DC/iDeCo受取方法
  dcReceiveMethod: DCReceiveMethod;
  // Social Insurance
  siParams?: SocialInsuranceParams; // 社保詳細パラメータ（未設定=フラット率sirPctを使用）
  // Spouse
  spouse?: SpouseConfig;
  // NISA / Balance policy
  nisa?: NISAConfig;
  balancePolicy?: BalancePolicy;
  // 住居タイムライン（設定されている場合、rent/property/relocationイベントの代わりに使用）
  housingTimeline?: HousingPhase[];
  // Phase 3: 個別資産クラス利回り
  dcReturnRate?: number;       // DC利回り（%）。未設定=グローバルrr
  nisaReturnRate?: number;     // NISA利回り（%）。未設定=グローバルrr
  taxableReturnRate?: number;  // 特定口座利回り（%）。未設定=グローバルrr
  cashInterestRate?: number;   // 現金利率（%）。デフォルト0
  // UI state: section open/close (persisted in JSON)
  sectionOpen?: Record<string, boolean>;
}

export interface MemberResult {
  gross: number;
  employeeDeduction: number;
  taxableIncome: number;
  marginalRate: number;
  incomeTax: number;
  residentTax: number;
  socialInsurance: number;
  // 社保内訳
  siPension: number;          // 厚生年金
  siHealth: number;           // 健康保険
  siNursing: number;          // 介護保険
  siEmployment: number;       // 雇用保険
  siChildSupport: number;     // 子ども・子育て支援金
  socialInsuranceDeduction: number;
  dcIdecoDeduction: number;
  lifeInsuranceDeductionAmount: number;
  furusatoDeduction: number;
  dependentDeduction: number;
  housingLoanDeduction: number;
  housingLoanDeductionAvail: number;
  housingLoanDeductionIT: number;
  housingLoanDeductionRT: number;
  dcContribution: number;
  idecoContribution: number;
  selfDCContribution: number;
  incomeTaxSaving: number;
  residentTaxSaving: number;
  socialInsuranceSaving: number;
  furusatoLimit: number;
  furusatoDonation: number;
  takeHome: number;
  pensionIncome: number;
  // 年金課税内訳（統合課税）
  pensionDeduction: number;        // 公的年金等控除額
  pensionTaxableIncome: number;    // 年金雑所得
  pensionIncomeTax: number;        // 年金にかかる所得税（按分）
  pensionResidentTax: number;      // 年金にかかる住民税（按分）
  dcAsset: number;
  loanBalance: number;             // ローン残高（ペアローン時は個人分）
  // DC受取（受取年のみ非0）
  dcReceiveLumpSum: number;        // 一時金受取額
  dcReceiveAnnuityAnnual: number;  // 年金年額
  dcRetirementDeduction: number;   // 退職所得控除額
  dcReceiveTax: number;            // 退職所得税
  nisaAsset: number;
  nisaCostBasis: number;
  nisaContribution: number;
}

export interface YearResult {
  age: number;
  grossMan: number;
  // Expenses
  baseLivingExpense: number;
  eventOnetime: number;
  eventOngoing: number;
  totalExpense: number;
  // Household totals
  takeHomePay: number;
  basicDeduction: number;          // 基礎控除
  spouseDeductionAmount: number;   // 配偶者控除/配偶者特別控除額
  // DC/iDeCo (本人)
  dcMonthly: number;
  companyDC: number;
  idecoMonthly: number;
  annualContribution: number;
  annualBenefit: number;
  annualNetBenefit: number;
  // Wealth (世帯合計)
  cumulativeDCAsset: number;
  cumulativeReinvest: number;
  annualNetCashFlow: number;
  cumulativeSavings: number;
  totalWealth: number;
  pensionLossAnnual: number;
  // Dependents & allowances
  childCount: number;
  dependentDeduction: number;  // 扶養控除合計（円）
  childAllowance: number;     // 児童手当合計（円/年）
  // 公的年金・遺族年金
  pensionTax: number;           // 年金にかかる税
  pensionReduction: number;     // 在職老齢年金の減額分(年額)
  survivorIncome: number;       // 遺族年金+収入保障保険（手取りに含まれる）
  // 遺族年金・保険内訳
  survivorBasicPension: number;
  survivorEmployeePension: number;
  survivorWidowSupplement: number;
  survivorIncomeProtection: number;
  // Housing loan balance (for graph) — 世帯合計。個別は self/spouse.loanBalance
  loanBalance: number;
  // NISA / 特定口座 / Cash split (世帯合計)
  nisaContribution: number;
  nisaWithdrawal: number;
  nisaAsset: number;           // 世帯合計（時価）
  nisaGain: number;            // NISA含み益（時価−簿価）
  taxableContribution: number;
  taxableWithdrawal: number;
  taxableAsset: number;        // 特定口座（税引前評価額）
  taxableGain: number;         // 特定口座の含み益
  cashSavings: number;
  // Insurance
  insurancePremiumTotal: number;
  insurancePayoutTotal: number;
  // Inheritance tax (death year)
  inheritanceTax: number;
  inheritanceEstate: number;
  // DC/iDeCo receive tax (retirement) — 世帯合計。個別は self/spouse.dcReceiveTax 等を参照
  dcReceiveTax: number;
  // Property sale (Phase 2)
  propertySaleProceeds: number;    // 売却代金（円）
  propertyCapitalGainsTax: number; // 不動産譲渡所得税（円）
  // Gift tax (Phase 6)
  giftTax: number;
  // Active events & cost breakdown
  activeEvents: LifeEvent[];
  eventCostBreakdown: EventYearCost[];
  // Unified member results
  self: MemberResult;
  spouse: MemberResult;
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
  lifeInsuranceDeduction: number;
  sirPct?: number;  // 社会保険料率(%) — 省略時15%
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
  rent:      { label: "家賃",       icon: "🏢", color: "#64748b", defaultAnnual: 120, defaultOnetime: 0,   defaultDuration: 10 },
  nursing:   { label: "介護",       icon: "🏥", color: "#be185d", defaultAnnual: 84,  defaultOnetime: 0,   defaultDuration: 6 },
  death:       { label: "死亡",       icon: "⚰️", color: "#1e293b", defaultAnnual: 0,   defaultOnetime: 0,   defaultDuration: 0 },
  relocation:  { label: "住み替え", icon: "🏡", color: "#0891b2", defaultAnnual: 0,   defaultOnetime: 0,   defaultDuration: 0 },
  gift:        { label: "贈与",     icon: "🎁", color: "#a855f7", defaultAnnual: 0,   defaultOnetime: 0,   defaultDuration: 0 },
  custom:      { label: "カスタム",   icon: "📌", color: "#78716c", defaultAnnual: 0,   defaultOnetime: 0,   defaultDuration: 0 },
};
