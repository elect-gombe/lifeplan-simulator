/** 保存データ → Plan の正規化（欠損フィールドをデフォルトで埋め、型を守る）。 */
import { defaultPlan, defaultMember, defaultProperty, defaultHousingPhase, defaultChild, STAGE_ORDER, type Plan, type Member, type Child, type HousingPhase, type LifeEvent, type LinkGroup, newId, defaultLivingItems } from "@/domain/model";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const sched = (v: unknown, d: { age: number; value: number }[]) =>
  Array.isArray(v) ? (v as unknown[]).filter(isObj).map(p => ({ age: num(p.age, 0), value: num(p.value, 0) })).sort((a, b) => a.age - b.age) : d;

function normMember(v: unknown, d: Member): Member {
  if (!isObj(v)) return d;
  const dc = isObj(v.dc) ? v.dc : {};
  const rec = isObj(dc.receive) ? dc.receive : {};
  return {
    ...d,
    name: str(v.name, d.name), age: num(v.age, d.age), sex: v.sex === "female" ? "female" : "male",
    employment: v.employment === "selfEmployed" || v.employment === "none" ? v.employment : "employee",
    workStartAge: num(v.workStartAge, d.workStartAge), retireAge: num(v.retireAge, d.retireAge),
    income: sched(v.income, d.income), incomeGrowthPct: num(v.incomeGrowthPct, d.incomeGrowthPct),
    pensionStartAge: num(v.pensionStartAge, d.pensionStartAge),
    dc: {
      company: sched(dc.company, []), matching: sched(dc.matching, []), ideco: sched(dc.ideco, []),
      receive: { method: rec.method === "annuity" || rec.method === "mixed" ? rec.method : "lump", startAge: num(rec.startAge, 65), annuityYears: num(rec.annuityYears, 20), lumpRatioPct: num(rec.lumpRatioPct, 50) },
    },
    socialInsurance: v.socialInsurance === "join" || v.socialInsurance === "dependent" ? v.socialInsurance : "auto",
    furusato: bool(v.furusato, d.furusato), severancePay: num(v.severancePay, 0), deathBenefit: num(v.deathBenefit, 0),
  };
}

function normChild(v: unknown, i: number, selfAge: number): Child | null {
  if (!isObj(v)) return null;
  const d = defaultChild(i, num(v.birthAge, selfAge));
  const edu = isObj(v.education) ? v.education : {};
  for (const k of STAGE_ORDER) {
    const s = isObj(edu[k]) ? (edu[k] as Obj) : null;
    if (s) d.education[k] = { enabled: bool(s.enabled, d.education[k].enabled), kind: s.kind === "private" ? "private" : "public", away: s.away === "rural" || s.away === "urban" ? s.away : d.education[k].away, annualOverride: typeof s.annualOverride === "number" ? s.annualOverride : undefined };
  }
  return { ...d, id: str(v.id, d.id), name: str(v.name, d.name), leaveMonthsSelf: num(v.leaveMonthsSelf, 0), leaveMonthsSpouse: num(v.leaveMonthsSpouse, 0) };
}

function normHousing(v: unknown, selfAge: number): HousingPhase | null {
  if (!isObj(v)) return null;
  const d = defaultHousingPhase(num(v.startAge, selfAge), v.kind === "own" ? "own" : "rent");
  const p = isObj(v.property) ? v.property : {};
  const dp = defaultProperty();
  const rate = isObj(p.rate) ? p.rate : {};
  const refi = isObj(p.refinance) ? p.refinance : null;
  return {
    ...d, id: str(v.id, d.id), rentMonthly: num(v.rentMonthly, d.rentMonthly), movingCost: num(v.movingCost, d.movingCost),
    property: {
      ...dp,
      price: num(p.price, dp.price), downPayment: num(p.downPayment, dp.downPayment), closingCostPct: num(p.closingCostPct, dp.closingCostPct),
      loanYears: num(p.loanYears, dp.loanYears), repayment: p.repayment === "principal" ? "principal" : "annuity",
      rate: rate.kind === "fixed" ? { kind: "fixed", pct: num(rate.pct, 1.5) } : { kind: "variable", initialPct: num(rate.initialPct, 0.6), laterPct: num(rate.laterPct, 1.6), changeAfterYears: num(rate.changeAfterYears, 10) },
      prepayments: Array.isArray(p.prepayments) ? (p.prepayments as unknown[]).filter(isObj).map(x => ({ age: num(x.age, 0), amount: num(x.amount, 0), mode: x.mode === "reduce" ? "reduce" as const : "shorten" as const })) : [],
      refinance: refi ? { age: num(refi.age, 0), pct: num(refi.pct, 1), years: num(refi.years, 20), cost: num(refi.cost, 50) } : null,
      maintenanceMonthly: num(p.maintenanceMonthly, dp.maintenanceMonthly), propertyTaxAnnual: num(p.propertyTaxAnnual, dp.propertyTaxAnnual), earthquakePremiumAnnual: num(p.earthquakePremiumAnnual, 0),
      deduction: ["none", "certified", "zeh", "energy", "other", "existing"].includes(String(p.deduction)) ? (p.deduction as Plan["housing"][number]["property"]["deduction"]) : dp.deduction,
      loanShareSelfPct: num(p.loanShareSelfPct, 100), danshin: bool(p.danshin, true), appreciationPct: num(p.appreciationPct, dp.appreciationPct),
      salePrice: typeof p.salePrice === "number" ? p.salePrice : null,
    },
  };
}

