/**
 * Regression fixtures for the simulation engine.
 * These scenarios intentionally exercise as many code paths as possible
 * (housing loan, pair loan, car, insurance, children/education, death,
 * survivor pension, NISA, crash, relocation, gift, private pension, career history).
 */
import type { Scenario, LifeEvent, PropertyParams } from "../types";
import { DEFAULT_DC_RECEIVE_METHOD } from "../types";
import type { CalcParams } from "../calc";

export const PARAMS: CalcParams = {
  currentAge: 30, retirementAge: 90, defaultGrossMan: 0, rr: 4, sirPct: 15.75,
  hasRet: true, retAmt: 15_000_000, PY: 20,
  taxOpts: { dependentsCount: 0, lifeInsuranceDeduction: 0, sirPct: 15.75 },
  housingLoanDed: 0, inflationRate: 1.5,
};

const property = (over: Partial<PropertyParams> = {}): PropertyParams => ({
  priceMan: 5000, downPaymentMan: 500, loanYears: 35, repaymentType: "equal_payment",
  rateType: "variable", fixedRate: 1.5, variableInitRate: 0.5, variableRiskRate: 1.8, variableRiseAfter: 10,
  maintenanceMonthlyMan: 2.5, taxAnnualMan: 15, hasLoanDeduction: true, certifiedType: "zeh",
  loanStructure: "single", pairRatio: 50, deductionTarget: "self", danshinTarget: "self",
  ...over,
});

