import type { Keyframe, LifeEvent, DCReceiveMethod, CareerPeriod, BalancePolicy, HousingPhase } from "../../lib/types";

export interface WizardData {
  // Step 1
  currentAge: number;
  gender: "male" | "female";
  retirementAge: number;
  simEndAge: number;
  retirementTouched: boolean;
  simEndTouched: boolean;
  // Step 2
  hasSpouse: boolean;
  spouseAge: number;
  spouseRetirementAge: number;
  spouseIncomeMan: number;
  spousePensionStartAge: number;
  marriageAge: number;
  childEvents: LifeEvent[];   // flat list: parent "child" events + education/custom sub-events
  // Step 3
  incomeKF: Keyframe[];
  incomeType: "employee" | "self_employed";
  salaryGrowthRate: number;
  hasFurusato: boolean;
  pensionWorkStartAge: number;
  pensionStartAge: number;
  // Step 3 — DC（本人）
  dcTotalKF: Keyframe[];
  companyDCKF: Keyframe[];
  idecoKF: Keyframe[];
  dcReceiveMethod: DCReceiveMethod;
  careerHistory?: CareerPeriod[];
  // Step 4 — 配偶者
  spouseIncomeKF: Keyframe[];
  spouseIncomeType: "employee" | "self_employed";
  spouseSalaryGrowthRate: number;
  spouseHasFurusato: boolean;
  spouseDcTotalKF: Keyframe[];
  spouseCompanyDCKF: Keyframe[];
  spouseIdecoKF: Keyframe[];
  spouseDcReceiveMethod: DCReceiveMethod;
  spousePensionWorkStartAge: number;
  spouseCareerHistory?: CareerPeriod[];
  // Step 4
  currentAssetsMan: number;
  expenseKF: Keyframe[];
  housingTimeline: HousingPhase[];
  insuranceEvents: LifeEvent[];
  carEvents: LifeEvent[];
  // Step 6 — NISA・投資
  balancePolicy: BalancePolicy;
  nisaEnabled: boolean;
  nisaAccounts: 1 | 2;
  nisaAnnualLimitMan: number;
  nisaLifetimeLimitMan: number;
  nisaReturnRate?: number;
  dcReturnRate?: number;
  taxableReturnRate?: number;
  cashInterestRate?: number;
}

export interface StepProps { data: WizardData; onChange: (d: WizardData) => void }

export const DEFAULT_WIZARD: WizardData = {
  currentAge: 30,
  gender: "male",
  retirementAge: 65,
  simEndAge: 90,
  retirementTouched: false,
  simEndTouched: false,
  hasSpouse: true,
  spouseAge: 28,
  spouseRetirementAge: 65,
  spouseIncomeMan: 500,
  spousePensionStartAge: 65,
  marriageAge: 0,
  childEvents: [],
  incomeKF: [{ age: 30, value: 700 }],
  incomeType: "employee",
  salaryGrowthRate: 0,
  hasFurusato: false,
  pensionWorkStartAge: 22,
  pensionStartAge: 65,
  dcTotalKF: [],
  companyDCKF: [],
  idecoKF: [],
  dcReceiveMethod: { type: "lump_sum", annuityStartAge: 65, annuityYears: 20, combinedLumpSumRatio: 50 },
  careerHistory: undefined,
  spouseIncomeKF: [{ age: 28, value: 500 }],
  spouseIncomeType: "employee",
  spouseSalaryGrowthRate: 0,
  spouseHasFurusato: false,
  spouseDcTotalKF: [],
  spouseCompanyDCKF: [],
  spouseIdecoKF: [],
  spouseDcReceiveMethod: { type: "lump_sum", annuityStartAge: 65, annuityYears: 20, combinedLumpSumRatio: 50 },
  spousePensionWorkStartAge: 22,
  spouseCareerHistory: undefined,
  currentAssetsMan: 0,
  expenseKF: [{ age: 30, value: 15 }],
  housingTimeline: [{ startAge: 30, type: "rent" as const, rentMonthlyMan: 10 }],
  insuranceEvents: [],
  carEvents: [],
  balancePolicy: { cashReserveMonths: 6, nisaPriority: true, withdrawalOrder: ["taxable", "selfNisa", "spouseNisa"] },
  nisaEnabled: false,
  nisaAccounts: 1,
  nisaAnnualLimitMan: 360,
  nisaLifetimeLimitMan: 1800,
  nisaReturnRate: undefined,
  dcReturnRate: undefined,
  taxableReturnRate: undefined,
  cashInterestRate: undefined,
};

// ============================================================
// wizardToScenario / scenarioToWizardData
// ============================================================

export const STEPS = [
  { label: "本人" },
  { label: "家族" },
  { label: "配偶者" },
  { label: "住居" },
  { label: "保険・車" },
  { label: "NISA・投資" },
  { label: "確認" },
] as const;

export const LAST_STEP = STEPS.length;
/** Step index (1-based) of the spouse step, skipped when there is no spouse. */
export const SPOUSE_STEP = 3;