function normEvent(v: unknown): LifeEvent | null {
  if (!isObj(v)) return null;
  const base = { id: str(v.id, `ev_${Math.random().toString(36).slice(2)}`), label: str(v.label, ""), enabled: bool(v.enabled, true) };
  switch (v.kind) {
    case "expense": case "income":
      return { ...base, kind: v.kind, startAge: num(v.startAge, 40), years: num(v.years, 1), every: num(v.every, 1), amount: num(v.amount, 0), inflate: bool(v.inflate, true), taxable: bool(v.taxable, false), stopOnSelfDeath: bool(v.stopOnSelfDeath, false) };
    case "car":
      return { ...base, kind: "car", startAge: num(v.startAge, 40), endAge: num(v.endAge, 75), price: num(v.price, 300), loanYears: num(v.loanYears, 0), loanRatePct: num(v.loanRatePct, 2), replaceEveryYears: num(v.replaceEveryYears, 8), runningAnnual: num(v.runningAnnual, 40) };
    case "insurance":
      return { ...base, kind: "insurance", member: v.member === "spouse" ? "spouse" : "self", type: v.type === "incomeProtection" ? "incomeProtection" : "term", deductionType: v.deductionType === "medical" || v.deductionType === "pension" ? v.deductionType : "general", startAge: num(v.startAge, 35), endAge: num(v.endAge, 65), premiumMonthly: num(v.premiumMonthly, 0.5), payout: num(v.payout, 3000), payoutUntilAge: num(v.payoutUntilAge, 65) };
    case "death":
      return { ...base, kind: "death", member: v.member === "spouse" ? "spouse" : "self", age: num(v.age, 50) };
    default: return null;
  }
}

