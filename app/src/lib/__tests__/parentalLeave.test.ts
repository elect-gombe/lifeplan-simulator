import { describe, it, expect } from "vitest";
import { computeBase, computeScenario } from "../calc";
import type { LifeEvent, Scenario } from "../types";
import { calcLeaveBenefit, phaseParentalLeave, LEAVE_BENEFIT_CAP_FIRST_MONTHLY } from "../sim/phases/parentalLeave";
import type { MemberLeave } from "../sim/phases/parentalLeave";
import { buildYearContext, phaseAgeEvents } from "../sim/yearContext";
import { resolveSimConfig } from "../sim/config";
import { PARAMS, minimalScenario } from "./fixtures";

function withLeave(months: number, extra: Partial<LifeEvent["parentalLeave"]> = {}): Scenario {
  const s = minimalScenario();
  const child: LifeEvent = {
    id: 900, age: 33, type: "child", label: "第1子", oneTimeCostMan: 50, annualCostMan: 40, durationYears: 22,
    parentalLeave: { self: { months, benefit: true, returnRatio: 100, returnYears: 0 }, ...extra },
  };
  // 年収480万 → 月40万: 給付金 67%=26.8万 / 50%=20万 で上限（31.5万/23.5万）内に収まる
  return { ...s, incomeKF: [{ age: 30, value: 480 }], salaryGrowthRate: 0, events: [...s.events, child] };
}

function leaveAt(s: Scenario, age: number) {
  const config = resolveSimConfig(s, PARAMS, null);
  const ctx = buildYearContext(age, config, config.events);
  return phaseParentalLeave(ctx, phaseAgeEvents(ctx, config));
}

describe("parental leave phase", () => {
  it("splits a 12-month leave into the birth year only", () => {
    const s = withLeave(12);
    expect(leaveAt(s, 33).self).toMatchObject({ leaveMonths: 12, incomeFactor: 0, benefitMonthsFirst: 6, benefitMonthsAfter: 6, protectPension: true });
    expect(leaveAt(s, 34).self).toMatchObject({ leaveMonths: 0, incomeFactor: 1 });
    expect(leaveAt(s, 32).self.leaveMonths).toBe(0);
  });

  it("carries an 18-month leave into the second year and applies return-to-work ratio afterwards", () => {
    const s = withLeave(18, { self: { months: 18, benefit: true, returnRatio: 60, returnYears: 2 } });
    const y0 = leaveAt(s, 33).self, y1 = leaveAt(s, 34).self, y2 = leaveAt(s, 35).self, y3 = leaveAt(s, 36).self;
    expect(y0).toMatchObject({ leaveMonths: 12, benefitMonthsFirst: 6, benefitMonthsAfter: 6 });
    expect(y1.leaveMonths).toBe(6);
    expect(y1.benefitMonthsAfter).toBe(6);
    expect(y1.incomeFactor).toBeCloseTo(0.5 * 0.6, 6); // 6か月勤務 × 60%
    expect(y2.incomeFactor).toBeCloseTo(0.6, 6);       // 復職2年目
    expect(y3.incomeFactor).toBe(1);                   // 復職期間終了
    expect(y2.protectPension).toBe(true);              // 子2歳: みなし対象
    expect(y3.protectPension).toBe(false);
  });

  it("computes spouse leave only when a spouse is enabled", () => {
    const s = withLeave(12, { spouse: { months: 12, benefit: true } });
    expect(leaveAt(s, 33).spouse.leaveMonths).toBe(12);
    const noSpouse: Scenario = { ...s, spouse: { ...s.spouse!, enabled: false } };
    expect(leaveAt(noSpouse, 33).spouse.leaveMonths).toBe(0);
  });

  it("benefit uses 67% then 50% with monthly caps", () => {
    const lv: MemberLeave = { leaveMonths: 12, incomeFactor: 0, benefitMonthsFirst: 6, benefitMonthsAfter: 6, protectPension: true };
    // 年収480万 → 月40万 → 67%=26.8万, 50%=20万 (上限内)
    expect(calcLeaveBenefit(4_800_000, lv)).toBe(Math.round(268_000 * 6 + 200_000 * 6));
    // 年収1200万 → 月100万 → 上限に張り付く
    expect(calcLeaveBenefit(12_000_000, lv)).toBe(Math.round(LEAVE_BENEFIT_CAP_FIRST_MONTHLY * 6 + 235_350 * 6));
    expect(calcLeaveBenefit(0, lv)).toBe(0);
  });
});

describe("parental leave in the full simulation", () => {
  const base = computeBase(PARAMS);
  it("zeroes salary in the leave year, pays a non-taxable benefit, and keeps the pension record", () => {
    const noLeave = computeScenario({ ...withLeave(12), events: withLeave(12).events.map(e => ({ ...e, parentalLeave: undefined })) }, base, PARAMS, null);
    const leave = computeScenario(withLeave(12), base, PARAMS, null);
    const y = leave.yearResults.find(r => r.age === 33)!;
    const y0 = noLeave.yearResults.find(r => r.age === 33)!;
    expect(y.self.gross).toBe(0);
    expect(y.self.incomeTax).toBe(0);
    expect(y.self.socialInsurance).toBe(0);
    expect(y.self.leaveMonths).toBe(12);
    expect(y.parentalLeaveBenefit).toBe(Math.round(268_000 * 6 + 200_000 * 6));
    expect(y.takeHomePay).toBeLessThan(y0.takeHomePay);
    expect(y.takeHomePay).toBeGreaterThan(y0.takeHomePay * 0.6);
    // 翌年は通常どおり
    const n = leave.yearResults.find(r => r.age === 34)!;
    expect(n.self.gross).toBe(4_800_000);
    expect(n.parentalLeaveBenefit).toBe(0);
    // 年金: 従前標準報酬みなしで受給額は変わらない
    const pen = (r: typeof leave) => r.yearResults.find(x => x.age === 70)!.self.pensionIncome;
    expect(pen(leave)).toBeCloseTo(pen(noLeave), 0);
  });
});
