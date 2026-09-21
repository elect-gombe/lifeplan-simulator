/**
 * ライフプラン・シミュレーション本体（年次ループ）。
 * 入力: Plan（万円・%）→ 出力: YearRow[]（円）。純関数。
 */
import type { Plan, Member, LifeEvent, HousingPhase, CarEvent, DeathEvent, CashEvent } from "@/domain/model";
import { resolveSchedule, scheduleSegmentStart } from "@/domain/schedule";
import * as C from "./constants";
import { MAN } from "./constants";
import { computePersonTax, retirementLumpTax, propertySaleTax, dependentDeduction, type PersonTaxResult } from "./tax";
import { estimateOldAgePension, workingPensionReduction, macroSlideFactor, survivorPension } from "./pension";
import { buildLoanSchedule, type LoanSchedule } from "./mortgage";
import { childCostAt, childAllowanceAnnual, highSchoolSupport, tashiWaiver, leaveMonthsInYear, leaveBenefit } from "./education";
import { inheritanceTax } from "./inheritance";

// ─────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────

export type CostCategory = "living" | "housing" | "education" | "childcare" | "insurance" | "car" | "other" | "tax";
export type InflowCategory = "salary" | "pension" | "public" | "insurance" | "asset" | "other";

export interface FlowItem { category: CostCategory | InflowCategory; label: string; amount: number; note?: string; oneOff?: boolean; member?: "self" | "spouse" }

export interface MemberYear {
  age: number;
  alive: boolean;
  working: boolean;
  salary: number;          // 額面（育休減額後、選択制DC拠出前）
  matching: number;        // 選択制DC・マッチング拠出（円/年）
  ideco: number;
  companyDc: number;
  publicPension: number;   // 老齢年金（在老調整後・スライド後）
  pensionBasic: number;    // うち老齢基礎（スライド後）
  pensionEmployee: number; // うち老齢厚生（スライド後・在老調整前）
  pensionReduction: number;
  deathBenefit: number;    // 死亡退職金・弔慰金（死亡年）
  dcAnnuity: number;       // DC年金受取（雑所得）
  otherTaxable: number;
  leaveMonths: number;
  leaveBenefit: number;
  survivorPension: number; // 受け取る遺族年金（非課税）
  tax: PersonTaxResult | null;
  netCash: number;         // 家計に入る現金 = 手取り − iDeCo − 選択制拠出 + 育休給付 + 遺族年金
  dcLump: number; dcLumpTax: number;
  severance: number; severanceTax: number;
  dcBalance: number;
  nisaBalance: number; nisaCost: number;
}

export interface Balances {
  cash: number; taxable: number; taxableCost: number;
  nisa: number; nisaCost: number; dc: number;
  home: number; loan: number;
  liquid: number;    // cash + taxable(税引後) + nisa
  netWorth: number;  // liquid + dc + home − loan
}

export interface YearRow {
  idx: number;
  age: number;
  year: number;
  self: MemberYear;
  spouse: MemberYear | null;
  childAges: number[];
  inflows: FlowItem[];
  outflows: FlowItem[];
  totalIn: number;
  totalOut: number;
  net: number;                 // totalIn − totalOut（投資前）
  byCategory: Record<CostCategory, number>;
  support: { childAllowance: number; hsSupport: number; tashiWaiver: number; leaveBenefit: number };
  flows: { nisaIn: number; nisaOut: number; taxableIn: number; taxableOut: number; taxableTax: number; dcIn: number; planned: number /* 計画的取り崩しで現金化した額（税引後） */; goalReserve: number /* 目標貯蓄のためにこの年キープすべき現金（上限に加算） */ };
  balances: Balances;
  housing: { kind: "rent" | "own" | null; loanBalance: number; loanPayment: number; homeValue: number };
  markers: string[];
  ended: boolean;              // 世帯が消滅（両者死亡）
}

export interface SimResult {
  plan: Plan;
  rows: YearRow[];
  loanSchedules: Record<string, LoanSchedule>;
}

export interface SimOptions {
  /** 年ごとのリスク資産リターン倍率（モンテカルロ用）。undefined なら期待リターン */
  riskReturnOverride?: (yearIdx: number) => { nisa: number; taxable: number; dc: number };
  /** イベントの差し替え（必要保障額分析で死亡を注入） */
  events?: LifeEvent[];
}

// ─────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────

interface MemberState {
  m: Member;
  offset: number;          // 本人年齢との差（配偶者年齢 = age + offset）
  deathAge: number | null; // 本人年齢基準
  empMonths: number;       // 厚生年金加入月数
  salarySum: number;       // 厚生年金加入期間の給与合計（円）
  dc: number;
  nisa: number; nisaCost: number;
  dcContribYears: number;
  dcAnnuityRemainingYears: number;
  pensionBaseAnnual: number | null; // 受給開始時に確定した年金（スライド前の名目基準）
  pensionEmployeePart: number;
  severancePaid: boolean;
  dcLumpDone: boolean;
}

function initMember(m: Member, offset: number, deathAge: number | null, dcInitial: number, nisa: number, nisaCost: number): MemberState {
  // 開始時点までの加入歴を推定: 就職〜現在は現在年収の 85% で加入していたとみなす
  const years = Math.max(0, Math.min(m.age, m.retireAge) - m.workStartAge);
  const startIncome = resolveSchedule(m.income, m.age, 0) * MAN;
  const isEmp = m.employment === "employee";
  return {
    m, offset, deathAge,
    empMonths: isEmp ? years * 12 : 0,
    salarySum: isEmp ? startIncome * 0.85 * years : 0,
    dc: dcInitial, nisa, nisaCost,
    dcContribYears: dcInitial > 0 ? Math.max(years, 1) : 0,
    dcAnnuityRemainingYears: 0,
    pensionBaseAnnual: null, pensionEmployeePart: 0,
    severancePaid: false, dcLumpDone: false,
  };
}

function grownIncome(m: Member, memberAge: number): number {
  const base = resolveSchedule(m.income, memberAge, 0);
  const segStart = scheduleSegmentStart(m.income, memberAge);
  const years = Math.max(0, memberAge - Math.max(segStart, m.age));
  return base * Math.pow(1 + m.incomeGrowthPct / 100, years) * MAN;
}

// ─────────────────────────────────────────────────────────────
// Simulation
// ─────────────────────────────────────────────────────────────

