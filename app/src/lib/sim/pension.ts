/**
 * Public pension: career-based and simplified estimation, working-pension
 * reduction (在職老齢年金), macro-economic slide, retirement deduction.
 */
import type { Keyframe, CareerPeriod } from "../types";
import { resolveKF } from "../types";
import { estimatePublicPension } from "../tax";
import { WORKING_PENSION_THRESHOLD_UNDER65, WORKING_PENSION_THRESHOLD_OVER65 } from "./constants";
import type { SimConfig, AgeEventInfo } from "./types";
import type { SimState } from "./state";

// ===== Phase 4: Career-based pension calculation =====

/** 退職所得控除額 */
export function calcRetirementDeduction(yearsOfService: number): number {
  const y = Math.max(yearsOfService, 1);
  if (y <= 20) return y * 400000;
  return 8000000 + (y - 20) * 700000;
}

/** 職歴から公的年金を計算（厚生年金+国民年金+共済を統合） */
export function calcPensionFromCareer(
  careerHistory: CareerPeriod[],
  incomeKF: Keyframe[],
  pensionStartAge: number,
  macroSlideFactor: number,
): { income: number; employeeAnnual: number; detail: string } {
  let employeeAndMutualMonths = 0;
  let employeeAndMutualTotalSalary = 0;
  let nationalMonths = 0;

  for (const period of careerHistory) {
    const years = period.endAge - period.startAge;
    if (years <= 0) continue;
    const months = years * 12;
    const midAge = (period.startAge + period.endAge) / 2;
    const avgSalaryMan = period.avgAnnualSalaryMan ?? resolveKF(incomeKF, midAge, 0);
    const avgSalary = avgSalaryMan * 10000;

    if (period.pensionScheme === "national") {
      nationalMonths += months;
    } else {
      // "employee" or "mutual" — 同じ5.481/1000レートで計算
      employeeAndMutualMonths += months;
      employeeAndMutualTotalSalary += avgSalary * years;
    }
  }

  const totalNationalMonths = Math.min(employeeAndMutualMonths + nationalMonths, 480);
  const empYears = employeeAndMutualMonths / 12;
  const avgEmpAnnual = empYears > 0 ? employeeAndMutualTotalSalary / empYears : 0;

  const pe = estimatePublicPension(avgEmpAnnual, employeeAndMutualMonths, totalNationalMonths, pensionStartAge);

  const adjusted = Math.round(pe.totalAnnual * macroSlideFactor);
  const adjEmployee = Math.round(pe.employeeAnnual * pe.adjustmentFactor * macroSlideFactor);

  // detail拡張: 国民年金期間を表示
  let detail = pe.detail;
  if (nationalMonths > 0) {
    detail += ` + 国民${Math.round(nationalMonths / 12)}年`;
  }

  return { income: adjusted, employeeAnnual: adjEmployee, detail };
}

// ===== phasePension: Compute public pension income and self working pension reduction =====
export interface PensionResult {
  selfPensionIncome: number;
  selfPensionEmployeeAnnual: number;
  spousePensionIncome: number;
  spousePensionEmployeeAnnual: number;
  selfPensionReduction: number;
}

export function calcPublicPensionForMember(
  isDead: boolean, currentAge: number, startAge: number, workStartAge: number,
  retAge: number, cumSalary: number, years: number,
  pensionSlideFactor: number,
  careerHistory?: CareerPeriod[],
  incomeKF?: Keyframe[],
): { income: number; employeeAnnual: number; detail: string } {
  if (isDead || currentAge < startAge) return { income: 0, employeeAnnual: 0, detail: "" };
  // Phase 4: 職歴が設定されている場合はcareer-basedの計算を使用
  if (careerHistory && careerHistory.length > 0 && incomeKF) {
    return calcPensionFromCareer(careerHistory, incomeKF, startAge, pensionSlideFactor);
  }
  const avg = years > 0 ? cumSalary / years : 0;
  const empMonths = Math.max(Math.min(retAge, 65) - workStartAge, 0) * 12;
  const natMonths = Math.min((65 - 20) * 12, 480);
  const pe = estimatePublicPension(avg, empMonths, natMonths, startAge);
  // マクロ経済スライド適用: 受給開始からの累積調整
  const adjusted = Math.round(pe.totalAnnual * pensionSlideFactor);
  const adjEmployee = Math.round(pe.employeeAnnual * pe.adjustmentFactor * pensionSlideFactor);
  return { income: adjusted, employeeAnnual: adjEmployee, detail: pe.detail };
}

