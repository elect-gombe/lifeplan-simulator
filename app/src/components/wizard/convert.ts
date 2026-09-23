import type { LifeEvent, Scenario, SpouseConfig } from "../../lib/types";
import { DEFAULT_DC_RECEIVE_METHOD } from "../../lib/types";
import { empDed, iTx, rTx, estimatePublicPension } from "../../lib/tax";
import { mkScenario } from "../../lib/scenarioFactory";
import type { WizardData } from "./types";

export function wizardToScenario(d: WizardData): Scenario {
  const base = mkScenario(0);

  const events: LifeEvent[] = [...d.childEvents, ...d.insuranceEvents, ...d.carEvents];

  const spouseHasIncome = d.spouseIncomeKF.length > 0
    ? (d.spouseIncomeKF[0]?.value ?? 0) > 0
    : d.spouseIncomeMan > 0;
  const spouseIncomeKF = d.spouseIncomeKF.length > 0
    ? d.spouseIncomeKF
    : [{ age: d.currentAge, value: d.spouseIncomeMan }];

  const spouse: SpouseConfig = d.hasSpouse
    ? {
        enabled: true,
        currentAge: d.spouseAge,
        retirementAge: d.spouseRetirementAge,
        incomeKF: spouseIncomeKF,
        expenseKF: [],
        dcTotalKF: d.spouseDcTotalKF,
        companyDCKF: d.spouseCompanyDCKF,
        idecoKF: d.spouseIdecoKF,
        salaryGrowthRate: d.spouseSalaryGrowthRate,
        sirPct: 15,
        hasFurusato: d.spouseHasFurusato,
        pensionStartAge: d.spousePensionStartAge,
        dcReceiveMethod: d.spouseDcReceiveMethod,
        careerHistory: d.spouseCareerHistory?.length ? d.spouseCareerHistory
          : d.spouseIncomeType === "self_employed"
            ? [{ id: 2, startAge: d.spousePensionWorkStartAge, endAge: d.spouseRetirementAge, pensionScheme: "national" as const }]
            : undefined,
        pensionWorkStartAge: spouseHasIncome ? d.spousePensionWorkStartAge : 999,
      }
    : base.spouse!;

  return {
    ...base,
    currentAge: d.currentAge,
    selfGender: d.gender,
    retirementAge: d.retirementAge,
    simEndAge: d.simEndAge,
    incomeKF: d.incomeKF,
    salaryGrowthRate: d.salaryGrowthRate,
    hasFurusato: d.hasFurusato,
    expenseKF: d.expenseKF,
    currentAssetsMan: d.currentAssetsMan,
    pensionStartAge: d.pensionStartAge,
    pensionWorkStartAge: d.pensionWorkStartAge,
    spouse,
    marriageAge: d.marriageAge > 0 ? d.marriageAge : undefined,
    events,
    housingTimeline: d.housingTimeline,
    dcTotalKF: d.dcTotalKF,
    companyDCKF: d.companyDCKF,
    idecoKF: d.idecoKF,
    dcReceiveMethod: d.dcReceiveMethod,
    nisa: {
      enabled: d.nisaEnabled,
      accounts: d.nisaAccounts,
      annualLimitMan: d.nisaAnnualLimitMan,
      lifetimeLimitMan: d.nisaLifetimeLimitMan,
    },
    nisaReturnRate: d.nisaReturnRate,
    dcReturnRate: d.dcReturnRate,
    taxableReturnRate: d.taxableReturnRate,
    cashInterestRate: d.cashInterestRate,
    balancePolicy: d.balancePolicy,
    careerHistory: d.careerHistory?.length ? d.careerHistory
      : d.incomeType === "self_employed"
        ? [{ id: 1, startAge: d.pensionWorkStartAge, endAge: d.retirementAge, pensionScheme: "national" as const }]
        : undefined,
  };
}

