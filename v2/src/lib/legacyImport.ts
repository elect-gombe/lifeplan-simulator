/**
 * 旧アプリ（app/ の "asset-sim-state-v1" 形式）の JSON を新しい Plan に変換する（ベストエフォート）。
 * 旧: scenarios[] に Keyframe 系列・LifeEvent・housingTimeline・spouse・nisa などを持つ。
 */
import { defaultPlan, defaultMember, defaultChild, defaultHousingPhase, defaultProperty, defaultEducation, PLAN_COLORS, newId, STAGE_ORDER, type Plan, type LifeEvent, type HousingPhase, type StageKey } from "@/domain/model";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const kf = (v: unknown) => Array.isArray(v) ? (v as unknown[]).filter(isObj).map(p => ({ age: num(p.age), value: num(p.value) })).sort((a, b) => a.age - b.age) : [];

export function isLegacyState(o: Obj): boolean {
  return Array.isArray(o.scenarios) && !Array.isArray(o.plans);
}

const STAGE_FROM: Record<number, StageKey> = { 0: "nursery", 3: "kinder", 6: "elementary", 12: "middle", 15: "high", 18: "university", 22: "grad" };

export function convertLegacy(o: Obj): Plan[] {
  const scenarios = (o.scenarios as unknown[]).filter(isObj);
  const base = scenarios[0];
  const globalRr = num(o.rr, 4), inflation = num(o.inflationRate, 1.5);
  const out: Plan[] = [];
  scenarios.forEach((s, i) => {
    // リンクされたシナリオはベースの値で欠損を補う
    const g = <T,>(key: string, fallback: T): T => {
      const own = s[key]; if (own != null && !(Array.isArray(own) && own.length === 0)) return own as T;
      if (s.linkedToBase && base && base[key] != null) return base[key] as T;
      return fallback;
    };
    const currentAge = num(g("currentAge", 30));
    const events = (g<unknown[]>("events", []) ?? []).filter(isObj);
    const sp = g<Obj | undefined>("spouse", undefined);
    const spouseEnabled = isObj(sp) && sp.enabled === true;
    const plan = defaultPlan({
      id: newId("plan"), name: String(s.name ?? `プラン${i + 1}`), color: PLAN_COLORS[i % PLAN_COLORS.length],
      endAge: num(g("simEndAge", 90)),
      self: defaultMember({
        name: "本人", age: currentAge, sex: g<string>("selfGender", "male") === "female" ? "female" : "male",
        retireAge: num(g("retirementAge", 65)), workStartAge: num(g("pensionWorkStartAge", 22)), pensionStartAge: num(g("pensionStartAge", 65)),
        income: kf(g("incomeKF", [])).length ? kf(g("incomeKF", [])) : [{ age: currentAge, value: 500 }],
        incomeGrowthPct: num(g("salaryGrowthRate", 1)), furusato: g<unknown>("hasFurusato", false) === true,
        employment: Array.isArray(s.careerHistory) && (s.careerHistory as Obj[]).some(c => c.pensionScheme === "national") ? "selfEmployed" : "employee",
      }),
    });
    // DC: 旧 dcTotalKF = 合計、companyDCKF = 会社拠出 → matching = total − company
    const total = kf(g("dcTotalKF", [])), company = kf(g("companyDCKF", [])), ideco = kf(g("idecoKF", []));
    plan.self.dc.company = company;
    plan.self.dc.matching = total.map(p => ({ age: p.age, value: Math.max(p.value - (company.filter(c => c.age <= p.age).pop()?.value ?? 0), 0) }));
    plan.self.dc.ideco = ideco;
    const rm = g<Obj | undefined>("dcReceiveMethod", undefined);
    if (isObj(rm)) plan.self.dc.receive = { method: rm.type === "annuity" ? "annuity" : rm.type === "combined" ? "mixed" : "lump", startAge: num(rm.annuityStartAge, 65), annuityYears: num(rm.annuityYears, 20), lumpRatioPct: num(rm.combinedLumpSumRatio, 50) };
    if (o.hasRet === true) plan.self.severancePay = Math.round(num(o.retAmt) / 10000);
    // 生活費
    const exp = kf(g("expenseKF", []));
    plan.living.monthly = exp.length ? exp : [{ age: currentAge, value: 15 }];
    if (typeof s.retirementLivingExpenseMan === "number") plan.living.retirementMonthly = s.retirementLivingExpenseMan;
    const ler = s.livingExpenseRules as Obj | undefined;
    if (isObj(ler) && ler.enabled) { plan.living.reductionPerChildPct = num(ler.reductionPerChildPct, 10); plan.living.survivorPct = num(ler.selfDeathReductionPct, 70); plan.childrenCommon.independenceAge = num(ler.childIndependenceAge, 22); }
    plan.assets.cash = num(g("currentAssetsMan", 0));
    // 配偶者
    if (spouseEnabled && sp) {
      plan.spouse = defaultMember({
        name: "配偶者", age: num(sp.currentAge, currentAge), sex: plan.self.sex === "male" ? "female" : "male",
        retireAge: num(sp.retirementAge, 65), workStartAge: num(sp.pensionWorkStartAge, 22) > 100 ? 22 : num(sp.pensionWorkStartAge, 22), pensionStartAge: num(sp.pensionStartAge, 65),
        income: kf(sp.incomeKF).length ? kf(sp.incomeKF) : [{ age: num(sp.currentAge, currentAge), value: 0 }],
        incomeGrowthPct: num(sp.salaryGrowthRate, 1), furusato: sp.hasFurusato === true,
        employment: Array.isArray(sp.careerHistory) && (sp.careerHistory as Obj[]).some(c => c.pensionScheme === "national") ? "selfEmployed" : "employee",
      });
      const st = kf(sp.dcTotalKF), sc = kf(sp.companyDCKF);
      plan.spouse.dc.company = sc; plan.spouse.dc.ideco = kf(sp.idecoKF);
      plan.spouse.dc.matching = st.map(p => ({ age: p.age, value: Math.max(p.value - (sc.filter(c => c.age <= p.age).pop()?.value ?? 0), 0) }));
    }
    // 子供: type=child の親イベント + education サブイベント
    const parents = events.filter(e => e.type === "child" && e.parentId == null);
    parents.forEach((p, ci) => {
      const child = defaultChild(ci, num(p.age, currentAge));
      child.name = String(p.label ?? child.name);
      const subs = events.filter(e => e.parentId === p.id && e.type === "education");
      const edu = defaultEducation("public");
      for (const k of STAGE_ORDER) edu[k].enabled = false;
      for (const sub of subs) {
        const from = num(sub.ageOffset, -1); const key = STAGE_FROM[from];
        if (!key) continue;
        const label = String(sub.label ?? "");
        edu[key] = { enabled: true, kind: sub.isPrivate === true || label.includes("私立") ? "private" : "public", away: label.includes("都内") ? "urban" : label.includes("地方") ? "rural" : (key === "university" || key === "grad" ? "home" : undefined) };
      }
      if (subs.length) child.education = edu;
      const pl = p.parentalLeave as Obj | undefined;
      if (isObj(pl)) { child.leaveMonthsSelf = num((pl.self as Obj | undefined)?.months); child.leaveMonthsSpouse = num((pl.spouse as Obj | undefined)?.months); }
      plan.children.push(child);
      if (ci === 0) { plan.childrenCommon.birthCost = num(p.oneTimeCostMan, 30); plan.childrenCommon.careMonthly = Math.round(num(p.annualCostMan, 36) / 12 * 10) / 10; }
    });
    // 住居
    const ht = g<unknown[]>("housingTimeline", []) ?? [];
    const phases: HousingPhase[] = [];
    for (const h of ht.filter(isObj)) {
      const ph = defaultHousingPhase(num(h.startAge, currentAge), h.type === "own" ? "own" : "rent");
      if (h.type === "rent") ph.rentMonthly = num(h.rentMonthlyMan, 10);
      const pp = h.propertyParams as Obj | undefined;
      if (h.type === "own" && isObj(pp)) {
        ph.property = defaultProperty({
          price: num(pp.priceMan, 5000), downPayment: num(pp.downPaymentMan, 500), loanYears: num(pp.loanYears, 35),
          repayment: pp.repaymentType === "equal_principal" ? "principal" : "annuity",
          rate: pp.rateType === "fixed" ? { kind: "fixed", pct: num(pp.fixedRate, 1.5) } : { kind: "variable", initialPct: num(pp.variableInitRate, 0.6), laterPct: num(pp.variableRiskRate, 1.6), changeAfterYears: num(pp.variableRiseAfter, 10) },
          maintenanceMonthly: num(pp.maintenanceMonthlyMan, 2), propertyTaxAnnual: num(pp.taxAnnualMan, 15),
          deduction: pp.hasLoanDeduction === false ? "none" : pp.certifiedType === "standard" ? "other" : pp.certifiedType === "zeh" ? "zeh" : pp.certifiedType === "advanced" ? "energy" : "certified",
          loanShareSelfPct: pp.loanStructure === "pair" ? num(pp.pairRatio, 50) : 100,
          appreciationPct: num(pp.appreciationRate, -1.5), salePrice: typeof pp.salePriceMan === "number" ? pp.salePriceMan : null,
          prepayments: Array.isArray(pp.prepayments) ? (pp.prepayments as Obj[]).map(x => ({ age: num(x.age), amount: num(x.amountMan), mode: x.type === "reduce" ? "reduce" as const : "shorten" as const })) : [],
          refinance: isObj(pp.refinance) ? { age: num((pp.refinance as Obj).age), pct: num((pp.refinance as Obj).newRate, 1), years: num((pp.refinance as Obj).newLoanYears, 20), cost: num((pp.refinance as Obj).costMan, 50) } : null,
        });
      }
      phases.push(ph);
    }
    if (phases.length) plan.housing = phases;
    // NISA・運用
    const nisa = g<Obj | undefined>("nisa", undefined);
    if (isObj(nisa)) { plan.invest.nisaEnabled = nisa.enabled === true; plan.invest.nisaAnnualCapSelf = num(nisa.annualLimitMan, 360); plan.invest.nisaAnnualCapSpouse = num(nisa.accounts, 1) === 2 ? num(nisa.spouseAnnualLimitMan, num(nisa.annualLimitMan, 360)) : 0; plan.invest.nisaLifetimeCap = num(nisa.lifetimeLimitMan, 1800); }
    const bp = g<Obj | undefined>("balancePolicy", undefined);
    if (isObj(bp)) {
      plan.invest.reserveMonths = num(bp.cashReserveMonths, 6); plan.invest.reserveMaxMonths = num(bp.cashReserveMaxMonths, num(bp.cashReserveMonths, 6) * 2);
      // 旧: ["taxable" | "selfNisa" | "spouseNisa"][]（旧エンジンでは未使用）。先頭が NISA なら NISA 優先に
      const wo = Array.isArray(bp.withdrawalOrder) ? (bp.withdrawalOrder as unknown[])[0] : undefined;
      if (wo === "selfNisa" || wo === "spouseNisa") plan.invest.withdrawalOrder = "nisaFirst";
    }
    const rr = num(g("rr", globalRr), globalRr);
    plan.invest.returns = { nisaPct: num(s.nisaReturnRate, rr), taxablePct: num(s.taxableReturnRate, rr), dcPct: num(s.dcReturnRate, rr), cashPct: num(s.cashInterestRate, 0) };
    plan.economy.inflationPct = num(g("inflationRate", inflation), inflation);
    plan.economy.macroSlidePct = num(g("macroSlideRate", -0.8), -0.8);
    // イベント
    const evs: LifeEvent[] = [];
    for (const e of events) {
      if (e.parentId != null || e.disabled === true) continue;
      const label = String(e.label ?? "");
      const age = num(e.age, currentAge);
      if (e.type === "car" && isObj(e.carParams)) {
        const cp = e.carParams as Obj;
        evs.push({ id: newId("ev"), kind: "car", label: label || "車", enabled: true, startAge: age, endAge: num(cp.endAge, plan.endAge), price: num(cp.priceMan, 300), loanYears: num(cp.loanYears, 0), loanRatePct: num(cp.loanRate, 2), replaceEveryYears: num(cp.replaceEveryYears, 0), runningAnnual: num(cp.maintenanceAnnualMan) + num(cp.insuranceAnnualMan) });
      } else if (e.type === "insurance" && isObj(e.insuranceParams)) {
        const ip = e.insuranceParams as Obj;
        evs.push({ id: newId("ev"), kind: "insurance", label: label || "保険", enabled: true, member: e.target === "spouse" ? "spouse" : "self", type: ip.insuranceType === "income_protection" ? "incomeProtection" : "term", deductionType: "general", startAge: age, endAge: num(ip.coverageEndAge, 65), premiumMonthly: num(ip.premiumMonthlyMan, 0.5), payout: ip.insuranceType === "income_protection" ? num(ip.monthlyPayoutMan, 15) : num(ip.lumpSumPayoutMan, 3000), payoutUntilAge: num(ip.payoutUntilAge, 65) });
      } else if (e.type === "death") {
        evs.push({ id: newId("ev"), kind: "death", label: label || "死亡", enabled: true, member: e.target === "spouse" ? "spouse" : "self", age });
      } else if (e.type === "crash" && isObj(e.marketCrashParams)) {
        const cp = e.marketCrashParams as Obj;
        plan.economy.stressTest = { enabled: true, age, dropPct: num(cp.dropRate, 40), recoveryYears: num(cp.recoveryYears, 3) };
      } else if (e.type === "gift" && isObj(e.giftParams)) {
        // 贈与（あげる側）: 贈与額を一時支出として計上（贈与税の計算は省略）
        evs.push({ id: newId("ev"), kind: "expense", label: label || "贈与", enabled: true, startAge: age, years: 1, every: 1, amount: num((e.giftParams as Obj).amountMan), inflate: false, taxable: false, stopOnSelfDeath: false });
      } else if (e.type === "pension_private" && isObj(e.privatePensionParams)) {
        const pp = e.privatePensionParams as Obj;
        const cm = num(pp.contributionMonthlyMan), cEnd = num(pp.contributionEndAge);
        if (cm > 0 && cEnd > age) evs.push({ id: newId("ev"), kind: "expense", label: `${label || "私的年金"}（掛金）`, enabled: true, startAge: age, years: cEnd - age, every: 1, amount: cm * 12, inflate: false, taxable: false, stopOnSelfDeath: true });
        const ps = num(pp.payoutStartAge, 65), pe = num(pp.payoutEndAge, 0);
        evs.push({ id: newId("ev"), kind: "income", label: `${label || "私的年金"}（受取）`, enabled: true, startAge: ps, years: pe > ps ? pe - ps : plan.endAge - ps + 1, every: 1, amount: num(pp.payoutAnnualMan), inflate: false, taxable: pp.isPublicPensionTaxed === true, stopOnSelfDeath: e.target !== "spouse" });
      } else if (["child", "education", "property", "rent", "relocation"].includes(String(e.type))) {
        continue;
      } else {
        const annual = num(e.annualCostMan), once = num(e.oneTimeCostMan), dur = num(e.durationYears, 0);
        const isIncome = e.incomeType && e.incomeType !== "expense";
        if (once !== 0) evs.push({ id: newId("ev"), kind: once < 0 || isIncome ? "income" : "expense", label: `${label}（一時）`, enabled: true, startAge: age, years: 1, every: 1, amount: Math.abs(once), inflate: true, taxable: false, stopOnSelfDeath: false });
        if (annual !== 0) evs.push({ id: newId("ev"), kind: annual < 0 || isIncome ? "income" : "expense", label, enabled: true, startAge: age, years: dur > 0 ? dur : plan.endAge - age + 1, every: num(e.intervalYears, 1), amount: Math.abs(annual), inflate: true, taxable: isIncome === true && e.incomeType !== "misc", stopOnSelfDeath: false });
      }
    }
    plan.events = evs;
    out.push(plan);
  });
  return out;
}