export function applyWorkingPensionReduction(pensionEmployeeAnnual: number, grossIncome: number, age: number): number {
  if (pensionEmployeeAnnual <= 0 || grossIncome <= 0) return 0;
  // Phase 12: 在職老齢年金 — 60-64歳は低在老(28万)、65歳以降は高在老(47万)
  const threshold = age < 65 ? WORKING_PENSION_THRESHOLD_UNDER65 : WORKING_PENSION_THRESHOLD_OVER65;
  const basicMonthly = pensionEmployeeAnnual / 12;
  const salaryMonthly = grossIncome / 12;
  if (basicMonthly + salaryMonthly > threshold) {
    const monthlyReduction = (basicMonthly + salaryMonthly - threshold) / 2;
    return Math.min(monthlyReduction * 12, pensionEmployeeAnnual);
  }
  return 0;
}

/** マクロ経済スライド累積係数を計算
 *  毎年の改定率 = max(0, 物価上昇率 + マクロスライド調整率) — 名目下限ルール
 *  インフレ率が一定の場合、yearsReceiving年後の累積係数 = (1 + adjRate)^yearsReceiving */
export function pensionMacroSlideFactor(yearsReceiving: number, inflationPct: number, macroSlidePct: number): number {
  if (yearsReceiving <= 0) return 1;
  const annualAdj = Math.max(0, inflationPct / 100 + macroSlidePct / 100);
  return Math.pow(1 + annualAdj, yearsReceiving);
}

export function phasePension(
  age: number, selfGross: number, state: SimState, config: SimConfig, ageInfo: AgeEventInfo,
): PensionResult {
  const { isSelfDead, isSpouseDead, spouseAge } = ageInfo;
  const { spouse, selfRetirementAge, effectivePensionStartAge, effectivePensionWorkStartAge, effectiveInflation, macroSlideRate } = config;

  const selfStartAge = effectivePensionStartAge ?? 65;
  const selfSlideFactor = pensionMacroSlideFactor(age - selfStartAge, effectiveInflation, macroSlideRate);
  const selfPen = calcPublicPensionForMember(
    isSelfDead, age, selfStartAge, effectivePensionWorkStartAge ?? 22,
    selfRetirementAge, state.cumulativeSalary, state.salaryYears, selfSlideFactor,
    config.careerHistory, config.incomeKF,
  );

  const spStartAge = spouse?.pensionStartAge ?? 65;
  const spSlideFactor = pensionMacroSlideFactor(spouseAge - spStartAge, effectiveInflation, macroSlideRate);
  // Phase 14: 配偶者の第3号被保険者期間を考慮
  // 本人の結婚年齢から配偶者の年齢差を計算し、配偶者が結婚した年齢を推定
  const spouseEffWorkStartAge = (() => {
    const spWorkStart = spouse?.pensionWorkStartAge ?? 22;
    if (!config.marriageAge || !spouse || config.spouseCareerHistory?.length) return spWorkStart;
    // 配偶者の結婚時年齢 = 本人結婚年齢 + 年齢差（配偶者現在年齢 - 本人現在年齢）
    const ageDiff = spouse.currentAge - config.currentAge;
    const spouseMarriageAge = config.marriageAge + ageDiff;
    // 第3号期間: 結婚〜就労開始（被扶養配偶者として国民年金算入）
    // 実質的な加入開始年齢 = min(就労開始年齢, 婚姻年齢, 20)
    return Math.min(spWorkStart, Math.max(spouseMarriageAge, 20));
  })();
  const spPen = spouse
    ? calcPublicPensionForMember(
        isSpouseDead, spouseAge, spStartAge, spouseEffWorkStartAge,
        spouse.retirementAge ?? 65, state.spouseCumulativeSalary, state.spouseSalaryYears, spSlideFactor,
        config.spouseCareerHistory, spouse.incomeKF,
      )
    : { income: 0, employeeAnnual: 0, detail: "" };

  // Self working pension reduction
  const selfReduction = applyWorkingPensionReduction(selfPen.employeeAnnual, selfGross, age);

  return {
    selfPensionIncome: selfPen.income - selfReduction,
    selfPensionEmployeeAnnual: selfPen.employeeAnnual,
    spousePensionIncome: spPen.income,
    spousePensionEmployeeAnnual: spPen.employeeAnnual,
    selfPensionReduction: selfReduction,
  };
}
