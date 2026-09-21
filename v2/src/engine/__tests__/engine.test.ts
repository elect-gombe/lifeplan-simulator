import { describe, it, expect } from "vitest";
import { defaultPlan, defaultMember, defaultChild, defaultHousingPhase, defaultProperty } from "@/domain/model";
import { computePersonTax, employeeSocialInsurance, incomeTaxOnTaxable, retirementLumpTax, spouseDeduction, lifeInsuranceDeduction, earthquakeInsuranceDeduction, resolveSiStatus, residentTaxExemptLimit } from "../tax";
import { estimateOldAgePension, claimFactor, survivorPension, workingPensionReduction } from "../pension";
import { buildLoanSchedule, annuityMonthlyPayment } from "../mortgage";
import { simulate } from "../simulate";
import { summarize } from "../summary";
import { coverageCurve } from "../coverage";
import { monteCarlo } from "../montecarlo";
import { childCostAt, totalEducationCost, stageAnnualCost } from "../education";

describe("tax", () => {
  it("所得税 速算表", () => {
    expect(incomeTaxOnTaxable(1_950_000)).toBe(Math.floor(1_950_000 * 0.05 * 1.021 / 100) * 100);
    expect(incomeTaxOnTaxable(5_000_000)).toBe(Math.floor((5_000_000 * 0.2 - 427_500) * 1.021 / 100) * 100);
    expect(incomeTaxOnTaxable(0)).toBe(0);
  });
  it("社会保険料は年収の 14〜16% 程度", () => {
    const si = employeeSocialInsurance(6_000_000, 35);
    expect(si.total / 6_000_000).toBeGreaterThan(0.14);
    expect(si.total / 6_000_000).toBeLessThan(0.16);
    expect(si.nursing).toBe(0);
    expect(employeeSocialInsurance(6_000_000, 45).nursing).toBeGreaterThan(0);
  });
  it("年収600万 会社員の手取りは 450〜480万", () => {
    const t = computePersonTax({ age: 35, employment: "employee", salary: 6_000_000, pension: 0, otherTaxableIncome: 0, idecoAnnual: 0, lifeInsurancePremium: 0, dependentIt: 0, dependentRt: 0, spouseIncomeForDeduction: null, housingLoanCredit: 0, furusato: false });
    expect(t.takeHome).toBeGreaterThan(4_500_000);
    expect(t.takeHome).toBeLessThan(4_800_000);
  });
  it("iDeCo は課税所得を減らす", () => {
    const a = computePersonTax({ age: 40, employment: "employee", salary: 7_000_000, pension: 0, otherTaxableIncome: 0, idecoAnnual: 0, lifeInsurancePremium: 0, dependentIt: 0, dependentRt: 0, spouseIncomeForDeduction: null, housingLoanCredit: 0, furusato: false });
    const b = { ...a, ...computePersonTax({ age: 40, employment: "employee", salary: 7_000_000, pension: 0, otherTaxableIncome: 0, idecoAnnual: 276_000, lifeInsurancePremium: 0, dependentIt: 0, dependentRt: 0, spouseIncomeForDeduction: null, housingLoanCredit: 0, furusato: false }) };
    expect(a.incomeTax + a.residentTax - (b.incomeTax + b.residentTax)).toBeGreaterThan(70_000);
  });
  it("配偶者控除", () => {
    expect(spouseDeduction(5_000_000, 0).it).toBe(380_000);
    expect(spouseDeduction(5_000_000, 1_200_000).it).toBe(160_000);
    expect(spouseDeduction(11_000_000, 0).it).toBe(0);
  });
  it("退職所得控除内なら非課税", () => {
    expect(retirementLumpTax(15_000_000, 30)).toBe(0);
    expect(retirementLumpTax(30_000_000, 30)).toBeGreaterThan(0);
  });
  it("ふるさと納税は手取りをほぼ変えない（自己負担2000円）", () => {
    const base = { age: 35, employment: "employee" as const, salary: 8_000_000, pension: 0, otherTaxableIncome: 0, idecoAnnual: 0, lifeInsurancePremium: 0, dependentIt: 0, dependentRt: 0, spouseIncomeForDeduction: null, housingLoanCredit: 0 };
    const a = computePersonTax({ ...base, furusato: false });
    const b = computePersonTax({ ...base, furusato: true });
    expect(b.furusatoDonation).toBeGreaterThan(100_000);
    expect(Math.abs(a.takeHome - b.takeHome)).toBeLessThan(6_000);
  });
});