export function richBaseScenario(): Scenario {
  const events: LifeEvent[] = [
    { id: 1, age: 32, type: "child", label: "第1子", oneTimeCostMan: 50, annualCostMan: 50, durationYears: 22 },
    { id: 11, age: 0, type: "education", label: "私立大学", oneTimeCostMan: 0, annualCostMan: 150, durationYears: 4, parentId: 1, ageOffset: 18, isPrivate: true },
    { id: 12, age: 0, type: "education", label: "公立高校", oneTimeCostMan: 0, annualCostMan: 40, durationYears: 3, parentId: 1, ageOffset: 15 },
    { id: 2, age: 34, type: "child", label: "第2子", oneTimeCostMan: 50, annualCostMan: 50, durationYears: 22 },
    { id: 21, age: 0, type: "education", label: "国立大学", oneTimeCostMan: 0, annualCostMan: 80, durationYears: 4, parentId: 2, ageOffset: 18 },
    { id: 3, age: 36, type: "child", label: "第3子", oneTimeCostMan: 50, annualCostMan: 50, durationYears: 22 },
    { id: 4, age: 33, type: "car", label: "車", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
      carParams: { priceMan: 300, loanYears: 5, loanRate: 2.0, maintenanceAnnualMan: 20, insuranceAnnualMan: 8, replaceEveryYears: 10 } },
    { id: 5, age: 31, type: "insurance", label: "収入保障", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, target: "self",
      insuranceParams: { insuranceType: "income_protection", premiumMonthlyMan: 0.5, lumpSumPayoutMan: 0, monthlyPayoutMan: 15, payoutUntilAge: 65, coverageEndAge: 65 } },
    { id: 6, age: 31, type: "insurance", label: "定期保険(配偶者)", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, target: "spouse",
      insuranceParams: { insuranceType: "term_life", premiumMonthlyMan: 0.3, lumpSumPayoutMan: 1000, monthlyPayoutMan: 0, payoutUntilAge: 0, coverageEndAge: 60 } },
    { id: 7, age: 45, type: "crash", label: "暴落", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 1,
      marketCrashParams: { dropRate: 40, target: "all", recoveryYears: 3, recoveryRates: [12, 8, 6] } },
    { id: 8, age: 50, type: "gift", label: "贈与", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
      giftParams: { giftType: "calendar", amountMan: 500, recipientRelation: "lineal" } },
    { id: 9, age: 40, type: "pension_private", label: "個人年金", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, target: "self",
      privatePensionParams: { pensionType: "individual_annuity", payoutStartAge: 65, payoutEndAge: 75, payoutAnnualMan: 60, contributionMonthlyMan: 2, contributionEndAge: 60, isPublicPensionTaxed: false },
      afterDeathRule: { selfDeath: "stop", spouseDeath: "continue" } },
    { id: 10, age: 40, type: "travel", label: "旅行", oneTimeCostMan: 0, annualCostMan: 30, durationYears: 20, intervalYears: 2,
      afterDeathRule: { selfDeath: "reduce", selfDeathReducePct: 50, spouseDeath: "continue" } },
    { id: 13, age: 70, type: "nursing", label: "介護", oneTimeCostMan: 100, annualCostMan: 84, durationYears: 6 },
  ];
  return {
    id: 0, name: "A",
    selfGender: "male",
    currentAge: 30, retirementAge: 65, simEndAge: 90,
    currentAssetsMan: 800,
    incomeKF: [{ age: 30, value: 650 }, { age: 40, value: 850 }, { age: 55, value: 700 }],
    expenseKF: [{ age: 30, value: 18 }, { age: 50, value: 22 }],
    dcTotalKF: [{ age: 30, value: 55000 }],
    companyDCKF: [{ age: 30, value: 20000 }],
    idecoKF: [{ age: 30, value: 0 }, { age: 45, value: 12000 }],
    salaryGrowthRate: 1.5,
    events, excludedBaseEventIds: [],
    housingTimeline: [
      { startAge: 30, type: "rent", rentMonthlyMan: 12 },
      { startAge: 35, type: "own", propertyParams: property({ loanStructure: "pair", deductionTarget: "both", danshinTarget: "both",
        prepayments: [{ age: 45, amountMan: 300, type: "shorten" }], refinance: { age: 50, newRate: 0.9, newLoanYears: 20, costMan: 60 } }) },
      { startAge: 60, type: "own", propertyParams: property({ priceMan: 3500, downPaymentMan: 2000, loanYears: 15, rateType: "fixed", certifiedType: "standard", appreciationRate: -1 }) },
    ],
    linkedToBase: false, overrideTracks: [],
    years: 35, hasFurusato: true,
    dependentDeductionHolder: "self",
    pensionStartAge: 65, pensionWorkStartAge: 22,
    dcReceiveMethod: { type: "combined", annuityYears: 10, annuityStartAge: 65, combinedLumpSumRatio: 60 },
    siParams: { healthInsuranceRate: 4.9, nursingInsuranceRate: 0.9, childSupportRate: 0.1 },
    spouse: {
      enabled: true, currentAge: 29, retirementAge: 60,
      incomeKF: [{ age: 29, value: 400 }, { age: 40, value: 300 }], expenseKF: [],
      dcTotalKF: [{ age: 29, value: 10000 }], companyDCKF: [], idecoKF: [{ age: 35, value: 23000 }],
      salaryGrowthRate: 1, sirPct: 15.75, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22,
      dcReceiveMethod: { type: "lump_sum", annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 },
    },
    nisa: { enabled: true, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800, spouseAnnualLimitMan: 120 },
    balancePolicy: { cashReserveMonths: 6, cashReserveMaxMonths: 12, nisaPriority: true, cashAnchors: [{ age: 35, amountMan: 800 }] },
    rr: 4.5, inflationRate: 1.2, macroSlideRate: -0.9,
    dcReturnRate: 3.5, cashInterestRate: 0.2,
    careerHistory: [
      { id: 1, startAge: 22, endAge: 35, pensionScheme: "employee", label: "A社", retirementBonusMan: 300 },
      { id: 2, startAge: 35, endAge: 37, pensionScheme: "national", label: "起業" },
      { id: 3, startAge: 37, endAge: 65, pensionScheme: "employee", label: "B社", avgAnnualSalaryMan: 800, retirementBonusMan: 1500 },
    ],
    returnRateKF: [{ age: 30, value: 5 }, { age: 60, value: 3 }],
    retirementLivingExpenseMan: 25,
    livingExpenseRules: { enabled: true, childIndependenceAge: 22, reductionPerChildPct: 10, selfDeathReductionPct: 70, spouseDeathReductionPct: 80 },
    marriageAge: 28,
    nhsSettings: {
      medEqualAmount: 20000, medPerCapita: 30000, medIncomeRate: 7.5, medCap: 650000,
      supportEqualAmount: 8000, supportPerCapita: 10000, supportIncomeRate: 2.5, supportCap: 240000,
      careEqualAmount: 6000, carePerCapita: 12000, careIncomeRate: 2.0, careCap: 170000,
    },
    protectionSettings: { funeralCostMan: 200, emergencyReserveMan: 300, survivorLivingRatio: 70, deathRetirementBonusMan: 500, afterDeathRentEnabled: true, afterDeathRentMonthlyMan: 8, afterDeathRentEndAge: 0 },
  };
}