export function scenarioToWizardData(s: Scenario): WizardData {
  // Detect income type
  const incomeType: WizardData["incomeType"] =
    s.careerHistory?.some(c => c.pensionScheme === "national") ? "self_employed" : "employee";

  // Expense
  const monthlyExpenseMan = s.expenseKF?.[0]?.value ?? 15;

  // Children: extract all events related to children
  const childEvents = s.events.filter(e =>
    e.type === "child" ||
    (e.parentId && (e.type === "education" || e.type === "custom"))
  );
  const insuranceEvents = s.events.filter(e => e.type === "insurance");
  const carEvents = s.events.filter(e => e.type === "car");

  const spouseIncomeKF = s.spouse?.incomeKF || [];

  return {
    currentAge: s.currentAge,
    gender: s.selfGender ?? "male",
    retirementAge: s.retirementAge,
    simEndAge: s.simEndAge,
    retirementTouched: true,
    simEndTouched: true,
    hasSpouse: s.spouse?.enabled ?? false,
    spouseAge: s.spouse?.currentAge ?? 28,
    spouseRetirementAge: s.spouse?.retirementAge ?? 60,
    spouseIncomeMan: spouseIncomeKF[0]?.value ?? 0,
    spousePensionStartAge: s.spouse?.pensionStartAge ?? 65,
    marriageAge: s.marriageAge ?? 0,
    childEvents,
    incomeKF: s.incomeKF?.length ? s.incomeKF : [{ age: s.currentAge, value: 500 }],
    incomeType,
    salaryGrowthRate: s.salaryGrowthRate ?? 0,
    hasFurusato: s.hasFurusato ?? false,
    pensionWorkStartAge: s.pensionWorkStartAge ?? 22,
    pensionStartAge: s.pensionStartAge ?? 65,
    dcTotalKF: s.dcTotalKF?.length ? s.dcTotalKF : [{ age: s.currentAge, value: 55000 }],
    companyDCKF: s.companyDCKF?.length ? s.companyDCKF : [{ age: s.currentAge, value: 0 }],
    idecoKF: s.idecoKF?.length ? s.idecoKF : [{ age: s.currentAge, value: 0 }],
    dcReceiveMethod: s.dcReceiveMethod ?? DEFAULT_DC_RECEIVE_METHOD,
    careerHistory: s.careerHistory,
    spouseIncomeKF,
    spouseIncomeType: s.spouse?.careerHistory?.some(c => c.pensionScheme === "national") ? "self_employed" : "employee",
    spouseSalaryGrowthRate: s.spouse?.salaryGrowthRate ?? 0,
    spouseHasFurusato: s.spouse?.hasFurusato ?? false,
    spouseDcTotalKF: s.spouse?.dcTotalKF || [],
    spouseCompanyDCKF: s.spouse?.companyDCKF || [],
    spouseIdecoKF: s.spouse?.idecoKF || [],
    spouseDcReceiveMethod: s.spouse?.dcReceiveMethod ?? DEFAULT_DC_RECEIVE_METHOD,
    spousePensionWorkStartAge: s.spouse?.pensionWorkStartAge ?? 22,
    spouseCareerHistory: s.spouse?.careerHistory,
    currentAssetsMan: s.currentAssetsMan,
    expenseKF: s.expenseKF?.length ? s.expenseKF : [{ age: s.currentAge, value: monthlyExpenseMan }],
    housingTimeline: s.housingTimeline?.length ? s.housingTimeline : [{ startAge: s.currentAge, type: "rent" as const, rentMonthlyMan: 10 }],
    insuranceEvents,
    carEvents,
    balancePolicy: s.balancePolicy ?? { cashReserveMonths: 6, nisaPriority: true, withdrawalOrder: ["taxable", "selfNisa", "spouseNisa"] },
    nisaEnabled: s.nisa?.enabled ?? false,
    nisaAccounts: (s.nisa?.accounts ?? 1) as 1 | 2,
    nisaAnnualLimitMan: s.nisa?.annualLimitMan ?? 360,
    nisaLifetimeLimitMan: s.nisa?.lifetimeLimitMan ?? 1800,
    nisaReturnRate: s.nisaReturnRate,
    dcReturnRate: s.dcReturnRate,
    taxableReturnRate: s.taxableReturnRate,
    cashInterestRate: s.cashInterestRate,
  };
}

// ============================================================
// Preview helpers
// ============================================================

// ============================================================
// Preview helpers
// ============================================================

/** Rough annual take-home (万円) for wizard hints: income tax + resident tax + 15% social insurance. */
export function calcTakeHome(incomeMan: number): number {
  const gross = incomeMan * 10000;
  if (gross <= 0) return 0;
  const taxable = gross - empDed(gross);
  return Math.round((gross - iTx(taxable) - rTx(taxable) - gross * 0.15) / 10000);
}

/** Rough public pension estimate (万円/年) assuming continuous 厚生年金 enrolment. */
export function calcPensionEstimate(
  incomeMan: number,
  retirementAge: number,
  pensionWorkStartAge: number,
  pensionStartAge: number,
): number {
  const gross = incomeMan * 10000;
  const employeeMonths = Math.max(0, retirementAge - pensionWorkStartAge) * 12;
  const pen = estimatePublicPension(gross, employeeMonths, employeeMonths, pensionStartAge);
  return Math.round(pen.totalAnnual / 10000);
}
