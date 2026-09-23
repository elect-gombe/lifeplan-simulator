import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "../sim/inheritance";
import { calcRetirementDeduction, applyWorkingPensionReduction, pensionMacroSlideFactor } from "../sim/pension";
import { calcDCReceiveTax } from "../sim/dcReceive";
import { computeCarYearCost } from "../sim/carCosts";
import { applyAfterDeathRule } from "../sim/phases/eventCosts";

describe("inheritance tax", () => {
  it("is zero below the basic deduction", () => {
    // 3000万 + 600万×3人 = 4800万 の基礎控除
    const r = calcInheritanceTax(40_000_000, 0, 0, 3, true);
    expect(r.tax).toBe(0);
    expect(r.taxableEstate).toBe(0);
  });
  it("applies the 500万×heirs exemption to deemed assets", () => {
    const withDC = calcInheritanceTax(50_000_000, 10_000_000, 0, 2, true);
    const noDC = calcInheritanceTax(50_000_000, 0, 0, 2, true);
    // 1000万のDC死亡一時金のうち 500万×2人 が非課税 → 課税価格は +0 ではなく 0 (全額非課税)
    expect(withDC.taxableEstate).toBe(noDC.taxableEstate);
  });
  it("taxes children when there is no surviving spouse", () => {
    const r = calcInheritanceTax(100_000_000, 0, 0, 2, false);
    expect(r.tax).toBeGreaterThan(0);
    expect(r.detail).not.toContain("配偶者軽減");
  });
});

describe("retirement deduction", () => {
  it("uses 40万/年 up to 20 years, then 70万/年", () => {
    expect(calcRetirementDeduction(10)).toBe(4_000_000);
    expect(calcRetirementDeduction(20)).toBe(8_000_000);
    expect(calcRetirementDeduction(30)).toBe(15_000_000);
  });
  it("treats less than one year as one year", () => {
    expect(calcRetirementDeduction(0)).toBe(400_000);
  });
});

describe("working pension reduction (在職老齢年金)", () => {
  it("does nothing when below threshold", () => {
    expect(applyWorkingPensionReduction(1_200_000, 2_000_000, 66)).toBe(0);
  });
  it("halves the excess over the threshold and caps at the pension itself", () => {
    // 年金10万/月 + 給与50万/月 = 60万 > 47万 → 超過13万の半分 6.5万/月
    expect(applyWorkingPensionReduction(1_200_000, 6_000_000, 66)).toBe(780_000);
    expect(applyWorkingPensionReduction(600_000, 60_000_000, 66)).toBe(600_000);
  });
  it("uses the lower threshold under 65", () => {
    const under = applyWorkingPensionReduction(1_200_000, 4_000_000, 62);
    const over = applyWorkingPensionReduction(1_200_000, 4_000_000, 66);
    expect(under).toBeGreaterThan(over);
  });
});

describe("macro slide factor", () => {
  it("is 1 before receiving starts and never below 1 (名目下限)", () => {
    expect(pensionMacroSlideFactor(0, 2, -0.8)).toBe(1);
    expect(pensionMacroSlideFactor(10, 0, -0.8)).toBe(1);
  });
  it("compounds inflation minus slide", () => {
    expect(pensionMacroSlideFactor(2, 2, -0.8)).toBeCloseTo(1.012 ** 2);
  });
});

describe("DC receive tax", () => {
  it("lump sum net equals asset minus tax", () => {
    const r = calcDCReceiveTax(20_000_000, 0, 15_000_000, { type: "lump_sum", annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 });
    expect(r.netAmount).toBe(20_000_000 - r.totalTax);
    expect(r.annuityAnnual).toBe(0);
  });
  it("annuity receives more in total when invested at a positive rate", () => {
    const flat = calcDCReceiveTax(20_000_000, 0, 15_000_000, { type: "annuity", annuityYears: 10, annuityStartAge: 65, combinedLumpSumRatio: 50 }, 0);
    const grown = calcDCReceiveTax(20_000_000, 0, 15_000_000, { type: "annuity", annuityYears: 10, annuityStartAge: 65, combinedLumpSumRatio: 50 }, 3);
    expect(grown.netAmount).toBeGreaterThan(flat.netAmount);
  });
});

describe("car costs", () => {
  const car = { priceMan: 300, loanYears: 0, loanRate: 0, maintenanceAnnualMan: 20, insuranceAnnualMan: 8, replaceEveryYears: 7 };
  it("books the purchase in year 0 and on each replacement", () => {
    expect(computeCarYearCost(car, 0).some(c => c.label === "車両購入")).toBe(true);
    expect(computeCarYearCost(car, 3).some(c => c.label === "車両購入")).toBe(false);
    expect(computeCarYearCost(car, 7).some(c => c.label === "車両購入")).toBe(true);
  });
  it("uses a loan instead of purchase when loanYears > 0", () => {
    const costs = computeCarYearCost({ ...car, loanYears: 5, loanRate: 2 }, 0);
    expect(costs.some(c => c.label === "車ローン")).toBe(true);
    expect(costs.some(c => c.label === "車両購入")).toBe(false);
  });
});

describe("after-death rule", () => {
  it("stops, reduces or continues", () => {
    expect(applyAfterDeathRule(100, { selfDeath: "stop", spouseDeath: "continue" }, true, false)).toBe(0);
    expect(applyAfterDeathRule(100, { selfDeath: "reduce", selfDeathReducePct: 40, spouseDeath: "continue" }, true, false)).toBe(40);
    expect(applyAfterDeathRule(100, { selfDeath: "stop", spouseDeath: "continue" }, false, true)).toBe(100);
    expect(applyAfterDeathRule(100, undefined, true, true)).toBe(100);
  });
});