export function normalizePlan(raw: unknown): Plan | null {
  if (!isObj(raw)) return null;
  const d = defaultPlan();
  const self = normMember(raw.self, d.self);
  const spouse = isObj(raw.spouse) ? normMember(raw.spouse, defaultMember({ name: "配偶者", age: self.age, sex: self.sex === "male" ? "female" : "male" })) : null;
  const cc = isObj(raw.childrenCommon) ? raw.childrenCommon : {};
  const liv = isObj(raw.living) ? raw.living : {};
  const as = isObj(raw.assets) ? raw.assets : {};
  const inv = isObj(raw.invest) ? raw.invest : {};
  const ret = isObj(inv.returns) ? inv.returns : {};
  const eco = isObj(raw.economy) ? raw.economy : {};
  const st = isObj(eco.stressTest) ? eco.stressTest : {};
  const housing = Array.isArray(raw.housing) ? (raw.housing as unknown[]).map(h => normHousing(h, self.age)).filter((h): h is HousingPhase => !!h) : d.housing;
  const lk = isObj(raw.link) ? raw.link : null;
  const GROUPS = ["family", "income", "living", "housing", "children", "invest", "events", "risk", "settings"];
  return {
    id: str(raw.id, d.id), name: str(raw.name, d.name), color: str(raw.color, d.color),
    link: lk && typeof lk.baseId === "string" ? { baseId: lk.baseId, overrides: (Array.isArray(lk.overrides) ? (lk.overrides as unknown[]) : []).filter((g): g is LinkGroup => typeof g === "string" && GROUPS.includes(g)) } : null,
    baseYear: num(raw.baseYear, d.baseYear), endAge: num(raw.endAge, d.endAge),
    self, spouse,
    children: Array.isArray(raw.children) ? (raw.children as unknown[]).map((c, i) => normChild(c, i, self.age)).filter((c): c is Child => !!c) : [],
    childrenCommon: (() => {
      // 旧形式: returnRatioPct / returnYears が本人・配偶者の共通設定だった
      const legacy = { ratioPct: num(cc.returnRatioPct, 100), years: num(cc.returnYears, 0) };
      const ret = (v: unknown) => (isObj(v) ? { ratioPct: num(v.ratioPct, legacy.ratioPct), years: num(v.years, legacy.years) } : { ...legacy });
      return { birthCost: num(cc.birthCost, d.childrenCommon.birthCost), careMonthly: num(cc.careMonthly, d.childrenCommon.careMonthly), independenceAge: num(cc.independenceAge, 22), leaveBenefit: bool(cc.leaveBenefit, true), returnSelf: ret(cc.returnSelf), returnSpouse: ret(cc.returnSpouse) };
    })(),
    living: {
      monthly: sched(liv.monthly, d.living.monthly), retirementMonthly: typeof liv.retirementMonthly === "number" ? liv.retirementMonthly : null, reductionPerChildPct: num(liv.reductionPerChildPct, 10), survivorPct: num(liv.survivorPct, 70),
      detailed: bool(liv.detailed, false),
      items: Array.isArray(liv.items) && (liv.items as unknown[]).length ? (liv.items as unknown[]).flatMap(it => isObj(it) ? [{ key: str(it.key, newId("li")), label: str(it.label, "項目"), monthly: num(it.monthly, 0) }] : []) : defaultLivingItems(),
    },
    housing: housing.length ? housing : d.housing,
    assets: { cash: num(as.cash, 0), taxable: num(as.taxable, 0), taxableCost: num(as.taxableCost, num(as.taxable, 0)), nisaSelf: num(as.nisaSelf, 0), nisaSelfCost: num(as.nisaSelfCost, num(as.nisaSelf, 0)), nisaSpouse: num(as.nisaSpouse, 0), nisaSpouseCost: num(as.nisaSpouseCost, num(as.nisaSpouse, 0)), dcSelf: num(as.dcSelf, 0), dcSpouse: num(as.dcSpouse, 0) },
    invest: {
      nisaEnabled: bool(inv.nisaEnabled, true), nisaAnnualCapSelf: num(inv.nisaAnnualCapSelf, 120), nisaAnnualCapSpouse: num(inv.nisaAnnualCapSpouse, 120), nisaLifetimeCap: num(inv.nisaLifetimeCap, 1800),
      reserveMonths: num(inv.reserveMonths, 6), reserveMaxMonths: num(inv.reserveMaxMonths, 12), useTaxableWhenNisaFull: bool(inv.useTaxableWhenNisaFull, true),
      returns: { nisaPct: num(ret.nisaPct, 4), taxablePct: num(ret.taxablePct, 4), dcPct: num(ret.dcPct, 3), cashPct: num(ret.cashPct, 0.2) }, volatilityPct: num(inv.volatilityPct, 12),
      withdrawalOrder: (["taxableFirst", "nisaFirst", "proportional"] as const).find(o => o === inv.withdrawalOrder) ?? "taxableFirst",
      cashGoals: Array.isArray(inv.cashGoals) ? (inv.cashGoals as unknown[]).flatMap(g => isObj(g) ? [{ id: str(g.id, newId("goal")), label: str(g.label, "目標貯蓄"), age: num(g.age, self.age + 5), amount: num(g.amount, 0), inflate: bool(g.inflate, true), years: Math.max(num(g.years, 5), 1), fromInvestments: bool(g.fromInvestments, false) }] : []) : [],
      withdrawal: (() => { const w = isObj(inv.withdrawal) ? inv.withdrawal : {}; return { mode: (["asNeeded", "fixedRate", "fixedAmount"] as const).find(m => m === w.mode) ?? "asNeeded", startAge: num(w.startAge, Math.max(self.retireAge, self.pensionStartAge)), ratePct: num(w.ratePct, 4), amount: num(w.amount, 120), stopInvesting: bool(w.stopInvesting, true) }; })(),
    },
    events: Array.isArray(raw.events) ? (raw.events as unknown[]).map(normEvent).filter((e): e is LifeEvent => !!e) : [],
    economy: { inflationPct: num(eco.inflationPct, 1.5), macroSlidePct: num(eco.macroSlidePct, -0.8), stressTest: { enabled: bool(st.enabled, false), age: num(st.age, 50), dropPct: num(st.dropPct, 40), recoveryYears: num(st.recoveryYears, 4) } },
    funeralCost: num(raw.funeralCost, 200),
  };
}