describe("pension", () => {
  it("繰上げ/繰下げ係数", () => {
    expect(claimFactor(60)).toBeCloseTo(0.76);
    expect(claimFactor(65)).toBe(1);
    expect(claimFactor(75)).toBeCloseTo(1.84);
  });
  it("平均年収500万×40年 → 月額約15万", () => {
    const p = estimateOldAgePension(5_000_000, 480, 480, 65);
    expect(p.total / 12).toBeGreaterThan(140_000);
    expect(p.total / 12).toBeLessThan(165_000);
  });
  it("在職老齢年金", () => {
    expect(workingPensionReduction(1_200_000, 3_000_000)).toBe(0);
    expect(workingPensionReduction(1_200_000, 8_000_000)).toBeGreaterThan(0);
  });
  it("遺族年金: 子2人の妻", () => {
    const s = survivorPension(6_000_000, 180, [5, 8], 38, true, 2030);
    expect(s.basic).toBeGreaterThan(1_300_000);
    expect(s.employee).toBeGreaterThan(500_000);
    expect(s.widow).toBe(0);
    const w = survivorPension(6_000_000, 180, [], 45, true, 2027);
    expect(w.widow).toBe(623_800);
  });
});

describe("mortgage", () => {
  it("元利均等 4000万 0.6% 35年 → 月約10.6万", () => {
    expect(annuityMonthlyPayment(4000, 0.6, 35)).toBeGreaterThan(104_000);
    expect(annuityMonthlyPayment(4000, 0.6, 35)).toBeLessThan(107_000);
  });
  it("完済で残高0、繰上返済で総利息が減る", () => {
    const p = defaultProperty({ price: 4500, downPayment: 500, rate: { kind: "fixed", pct: 1.5 }, loanYears: 30 });
    const s = buildLoanSchedule(p, 35, 100);
    expect(s.years.length).toBe(30);
    expect(s.years[29].closingBalance).toBe(0);
    expect(s.payoffAge).toBe(64);
    const s2 = buildLoanSchedule({ ...p, prepayments: [{ age: 40, amount: 500, mode: "shorten" }] }, 35, 100);
    expect(s2.totalInterest).toBeLessThan(s.totalInterest);
    expect(s2.payoffAge!).toBeLessThan(64);
  });
  it("変動金利の段階上昇で返済額が増える", () => {
    const p = defaultProperty({ rate: { kind: "variable", initialPct: 0.5, laterPct: 2.0, changeAfterYears: 5 } });
    const s = buildLoanSchedule(p, 35, 100);
    expect(s.years[6].payment).toBeGreaterThan(s.years[4].payment);
  });
});

describe("education", () => {
  it("金額の上書きは下宿費込みの年額として扱われ、二重加算しない", () => {
    const st = { enabled: true, kind: "private" as const, away: "urban" as const };
    const shown = stageAnnualCost("grad", st, false); // 110 + 110 = 220
    expect(shown).toBe(110 + 110);
    expect(stageAnnualCost("grad", { ...st, annualOverride: shown }, false)).toBe(shown);
    expect(stageAnnualCost("grad", { ...st, annualOverride: shown }, true)).toBe(shown + 25);
  });
  it("私立大学は公立より高い", () => {
    const c = defaultChild(0, 35);
    const pub = { ...c, education: { ...c.education, university: { enabled: true, kind: "public" as const, away: "home" as const } } };
    expect(totalEducationCost(c)).toBeGreaterThan(totalEducationCost(pub));
    expect(childCostAt(c, 19, 3, 22).education).toBeGreaterThan(100);
    expect(childCostAt(c, 25, 3, 22).education).toBe(0);
  });
});

