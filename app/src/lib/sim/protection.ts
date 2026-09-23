/** Phase 7: 必要保障額の自動算出（死亡年齢ごとの遺族必要保障額）。 */
import type { Scenario, YearResult } from "../types";

export interface ProtectionNeedEntry {
  deathAge: number;
  totalExpense: number;       // 遺族の総支出（死亡年〜simEnd）
  totalIncome: number;        // 遺族の総収入（配偶者給与+遺族年金+老齢年金）
  gap: number;                // 不足額 = 必要保障額
  currentCoverage: number;    // 現在の保険カバー（定期保険一時金+収入保障保険総額）
  shortage: number;           // カバー不足 = gap - currentCoverage - 既存資産
  expenseBreakdown: {
    living: number;      // 遺族生活費（survivorLivingRatio適用後）
    education: number;   // 残り教育費
    housing: number;     // 住居費
    funeral: number;     // 葬儀費用
    other: number;       // その他イベント
  };
  incomeBreakdown: {
    spouseSalary: number;      // 配偶者給与
    survivorPension: number;   // 遺族年金
    oldAgePension: number;     // 老齢年金（配偶者）
    insurance: number;         // 保険給付（保険適用時）
    existingAssets: number;    // 既存資産（死亡時点）
  };
}

export function calcNecessaryProtection(
  yearResults: YearResult[],
  scenario: Scenario,
): ProtectionNeedEntry[] {
  if (yearResults.length === 0) return [];

  const results: ProtectionNeedEntry[] = [];
  const currentAge = scenario.currentAge;
  const simEndAge = scenario.simEndAge;
  const ps = scenario.protectionSettings;
  const survivorLivingRatio = (ps?.survivorLivingRatio ?? 70) / 100;
  const funeralCost = (ps?.funeralCostMan ?? 200) * 10000;
  const emergencyReserve = (ps?.emergencyReserveMan ?? 0) * 10000;
  const deathRetirementBonus = (ps?.deathRetirementBonusMan ?? 0) * 10000;

  // Calculate insurance coverage from events
  const events = scenario.events || [];
  const insuranceEvents = events.filter(e => e.insuranceParams && !e.disabled);

  for (let deathAge = currentAge; deathAge < simEndAge; deathAge++) {
    const deathIdx = deathAge - currentAge;
    if (deathIdx < 0 || deathIdx >= yearResults.length) continue;

    // Expense breakdown accumulation
    let living = 0, education = 0, housing = 0, other = 0;

    for (let a = deathAge; a < simEndAge && (a - currentAge) < yearResults.length; a++) {
      const yr = yearResults[a - currentAge];
      living += yr.baseLivingExpense * survivorLivingRatio;
      for (const ec of yr.eventCostBreakdown) {
        if (ec.amount <= 0) continue; // income items are negative
        if (ec.icon === "🎓") education += ec.amount;
        else if (ec.icon === "🏠") housing += ec.amount;
        else other += ec.amount;
      }
    }

    // After-death rent adjustment
    let afterDeathRentTotal = 0;
    if (ps?.afterDeathRentEnabled && ps.afterDeathRentMonthlyMan) {
      for (let a = deathAge; a < simEndAge && (a - currentAge) < yearResults.length; a++) {
        const yr = yearResults[a - currentAge];
        const endAge = ps.afterDeathRentEndAge && ps.afterDeathRentEndAge > 0 ? ps.afterDeathRentEndAge : 999;
        if (yr.age < endAge) afterDeathRentTotal += ps.afterDeathRentMonthlyMan * 12 * 10000;
      }
      housing += afterDeathRentTotal;
    }

    const funeral = funeralCost + emergencyReserve;
    const totalExpense = living + education + housing + funeral + other;

    // Income breakdown accumulation
    let spouseSalary = 0, survivorPension = 0, oldAgePension = 0, insurance = 0;
    for (let a = deathAge; a < simEndAge && (a - currentAge) < yearResults.length; a++) {
      const yr = yearResults[a - currentAge];
      spouseSalary += yr.spouse.takeHome;
      survivorPension += yr.survivorIncome;
      oldAgePension += yr.spouse.pensionIncome;
      insurance += yr.insurancePayoutTotal;
    }
    const totalIncome = spouseSalary + survivorPension + oldAgePension;

    // Insurance coverage from events (lump sum term life + income protection total)
    let currentCoverage = 0;
    for (const e of insuranceEvents) {
      const ip = e.insuranceParams!;
      if (ip.insuranceType === "term_life") {
        currentCoverage += ip.lumpSumPayoutMan * 10000;
      } else if (ip.insuranceType === "income_protection" && ip.payoutUntilAge > deathAge) {
        currentCoverage += ip.monthlyPayoutMan * 12 * (ip.payoutUntilAge - deathAge) * 10000;
      }
    }

    // Existing assets at death time
    const yrAtDeath = yearResults[deathIdx];
    const existingAssets = yrAtDeath ? yrAtDeath.cumulativeSavings + yrAtDeath.cumulativeDCAsset : 0;

    const gap = Math.max(totalExpense - totalIncome, 0);
    const shortage = Math.max(gap - currentCoverage - existingAssets - deathRetirementBonus, 0);

    results.push({
      deathAge, totalExpense, totalIncome, gap, currentCoverage, shortage,
      expenseBreakdown: { living, education, housing, funeral, other },
      incomeBreakdown: { spouseSalary, survivorPension, oldAgePension, insurance, existingAssets },
    });
  }

  return results;
}
