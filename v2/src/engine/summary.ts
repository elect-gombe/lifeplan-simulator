/** シミュレーション結果の要約 KPI。 */
import type { SimResult, YearRow } from "./simulate";
import { MAN } from "./constants";

export interface Summary {
  finalNetWorth: number;        // 最終年の純資産（円）
  finalLiquid: number;          // 最終年の流動資産
  peakLiquid: { age: number; value: number };
  minLiquid: { age: number; value: number };
  depletionAge: number | null;  // 流動資産がマイナスになる最初の年齢
  retirementLiquid: number | null; // 本人退職時点の流動資産
  retirementNetWorth: number | null;
  pensionMonthly: number | null; // 世帯の公的年金（手取り前、月額）: 受給開始翌年
  lifetime: { income: number; taxAndSi: number; living: number; housing: number; education: number; other: number };
  currentYear: { takeHome: number; out: number; net: number; savingsRate: number };
  healthScore: number;          // 0..100
}

export function summarize(res: SimResult): Summary {
  const rows = res.rows;
  const last = rows[rows.length - 1];
  const first = rows[0];
  const retire = rows.find(r => r.age === res.plan.self.retireAge) ?? null;
  let peak = { age: first.age, value: first.balances.liquid }, min = { age: first.age, value: first.balances.liquid };
  let depletionAge: number | null = null;
  const lifetime = { income: 0, taxAndSi: 0, living: 0, housing: 0, education: 0, other: 0 };
  for (const r of rows) {
    const l = r.balances.liquid;
    if (l > peak.value) peak = { age: r.age, value: l };
    if (l < min.value) min = { age: r.age, value: l };
    if (depletionAge == null && l < 0) depletionAge = r.age;
    lifetime.income += r.totalIn;
    for (const m of [r.self, r.spouse]) if (m?.tax) lifetime.taxAndSi += m.tax.incomeTax + m.tax.residentTax + m.tax.socialInsurance.total;
    lifetime.living += r.byCategory.living;
    lifetime.housing += r.byCategory.housing;
    lifetime.education += r.byCategory.education + r.byCategory.childcare;
    lifetime.other += r.byCategory.other + r.byCategory.car + r.byCategory.insurance + r.byCategory.tax;
  }
  const pensionRow = rows.find(r => r.age === res.plan.self.pensionStartAge + 1) ?? rows.find(r => r.age >= res.plan.self.pensionStartAge);
  const pensionMonthly = pensionRow ? Math.round(((pensionRow.self.publicPension) + (pensionRow.spouse?.publicPension ?? 0)) / 12) : null;
  const takeHome = first.totalIn;
  const healthScore = computeHealth(rows, depletionAge, res.plan.endAge);
  return {
    finalNetWorth: last.balances.netWorth, finalLiquid: last.balances.liquid,
    peakLiquid: peak, minLiquid: min, depletionAge,
    retirementLiquid: retire?.balances.liquid ?? null, retirementNetWorth: retire?.balances.netWorth ?? null,
    pensionMonthly, lifetime,
    currentYear: { takeHome, out: first.totalOut, net: first.net, savingsRate: takeHome > 0 ? first.net / takeHome : 0 },
    healthScore,
  };
}

function computeHealth(rows: YearRow[], depletionAge: number | null, endAge: number): number {
  if (!rows.length) return 0;
  const last = rows[rows.length - 1];
  if (depletionAge != null) {
    // 早く枯渇するほど低スコア
    const span = Math.max(endAge - rows[0].age, 1);
    return Math.round(Math.max(0, 40 * (depletionAge - rows[0].age) / span));
  }
  // 最終流動資産が最終年の年間支出の何年分か（10年分で満点）
  const yearsCovered = last.totalOut > 0 ? last.balances.liquid / last.totalOut : 10;
  return Math.round(Math.min(100, 50 + Math.min(yearsCovered, 10) * 5));
}

export const yen = (v: number) => Math.round(v);
export const man = (v: number) => Math.round(v / MAN);
