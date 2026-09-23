/**
 * Shared types for the simulation engine: external parameters (CalcParams),
 * the fully-resolved per-scenario configuration (SimConfig) and per-year
 * context/age information passed between phases.
 */
import type { Scenario, TaxOpts, Keyframe, LifeEvent, DeathParams, SpouseConfig, NISAConfig, BalancePolicy, SocialInsuranceParams, CareerPeriod, DCReceiveMethod } from "../types";

export interface CalcParams {
  currentAge: number;
  retirementAge: number;
  defaultGrossMan: number;
  rr: number;
  sirPct: number;
  hasRet: boolean;
  retAmt: number;
  PY: number;
  taxOpts: TaxOpts;
  housingLoanDed: number;
  inflationRate: number; // % per year
}

// ===== SimConfig: All resolved configuration for a scenario simulation =====
export interface SimConfig {
  // Linked settings
  linked: boolean;
  base_: Scenario;
  currentAge: number;
  baseCalendarYear: number;
  selfRetirementAge: number;
  retirementAge: number;
  rr: number;
  r: number;
  sir: number;
  otherRet: number;
  selfGender: string;
  hasFuru: boolean;
  selfSIParams: SocialInsuranceParams | undefined;
  effectiveCurrentAssets: number;
  growthRate: number | undefined;
  effectiveDCReceiveMethod: DCReceiveMethod | undefined;
  effectiveYears: number;
  effectivePensionStartAge: number | undefined;
  effectivePensionWorkStartAge: number | undefined;
  effectiveDepHolder: "self" | "spouse" | undefined;
  // Keyframes
  incomeKF: Keyframe[];
  expenseKF: Keyframe[];
  dcTotalKF: Keyframe[];
  companyDCKF: Keyframe[];
  idecoKF: Keyframe[];
  // Events
  events: LifeEvent[];
  // Spouse / NISA / Balance policy
  spouse: SpouseConfig | undefined;
  nisaConfig: NISAConfig | undefined;
  bpConfig: BalancePolicy | undefined;
  // NISA limits
  selfNISAAnnualLimit: number;
  selfNISALifetimeLimit: number;
  spouseNISAAnnualLimit: number;
  spouseNISALifetimeLimit: number;
  // Rates
  dcRate: number;
  nisaReturnRate: number;
  taxableReturnRate: number;
  cashRate: number;
  // Balance policy resolved
  cashReserveMinMonths: number;
  cashReserveMaxMonths: number;
  nisaPriority: boolean;
  cashAnchors: { age: number; amountMan: number }[];
  // Spouse DC receive method
  spouseRM: DCReceiveMethod;
  // Inflation & macro slide
  effectiveInflation: number;
  inflation: number;
  macroSlideRate: number; // % per year (default -0.8)
  // Params pass-through
  defaultGrossMan: number;
  taxOpts: TaxOpts;
  housingLoanDed: number;
  PY: number;
  hasRet: boolean;
  retAmt: number;
  livingExpenseRules: Scenario["livingExpenseRules"];
  careerHistory?: CareerPeriod[];        // Phase 4: 本人の職歴
  spouseCareerHistory?: CareerPeriod[];  // Phase 4: 配偶者の職歴
  returnRateKF?: Keyframe[];             // Phase 5: 年齢別運用利回り
  // Phase 5: per-account explicit rate flags (true = user explicitly set, KF should not override)
  nisaRateExplicit: boolean;
  dcRateExplicit: boolean;
  taxableRateExplicit: boolean;
  childAllowanceEnabled: boolean;        // Phase 15: 児童手当
  tashiWaiverEnabled: boolean;           // 多子世帯授業料減免
  hsSupportEnabled: boolean;             // 高校就学支援金
  retirementLivingExpenseMan?: number;   // Phase 16: 老後の基本生活費（万円/月）
  afterSelfDeathSpouseIncome?: Scenario["afterSelfDeathSpouseIncome"]; // Phase 10
  nhsSettings?: Scenario["nhsSettings"]; // Phase 9: 国民健康保険料率詳細設定
  marriageAge?: number; // Phase 14: 本人の結婚年齢（配偶者第3号計算用）
}

// ===== AgeEventInfo: Death/retirement detection for a given year =====
export interface AgeEventInfo {
  isSelfDead: boolean;
  isSpouseDead: boolean;
  isDeathYear: boolean;
  isSpouseDeathYear: boolean;
  selfDeathEvent?: LifeEvent;
  spouseDeathEvent?: LifeEvent;
  deathEvent?: LifeEvent;
  dp?: DeathParams;
  deathAge: number;
  isDead: boolean;
  selfRetired: boolean;
  spouseAge: number;
  spouseRetired: boolean;
}

// ===== YearContext: Per-year computed values that don't depend on previous phases =====
export interface YearContext {
  age: number;
  yearsFromStart: number;
  inflationFactor: number;
  baseCalendarYear: number;
  isEffDisabled: (e: LifeEvent) => boolean;
  events: LifeEvent[];
  config: SimConfig;
}
