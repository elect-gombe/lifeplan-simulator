/** Yearly cost breakdown for car events (purchase/loan, maintenance, insurance). */
import type { CarParams, EventYearCost } from "../types";
import { calcMonthlyPaymentEqual } from "../mortgage";

// Compute yearly costs from a car event
export function computeCarYearCost(cp: CarParams, yearsSincePurchase: number, inflationFactor: number = 1): EventYearCost[] {
  const costs: EventYearCost[] = [];
  const isReplacementYear = cp.replaceEveryYears > 0 && yearsSincePurchase > 0 && yearsSincePurchase % cp.replaceEveryYears === 0;

  // Purchase or Loan
  if (cp.loanYears > 0) {
    // ローンあり: 購入費は計上せず、ローン返済のみ
    const yearInCycle = cp.replaceEveryYears > 0 ? yearsSincePurchase % cp.replaceEveryYears : yearsSincePurchase;
    if (yearInCycle < cp.loanYears) {
      const monthly = calcMonthlyPaymentEqual(cp.priceMan * 10000, cp.loanRate, cp.loanYears);
      costs.push({ label: "車ローン", icon: "🚗", color: "#10b981", amount: monthly * 12 });
    }
  } else {
    // 一括購入: 購入年と買い替え年に全額計上
    if (yearsSincePurchase === 0 || isReplacementYear) {
      costs.push({ label: "車両購入", icon: "🚗", color: "#10b981", amount: Math.round(cp.priceMan * 10000 * inflationFactor) });
    }
  }

  // Running costs (inflation applied)
  if (cp.maintenanceAnnualMan > 0) {
    costs.push({ label: "車維持費", icon: "🔧", color: "#10b981", amount: Math.round(cp.maintenanceAnnualMan * 10000 * inflationFactor) });
  }
  if (cp.insuranceAnnualMan > 0) {
    costs.push({ label: "車保険", icon: "🛡️", color: "#10b981", amount: Math.round(cp.insuranceAnnualMan * 10000 * inflationFactor) });
  }

  return costs;
}