export function simulate(plan: Plan, opts: SimOptions = {}): SimResult {
  const events = (opts.events ?? plan.events).filter(e => e.enabled);
  const startAge = plan.self.age;
  const endAge = Math.max(plan.endAge, startAge + 1);
  const infl = plan.economy.inflationPct / 100;
  const deathOf = (who: "self" | "spouse") => {
    const d = events.find((e): e is DeathEvent => e.kind === "death" && e.member === who);
    return d ? d.age : null;
  };
  const selfSt = initMember(plan.self, 0, deathOf("self"), plan.assets.dcSelf * MAN, plan.assets.nisaSelf * MAN, plan.assets.nisaSelfCost * MAN);
  const spouseSt = plan.spouse ? initMember(plan.spouse, plan.spouse.age - plan.self.age, deathOf("spouse"), plan.assets.dcSpouse * MAN, plan.assets.nisaSpouse * MAN, plan.assets.nisaSpouseCost * MAN) : null;

  let cash = plan.assets.cash * MAN;
  let taxable = plan.assets.taxable * MAN;
  let taxableCost = Math.min(plan.assets.taxableCost * MAN, taxable);

  const housing = [...plan.housing].sort((a, b) => a.startAge - b.startAge);
  const loanSchedules: Record<string, LoanSchedule> = {};
  for (const h of housing) if (h.kind === "own") loanSchedules[h.id] = buildLoanSchedule(h.property, h.startAge, endAge);
  const loanForgiven: Record<string, number> = {}; // 団信で免除された割合

  const children = [...plan.children].sort((a, b) => a.birthAge - b.birthAge);
  const rows: YearRow[] = [];
  const r = plan.invest.returns;
  const stress = plan.economy.stressTest;

  for (let age = startAge, idx = 0; age <= endAge; age++, idx++) {
    const t = age - startAge;
    const inflF = Math.pow(1 + infl, t);
    const year = plan.baseYear + t;
    const inflows: FlowItem[] = [];
    const outflows: FlowItem[] = [];
    const markers: string[] = [];
    const byCat: Record<CostCategory, number> = { living: 0, housing: 0, education: 0, childcare: 0, insurance: 0, car: 0, other: 0, tax: 0 };
    let earthquakePremium = 0; // 地震保険料（本人の所得控除へ）
    const addOut = (category: CostCategory, label: string, amount: number, note?: string, oneOff = false) => {
      if (Math.abs(amount) < 0.5) return;
      outflows.push({ category, label, amount: Math.round(amount), note, oneOff }); byCat[category] += Math.round(amount);
    };
    const addIn = (category: InflowCategory, label: string, amount: number, note?: string, member?: "self" | "spouse") => {
      if (Math.abs(amount) < 0.5) return;
      inflows.push({ category, label, amount: Math.round(amount), note, member });
    };

    const selfAlive = selfSt.deathAge == null || age < selfSt.deathAge;
    const spouseAlive = !!spouseSt && (spouseSt.deathAge == null || age < spouseSt.deathAge);
    const selfDeathYear = selfSt.deathAge === age;
    const spouseDeathYear = !!spouseSt && spouseSt.deathAge === age;
    if (selfDeathYear) markers.push(`${plan.self.name} 死亡`);
    if (spouseDeathYear && spouseSt) markers.push(`${spouseSt.m.name} 死亡`);
    const ended = !selfAlive && !spouseAlive;

    // ── 1. 年初: 運用リターン（前年末残高に対する当年の運用益） ─────────────
    let riskMul = { nisa: 1 + r.nisaPct / 100, taxable: 1 + r.taxablePct / 100, dc: 1 + r.dcPct / 100 };
    if (opts.riskReturnOverride) riskMul = opts.riskReturnOverride(idx);
    else if (stress.enabled) {
      const d = Math.max(1 - stress.dropPct / 100, 0.01);
      if (age === stress.age) {
        riskMul = { nisa: d, taxable: d, dc: d };
        markers.push(`市場急落 −${stress.dropPct}%`);
      } else if (age > stress.age && age <= stress.age + stress.recoveryYears && stress.recoveryYears > 0) {
        const n = stress.recoveryYears;
        const rec = (base: number) => Math.pow(Math.pow(base, n + 1) / d, 1 / n);
        riskMul = { nisa: rec(1 + r.nisaPct / 100), taxable: rec(1 + r.taxablePct / 100), dc: rec(1 + r.dcPct / 100) };
      }
    }
    if (t > 0) {
      cash = Math.round(cash * (1 + (cash > 0 ? r.cashPct / 100 : 0)));
      taxable = Math.round(taxable * riskMul.taxable);
      for (const s of [selfSt, spouseSt]) if (s) { s.nisa = Math.round(s.nisa * riskMul.nisa); s.dc = Math.round(s.dc * riskMul.dc); }
    }

    // ── 2. 子 ─────────────────────────────────────────────────────────────
    const childAges = children.map(c => age - c.birthAge);
    const dependentChildren = childAges.filter(a => a >= 0 && a < plan.childrenCommon.independenceAge).length;
    let childAllowance = 0, hsSupport = 0, tashi = 0;
    let dependentIt = 0, dependentRt = 0;
    let leaveSelf = { leave: 0, first: 0, after: 0 }, leaveSpouse = { leave: 0, first: 0, after: 0 };
    let returnSelf = 1, returnSpouse = 1;
    children.forEach((c, i) => {
      const ca = childAges[i];
      if (ca < 0) return;
      if (ca === 0) { addOut("childcare", `${c.name} 出産費用`, plan.childrenCommon.birthCost * MAN * inflF, undefined, true); markers.push(`${c.name} 誕生`); }
      const cost = childCostAt(c, ca, plan.childrenCommon.careMonthly, plan.childrenCommon.independenceAge);
      if (cost.education > 0) addOut("education", `${c.name} ${cost.stage ? stageLabel(cost.stage) : "教育費"}`, cost.education * MAN * inflF);
      if (cost.care > 0) addOut("childcare", `${c.name} 養育費`, cost.care * MAN * inflF);
      childAllowance += childAllowanceAnnual(ca, children.filter((_, j) => { const a = childAges[j]; return a >= 0 && a < 22 && (a > ca || (a === ca && j < i)); }).length >= 2);
      hsSupport += highSchoolSupport(ca, cost.stage, cost.isPrivate);
      tashi += tashiWaiver(ca, cost.stage, cost.isPrivate, dependentChildren);
      const dd = dependentDeduction(ca); dependentIt += dd.it; dependentRt += dd.rt;
      // 育休
      const ls = leaveMonthsInYear(c.leaveMonthsSelf, ca); const lp = leaveMonthsInYear(c.leaveMonthsSpouse, ca);
      leaveSelf = { leave: Math.min(12, leaveSelf.leave + ls.leave), first: leaveSelf.first + ls.first, after: leaveSelf.after + ls.after };
      leaveSpouse = { leave: Math.min(12, leaveSpouse.leave + lp.leave), first: leaveSpouse.first + lp.first, after: leaveSpouse.after + lp.after };
      // 復帰後の時短（本人・配偶者を個別に設定）。復帰年から years 年間、年収を ratioPct% にする
      const cc = plan.childrenCommon;
      const rs = cc.returnSelf, rp = cc.returnSpouse;
      if (c.leaveMonthsSelf > 0 && rs.years > 0 && rs.ratioPct < 100) {
        const end = Math.floor(c.leaveMonthsSelf / 12);
        if (ca >= end && ca < end + rs.years) returnSelf = Math.min(returnSelf, rs.ratioPct / 100);
      }
      if (c.leaveMonthsSpouse > 0 && rp.years > 0 && rp.ratioPct < 100) {
        const end = Math.floor(c.leaveMonthsSpouse / 12);
        if (ca >= end && ca < end + rp.years) returnSpouse = Math.min(returnSpouse, rp.ratioPct / 100);
      }
    });
    // 給付月数は年 12 ヶ月を超えない（双子・年子の重複）
    for (const lv of [leaveSelf, leaveSpouse]) { lv.first = Math.min(lv.first, 12); lv.after = Math.min(lv.after, 12 - lv.first); }
    if (hsSupport > 0) addOut("education", "高校就学支援金", -hsSupport);
    if (tashi > 0) addOut("education", "多子世帯 大学授業料減免", -tashi);
    if (childAllowance > 0) addIn("public", "児童手当", childAllowance);

    // ── 3. 住居 ───────────────────────────────────────────────────────────
    let phase: HousingPhase | null = null; let phaseIdx = -1;
    housing.forEach((h, i) => { if (h.startAge <= age) { phase = h; phaseIdx = i; } });
    let loanBalance = 0, loanPayment = 0, homeValue = 0;
    let hlCreditSelf = 0, hlCreditSpouse = 0;
    let saleProceeds = 0;
    if (phase) {
      const ph: HousingPhase = phase;
      const next = housing[phaseIdx + 1];
      if (ph.startAge === age && ph.movingCost > 0 && !(phaseIdx === 0 && t === 0)) addOut("housing", "引越し・初期費用", ph.movingCost * MAN * inflF, undefined, true);
      if (ph.kind === "rent") {
        addOut("housing", "家賃", ph.rentMonthly * 12 * MAN * inflF);
        if (ph.startAge === age) markers.push(phaseIdx === 0 ? "" : (housing[phaseIdx - 1]?.kind === "rent" ? "住み替え（賃貸）" : "賃貸へ"));
      } else {
        const p = ph.property; const sched = loanSchedules[ph.id];
        const yi = age - ph.startAge;
        const forgiven = loanForgiven[ph.id] ?? 0;
        if (yi === 0) {
          addOut("housing", "頭金・諸費用", (p.downPayment + p.price * p.closingCostPct / 100) * MAN, undefined, true);
          markers.push(`住宅購入 ${p.price.toLocaleString()}万`);
        }
        homeValue = Math.round(p.price * MAN * Math.pow(1 + p.appreciationPct / 100, yi));
        const ly = sched.years[yi];
        if (ly) {
          const share = 1 - forgiven;
          loanPayment = Math.round(ly.payment * share);
          addOut("housing", `住宅ローン返済${ly.ratePct ? `（${ly.ratePct}%）` : ""}`, loanPayment, `残高 ${Math.round(ly.closingBalance * share / MAN).toLocaleString()}万`);
          if (ly.prepayment > 0) addOut("housing", "繰上返済", ly.prepayment * share, undefined, true);
          if (ly.refinanceCost > 0) addOut("housing", "借換費用", ly.refinanceCost, undefined, true);
          loanBalance = Math.round(ly.closingBalance * share);
          for (const ev of ly.events) if (!ev.startsWith("繰上")) markers.push(ev);
          // 住宅ローン控除
          const ded = C.HOUSING_LOAN_DEDUCTION[p.deduction];
          if (ded && yi < ded.years && ly.closingBalance > 0) {
            const credit = Math.min(ly.closingBalance, ded.cap) * C.HOUSING_LOAN_DEDUCTION_RATE;
            hlCreditSelf = credit * p.loanShareSelfPct / 100;
            hlCreditSpouse = credit - hlCreditSelf;
            if (yi === ded.years - 1) markers.push("住宅ローン控除 終了");
          }
        }
        addOut("housing", "管理費・修繕", p.maintenanceMonthly * 12 * MAN * inflF);
        addOut("housing", "固定資産税", p.propertyTaxAnnual * MAN * inflF);
        if (p.earthquakePremiumAnnual > 0) { const q = p.earthquakePremiumAnnual * MAN * inflF; earthquakePremium += q; addOut("insurance", "地震保険料", q); }
        // 売却（次フェーズ開始年の年末に売却）
        if (next && next.startAge === age + 1) {
          const salePrice = p.salePrice != null ? p.salePrice * MAN : Math.round(p.price * MAN * Math.pow(1 + p.appreciationPct / 100, yi + 1));
          const remaining = loanBalance;
          const { tax } = propertySaleTax(salePrice, p.price * MAN * (1 + p.closingCostPct / 100), yi + 1);
          const cost = Math.round(salePrice * 0.04);
          saleProceeds = salePrice - remaining - cost;
          addIn("asset", "住宅売却（ローン完済後）", saleProceeds, `売却 ${Math.round(salePrice / MAN).toLocaleString()}万 − 残債 ${Math.round(remaining / MAN).toLocaleString()}万`);
          if (tax > 0) addOut("tax", "譲渡所得税", tax, undefined, true);
          markers.push(`住宅売却 ${Math.round(salePrice / MAN).toLocaleString()}万`);
          homeValue = 0; loanBalance = 0;
        }
      }
    }

    // ── 4. イベント: 車・保険・その他 ────────────────────────────────────
    let insurancePayout = 0;
    const deathBenefitPaid: [number, number] = [0, 0];
    let otherTaxableSelf = 0, otherIncomeNonTaxable = 0;
    const lifePremiumSelf = { general: 0, medical: 0, pension: 0 }, lifePremiumSpouse = { general: 0, medical: 0, pension: 0 };
    for (const e of events) {
      if (e.kind === "car") carCosts(e, age, infl, inflF, addOut);
      else if (e.kind === "insurance") {
        const insuredAlive = e.member === "self" ? selfAlive : spouseAlive;
        const insuredDeathYear = e.member === "self" ? selfDeathYear : spouseDeathYear;
        const deathAge = e.member === "self" ? selfSt.deathAge : spouseSt?.deathAge ?? null;
        if (insuredAlive && age >= e.startAge && age < e.endAge) {
          const prem = e.premiumMonthly * 12 * MAN;
          addOut("insurance", `${e.label}（保険料）`, prem);
          (e.member === "self" ? lifePremiumSelf : lifePremiumSpouse)[e.deductionType ?? "general"] += prem;
        }
        if (deathAge != null && deathAge >= e.startAge && deathAge < e.endAge) {
          if (e.type === "term" && insuredDeathYear) { insurancePayout += e.payout * MAN; addIn("insurance", `${e.label} 死亡保険金`, e.payout * MAN); }
          if (e.type === "incomeProtection" && age >= deathAge && age < e.payoutUntilAge) { insurancePayout += e.payout * 12 * MAN; addIn("insurance", `${e.label} 収入保障`, e.payout * 12 * MAN); }
        }
      } else if (e.kind === "expense" || e.kind === "income") {
        const amt = cashEventAmount(e, age, inflF);
        if (amt === 0) continue;
        if (e.stopOnSelfDeath && !selfAlive) continue;
        if (e.kind === "expense") addOut("other", e.label, amt, undefined, e.years <= 1);
        else if (e.taxable && selfAlive) otherTaxableSelf += amt;
        else { otherIncomeNonTaxable += amt; addIn("other", e.label, amt); }
      }
    }

    // ── 5. 各メンバーの収入・年金・税 ──────────────────────────────────
    const memberYears: (MemberYear | null)[] = [null, null];
    const members: (MemberState | null)[] = [selfSt, spouseSt];
    const alive = [selfAlive, spouseAlive];
    const leaves = [leaveSelf, leaveSpouse];
    const returns = [returnSelf, returnSpouse];
    const hlCredits = [hlCreditSelf, hlCreditSpouse];
    const lifePrem = [lifePremiumSelf, lifePremiumSpouse];

    // 5a. 給与・拠出・年金（税計算前の素データ）
    type Pre = { salary: number; fullSalary: number; matching: number; ideco: number; companyDc: number; pension: number; pensionCut: number; pensionBasic: number; pensionEmployee: number; dcAnnuity: number; totalIncomeApprox: number; leave: { leave: number; first: number; after: number }; severance: number; severanceTax: number; dcLump: number; dcLumpTax: number };
    const pre: (Pre | null)[] = members.map((s, i) => {
      if (!s || !alive[i]) return null;
      const m = s.m; const mAge = age + s.offset;
      const working = mAge < m.retireAge && m.employment !== "none";
      const lv = leaves[i];
      const fullSalary = working ? grownIncome(m, mAge) : 0;
      const salary = working ? fullSalary * ((12 - lv.leave) / 12) * returns[i] : 0;
      const matching = working ? resolveSchedule(m.dc.matching, mAge, 0) * 12 * ((12 - lv.leave) / 12) : 0;
      const companyDc = working ? resolveSchedule(m.dc.company, mAge, 0) * 12 : 0;
      // 退職金（退職年）
      let severance = 0, severanceTax = 0;
      if (!s.severancePaid && mAge === m.retireAge && m.severancePay > 0) {
        severance = m.severancePay * MAN;
        severanceTax = retirementLumpTax(severance, m.retireAge - m.workStartAge);
        s.severancePaid = true;
        addIn("salary", `${m.name} 退職金`, severance - severanceTax, `税 ${Math.round(severanceTax / MAN)}万`);
        markers.push(`${m.name} 退職`);
      } else if (mAge === m.retireAge && m.employment !== "none") markers.push(`${m.name} 退職`);
      // DC 受取開始（一時金は同年の退職金と合算して退職所得課税）
      let dcLump = 0, dcLumpTax = 0;
      if (!s.dcLumpDone && mAge >= m.dc.receive.startAge && s.dc > 0) {
        s.dcLumpDone = true;
        const rec = m.dc.receive;
        const lumpPart = rec.method === "lump" ? s.dc : rec.method === "mixed" ? Math.round(s.dc * rec.lumpRatioPct / 100) : 0;
        if (lumpPart > 0) {
          dcLump = lumpPart;
          dcLumpTax = retirementLumpTax(lumpPart, Math.max(s.dcContribYears, 1), severance);
          s.dc -= lumpPart;
          addIn("asset", `${m.name} DC/iDeCo 一時金`, dcLump - dcLumpTax, `税 ${Math.round(dcLumpTax / MAN)}万`);
          markers.push(`${m.name} DC受取`);
        }
        if (rec.method !== "lump" && s.dc > 0) { s.dcAnnuityRemainingYears = Math.max(rec.annuityYears, 1); markers.push(`${m.name} DC年金受取開始`); }
      }
      // iDeCo: 受取開始後は拠出しない
      const ideco = !s.dcLumpDone && (working || (mAge < 65 && m.employment !== "none")) ? resolveSchedule(m.dc.ideco, mAge, 0) * 12 : 0;
      // 公的年金
      let pension = 0, pensionCut = 0, pensionBasicNow = 0, pensionEmployeeNow = 0;
      if (mAge >= m.pensionStartAge) {
        if (s.pensionBaseAnnual == null) {
          const avg = s.empMonths > 0 ? s.salarySum / (s.empMonths / 12) : 0;
          const nationalMonths = Math.min(Math.max(Math.min(mAge, 60) - 20, 0) * 12, C.BASIC_PENSION_MONTHS);
          const est = estimateOldAgePension(avg, s.empMonths, nationalMonths, m.pensionStartAge);
          s.pensionBaseAnnual = est.total; s.pensionEmployeePart = est.employee;
        }
        const slide = macroSlideFactor(t, plan.economy.inflationPct, plan.economy.macroSlidePct);
        pension = Math.round(s.pensionBaseAnnual * slide);
        pensionEmployeeNow = Math.round(s.pensionEmployeePart * slide);
        pensionBasicNow = pension - pensionEmployeeNow; // 基礎＋厚生＝合計 が丸めでずれないように差分で持つ
        pensionCut = workingPensionReduction(pensionEmployeeNow, salary);
        pension -= pensionCut;
      }
      // DC 年金受取
      let dcAnnuity = 0;
      if (s.dcAnnuityRemainingYears > 0 && s.dc > 0) {
        dcAnnuity = Math.round(s.dc / s.dcAnnuityRemainingYears);
        s.dc -= dcAnnuity; s.dcAnnuityRemainingYears--;
      }
      const other = i === 0 ? otherTaxableSelf : 0;
      const totalIncomeApprox = Math.max(salary - matching - Math.min(C.employmentIncomeDeduction(Math.max(salary - matching, 0)), salary), 0) + Math.max(pension + dcAnnuity - C.publicPensionDeduction(pension + dcAnnuity, mAge), 0) + other;
      return { salary, fullSalary, matching, ideco, companyDc, pension, pensionCut, pensionBasic: pensionBasicNow, pensionEmployee: pensionEmployeeNow, dcAnnuity, totalIncomeApprox, leave: lv, severance, severanceTax, dcLump, dcLumpTax };
    });

    // 5b. 配偶者控除・扶養控除の帰属: 合計所得が大きい側
    const primary = pre[1] && pre[0] ? (pre[1].totalIncomeApprox > pre[0].totalIncomeApprox ? 1 : 0) : pre[0] ? 0 : 1;

    // 5c. 遺族年金
    const survivorFor = (survivorIdx: 0 | 1): number => {
      const deceased = members[1 - survivorIdx]; const survivor = members[survivorIdx];
      if (!deceased || !survivor || deceased.deathAge == null || age < deceased.deathAge) return 0;
      const survivorAge = age + survivor.offset;
      const avg = deceased.empMonths > 0 ? deceased.salarySum / (deceased.empMonths / 12) : 0;
      const deathYear = plan.baseYear + (deceased.deathAge - startAge);
      const ownEmp = survivorAge >= 65 ? Math.round(survivor.pensionEmployeePart * macroSlideFactor(t, plan.economy.inflationPct, plan.economy.macroSlidePct)) : 0;
      const sp = survivorPension(avg, deceased.empMonths, childAges, survivorAge, survivor.m.sex === "female", deathYear, ownEmp);
      return Math.round(sp.total * macroSlideFactor(t, plan.economy.inflationPct, plan.economy.macroSlidePct));
    };

    let totalLeaveBenefit = 0;
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const s = members[i]; const p = pre[i];
      if (!s) continue;
      const mAge = age + s.offset;
      if (!p) {
        memberYears[i] = emptyMemberYear(mAge, s);
        continue;
      }
      const m = s.m;
      const isPrimary = primary === i;
      const spouseIncome = isPrimary && pre[1 - i] ? pre[1 - i]!.totalIncomeApprox : (isPrimary && members[1 - i] && alive[1 - i] ? 0 : null);
      const salaryForTax = Math.max(p.salary - p.matching, 0);
      // 相手が被用者保険の被保険者なら、106万・130万の壁で被扶養者になれる
      const other = members[1 - i], otherPre = pre[1 - i];
      const canBeDependent = !!other && alive[1 - i] && other.m.employment === "employee" && !!otherPre && Math.max(otherPre.salary - otherPre.matching, 0) >= C.SI_ENROLL_ANNUAL;
      // 住民税の非課税限度額に使う扶養親族等の数（同一生計配偶者＋子）
      const sameHouseholdSpouse = isPrimary && otherPre && otherPre.totalIncomeApprox <= C.BASIC_DEDUCTION_IT ? 1 : 0;
      const dependentsForRt = isPrimary ? sameHouseholdSpouse + dependentChildren : 0;
      const tax = computePersonTax({
        age: mAge, employment: m.employment,
        salary: salaryForTax, pension: p.pension + p.dcAnnuity, otherTaxableIncome: i === 0 ? otherTaxableSelf : 0,
        onLeave: p.fullSalary > 0 && p.leave.leave >= 12,
        idecoAnnual: p.ideco, // 選択制拠出は給与から除外済み。iDeCo は所得控除
        lifeInsurancePremium: lifePrem[i],
        earthquakePremium: i === 0 ? earthquakePremium : 0,
        dependentIt: isPrimary ? dependentIt : 0, dependentRt: isPrimary ? dependentRt : 0,
        dependentsForRt,
        siMode: m.socialInsurance, canBeDependent,
        spouseIncomeForDeduction: spouseIncome,
        housingLoanCredit: Math.round(hlCredits[i]),
        furusato: m.furusato,
      });
      // 年金記録の積み上げ（育休中は休業前給与でみなし）
      if (m.employment === "employee" && p.fullSalary > 0 && mAge < 70) {
        const protect = children.some((c, ci) => childAges[ci] >= 0 && childAges[ci] < 3 && (i === 0 ? c.leaveMonthsSelf : c.leaveMonthsSpouse) > 0);
        // 年金記録は基準年の実質値で積み上げる（再評価率 ≒ 物価と見なす）。受給時に物価＋マクロスライドで名目化するため二重計上を避ける
        s.empMonths += 12; s.salarySum += (protect ? p.fullSalary : salaryForTax) / inflF;
      }
      const lb = m.employment === "employee" && plan.childrenCommon.leaveBenefit ? leaveBenefit(p.fullSalary, p.leave.first, p.leave.after) : 0;
      totalLeaveBenefit += lb;
      const surv = survivorFor(i);
      // DC 積立
      const dcIn = p.companyDc + p.matching + p.ideco;
      if (dcIn > 0) { s.dc += dcIn; s.dcContribYears++; }
      const netCash = tax.takeHome - p.ideco + lb + surv;
      if (tax.gross > 0) {
        const ratio = tax.takeHome / tax.gross;
        const other = i === 0 ? otherTaxableSelf : 0;
        if (salaryForTax > 0) addIn("salary", `${m.name} 給与（手取り）`, salaryForTax * ratio, `額面 ${Math.round(p.salary / MAN).toLocaleString()}万${p.leave.leave > 0 ? `・育休 ${p.leave.leave}ヶ月` : ""}`, i === 0 ? "self" : "spouse");
        if (p.pension + p.dcAnnuity > 0) addIn("pension", `${m.name} 年金（手取り）`, (p.pension + p.dcAnnuity) * ratio, p.pensionCut > 0 ? `在職老齢年金 −${Math.round(p.pensionCut / MAN)}万` : `額面 ${Math.round((p.pension + p.dcAnnuity) / MAN)}万`);
        if (other > 0) addIn("other", "その他収入（課税後）", other * ratio);
      } else if (tax.takeHome < 0) {
        // 収入がなくても発生する社会保険料（国民年金・国保・介護）
        addOut("other", `${m.name} 社会保険料`, -tax.takeHome);
      }
      if (p.ideco > 0) addOut("other", `${m.name} iDeCo 拠出`, p.ideco);
      if (lb > 0) addIn("public", `${m.name} 育児休業給付金`, lb);
      if (surv > 0) addIn("pension", `${m.name} 遺族年金`, surv);
      memberYears[i] = {
        age: mAge, alive: true, working: p.salary > 0,
        salary: p.salary, matching: p.matching, ideco: p.ideco, companyDc: p.companyDc,
        publicPension: p.pension, pensionBasic: p.pensionBasic, pensionEmployee: p.pensionEmployee, pensionReduction: p.pensionCut, deathBenefit: deathBenefitPaid[i], dcAnnuity: p.dcAnnuity, otherTaxable: i === 0 ? otherTaxableSelf : 0,
        leaveMonths: p.leave.leave, leaveBenefit: lb, survivorPension: surv,
        tax, netCash, dcLump: p.dcLump, dcLumpTax: p.dcLumpTax, severance: p.severance, severanceTax: p.severanceTax,
        dcBalance: s.dc, nisaBalance: s.nisa, nisaCost: s.nisaCost,
      };
    }

    // ── 6. 死亡処理: DC死亡一時金・NISA現金化・団信・相続税 ───────────────
    let inheritanceTaxPaid = 0; void inheritanceTaxPaid;
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const s = members[i];
      if (!s || s.deathAge !== age) continue;
      const survivorAlive = alive[1 - i];
      const otherDiedSameYear = !!members[1 - i] && members[1 - i]!.deathAge === age;
      // 団信
      if (phase && (phase as HousingPhase).kind === "own" && (phase as HousingPhase).property.danshin) {
        const ph = phase as HousingPhase; const share = i === 0 ? ph.property.loanShareSelfPct / 100 : 1 - ph.property.loanShareSelfPct / 100;
        if (share > 0 && loanBalance > 0) { loanForgiven[ph.id] = Math.min((loanForgiven[ph.id] ?? 0) + share, 1); markers.push("団信でローン免除"); loanBalance = Math.round(loanBalance * (1 - share)); }
      }
      // 死亡退職金・弔慰金（在職中の死亡。遺族が受け取り、相続税ではみなし退職手当金として非課税枠 500 万×法定相続人）
      let deathBenefit = 0;
      if (s.m.deathBenefit > 0 && age + s.offset < s.m.retireAge && s.m.employment !== "none") { deathBenefit = s.m.deathBenefit * MAN; deathBenefitPaid[i] = deathBenefit; if (memberYears[i]) memberYears[i]!.deathBenefit = deathBenefit; addIn("insurance", `${s.m.name} 死亡退職金・弔慰金`, deathBenefit); }
      // DC・NISA → 現金（遺族へ）
      const dcDeath = s.dc; const nisaDeath = s.nisa;
      if (dcDeath > 0) addIn("asset", `${s.m.name} DC死亡一時金`, dcDeath);
      if (nisaDeath > 0) addIn("asset", `${s.m.name} NISA 相続（現金化）`, nisaDeath);
      s.dc = 0; s.nisa = 0; s.nisaCost = 0; // 現金化分は収入項目として net 経由で現金に入る
      // 相続税（世帯資産の半分を故人の遺産とみなす）。同年に両者が亡くなる場合は 1 回だけ課税
      if (i === 1 && otherDiedSameYear) continue;
      const estateShare = survivorAlive ? 0.5 : 1;
      const estate = Math.max((cash + taxable) * estateShare + nisaDeath + (homeValue - loanBalance) * estateShare, 0);
      const { tax } = inheritanceTax(estate, insurancePayout, dcDeath + deathBenefit, childAges.filter(a => a >= 0).length, survivorAlive);
      if (tax > 0) { inheritanceTaxPaid += tax; addOut("tax", `相続税（${s.m.name}）`, tax, undefined, true); }
    }

    // ── 7. 生活費 ─────────────────────────────────────────────────────────
    let livingMonthly = resolveSchedule(plan.living.monthly, age, 0);
    if (plan.living.retirementMonthly != null && age >= plan.self.pensionStartAge) livingMonthly = plan.living.retirementMonthly;
    const independent = childAges.filter(a => a >= plan.childrenCommon.independenceAge).length;
    let living = livingMonthly * 12 * MAN * inflF * Math.max(0, 1 - independent * plan.living.reductionPerChildPct / 100);
    if (!selfAlive || (spouseSt && !spouseAlive)) living *= plan.living.survivorPct / 100;
    if (ended) living = 0;
    addOut("living", "基本生活費", living, independent > 0 ? `子 ${independent} 人独立で −${independent * plan.living.reductionPerChildPct}%` : undefined);
    if (selfDeathYear || spouseDeathYear) addOut("other", "葬儀費用", plan.funeralCost * MAN * inflF, undefined, true);

    // ── 8. 収支集計 ────────────────────────────────────────────────────────
    const totalIn = inflows.reduce((a, f) => a + f.amount, 0);
    const totalOut = outflows.reduce((a, f) => a + f.amount, 0);
    const net = totalIn - totalOut;
    cash += net;

    // ── 9. 投資ポリシー（生活防衛資金 → NISA → 特定口座 / 取り崩し） ─────
    const flows = { nisaIn: 0, nisaOut: 0, taxableIn: 0, taxableOut: 0, taxableTax: 0, dcIn: (memberYears[0]?.companyDc ?? 0) + (memberYears[0]?.matching ?? 0) + (memberYears[0]?.ideco ?? 0) + (memberYears[1]?.companyDc ?? 0) + (memberYears[1]?.matching ?? 0) + (memberYears[1]?.ideco ?? 0), planned: 0, goalReserve: 0 };
    const recurringOut = outflows.reduce((a, f) => a + (f.oneOff ? 0 : f.amount), 0);
    const monthlyOut = Math.max(recurringOut, 0) / 12;
    const reserveMin = monthlyOut * plan.invest.reserveMonths;
    // 目標貯蓄: 積立期間中は目標額を按分して現金のキープ上限に足す（使う年の頭に満額 → 使った後は元に戻る）
    let goalReserve = 0, goalFromInvest = 0;
    for (const g of plan.invest.cashGoals) {
      if (g.amount <= 0 || age >= g.age) continue;
      const start = g.age - g.years;
      if (age < start) continue;
      const target = g.amount * MAN * (g.inflate ? inflF : 1);
      const progress = Math.min((age - start + 1) / g.years, 1);
      goalReserve += target * progress;
      if (g.fromInvestments) goalFromInvest += target * progress;
      if (age === start) markers.push(`${g.label} の積立開始`);
    }
    flows.goalReserve = Math.round(goalReserve);
    const reserveMax = Math.max(monthlyOut * plan.invest.reserveMaxMonths, reserveMin) + goalReserve;

    /**
     * 特定口座から売る。gross=false: 税引後 wanted 円が手元に残るように売る（不足補填用）。
     * gross=true: wanted 円分を売却する（計画的取り崩し用。税は売却額から差し引かれる）。返り値は手取り。
     */
    const sellTaxable = (wanted: number, gross = false): number => {
      if (taxable <= 0 || wanted <= 0) return 0;
      const gainRatio = Math.max(taxable - taxableCost, 0) / taxable;
      const netRatio = 1 - gainRatio * C.CAPITAL_GAINS_TAX_RATE;
      const sell = Math.min(gross ? Math.ceil(wanted) : Math.ceil(wanted / netRatio), taxable);
      const taxOnSale = Math.round(sell * gainRatio * C.CAPITAL_GAINS_TAX_RATE);
      taxableCost = Math.round(taxableCost * (1 - sell / taxable)); taxable -= sell;
      cash += sell - taxOnSale; flows.taxableOut += sell; flows.taxableTax += taxOnSale;
      return sell - taxOnSale;
    };
    /** NISA（本人→配偶者）から wanted 円を売る。非課税なので手取り＝売却額 */
    const sellNisa = (wanted: number): number => {
      let got = 0;
      for (let i = 0 as 0 | 1; i < 2 && wanted - got > 0; i = (i + 1) as 0 | 1) {
        const s = members[i]; if (!s || s.nisa <= 0) continue;
        const sell = Math.min(wanted - got, s.nisa);
        s.nisaCost = Math.round(s.nisaCost * (1 - sell / s.nisa)); s.nisa -= sell;
        cash += sell; got += sell; flows.nisaOut += sell;
      }
      return got;
    };
    /**
     * 取り崩し順序に従って現金化する。gross=false: 手取り wanted 円を確保（不足補填）。
     * gross=true: 売却額ベースで wanted 円（計画的取り崩し）。返り値は手取り。
     */
    const withdraw = (wanted: number, gross = false): number => {
      if (wanted <= 0) return 0;
      const nisaTot = selfSt.nisa + (spouseSt?.nisa ?? 0);
      let got = 0, sold = 0;
      const takeTaxable = (w: number) => { const before = flows.taxableOut; const net = sellTaxable(w, gross); sold += flows.taxableOut - before; got += net; };
      const takeNisa = (w: number) => { const net = sellNisa(w); sold += net; got += net; };
      const remaining = () => (gross ? wanted - sold : wanted - got);
      if (plan.invest.withdrawalOrder === "proportional" && taxable + nisaTot > 0) {
        const share = taxable / (taxable + nisaTot);
        takeTaxable(wanted * share); takeNisa(remaining()); takeTaxable(remaining());
      } else if (plan.invest.withdrawalOrder === "nisaFirst") {
        takeNisa(wanted); takeTaxable(remaining());
      } else {
        takeTaxable(wanted); takeNisa(remaining());
      }
      return got;
    };

    // 計画的な取り崩し（定率・定額）: 開始年齢以降、毎年決めた額を運用資産から現金化する
    const wp = plan.invest.withdrawal;
    const inDrawdown = !ended && wp.mode !== "asNeeded" && age >= wp.startAge;
    if (inDrawdown) {
      const invested = taxable + selfSt.nisa + (spouseSt?.nisa ?? 0);
      const target = wp.mode === "fixedRate" ? invested * wp.ratePct / 100 : wp.amount * MAN * inflF;
      flows.planned = withdraw(Math.min(target, invested), true);
      if (age === wp.startAge) markers.push(wp.mode === "fixedRate" ? `取り崩し開始（年 ${wp.ratePct}%）` : "取り崩し開始（定額）");
    }
    const investExcess = !(inDrawdown && wp.stopInvesting);

    if (!ended) {
      if (cash > reserveMax && investExcess) {
        let excess = cash - reserveMax;
        if (plan.invest.nisaEnabled) {
          const caps = [plan.invest.nisaAnnualCapSelf, plan.invest.nisaAnnualCapSpouse];
          for (let i = 0 as 0 | 1; i < 2 && excess > 0; i = (i + 1) as 0 | 1) {
            const s = members[i]; if (!s || !alive[i]) continue;
            const room = Math.max(Math.min(caps[i] * MAN, plan.invest.nisaLifetimeCap * MAN - s.nisaCost), 0);
            const put = Math.min(room, excess);
            if (put > 0) { s.nisa += put; s.nisaCost += put; excess -= put; flows.nisaIn += put; }
          }
        }
        if (excess > 0 && plan.invest.useTaxableWhenNisaFull) { taxable += excess; taxableCost += excess; flows.taxableIn += excess; excess = 0; }
        cash = reserveMax + excess;
      } else if (cash < reserveMin) {
        // 現金が下限を割ったら、取り崩し順序に従って不足分を売却
        withdraw(reserveMin - cash);
      }
      // 目標貯蓄（運用資産から移す設定）: 余剰で積み立てても足りない分を、毎年少しずつ売却して現金へ
      if (goalFromInvest > 0 && cash < reserveMin + goalFromInvest) withdraw(reserveMin + goalFromInvest - cash);
    }
    if (flows.taxableTax > 0) addOut("tax", "譲渡益課税（特定口座）", flows.taxableTax, undefined, true);
    const totalOutFinal = outflows.reduce((a, f) => a + f.amount, 0);

    // ── 10. 残高 ─────────────────────────────────────────────────────────
    const nisaTotal = (selfSt.nisa) + (spouseSt?.nisa ?? 0);
    const nisaCostTotal = selfSt.nisaCost + (spouseSt?.nisaCost ?? 0);
    const dcTotal = selfSt.dc + (spouseSt?.dc ?? 0);
    const taxableAfterTax = taxable - Math.round(Math.max(taxable - taxableCost, 0) * C.CAPITAL_GAINS_TAX_RATE);
    const liquid = cash + taxableAfterTax + nisaTotal;
    const balances: Balances = {
      cash: Math.round(cash), taxable: Math.round(taxable), taxableCost: Math.round(taxableCost),
      nisa: Math.round(nisaTotal), nisaCost: Math.round(nisaCostTotal), dc: Math.round(dcTotal),
      home: homeValue, loan: loanBalance,
      liquid: Math.round(liquid), netWorth: Math.round(liquid + dcTotal + homeValue - loanBalance),
    };
    if (memberYears[0]) { memberYears[0].dcBalance = selfSt.dc; memberYears[0].nisaBalance = selfSt.nisa; memberYears[0].nisaCost = selfSt.nisaCost; }
    if (memberYears[1] && spouseSt) { memberYears[1].dcBalance = spouseSt.dc; memberYears[1].nisaBalance = spouseSt.nisa; memberYears[1].nisaCost = spouseSt.nisaCost; }

    rows.push({
      idx, age, year,
      self: memberYears[0]!, spouse: memberYears[1],
      childAges, inflows, outflows, totalIn, totalOut: totalOutFinal, net: totalIn - totalOutFinal, byCategory: byCat,
      support: { childAllowance, hsSupport, tashiWaiver: tashi, leaveBenefit: totalLeaveBenefit },
      flows, balances,
      housing: { kind: phase ? (phase as HousingPhase).kind : null, loanBalance, loanPayment, homeValue },
      markers: markers.filter(Boolean), ended,
    });
    if (ended) break;
  }
  return { plan, rows, loanSchedules };
}

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────