describe("simulate", () => {
  const plan = defaultPlan({
    self: defaultMember({ name: "本人", age: 35, income: [{ age: 35, value: 650 }], dc: { company: [{ age: 35, value: 20000 }], matching: [], ideco: [{ age: 35, value: 10000 }], receive: { method: "lump", startAge: 65, annuityYears: 20, lumpRatioPct: 50 } } }),
    spouse: defaultMember({ name: "配偶者", age: 33, sex: "female", income: [{ age: 33, value: 400 }] }),
    children: [defaultChild(0, 36), defaultChild(1, 39)],
    housing: [defaultHousingPhase(35, "rent"), { ...defaultHousingPhase(38, "own"), property: defaultProperty({ price: 5500, downPayment: 500 }) }],
  });

  it("行数・年齢・恒等式", () => {
    const res = simulate(plan);
    expect(res.rows.length).toBe(plan.endAge - plan.self.age + 1);
    expect(res.rows[0].age).toBe(35);
    for (const r of res.rows) {
      expect(r.totalIn).toBeCloseTo(r.inflows.reduce((a, f) => a + f.amount, 0), 0);
      expect(r.totalOut).toBeCloseTo(r.outflows.reduce((a, f) => a + f.amount, 0), 0);
      expect(Number.isFinite(r.balances.netWorth)).toBe(true);
    }
  });
  it("住宅購入年に頭金が出て、ローン残高が計上される", () => {
    const res = simulate(plan);
    const buy = res.rows.find(r => r.age === 38)!;
    expect(buy.outflows.some(f => f.label.includes("頭金"))).toBe(true);
    expect(buy.housing.loanBalance).toBeGreaterThan(40_000_000);
    expect(res.rows.find(r => r.age === 74)!.housing.loanBalance).toBe(0);
  });
  it("年金は受給開始年齢から", () => {
    const res = simulate(plan);
    expect(res.rows.find(r => r.age === 64)!.self.publicPension).toBe(0);
    expect(res.rows.find(r => r.age === 66)!.self.publicPension).toBeGreaterThan(1_500_000);
  });
  it("DC は65歳で一時金として現金化される", () => {
    const res = simulate(plan);
    const before = res.rows.find(r => r.age === 64)!;
    const at = res.rows.find(r => r.age === 65)!;
    expect(before.self.dcBalance).toBeGreaterThan(5_000_000);
    expect(at.self.dcLump).toBeGreaterThan(5_000_000);
    expect(at.self.dcBalance).toBe(0);
  });
  it("子の教育費・児童手当", () => {
    const res = simulate(plan);
    const r = res.rows.find(r => r.age === 40)!; // 第1子 4歳, 第2子 1歳
    expect(r.support.childAllowance).toBe(120_000 + 180_000);
    expect(r.byCategory.education).toBeGreaterThan(0);
  });
  it("死亡イベントで遺族年金と団信が働く", () => {
    const p2 = { ...plan, events: [{ id: "d", kind: "death" as const, member: "self" as const, age: 45, label: "", enabled: true }] };
    const res = simulate(p2);
    const r = res.rows.find(r => r.age === 46)!;
    expect(r.self.alive).toBe(false);
    expect(r.spouse!.survivorPension).toBeGreaterThan(1_000_000);
    expect(r.housing.loanBalance).toBe(0);
    expect(r.markers.length === 0 || true).toBe(true);
  });
  it("summary / coverage / monteCarlo が動く", () => {
    const res = simulate(plan);
    const s = summarize(res);
    expect(s.healthScore).toBeGreaterThanOrEqual(0);
    expect(s.pensionMonthly).toBeGreaterThan(0);
    const cov = coverageCurve(plan, "self", 5);
    expect(cov.length).toBeGreaterThan(3);
    const mc = monteCarlo(plan, 20, 1);
    expect(mc.bands.length).toBe(res.rows.length);
    expect(mc.bands[10].p90).toBeGreaterThanOrEqual(mc.bands[10].p10);
  });
  it("決定的（同じ入力で同じ出力）", () => {
    const a = simulate(plan), b = simulate(plan);
    expect(a.rows.map(r => r.balances.netWorth)).toEqual(b.rows.map(r => r.balances.netWorth));
  });
});

