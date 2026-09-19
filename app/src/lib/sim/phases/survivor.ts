/** 遺族年金・収入保障の計算（死亡者の給与履歴 → 遺族給付、併給調整・マクロスライド適用）。 */
import type { LifeEvent, DeathParams } from "../../types";
import { isEventActive, resolveEventAge, resolveKF } from "../../types";
import { calcSurvivorPension } from "../../survivor";
import type { SimConfig, AgeEventInfo, YearContext } from "../types";
import type { SimState } from "../state";
import { pensionMacroSlideFactor } from "../pension";

export interface SurvivorResult {
  survivorIncome: number;            // 遺族年金+収入保障 合計（手取りに加算）
  survivorBasicPension: number;
  survivorEmployeePension: number;
  survivorWidowSupplement: number;
  survivorIncomeProtection: number;
}

interface DeceasedProfile {
  avgSalary: number;
  contribYears: number;
}

/** 本人の平均給与・加入年数。職歴があれば厚生/共済期間のみで再計算（国民年金期間は除外）。 */
function selfDeceasedProfile(state: SimState, config: SimConfig): DeceasedProfile {
  let avgSalary = state.salaryYears > 0 ? state.cumulativeSalary / state.salaryYears : config.defaultGrossMan * 10000;
  let contribYears = state.salaryYears;
  if (config.careerHistory?.length) {
    let totalSalary = 0, totalYears = 0;
    for (const p of config.careerHistory) {
      if (p.pensionScheme === "national") continue;
      const yrs = p.endAge - p.startAge;
      if (yrs <= 0) continue;
      const sal = p.avgAnnualSalaryMan ? p.avgAnnualSalaryMan * 10000 : resolveKF(config.incomeKF, (p.startAge + p.endAge) / 2, 0) * 10000;
      totalSalary += sal * yrs;
      totalYears += yrs;
    }
    if (totalYears > 0) { avgSalary = totalSalary / totalYears; contribYears = totalYears; }
  }
  return { avgSalary, contribYears };
}

export function phaseSurvivor(
  ctx: YearContext, config: SimConfig, ageInfo: AgeEventInfo, state: SimState,
  selfPensionEmployeeAnnual: number, spousePensionEmployeeAnnual: number,
): SurvivorResult {
  const { age, events, isEffDisabled } = ctx;
  const { isDead, isSpouseDead, dp, selfDeathEvent, spouseDeathEvent } = ageInfo;
  const { spouse, selfGender, currentAge, baseCalendarYear, effectiveInflation, macroSlideRate } = config;

  const out: SurvivorResult = {
    survivorIncome: 0, survivorBasicPension: 0, survivorEmployeePension: 0,
    survivorWidowSupplement: 0, survivorIncomeProtection: 0,
  };

  const addForDeath = (
    deceased: DeceasedProfile,
    survivorCurrentAge: number, survivorIsFemale: boolean,
    survivorOwnEmployeePension: number,
    deathEvt: LifeEvent, deathP: DeathParams,
  ) => {
    if (deceased.avgSalary <= 0 && deceased.contribYears <= 0) return;
    const childAges = events
      .filter(e => e.type === "child" && isEventActive(e, age, events))
      .map(ce => age - resolveEventAge(ce, events));
    const deathAge = resolveEventAge(deathEvt, events);
    const deathCalYear = baseCalendarYear + (deathAge - currentAge);
    const pc = calcSurvivorPension(deceased.avgSalary, deceased.contribYears, childAges, survivorCurrentAge, survivorIsFemale, deathCalYear);

    // マクロ経済スライド: 遺族年金にも死亡時からの累積調整を適用
    const slide = pensionMacroSlideFactor(age - deathAge, effectiveInflation, macroSlideRate);

    // 65歳以降の併給調整: 遺族厚生年金は遺族自身の老齢厚生年金との差額のみ
    let adjEmployee = Math.round(pc.employee * slide);
    if (survivorOwnEmployeePension > 0) {
      const optionB = Math.round(adjEmployee / 3 * 4 / 2) + Math.round(survivorOwnEmployeePension / 2);
      adjEmployee = Math.max(Math.max(adjEmployee, optionB) - survivorOwnEmployeePension, 0);
    }
    const adjBasic = Math.round(pc.basic * slide);
    const adjWidow = Math.round(pc.widowSupplement * slide);
    out.survivorBasicPension += adjBasic;
    out.survivorEmployeePension += adjEmployee;
    out.survivorWidowSupplement += adjWidow;
    out.survivorIncome += adjBasic + adjEmployee + adjWidow;

    // 収入保障: deathParams経由の給付。同一target向けのincome_protection保険イベントがあれば二重計上防止
    if (deathP.incomeProtectionManPerMonth > 0 && age < deathP.incomeProtectionUntilAge) {
      const deathTarget = deathEvt.target || "self";
      const hasInsEvt = events.some(e =>
        e.insuranceParams?.insuranceType === "income_protection" &&
        (e.target || "self") === deathTarget && !isEffDisabled(e));
      if (!hasInsEvt) {
        const amt = deathP.incomeProtectionManPerMonth * 12 * 10000;
        out.survivorIncome += amt;
        out.survivorIncomeProtection += amt;
      }
    }
  };

  if (isDead && dp) {
    const survivorAge = spouse ? spouse.currentAge + (age - currentAge) : age;
    addForDeath(selfDeceasedProfile(state, config), survivorAge, selfGender === "male", spousePensionEmployeeAnnual, selfDeathEvent!, dp);
  }
  if (isSpouseDead && spouseDeathEvent?.deathParams) {
    const avgSpSalary = state.spouseSalaryYears > 0 ? state.spouseCumulativeSalary / state.spouseSalaryYears : 0;
    addForDeath({ avgSalary: avgSpSalary, contribYears: state.spouseSalaryYears }, age, selfGender === "female", selfPensionEmployeeAnnual, spouseDeathEvent, spouseDeathEvent.deathParams);
  }
  return out;
}