/** Linked scenario: self dies at 48 with danshin, plus relocation to rent. */
export function linkedDeathScenario(): Scenario {
  return {
    id: 1, name: "B", currentAge: 30, retirementAge: 65, simEndAge: 90, currentAssetsMan: 0,
    incomeKF: [], expenseKF: [], dcTotalKF: [{ age: 30, value: 30000 }], companyDCKF: [], idecoKF: [],
    salaryGrowthRate: 0,
    events: [
      { id: 100, age: 48, type: "death", label: "死亡", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, target: "self",
        deathParams: { expenseReductionPct: 70, hasDanshin: true, survivorPensionManPerYear: 0, incomeProtectionManPerMonth: 10, incomeProtectionUntilAge: 65 } },
      { id: 101, age: 55, type: "relocation", label: "住み替え", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
        relocationParams: { movingCostMan: 50, newHousingType: "rent", newRentAnnualMan: 96, newRentDurationYears: 30 } },
    ],
    excludedBaseEventIds: [8], disabledBaseEventIds: [13],
    linkedToBase: true, overrideTracks: ["dcTotalKF"], overrideSettings: ["rr"],
    spouseOverrideTracks: ["incomeKF"],
    spouse: { enabled: false, currentAge: 29, retirementAge: 60, incomeKF: [{ age: 29, value: 450 }], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 1, sirPct: 15.75, hasFurusato: true },
    years: 35, hasFurusato: false, dependentDeductionHolder: "self",
    pensionStartAge: 65, pensionWorkStartAge: 22,
    dcReceiveMethod: undefined as unknown as Scenario["dcReceiveMethod"],
    rr: 3,
    afterSelfDeathSpouseIncome: { enabled: true, monthlyMan: 25, bonusMan: 60, retirementAge: 62 },
    balancePolicy: { cashReserveMonths: 3, nisaPriority: false },
  };
}

/** Linked scenario: spouse dies, annuity DC receive, own housing timeline (legacy rent/property events). */
export function linkedSpouseDeathScenario(): Scenario {
  return {
    id: 2, name: "C", currentAge: 30, retirementAge: 62, simEndAge: 90, currentAssetsMan: 1200,
    incomeKF: [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [],
    salaryGrowthRate: 0,
    events: [
      { id: 200, age: 52, type: "death", label: "配偶者死亡", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, target: "spouse",
        deathParams: { expenseReductionPct: 80, hasDanshin: false, survivorPensionManPerYear: 0, incomeProtectionManPerMonth: 0, incomeProtectionUntilAge: 0 } },
    ],
    excludedBaseEventIds: [], linkedToBase: true, overrideTracks: [],
    overrideSettings: ["retirementAge", "currentAssetsMan"],
    years: 30, hasFurusato: true, dependentDeductionHolder: "spouse",
    pensionStartAge: 70, pensionWorkStartAge: 22,
    dcReceiveMethod: { type: "annuity", annuityYears: 15, annuityStartAge: 70, combinedLumpSumRatio: 50 },
    nisa: { enabled: true, accounts: 1, annualLimitMan: 240, lifetimeLimitMan: 1800 },
    housingTimeline: [{ startAge: 30, type: "own", propertyParams: property({ saleAge: 70, salePriceMan: 4000, saleIsResidence: true }) }],
  };
}

/** Minimal default-like scenario (what the app creates on first launch). */
export function minimalScenario(): Scenario {
  return {
    id: 0, name: "min", currentAge: 30, retirementAge: 65, simEndAge: 85, currentAssetsMan: 500,
    incomeKF: [{ age: 30, value: 700 }], expenseKF: [{ age: 30, value: 15 }],
    dcTotalKF: [{ age: 30, value: 55000 }], companyDCKF: [{ age: 30, value: 0 }], idecoKF: [{ age: 30, value: 0 }],
    salaryGrowthRate: 2, events: [], excludedBaseEventIds: [],
    housingTimeline: [{ startAge: 30, type: "rent", rentMonthlyMan: 10 }],
    linkedToBase: false, overrideTracks: [], years: 35, hasFurusato: true,
    dependentDeductionHolder: "self", pensionStartAge: 65, pensionWorkStartAge: 22,
    dcReceiveMethod: DEFAULT_DC_RECEIVE_METHOD,
    spouse: { enabled: true, currentAge: 28, retirementAge: 65, incomeKF: [{ age: 28, value: 500 }], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, sirPct: 15.75, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22 },
    nisa: { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800 },
    balancePolicy: { cashReserveMonths: 6, nisaPriority: true },
  };
}

/** Standalone scenario without housingTimeline: legacy rent + relocation(purchase) events, spouse death with NISA. */
export function relocationScenario(): Scenario {
  const s = minimalScenario();
  s.id = 3; s.name = "D";
  s.housingTimeline = undefined;
  s.nisa = { enabled: true, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800 };
  s.balancePolicy = { cashReserveMonths: 6, nisaPriority: true, cashReserveMaxMonths: 9 };
  s.incomeKF = [{ age: 30, value: 900 }];
  s.events = [
    { id: 300, age: 30, type: "rent", label: "家賃", oneTimeCostMan: 0, annualCostMan: 144, durationYears: 10 },
    { id: 301, age: 40, type: "relocation", label: "住み替え", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
      relocationParams: { movingCostMan: 40, newHousingType: "purchase", newPropertyParams: property({ priceMan: 4000, downPaymentMan: 800, loanYears: 30, rateType: "fixed" }) } },
    { id: 302, age: 60, type: "death", label: "配偶者死亡", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, target: "spouse",
      deathParams: { expenseReductionPct: 75, hasDanshin: false, survivorPensionManPerYear: 0, incomeProtectionManPerMonth: 0, incomeProtectionUntilAge: 0 } },
  ];
  return s;
}