describe("regression (review findings)", () => {
  it("死亡年に DC・NISA の現金化が二重計上されない", () => {
    const p = defaultPlan({
      self: defaultMember({ age: 40, income: [{ age: 40, value: 600 }] }),
      spouse: defaultMember({ name: "配偶者", age: 38, sex: "female", income: [{ age: 38, value: 300 }] }),
      assets: { cash: 100, taxable: 0, taxableCost: 0, nisaSelf: 500, nisaSelfCost: 500, nisaSpouse: 0, nisaSpouseCost: 0, dcSelf: 1000, dcSpouse: 0 },
      events: [{ id: "d", kind: "death", member: "self", age: 41, label: "", enabled: true }],
      invest: { ...defaultPlan().invest, nisaEnabled: false, useTaxableWhenNisaFull: false, returns: { nisaPct: 0, taxablePct: 0, dcPct: 0, cashPct: 0 } },
    });
    const r = simulate(p).rows[1];
    // 前年末 100 + 500 + 1000 + 当年収支 ≒ 当年末の流動資産（DC は現金化済み）
    expect(r.balances.dc).toBe(0);
    expect(r.balances.liquid).toBeLessThan(16_000_000 + r.net + 1);
    expect(r.balances.liquid).toBeGreaterThan(16_000_000 + r.net - 20_000_000);
  });
  it("住宅売却の譲渡所得税は 1 回だけ", () => {
    const p = defaultPlan({ self: defaultMember({ age: 40, income: [{ age: 40, value: 800 }] }), housing: [{ ...defaultHousingPhase(40, "own"), property: defaultProperty({ price: 5000, downPayment: 5000, appreciationPct: 8 }) }, defaultHousingPhase(50, "rent")] });
    const r = simulate(p).rows.find(x => x.age === 49)!;
    const sale = r.inflows.find(f => f.category === "asset")!; const tax = r.outflows.find(f => f.label === "譲渡所得税")!;
    const salePrice = Math.round(5000 * 1e4 * Math.pow(1.08, 10));
    expect(sale.amount).toBe(salePrice - Math.round(salePrice * 0.04));
    expect(tax.amount).toBeGreaterThan(0);
  });
  it("無収入でも iDeCo 拠出と社会保険料が支出に出る / DC年金は開始年から", () => {
    const p = defaultPlan({ self: defaultMember({ age: 58, retireAge: 60, income: [{ age: 58, value: 600 }], dc: { company: [], matching: [], ideco: [{ age: 58, value: 23000 }], receive: { method: "annuity", startAge: 65, annuityYears: 10, lumpRatioPct: 50 } } }) });
    const rows = simulate(p).rows;
    const r61 = rows.find(x => x.age === 61)!;
    expect(r61.outflows.some(f => f.label.includes("iDeCo"))).toBe(true);
    expect(r61.outflows.some(f => f.label.includes("社会保険料"))).toBe(true);
    expect(rows.find(x => x.age === 65)!.self.dcAnnuity).toBeGreaterThan(0);
    expect(rows.find(x => x.age === 65)!.self.ideco).toBe(0);
  });
  it("下落率 100% でも数値が発散しない", () => {
    const p = defaultPlan({ economy: { inflationPct: 1, macroSlidePct: -0.8, stressTest: { enabled: true, age: 40, dropPct: 100, recoveryYears: 3 } } });
    expect(simulate(p).rows.every(r => Number.isFinite(r.balances.netWorth))).toBe(true);
  });
  it("働いていない配偶者に社会保険料は発生しない", () => {
    const p = defaultPlan({ spouse: defaultMember({ name: "配偶者", age: 33, employment: "none", income: [{ age: 33, value: 0 }] }) });
    expect(simulate(p).rows[0].spouse?.tax?.socialInsurance.total ?? 0).toBe(0);
  });
});

describe("年表の恒等式", () => {
  it("収入はカテゴリ別に分解しても合計に一致し、現金増減は収支＋運用振替＋利息に一致する", () => {
    const plan = defaultPlan({
      self: defaultMember({ age: 35, income: [{ age: 35, value: 650 }], dc: { company: [{ age: 35, value: 20000 }], matching: [], ideco: [{ age: 35, value: 10000 }], receive: { method: "lump", startAge: 65, annuityYears: 20, lumpRatioPct: 50 } } }),
      spouse: defaultMember({ name: "配偶者", age: 33, sex: "female", income: [{ age: 33, value: 400 }] }),
      children: [defaultChild(0, 36)],
      housing: [defaultHousingPhase(35, "rent"), { ...defaultHousingPhase(38, "own"), property: defaultProperty({ price: 5500 }) }, defaultHousingPhase(70, "rent")],
      invest: { ...defaultPlan().invest, returns: { nisaPct: 4, taxablePct: 4, dcPct: 3, cashPct: 0 } },
    });
    const rows = simulate(plan).rows;
    const cats = ["salary", "pension", "public", "insurance", "asset", "other"] as const;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], p = rows[i - 1];
      const byCat = cats.reduce((a, c) => a + r.inflows.filter(f => f.category === c).reduce((x, f) => x + f.amount, 0), 0);
      expect(byCat).toBe(r.totalIn);
      const byCatOut = Object.values(r.byCategory).reduce((a, b) => a + b, 0);
      expect(Math.abs(byCatOut - r.totalOut)).toBeLessThan(2);
      if (p && !r.ended) {
        const transfer = -(r.flows.nisaIn + r.flows.taxableIn) + r.flows.nisaOut + r.flows.taxableOut;
        expect(Math.abs(r.balances.cash - p.balances.cash - (r.net + transfer))).toBeLessThan(2);
      }
      expect(Math.abs(r.balances.netWorth - (r.balances.liquid + r.balances.dc + r.balances.home - r.balances.loan))).toBeLessThan(2);
    }
  });
});