function emptyMemberYear(mAge: number, s: MemberState): MemberYear {
  return {
    age: mAge, alive: false, working: false, salary: 0, matching: 0, ideco: 0, companyDc: 0,
    publicPension: 0, pensionBasic: 0, pensionEmployee: 0, pensionReduction: 0, deathBenefit: 0, dcAnnuity: 0, otherTaxable: 0, leaveMonths: 0, leaveBenefit: 0, survivorPension: 0,
    tax: null, netCash: 0, dcLump: 0, dcLumpTax: 0, severance: 0, severanceTax: 0,
    dcBalance: s.dc, nisaBalance: s.nisa, nisaCost: s.nisaCost,
  };
}

function stageLabel(k: string): string {
  return ({ nursery: "保育園", kinder: "幼稚園", elementary: "小学校", middle: "中学校", high: "高校", university: "大学", grad: "大学院" } as Record<string, string>)[k] ?? "教育費";
}

function cashEventAmount(e: CashEvent, age: number, inflF: number): number {
  if (age < e.startAge || age >= e.startAge + Math.max(e.years, 1)) return 0;
  if (e.every > 1 && (age - e.startAge) % e.every !== 0) return 0;
  return Math.round(e.amount * MAN * (e.inflate ? inflF : 1));
}

function carCosts(e: CarEvent, age: number, infl: number, inflF: number, addOut: (c: CostCategory, l: string, a: number, n?: string, oneOff?: boolean) => void) {
  if (age < e.startAge || age > e.endAge) return;
  const since = age - e.startAge;
  const cycle = e.replaceEveryYears > 0 ? since % e.replaceEveryYears : since;
  const isPurchaseYear = cycle === 0;
  // 購入時点（サイクル開始年）の価格
  const purchasePrice = e.price * MAN * inflF / Math.pow(1 + infl, cycle);
  if (e.loanYears > 0) {
    if (cycle < e.loanYears) {
      const n = e.loanYears * 12; const mr = e.loanRatePct / 100 / 12;
      const monthly = mr > 0 ? purchasePrice * mr * Math.pow(1 + mr, n) / (Math.pow(1 + mr, n) - 1) : purchasePrice / n;
      addOut("car", `${e.label} ローン返済`, monthly * 12);
    }
  } else if (isPurchaseYear) {
    addOut("car", `${e.label} 購入`, purchasePrice, undefined, true);
  }
  if (e.runningAnnual > 0) addOut("car", `${e.label} 維持費`, e.runningAnnual * MAN * inflF);
}

/** イベント単体の年ごとの金額プレビュー（円、正=支出・負=収入）。フォームのプレビュー用。 */
export function previewEventAmounts(e: LifeEvent, plan: Plan): { age: number; amount: number }[] {
  const infl = plan.economy.inflationPct / 100;
  const out: { age: number; amount: number }[] = [];
  for (let age = plan.self.age; age <= plan.endAge; age++) {
    const inflF = Math.pow(1 + infl, age - plan.self.age);
    let amount = 0;
    if (e.kind === "expense" || e.kind === "income") amount = cashEventAmount(e, age, inflF) * (e.kind === "income" ? -1 : 1);
    else if (e.kind === "car") carCosts(e, age, infl, inflF, (_c, _l, a) => { amount += a; });
    else if (e.kind === "insurance") { if (age >= e.startAge && age < e.endAge) amount = e.premiumMonthly * 12 * MAN; }
    out.push({ age, amount: Math.round(amount) });
  }
  return out;
}
