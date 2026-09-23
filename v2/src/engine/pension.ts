/** 公的年金（老齢・遺族）・在職老齢年金・マクロ経済スライド。単位: 円。 */
import * as C from "./constants";

export interface PensionEstimate {
  basic: number;     // 老齢基礎年金（調整後）
  employee: number;  // 老齢厚生年金（調整後）
  total: number;
  factor: number;    // 繰上げ/繰下げ係数
}

/** 繰上げ/繰下げ係数 */
export function claimFactor(startAge: number): number {
  const a = Math.min(Math.max(startAge, 60), 75);
  if (a < 65) return 1 - C.PENSION_EARLY_RATE_PER_MONTH * (65 - a) * 12;
  return 1 + C.PENSION_DEFER_RATE_PER_MONTH * (a - 65) * 12;
}

/**
 * 老齢年金の見込額。
 * @param avgAnnualSalary 厚生年金加入期間の平均年収（円、上限で頭打ち）
 * @param employeeMonths 厚生年金加入月数
 * @param nationalMonths 国民年金の納付月数（厚生年金期間含む、最大480）
 */
export function estimateOldAgePension(avgAnnualSalary: number, employeeMonths: number, nationalMonths: number, startAge: number): PensionEstimate {
  const factor = claimFactor(startAge);
  const basic = Math.round(C.BASIC_PENSION_FULL * Math.min(nationalMonths, C.BASIC_PENSION_MONTHS) / C.BASIC_PENSION_MONTHS * factor);
  const avgMonthly = Math.min(avgAnnualSalary / 12, C.PENSION_STANDARD_MONTHLY_CAP + C.PENSION_BONUS_CAP_ANNUAL / 12);
  const employee = Math.round(avgMonthly * C.EMPLOYEE_PENSION_MULTIPLIER * employeeMonths * factor);
  return { basic, employee, total: basic + employee, factor };
}

/** 在職老齢年金による支給停止額（年額）。厚生年金部分のみ対象。 */
export function workingPensionReduction(employeePensionAnnual: number, salaryAnnual: number): number {
  if (employeePensionAnnual <= 0 || salaryAnnual <= 0) return 0;
  const monthlyTotal = employeePensionAnnual / 12 + salaryAnnual / 12;
  if (monthlyTotal <= C.WORKING_PENSION_THRESHOLD_MONTHLY) return 0;
  const cut = (monthlyTotal - C.WORKING_PENSION_THRESHOLD_MONTHLY) / 2;
  return Math.min(Math.round(cut * 12), employeePensionAnnual);
}

/** マクロ経済スライド: 受給開始後 years 年での累積改定係数（名目下限あり） */
export function macroSlideFactor(years: number, inflationPct: number, macroSlidePct: number): number {
  if (years <= 0) return 1;
  const adj = Math.max(0, (inflationPct + macroSlidePct) / 100);
  return Math.pow(1 + adj, years);
}

export interface SurvivorPension { basic: number; employee: number; widow: number; total: number }

/**
 * 遺族年金（配偶者が受給）。
 * @param deceasedAvgSalary 死亡者の平均年収（円）
 * @param deceasedEmployeeMonths 死亡者の厚生年金加入月数（300月みなし）
 * @param childAges 子の年齢（18歳到達年度末までが対象 ≒ <19）
 * @param survivorAge 遺族の年齢
 * @param survivorIsWife 遺族が妻か（中高齢寡婦加算）
 * @param deathYear 死亡暦年（寡婦加算の逓減判定）
 * @param survivorOwnEmployeePension 遺族自身の老齢厚生年金（65歳以降の併給調整）
 */
export function survivorPension(
  deceasedAvgSalary: number, deceasedEmployeeMonths: number, childAges: number[],
  survivorAge: number, survivorIsWife: boolean, deathYear: number, survivorOwnEmployeePension = 0,
): SurvivorPension {
  const kids = childAges.filter(a => a >= 0 && a < 19).length;
  let basic = 0;
  if (kids > 0 && survivorAge < 65) {
    basic = C.SURVIVOR_BASIC;
    for (let i = 0; i < kids; i++) basic += i < 2 ? C.SURVIVOR_CHILD_ADD_1_2 : C.SURVIVOR_CHILD_ADD_3;
  }
  let employee = 0;
  if (deceasedEmployeeMonths > 0) {
    const avgMonthly = Math.min(deceasedAvgSalary / 12, C.PENSION_STANDARD_MONTHLY_CAP + C.PENSION_BONUS_CAP_ANNUAL / 12);
    const months = Math.max(deceasedEmployeeMonths, C.SURVIVOR_MIN_MONTHS);
    employee = Math.round(avgMonthly * C.EMPLOYEE_PENSION_MULTIPLIER * months * 3 / 4);
    if (survivorAge >= 65 && survivorOwnEmployeePension > 0) {
      // 65歳以降: 自身の老齢厚生年金を優先し、差額のみ遺族厚生年金
      const alt = Math.round(employee * 2 / 3) + Math.round(survivorOwnEmployeePension / 2);
      employee = Math.max(Math.max(employee, alt) - survivorOwnEmployeePension, 0);
    }
  }
  let widow = 0;
  if (survivorIsWife && employee > 0 && kids === 0 && survivorAge >= 40 && survivorAge < 65) {
    let taper = 1;
    if (deathYear >= C.WIDOW_SUPPLEMENT_PHASEOUT_START) {
      const elapsed = deathYear - C.WIDOW_SUPPLEMENT_PHASEOUT_START + 1;
      taper = Math.max(26 - elapsed, 0) / 26;
    }
    widow = Math.round(C.WIDOW_SUPPLEMENT * taper);
  }
  return { basic, employee, widow, total: basic + employee + widow };
}