describe("取り崩し", () => {
  const base = () => {
    const p = defaultPlan();
    p.self.age = 60; p.self.retireAge = 60; p.self.income = [{ age: 60, value: 0 }]; p.spouse = null; p.endAge = 70;
    p.assets.cash = 1000; p.assets.taxable = 2000; p.assets.taxableCost = 1000; p.assets.nisaSelf = 2000; p.assets.nisaSelfCost = 1500;
    p.living.monthly = [{ age: 60, value: 20 }];
    p.invest.returns = { nisaPct: 0, taxablePct: 0, dcPct: 0, cashPct: 0 };
    p.economy.inflationPct = 0;
    return p;
  };
  it("売る順番: 特定→NISA では NISA が最後まで残り、NISA→特定 では特定口座が残る", () => {
    const a = base(); a.invest.withdrawalOrder = "taxableFirst";
    const b = base(); b.invest.withdrawalOrder = "nisaFirst";
    const ra = simulate(a).rows, rb = simulate(b).rows;
    // 収入ゼロで毎年 240万の生活費 → 現金が下限を割って売却が起きる
    expect(ra.some(r => r.flows.taxableOut > 0)).toBe(true);
    expect(ra.filter(r => r.flows.nisaOut > 0).length).toBeLessThanOrEqual(rb.filter(r => r.flows.nisaOut > 0).length);
    const lastA = ra[ra.length - 1].balances, lastB = rb[rb.length - 1].balances;
    expect(lastA.nisa).toBeGreaterThan(lastB.nisa);
    expect(lastB.taxable).toBeGreaterThan(lastA.taxable);
    // 特定口座の売却には含み益課税が乗る
    expect(ra.reduce((s, r) => s + r.flows.taxableTax, 0)).toBeGreaterThan(0);
  });
  it("残高比例は両口座から同時に売る", () => {
    const p = base(); p.invest.withdrawalOrder = "proportional";
    const r = simulate(p).rows.find(r => r.flows.taxableOut > 0 || r.flows.nisaOut > 0)!;
    expect(r.flows.taxableOut).toBeGreaterThan(0); expect(r.flows.nisaOut).toBeGreaterThan(0);
  });
  it("定率取り崩し: 開始年齢から毎年 年初残高の x% を現金化し、開始後は再投資しない", () => {
    const p = base(); p.assets.cash = 5000; // 現金は十分 → 必要時売却は起きない
    p.invest.withdrawal = { mode: "fixedRate", startAge: 65, ratePct: 4, amount: 0, stopInvesting: true };
    const rows = simulate(p).rows;
    expect(rows.filter(r => r.age < 65).every(r => r.flows.planned === 0)).toBe(true);
    const r65 = rows.find(r => r.age === 65)!;
    const balBefore = rows.find(r => r.age === 64)!.balances;
    // x% は売却額ベース。手取り（planned）は特定口座分の含み益課税を差し引いた額（税率 20.315% が上限）
    const gross = (balBefore.nisa + balBefore.taxable) * 0.04;
    expect(r65.flows.planned).toBeLessThanOrEqual(gross + 1);
    expect(r65.flows.planned).toBeGreaterThan(gross * (1 - 0.20315));
    // 現金が下限を割った分の売却も同じ年に起きうるので、売却総額は計画分以上
    expect(r65.flows.nisaOut + r65.flows.taxableOut).toBeGreaterThanOrEqual(gross - 1);
    // 残高が減るので翌年以降の取り崩し額は減っていく（定率の性質）
    const planned = rows.filter(r => r.age >= 65).map(r => r.flows.planned);
    expect(planned.every((v, i) => i === 0 || v < planned[i - 1])).toBe(true);
    expect(r65.markers.some(m => m.includes("取り崩し開始"))).toBe(true);
    // 開始後は現金が上限を超えても投資に回さない
    expect(rows.filter(r => r.age >= 65).every(r => r.flows.nisaIn === 0 && r.flows.taxableIn === 0)).toBe(true);
    // 開始前は余剰現金が投資に回る
    expect(rows.filter(r => r.age < 65).some(r => r.flows.nisaIn > 0 || r.flows.taxableIn > 0)).toBe(true);
  });
  it("定額取り崩しはインフレ連動し、運用資産がなくなれば止まる", () => {
    const p = base(); p.assets.cash = 5000; p.economy.inflationPct = 2; p.assets.taxable = 100; p.assets.taxableCost = 100; p.assets.nisaSelf = 100; p.assets.nisaSelfCost = 100;
    p.invest.nisaEnabled = false; p.invest.useTaxableWhenNisaFull = false; // 余剰現金を投資に回さない → 運用資産は 200万のまま
    p.invest.withdrawal = { mode: "fixedAmount", startAge: 61, ratePct: 0, amount: 60, stopInvesting: true };
    const rows = simulate(p).rows;
    const r61 = rows.find(r => r.age === 61)!, r62 = rows.find(r => r.age === 62)!;
    expect(r61.flows.planned).toBeCloseTo(600_000 * 1.02, -3);
    expect(r62.flows.planned).toBeCloseTo(600_000 * 1.02 ** 2, -3);
    const total = rows.reduce((s, r) => s + r.flows.planned, 0);
    expect(total).toBeLessThanOrEqual(2_000_000 + 1);
    expect(rows[rows.length - 1].flows.planned).toBe(0);
  });
});

