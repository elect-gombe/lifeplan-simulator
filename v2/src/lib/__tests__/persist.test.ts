import { describe, it, expect } from "vitest";
import { parseState } from "../persist";
import { normalizePlan } from "../normalize";
import { defaultPlan, defaultChild } from "@/domain/model";
import { simulate } from "@/engine/simulate";

describe("normalizePlan", () => {
  it("完全なプランはそのまま通る", () => {
    const p = defaultPlan({ children: [defaultChild(0, 36)] });
    const n = normalizePlan(JSON.parse(JSON.stringify(p)))!;
    expect(n).toEqual(p);
  });
  it("欠損フィールドはデフォルトで埋まる", () => {
    const n = normalizePlan({ id: "x", self: { age: 40, income: [{ age: 40, value: 700 }] } })!;
    expect(n.self.age).toBe(40);
    expect(n.self.retireAge).toBe(65);
    expect(n.housing.length).toBe(1);
    expect(n.invest.returns.nisaPct).toBe(4);
    expect(() => simulate(n)).not.toThrow();
  });
  it("壊れた入力は null", () => {
    expect(normalizePlan(null)).toBeNull();
    expect(normalizePlan("x")).toBeNull();
  });
});

describe("legacy import (旧 FP計算 形式)", () => {
  const legacy = {
    rr: 4, hasRet: true, retAmt: 15_000_000, PY: 20, sirPct: 15.75, inflationRate: 1.5,
    scenarios: [{
      id: 0, name: "A", selfGender: "male", currentAge: 30, retirementAge: 65, simEndAge: 90, currentAssetsMan: 800,
      incomeKF: [{ age: 30, value: 650 }, { age: 40, value: 850 }], expenseKF: [{ age: 30, value: 18 }],
      dcTotalKF: [{ age: 30, value: 55000 }], companyDCKF: [{ age: 30, value: 20000 }], idecoKF: [],
      salaryGrowthRate: 2, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22,
      dcReceiveMethod: { type: "annuity", annuityYears: 10, annuityStartAge: 65, combinedLumpSumRatio: 50 },
      spouse: { enabled: true, currentAge: 28, retirementAge: 60, incomeKF: [{ age: 28, value: 400 }], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 1, hasFurusato: false },
      nisa: { enabled: true, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800 },
      balancePolicy: { cashReserveMonths: 6, cashReserveMaxMonths: 12, nisaPriority: true },
      housingTimeline: [
        { startAge: 30, type: "rent", rentMonthlyMan: 12 },
        { startAge: 35, type: "own", propertyParams: { priceMan: 5000, downPaymentMan: 500, loanYears: 35, repaymentType: "equal_payment", rateType: "variable", fixedRate: 1.5, variableInitRate: 0.5, variableRiskRate: 1.8, variableRiseAfter: 10, maintenanceMonthlyMan: 2.5, taxAnnualMan: 15, hasLoanDeduction: true, certifiedType: "zeh", loanStructure: "pair", pairRatio: 60, deductionTarget: "both", danshinTarget: "both" } },
      ],
      events: [
        { id: 1, age: 32, type: "child", label: "第1子", oneTimeCostMan: 50, annualCostMan: 50, durationYears: 22, parentalLeave: { spouse: { months: 12, benefit: true } } },
        { id: 11, age: 0, type: "education", label: "私立大学", oneTimeCostMan: 0, annualCostMan: 150, durationYears: 4, parentId: 1, ageOffset: 18, isPrivate: true },
        { id: 12, age: 0, type: "education", label: "公立高校", oneTimeCostMan: 0, annualCostMan: 40, durationYears: 3, parentId: 1, ageOffset: 15 },
        { id: 4, age: 33, type: "car", label: "車", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, carParams: { priceMan: 300, loanYears: 5, loanRate: 2.0, maintenanceAnnualMan: 20, insuranceAnnualMan: 8, replaceEveryYears: 10 } },
        { id: 5, age: 31, type: "insurance", label: "収入保障", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, target: "self", insuranceParams: { insuranceType: "income_protection", premiumMonthlyMan: 0.5, lumpSumPayoutMan: 0, monthlyPayoutMan: 15, payoutUntilAge: 65, coverageEndAge: 65 } },
        { id: 10, age: 40, type: "travel", label: "旅行", oneTimeCostMan: 0, annualCostMan: 30, durationYears: 20, intervalYears: 2 },
        { id: 13, age: 70, type: "nursing", label: "介護", oneTimeCostMan: 100, annualCostMan: 84, durationYears: 6 },
      ],
    }, {
      id: 1, name: "B", linkedToBase: true, overrideTracks: [], events: [], excludedBaseEventIds: [], currentAge: 30, retirementAge: 65, simEndAge: 90, currentAssetsMan: 800,
      incomeKF: [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22, years: 35, dependentDeductionHolder: "self",
    }],
  };
  it("2 シナリオが 2 プランに変換される", () => {
    const st = parseState(legacy)!;
    expect(st.plans.length).toBe(2);
    const a = st.plans[0];
    expect(a.self.age).toBe(30);
    expect(a.self.income[1]).toEqual({ age: 40, value: 850 });
    expect(a.self.dc.company[0].value).toBe(20000);
    expect(a.self.dc.matching[0].value).toBe(35000);
    expect(a.self.dc.receive.method).toBe("annuity");
    expect(a.self.severancePay).toBe(1500);
    expect(a.spouse?.age).toBe(28);
    expect(a.spouse?.retireAge).toBe(60);
    expect(a.children.length).toBe(1);
    expect(a.children[0].birthAge).toBe(32);
    expect(a.children[0].education.university).toMatchObject({ enabled: true, kind: "private" });
    expect(a.children[0].education.high).toMatchObject({ enabled: true, kind: "public" });
    expect(a.children[0].education.elementary.enabled).toBe(false);
    expect(a.children[0].leaveMonthsSpouse).toBe(12);
    expect(a.housing.length).toBe(2);
    expect(a.housing[1].property.loanShareSelfPct).toBe(60);
    expect(a.housing[1].property.deduction).toBe("zeh");
    expect(a.events.filter(e => e.kind === "car").length).toBe(1);
    expect(a.events.filter(e => e.kind === "insurance").length).toBe(1);
    expect(a.events.filter(e => e.kind === "expense").length).toBe(3); // 旅行 + 介護(一時) + 介護(年額)
    expect(a.invest.nisaEnabled).toBe(true);
    expect(() => simulate(a)).not.toThrow();
    // リンクされたシナリオ B はベースの値を継承
    const b = st.plans[1];
    expect(b.self.income[0].value).toBe(650);
    expect(b.housing.length).toBe(2);
  });
  it("新形式は素通し、不正は null", () => {
    const p = defaultPlan();
    const st = parseState({ version: 2, plans: [p], activeId: p.id })!;
    expect(st.plans[0].id).toBe(p.id);
    expect(parseState({})).toBeNull();
    expect(parseState([])).toBeNull();
  });
});

describe("生活費の内訳", () => {
  it("旧データ（内訳なし）は既定の項目で読み込まれ、合計モードのまま", async () => {
    const { normalizePlan } = await import("@/lib/normalize");
    const { defaultPlan, livingItemsTotal } = await import("@/domain/model");
    const p = defaultPlan();
    const raw = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
    delete (raw.living as Record<string, unknown>).items; delete (raw.living as Record<string, unknown>).detailed;
    const n = normalizePlan(raw)!;
    expect(n).not.toBeNull();
    expect(n.living.detailed).toBe(false);
    expect(n.living.items.length).toBeGreaterThan(5);
    expect(livingItemsTotal(n.living.items)).toBe(0);
    expect(n.living.monthly[0].value).toBe(p.living.monthly[0].value);
  });
});

describe("育休・時短の旧形式", () => {
  it("共通の returnRatioPct / returnYears は本人・配偶者の両方に引き継がれる", async () => {
    const { normalizePlan } = await import("@/lib/normalize");
    const { defaultPlan } = await import("@/domain/model");
    const raw = JSON.parse(JSON.stringify(defaultPlan())) as Record<string, unknown>;
    const cc = raw.childrenCommon as Record<string, unknown>;
    delete cc.returnSelf; delete cc.returnSpouse;
    cc.returnRatioPct = 70; cc.returnYears = 3;
    const n = normalizePlan(raw)!;
    expect(n.childrenCommon.returnSelf).toEqual({ ratioPct: 70, years: 3 });
    expect(n.childrenCommon.returnSpouse).toEqual({ ratioPct: 70, years: 3 });
  });
});