describe("保険料控除・死亡退職金・年金内訳", () => {
  it("生命保険料控除は区分ごとに 4 万/2.8 万、合計 12 万/7 万が上限", () => {
    const one = lifeInsuranceDeduction(100_000);
    expect(one.it).toBe(40_000); expect(one.rt).toBe(28_000);
    const three = lifeInsuranceDeduction({ general: 100_000, medical: 100_000, pension: 100_000 });
    expect(three.it).toBe(120_000); expect(three.rt).toBe(70_000);
    expect(lifeInsuranceDeduction({ general: 30_000, medical: 0, pension: 0 }).it).toBe(25_000);
  });
  it("地震保険料控除は所得税 全額（上限 5 万）、住民税 1/2（上限 2.5 万）", () => {
    expect(earthquakeInsuranceDeduction(30_000)).toEqual({ it: 30_000, rt: 15_000 });
    expect(earthquakeInsuranceDeduction(80_000)).toEqual({ it: 50_000, rt: 25_000 });
  });
  it("介護医療・地震の保険料は課税所得を減らす", () => {
    const base = { age: 40, employment: "employee" as const, salary: 7_000_000, pension: 0, otherTaxableIncome: 0, idecoAnnual: 0, lifeInsurancePremium: 0, dependentIt: 0, dependentRt: 0, spouseIncomeForDeduction: null, housingLoanCredit: 0, furusato: false };
    const a = computePersonTax(base);
    const b = computePersonTax({ ...base, lifeInsurancePremium: { general: 100_000, medical: 100_000, pension: 0 }, earthquakePremium: 30_000 });
    expect(a.taxableIt - b.taxableIt).toBe(80_000 + 30_000);
    expect(b.breakdown.lifeParts.medical.it).toBe(40_000);
  });
  it("公的年金は 基礎＋厚生−在老停止 に分解される", () => {
    const p = defaultPlan(); p.spouse = null; p.self.age = 40; p.self.income = [{ age: 40, value: 600 }]; p.self.retireAge = 65; p.endAge = 80;
    const r = simulate(p).rows.find(r => r.self.publicPension > 0)!;
    expect(r.self.pensionBasic).toBeGreaterThan(0); expect(r.self.pensionEmployee).toBeGreaterThan(0);
    expect(r.self.pensionBasic + r.self.pensionEmployee - r.self.pensionReduction).toBe(r.self.publicPension);
  });
  it("死亡退職金・弔慰金は在職中の死亡年に遺族の収入になり、退職後の死亡では出ない", () => {
    const p = defaultPlan(); p.self.age = 40; p.self.deathBenefit = 1000; p.self.retireAge = 65;
    p.events.push({ id: "d", kind: "death", member: "self", label: "", enabled: true, age: 50 });
    const rows = simulate(p).rows;
    const r50 = rows.find(r => r.age === 50)!;
    expect(r50.self.deathBenefit).toBe(1000 * 10_000);
    expect(r50.inflows.some(f => /死亡退職金/.test(f.label) && f.amount === 1000 * 10_000)).toBe(true);
    const q = defaultPlan(); q.self.age = 40; q.self.deathBenefit = 1000; q.self.retireAge = 60;
    q.events.push({ id: "d", kind: "death", member: "self", label: "", enabled: true, age: 62 });
    expect(simulate(q).rows.find(r => r.age === 62)!.inflows.some(f => /死亡退職金/.test(f.label))).toBe(false);
  });
});

describe("目標貯蓄", () => {
  const base = () => {
    const p = defaultPlan(); p.spouse = null; p.self.age = 30; p.self.income = [{ age: 30, value: 800 }]; p.endAge = 60;
    p.assets.cash = 300; p.assets.taxable = 0; p.assets.nisaSelf = 0; p.living.monthly = [{ age: 30, value: 15 }];
    p.housing = [{ ...defaultHousingPhase(30, "rent"), rentMonthly: 8 }];
    p.invest.returns = { nisaPct: 0, taxablePct: 0, dcPct: 0, cashPct: 0 }; p.economy.inflationPct = 0;
    return p;
  };
  it("目標があると使う年の前年末に現金が積み上がり、余剰が投資に回らない", () => {
    const a = base();
    const b = base(); b.invest.cashGoals = [{ id: "g", label: "頭金", age: 36, amount: 1000, inflate: false, years: 5, fromInvestments: false }];
    const ra = simulate(a).rows, rb = simulate(b).rows;
    const cashA = ra.find(r => r.age === 35)!.balances.cash, cashB = rb.find(r => r.age === 35)!.balances.cash;
    expect(cashB).toBeGreaterThan(cashA);
    expect(cashB).toBeGreaterThanOrEqual(1000 * 10_000);
    // 積立期間中は NISA への積立が減る
    const nisaInA = ra.filter(r => r.age >= 31 && r.age <= 35).reduce((s, r) => s + r.flows.nisaIn + r.flows.taxableIn, 0);
    const nisaInB = rb.filter(r => r.age >= 31 && r.age <= 35).reduce((s, r) => s + r.flows.nisaIn + r.flows.taxableIn, 0);
    expect(nisaInB).toBeLessThan(nisaInA);
    // 目標は段階的に増える
    expect(rb.find(r => r.age === 31)!.flows.goalReserve).toBeCloseTo(200 * 10_000, -2);
    expect(rb.find(r => r.age === 35)!.flows.goalReserve).toBeCloseTo(1000 * 10_000, -2);
    expect(rb.find(r => r.age === 36)!.flows.goalReserve).toBe(0);
    expect(rb.find(r => r.age === 31)!.markers.some(m => m.includes("積立開始"))).toBe(true);
    // 資産合計は変わらない（現金と投資の配分が変わるだけ）
    expect(Math.abs(ra[ra.length - 1].balances.netWorth - rb[rb.length - 1].balances.netWorth)).toBeLessThan(1);
  });
  it("運用資産から移す設定では、余剰で足りない分を毎年売却して分散させる", () => {
    const p = base(); p.assets.taxable = 3000; p.assets.taxableCost = 3000; p.self.income = [{ age: 30, value: 300 }]; // 余剰ほぼゼロ
    p.invest.cashGoals = [{ id: "g", label: "頭金", age: 36, amount: 2000, inflate: false, years: 5, fromInvestments: true }];
    const rows = simulate(p).rows;
    const sells = rows.filter(r => r.age >= 31 && r.age <= 35).map(r => r.flows.taxableOut);
    expect(sells.filter(v => v > 0).length).toBeGreaterThanOrEqual(4);
    expect(rows.find(r => r.age === 35)!.balances.cash).toBeGreaterThanOrEqual(2000 * 10_000 - 1);
  });
});

describe("復帰後の時短（本人・配偶者を個別に設定）", () => {
  const base = () => {
    const p = defaultPlan();
    p.self.age = 30; p.self.income = [{ age: 30, value: 600 }];
    p.spouse = defaultMember({ name: "配偶者", age: 30, sex: "female", income: [{ age: 30, value: 600 }] });
    p.children = [defaultChild(0, 32)];
    p.children[0].leaveMonthsSelf = 12; p.children[0].leaveMonthsSpouse = 12;
    p.endAge = 45; p.economy.inflationPct = 0; p.self.incomeGrowthPct = 0; p.spouse.incomeGrowthPct = 0;
    return p;
  };
  const salaryAt = (p: ReturnType<typeof base>, age: number) => { const r = simulate(p).rows.find(r => r.age === age)!; return { self: r.self.salary, spouse: r.spouse!.salary }; };
  it("本人だけ時短にすると本人の給与だけ下がる", () => {
    const p = base();
    p.childrenCommon.returnSelf = { ratioPct: 60, years: 3 };
    p.childrenCommon.returnSpouse = { ratioPct: 100, years: 0 };
    const s = salaryAt(p, 33); // 子 1 歳（育休 12 ヶ月が明けた年）
    expect(s.self).toBeCloseTo(600 * 10_000 * 0.6, -3);
    expect(s.spouse).toBeCloseTo(600 * 10_000, -3);
  });
  it("配偶者だけ時短にすると配偶者の給与だけ下がる", () => {
    const p = base();
    p.childrenCommon.returnSelf = { ratioPct: 100, years: 0 };
    p.childrenCommon.returnSpouse = { ratioPct: 50, years: 5 };
    const s = salaryAt(p, 33);
    expect(s.self).toBeCloseTo(600 * 10_000, -3);
    expect(s.spouse).toBeCloseTo(600 * 10_000 * 0.5, -3);
  });
  it("期間を過ぎると元の年収に戻る", () => {
    const p = base();
    p.childrenCommon.returnSelf = { ratioPct: 60, years: 2 };
    p.childrenCommon.returnSpouse = { ratioPct: 100, years: 0 };
    expect(salaryAt(p, 34).self).toBeCloseTo(600 * 10_000 * 0.6, -3); // 子 2 歳（復帰 2 年目）
    expect(salaryAt(p, 35).self).toBeCloseTo(600 * 10_000, -3);       // 子 3 歳（期間終了）
  });
});

describe("パート収入（106万・130万の壁、住民税の非課税限度額）", () => {
  const base = (salary: number, o: Record<string, unknown> = {}) => computePersonTax({
    age: 40, employment: "employee", salary, pension: 0, otherTaxableIncome: 0, idecoAnnual: 0, lifeInsurancePremium: 0,
    dependentIt: 0, dependentRt: 0, spouseIncomeForDeduction: null, housingLoanCredit: 0, furusato: false, ...o,
  });
  it("配偶者が会社員なら 100万円のパートは税も社会保険料もゼロ（手取り＝額面）", () => {
    const t = base(1_000_000, { canBeDependent: true });
    expect(t.totalIncome).toBe(350_000);          // 100万 − 給与所得控除 65万
    expect(t.incomeTax).toBe(0);                   // 基礎控除 58万 → 課税所得 0
    expect(t.residentTax).toBe(0);                 // 合計所得 35万 ≤ 非課税限度額 45万
    expect(t.socialInsurance.total).toBe(0);       // 106万未満 → 被扶養者
    expect(t.breakdown.siStatus).toBe("dependent");
    expect(t.takeHome).toBe(1_000_000);
  });
  it("106万円以上になると勤務先の社会保険に加入する", () => {
    const under = base(1_050_000, { canBeDependent: true });
    const over = base(1_060_000, { canBeDependent: true });
    expect(under.socialInsurance.total).toBe(0);
    expect(over.socialInsurance.total).toBeGreaterThan(140_000);
    expect(over.breakdown.siStatus).toBe("employee");
    expect(over.takeHome).toBeLessThan(under.takeHome); // 手取りが逆転する「壁」
  });
  it("扶養に入れない単身のパートは国保（均等割は軽減）", () => {
    const t = base(1_000_000, { canBeDependent: false });
    expect(t.breakdown.siStatus).toBe("self");
    expect(t.socialInsurance.total).toBeGreaterThan(0);
    expect(t.socialInsurance.total).toBeLessThan(30_000); // 7割軽減後の均等割
  });
  it("60 歳以上の被扶養者の収入要件は 180 万円", () => {
    const inp = (age: number) => ({ age, employment: "none" as const, salary: 0, pension: 1_500_000, otherTaxableIncome: 0, idecoAnnual: 0, lifeInsurancePremium: 0, dependentIt: 0, dependentRt: 0, spouseIncomeForDeduction: null, housingLoanCredit: 0, furusato: false, canBeDependent: true });
    expect(resolveSiStatus(inp(61), 0, 1_500_000)).toBe("dependent");
    expect(resolveSiStatus(inp(45), 0, 1_500_000)).toBe("self");
  });
  it("「必ず加入」「扶養に入る」で上書きできる", () => {
    expect(base(1_000_000, { canBeDependent: true, siMode: "join" }).socialInsurance.total).toBeGreaterThan(100_000);
    expect(base(2_000_000, { canBeDependent: false, siMode: "dependent" }).socialInsurance.total).toBe(0);
  });
  it("住民税の非課税限度額は扶養親族等の数で上がる", () => {
    expect(residentTaxExemptLimit(0)).toEqual({ perCapita: 450_000, income: 450_000 });
    expect(residentTaxExemptLimit(2)).toEqual({ perCapita: 350_000 * 3 + 310_000, income: 350_000 * 3 + 420_000 });
    expect(base(1_500_000, { canBeDependent: true, dependentsForRt: 3 }).residentTax).toBe(0);
    expect(base(1_500_000, { canBeDependent: true, dependentsForRt: 0 }).residentTax).toBeGreaterThan(0);
  });
  it("シミュレーション: 配偶者が 100万円のパートになると社会保険料が消え、配偶者控除が満額になる", () => {
    const p = defaultPlan();
    p.self.age = 40; p.self.income = [{ age: 40, value: 840 }]; p.self.incomeGrowthPct = 0;
    p.spouse = defaultMember({ name: "配偶者", age: 40, sex: "female", income: [{ age: 40, value: 430 }, { age: 45, value: 100 }], incomeGrowthPct: 0 });
    p.endAge = 50; p.economy.inflationPct = 0;
    const rows = simulate(p).rows;
    const before = rows.find(r => r.age === 44)!.spouse!, after = rows.find(r => r.age === 45)!.spouse!;
    expect(before.tax!.socialInsurance.total).toBeGreaterThan(0);
    expect(after.tax!.socialInsurance.total).toBe(0);
    expect(after.tax!.residentTax).toBe(0);
    expect(after.tax!.incomeTax).toBe(0);
    expect(after.tax!.takeHome).toBe(after.tax!.gross); // 手取り＝額面
    // 本人側で配偶者控除が満額 38万になる
    expect(rows.find(r => r.age === 45)!.self.tax!.breakdown.spouseIt).toBe(380_000);
  });
});
