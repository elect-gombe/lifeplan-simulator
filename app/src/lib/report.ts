import type { ScenarioResult, YearResult, MemberResult, Scenario, LifeEvent } from "./types";
import { EVENT_TYPES, resolveEventAge } from "./types";
import { EXPENSE_CATS, type ExpenseCategory } from "../components/IncomeExpenseChart";

// --- ヘルパー ---
const m = (v: number) => v === 0 ? "-" : `${Math.round(v / 10000).toLocaleString()}万`;
const mRaw = (v: number) => Math.round(v / 10000);

function mdTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(r => `| ${r.join(" | ")} |`),
  ].join("\n");
}

function expenseCats(yr: YearResult): Record<ExpenseCategory, number> {
  const data: Record<ExpenseCategory, number> = { living: yr.baseLivingExpense, housing: 0, child: 0, car: 0, insurance: 0, other: 0 };
  for (const c of yr.eventCostBreakdown) {
    if (c.amount <= 0) continue;
    const cat = EXPENSE_CATS.find(ct => ct.key !== "living" && ct.key !== "other" && ct.match(c.label));
    data[cat ? cat.key : "other"] += c.amount;
  }
  return data;
}

// --- セクション1: 基本設定サマリー ---
function settingsSummary(s: Scenario, params: { rr: number; inflationRate: number; hasRet: boolean; retAmt: number }, isFirst: boolean, baseScenario?: Scenario | null): string {
  const lines: string[] = [];

  if (isFirst) {
    lines.push("※ このレポートはライフプランシミュレーターの出力です。末尾にJSON設定を添付しています。");
    lines.push("※ JSON内の linkedToBase:true のシナリオは、シナリオAと同じ前提条件（配偶者・住居・NISA・子供・保険等）で計算されています。");
    lines.push("  JSON上の spouse.enabled:false 等はUI上の「独自設定なし＝Aを流用」を意味し、「配偶者なし」ではありません。");
    lines.push("※ 利回り設定の優先順位: Scenario.dcReturnRate/nisaReturnRate/taxableReturnRate → Scenario.rr → グローバルrr");
    lines.push("  未設定(undefined)のフィールドはリンク先 → グローバル値にフォールバックします。");
    lines.push("");
  }

  lines.push(`=== ${s.name}${s.linkedToBase ? "（Aベース＋差分）" : ""} ===`);
  if (s.linkedToBase) {
    lines.push(`※ このシナリオはAと同一の前提条件（収入・配偶者・住居・NISA・イベント等）をベースに、差分のみ変更しています。`);
    lines.push(`※ 以下の設定はAから継承されたものを含みます。`);
  }

  // リンク設定の解決: overrideSettingsが空=全設定リンク、含まれていない設定=Aの値を使用
  const base = s.linkedToBase && baseScenario ? baseScenario : null;
  const linked = !!base;
  const overSet = s.overrideSettings || [];
  const settingLinked = (key: string) => linked && !overSet.includes(key as any);
  const resolve = (key: string, fallback: any) => settingLinked(key) ? ((base as any)?.[key] ?? fallback) : ((s as any)[key] ?? fallback);

  const effCurrentAge = resolve("currentAge", s.currentAge);
  const effRetAge = resolve("retirementAge", s.retirementAge);
  const effSimEnd = resolve("simEndAge", s.simEndAge);
  lines.push(`期間: ${effCurrentAge}歳→${effSimEnd}歳（${effSimEnd - effCurrentAge}年） / 退職: ${effRetAge}歳`);

  const effectiveRR = resolve("rr", params.rr);
  const effectiveInflation = resolve("inflationRate", params.inflationRate);
  const rrSource = settingLinked("rr") ? '(Aから継承)' : (s.rr != null ? '(シナリオ独自)' : '');
  const infSource = settingLinked("inflationRate") ? '(Aから継承)' : (s.inflationRate != null ? '(シナリオ独自)' : '');
  lines.push(`運用利回り: ${effectiveRR}%${rrSource} / インフレ率: ${effectiveInflation}%${infSource}`);

  // 個別利回り: リンク時はAの値にフォールバック
  const effDCRR = s.dcReturnRate ?? (linked ? base?.dcReturnRate : undefined);
  const effNisaRR = s.nisaReturnRate ?? (linked ? base?.nisaReturnRate : undefined);
  const effTaxRR = s.taxableReturnRate ?? (linked ? base?.taxableReturnRate : undefined);
  const effCashRR = s.cashInterestRate ?? (linked ? base?.cashInterestRate : undefined);
  if (effDCRR != null || effNisaRR != null || effTaxRR != null || effCashRR != null) {
    lines.push(`個別利回り: DC${effDCRR ?? '共通'}% / NISA${effNisaRR ?? '共通'}% / 特定${effTaxRR ?? '共通'}% / 現金${effCashRR ?? 0}%`);
  }
  if (params.hasRet) lines.push(`会社退職金: ${Math.round(params.retAmt / 10000).toLocaleString()}万円`);

  // 配偶者（linkedToBaseの場合、計算にはAの配偶者が含まれるがJSON上はenabled:false）
  const hasSpouseInCalc = s.spouse?.enabled || (s.linkedToBase && !s.spouse?.enabled);
  if (s.spouse?.enabled) {
    lines.push(`配偶者: あり（${s.spouse.currentAge}歳、退職${s.spouse.retirementAge}歳）`);
  } else if (hasSpouseInCalc) {
    lines.push(`配偶者: あり（Aから継承）`);
  } else {
    lines.push(`配偶者: なし`);
  }

  // リンクシナリオの場合、Aから継承した設定を使う
  const effHousingTimeline = s.housingTimeline ?? base?.housingTimeline;
  const effNisa = s.nisa?.enabled ? s.nisa : (base?.nisa?.enabled ? base.nisa : null);
  const effDCMethod = s.dcReceiveMethod ?? base?.dcReceiveMethod;
  const effEvents = [...(s.events || []), ...(base ? (base.events || []).filter(e => !(s.excludedBaseEventIds || []).includes(e.id)) : [])];

  // 住居
  if (effHousingTimeline?.length) {
    const ht = effHousingTimeline;
    const phases = ht.map((p, i) => {
      const end = i < ht.length - 1 ? ht[i + 1].startAge : s.simEndAge;
      if (p.type === "rent") return `賃貸${p.startAge}-${end}歳(${p.rentMonthlyMan}万/月)`;
      if (p.type === "own" && p.propertyParams) {
        const pp = p.propertyParams;
        const rate = pp.rateType === "fixed" ? `固定${pp.fixedRate}%` : `変動${pp.variableInitRate}%→${pp.variableRiskRate}%`;
        return `持家${p.startAge}-${end}歳(${pp.priceMan}万/${rate}/${pp.loanYears}年)`;
      }
      return "";
    }).filter(Boolean);
    lines.push(`住居: ${phases.join(" → ")}${base && !s.housingTimeline ? '（Aから継承）' : ''}`);
  }

  // NISA
  if (effNisa) {
    const nisaRR = effNisaRR ?? effectiveRR;
    lines.push(`NISA: 年${effNisa.annualLimitMan}万×${effNisa.accounts}口座 / 生涯${effNisa.lifetimeLimitMan}万 / 利回り${nisaRR}%${!s.nisa?.enabled && base ? '（Aから継承）' : ''}`);
  }

  // DC
  if (effDCMethod) {
    const methodLabel = effDCMethod.type === "lump_sum" ? "一時金" : effDCMethod.type === "annuity" ? `年金${effDCMethod.annuityYears}年` : `併用(一時金${effDCMethod.combinedLumpSumRatio}%)`;
    lines.push(`DC受取: ${methodLabel}${!s.dcReceiveMethod && base ? '（Aから継承）' : ''}`);
  }

  // 子供
  const children = effEvents.filter(e => e.type === "child" && !e.parentId);
  if (children.length > 0) {
    lines.push(`子供: ${children.length}人（${children.map(c => `${c.label}${c.age}歳`).join("、")}）`);
  }

  // 保険
  const insurances = effEvents.filter(e => e.type === "insurance" && e.insuranceParams);
  for (const ins of insurances) {
    const ip = ins.insuranceParams!;
    if (ip.insuranceType === "term_life") {
      lines.push(`保険: ${ins.label} 定期${ip.lumpSumPayoutMan}万(保険料${ip.premiumMonthlyMan}万/月、〜${ip.coverageEndAge}歳)`);
    } else {
      lines.push(`保険: ${ins.label} 収入保障${ip.monthlyPayoutMan}万/月(保険料${ip.premiumMonthlyMan}万/月、〜${ip.payoutUntilAge}歳)`);
    }
  }

  if (s.hasFurusato) lines.push(`ふるさと納税: 利用`);

  return lines.join("\n");
}

// --- セクション2: 収入・税・手取りテーブル（毎年） ---
function incomeTable(yrs: YearResult[], s: Scenario): string {
  const hasSpouse = yrs.some(yr => yr.spouse.gross > 0);
  const spH = hasSpouse ? ["配偶者給与", "配偶者課税所得", "配偶者税率", "配偶者所得税", "配偶者住民税", "配偶者社保"] : [];
  const headers = ["年齢", "本人給与", "本人課税所得", "本人税率", "本人所得税", "本人住民税", "本人社保", ...spH, "本人年金", ...(hasSpouse ? ["配偶者年金"] : []), "手当", "ローン控除", "手取合計"];
  const rows = yrs.map(yr => {
    const loanDed = yr.self.housingLoanDeduction + yr.spouse.housingLoanDeduction;
    const spData = hasSpouse ? [
      m(yr.spouse.gross), m(yr.spouse.taxableIncome),
      yr.spouse.marginalRate > 0 ? `${yr.spouse.marginalRate}%` : "-",
      m(yr.spouse.incomeTax), m(yr.spouse.residentTax), m(yr.spouse.socialInsurance),
    ] : [];
    return [
      `${yr.age}`, m(yr.self.gross), m(yr.self.taxableIncome),
      yr.self.marginalRate > 0 ? `${yr.self.marginalRate}%` : "-",
      m(yr.self.incomeTax), m(yr.self.residentTax), m(yr.self.socialInsurance),
      ...spData,
      m(yr.self.pensionIncome), ...(hasSpouse ? [m(yr.spouse.pensionIncome)] : []),
      m(yr.childAllowance), m(loanDed), m(yr.takeHomePay),
    ];
  });
  return "【収入・税・手取り】※各項目は本人/配偶者別に表示、手取合計は世帯合計\n" + mdTable(headers, rows);
}

// --- セクション3: 支出・CFテーブル（毎年） ---
function expenseTableSection(yrs: YearResult[], s: Scenario): string {
  const headers = ["年齢", "生活費", "DC拠出", "住居費", "養育費", "車", "保険", "他", "支出計", "年間CF"];
  const rows = yrs.map(yr => {
    const cats = expenseCats(yr);
    const dcContrib = yr.self.dcContribution + yr.spouse.dcContribution;
    return [
      `${yr.age}`, m(cats.living), m(dcContrib), m(cats.housing), m(cats.child),
      m(cats.car), m(cats.insurance), m(cats.other), m(yr.totalExpense),
      `${yr.annualNetCashFlow >= 0 ? "+" : ""}${mRaw(yr.annualNetCashFlow)}万`,
    ];
  });
  return "【支出・CF】\n" + mdTable(headers, rows);
}

// --- セクション4: 資産残高テーブル（毎年） ---
function assetTable(yrs: YearResult[], s: Scenario): string {
  const hasSpouse = yrs.some(yr => yr.spouse.dcAsset > 0 || yr.spouse.nisaAsset > 0);
  const headers = ["年齢", "本人DC", ...(hasSpouse ? ["配偶者DC"] : []), "NISA", "NISA含み益", "特定", "特定含み益", "現金", "防衛月数", "ローン残", "純資産"];
  const rows = yrs.map(yr => {
    const monthlyExpense = yr.totalExpense / 12;
    const defenseMonths = monthlyExpense > 0 ? Math.round(yr.cashSavings / monthlyExpense * 10) / 10 : 0;
    return [
      `${yr.age}`, m(yr.self.dcAsset), ...(hasSpouse ? [m(yr.spouse.dcAsset)] : []),
      m(yr.nisaAsset), m(yr.nisaGain),
      m(yr.taxableAsset), m(yr.taxableGain),
      m(yr.cashSavings), defenseMonths > 0 ? `${defenseMonths}ヶ月` : "-",
      yr.loanBalance > 0 ? `▲${mRaw(yr.loanBalance)}万` : "-", m(yr.totalWealth),
    ];
  });
  return "【資産残高】※防衛月数=現金÷月間支出\n" + mdTable(headers, rows);
}

// --- セクション4b: NISA/特定 積立・取崩テーブル（毎年） ---
function investFlowTable(yrs: YearResult[]): string {
  const hasFlow = yrs.some(yr => yr.nisaContribution > 0 || yr.nisaWithdrawal > 0 || yr.taxableContribution > 0 || yr.taxableWithdrawal > 0);
  if (!hasFlow) return "";
  const headers = ["年齢", "NISA積立", "NISA取崩", "特定積立", "特定取崩", "年間CF"];
  const rows = yrs.map(yr => [
    `${yr.age}`,
    yr.nisaContribution > 0 ? `+${mRaw(yr.nisaContribution)}万` : "-",
    yr.nisaWithdrawal > 0 ? `▲${mRaw(yr.nisaWithdrawal)}万` : "-",
    yr.taxableContribution > 0 ? `+${mRaw(yr.taxableContribution)}万` : "-",
    yr.taxableWithdrawal > 0 ? `▲${mRaw(yr.taxableWithdrawal)}万` : "-",
    `${yr.annualNetCashFlow >= 0 ? "+" : ""}${mRaw(yr.annualNetCashFlow)}万`,
  ]);
  return "【NISA/特定口座 積立・取崩】\n" + mdTable(headers, rows);
}

// --- セクション6: ライフイベント一覧 ---
function eventList(events: LifeEvent[], allEvents: LifeEvent[]): string {
  const lines: string[] = ["【ライフイベント】"];
  const parents = events.filter(e => !e.parentId).sort((a, b) => a.age - b.age);

  for (const e of parents) {
    const et = EVENT_TYPES[e.type] || EVENT_TYPES.custom;
    const age = resolveEventAge(e, allEvents);

    if (e.type === "child") {
      lines.push("");
      lines.push(`${et.icon}${e.label}（${age}歳誕生、出産費${e.oneTimeCostMan}万、養育費${e.annualCostMan}万/年）`);
      // サブイベント展開
      const subs = allEvents.filter(s => s.parentId === e.id && s.type === "education").sort((a, b) => (a.ageOffset ?? 0) - (b.ageOffset ?? 0));
      if (subs.length > 0) {
        lines.push("  教育プラン:");
        let eduTotal = 0;
        for (const sub of subs) {
          const from = sub.ageOffset ?? 0;
          const to = from + sub.durationYears;
          const total = sub.annualCostMan * sub.durationYears;
          eduTotal += total;
          lines.push(`  - ${sub.label.replace(e.label + " ", "")} ${from}〜${to}歳 ${sub.annualCostMan}万/年 = ${total}万`);
        }
        const lastEdu = Math.max(...subs.map(s => (s.ageOffset ?? 0) + s.durationYears));
        const careTotal = e.annualCostMan * lastEdu;
        lines.push(`  教育費合計: ${eduTotal}万 / 養育費込み総額: ${eduTotal + careTotal + e.oneTimeCostMan}万`);
      }
      // 結婚支援金
      const wedding = allEvents.find(s => s.parentId === e.id && s.type === "custom" && s.label.includes("結婚"));
      if (wedding) {
        lines.push(`  結婚支援金: ${resolveEventAge(wedding, allEvents)}歳時 ${Math.abs(wedding.oneTimeCostMan)}万`);
      }
    } else if (e.propertyParams) {
      const pp = e.propertyParams;
      lines.push("");
      lines.push(`${et.icon}${e.label}（${age}歳）`);
      lines.push(`  物件: ${pp.priceMan}万 / 頭金${pp.downPaymentMan}万 / 借入${pp.priceMan - pp.downPaymentMan}万`);
      const rate = pp.rateType === "fixed" ? `固定${pp.fixedRate}%` : `変動${pp.variableInitRate}%(→${pp.variableRiseAfter}年後${pp.variableRiskRate}%)`;
      lines.push(`  ローン: ${rate} / ${pp.loanYears}年 / ${pp.repaymentType === "equal_payment" ? "元利均等" : "元金均等"}`);
      lines.push(`  管理費: ${pp.maintenanceMonthlyMan}万/月 / 固定資産税: ${pp.taxAnnualMan}万/年`);
      if (pp.hasLoanDeduction) lines.push(`  住宅ローン控除: 13年間`);
      for (const prep of pp.prepayments || []) {
        if (prep.amountMan > 0) lines.push(`  繰上返済: ${prep.age}歳 ${prep.amountMan}万（${prep.type === "shorten" ? "期間短縮" : "返済軽減"}）`);
      }
      if (pp.refinance) lines.push(`  借換: ${pp.refinance.age}歳 → ${pp.refinance.newRate}%/${pp.refinance.newLoanYears}年（手数料${pp.refinance.costMan}万）`);
      if (pp.saleAge) lines.push(`  売却予定: ${pp.saleAge}歳${pp.salePriceMan ? ` ${pp.salePriceMan}万` : ""}`);
    } else if (e.carParams) {
      const cp = e.carParams;
      lines.push(`${et.icon}${e.label}（${age}歳〜）${cp.priceMan}万${cp.replaceEveryYears > 0 ? `/${cp.replaceEveryYears}年毎買替` : ""}、維持費${cp.maintenanceAnnualMan}万/年、保険${cp.insuranceAnnualMan}万/年`);
    } else if (e.insuranceParams) {
      const ip = e.insuranceParams;
      if (ip.insuranceType === "term_life") {
        lines.push(`${et.icon}${e.label}（${age}歳〜${ip.coverageEndAge}歳）保険料${ip.premiumMonthlyMan}万/月、死亡保険金${ip.lumpSumPayoutMan}万`);
      } else {
        lines.push(`${et.icon}${e.label}（${age}歳〜${ip.coverageEndAge}歳）保険料${ip.premiumMonthlyMan}万/月、月額保障${ip.monthlyPayoutMan}万/月(〜${ip.payoutUntilAge}歳)`);
      }
    } else if (e.marketCrashParams) {
      const cp = e.marketCrashParams;
      const target = cp.target === "all" ? "全口座" : cp.target === "nisa" ? "NISA" : "特定口座";
      lines.push(`${et.icon}${e.label}（${age}歳）${target} -${cp.dropRate}%`);
    } else if (e.deathParams) {
      lines.push(`${et.icon}${e.label}（${age}歳）生活費${e.deathParams.expenseReductionPct}%、団信${e.deathParams.hasDanshin ? "あり" : "なし"}`);
    } else if (e.giftParams) {
      lines.push(`${et.icon}${e.label}（${age}歳）${e.giftParams.amountMan}万（${e.giftParams.giftType === "calendar" ? "暦年課税" : "相続時精算課税"}）`);
    } else {
      const parts = [`${et.icon}${e.label}（${age}歳${e.durationYears > 0 ? `〜${age + e.durationYears}歳` : ""}）`];
      if (e.oneTimeCostMan) parts.push(`一時費用${e.oneTimeCostMan}万`);
      if (e.annualCostMan) parts.push(`${e.annualCostMan}万/年`);
      lines.push(parts.join(" "));
    }
  }
  return lines.join("\n");
}

// --- セクション7: 総括 ---
function summarySection(result: ScenarioResult, yrs: YearResult[]): string {
  const last = yrs[yrs.length - 1];
  const lines: string[] = ["【総括】"];
  lines.push(`最終資産（${last.age}歳）: ${mRaw(last.totalWealth).toLocaleString()}万円`);
  lines.push(`  DC: ${mRaw(last.cumulativeDCAsset)}万 / NISA: ${mRaw(last.nisaAsset)}万 / 特定: ${mRaw(last.taxableAsset)}万 / 現金: ${mRaw(last.cashSavings)}万`);

  const totalIncome = yrs.reduce((s, yr) => s + yr.takeHomePay, 0);
  const totalExpense = yrs.reduce((s, yr) => s + yr.totalExpense, 0);
  const okuInc = Math.floor(totalIncome / 100000000);
  const manInc = Math.round((totalIncome % 100000000) / 10000);
  const okuExp = Math.floor(totalExpense / 100000000);
  const manExp = Math.round((totalExpense % 100000000) / 10000);
  lines.push(`生涯手取り合計: ${okuInc > 0 ? `約${okuInc}億` : ""}${manInc.toLocaleString()}万円`);
  lines.push(`生涯支出合計: ${okuExp > 0 ? `約${okuExp}億` : ""}${manExp.toLocaleString()}万円`);

  // DC受取
  const dc = result.dcReceiveDetail;
  lines.push(`DC受取: ${dc.method} → 税額${mRaw(dc.totalTax)}万 / 手取り${mRaw(dc.netAmount)}万`);

  // 最小値
  const minCF = yrs.reduce((min, yr) => yr.annualNetCashFlow < min.annualNetCashFlow ? yr : min, yrs[0]);
  const minWealth = yrs.reduce((min, yr) => yr.totalWealth < min.totalWealth ? yr : min, yrs[0]);
  lines.push(`年間CF最小: ${minCF.age}歳時 ${minCF.annualNetCashFlow >= 0 ? "+" : ""}${mRaw(minCF.annualNetCashFlow)}万`);
  lines.push(`純資産最小: ${minWealth.age}歳時 ${mRaw(minWealth.totalWealth).toLocaleString()}万`);

  return lines.join("\n");
}

// --- セクション8: 5年毎の詳細計算根拠ダンプ ---
function detailDump(yrs: YearResult[], interval: number = 5): string {
  const lines: string[] = ["【計算根拠（5年毎の詳細）】"];
  const f = (v: number) => `¥${Math.round(v).toLocaleString()}`; // 円表記
  const fm = (v: number) => v === 0 ? "-" : `${Math.round(v / 10000).toLocaleString()}万`;

  const dumpMember = (label: string, mr: MemberResult, yr: YearResult) => {
    if (mr.gross <= 0 && mr.pensionIncome <= 0 && mr.dcAsset <= 0) return [];
    const out: string[] = [];
    out.push(`  ■ ${label}`);
    if (mr.gross > 0) {
      out.push(`    給与収入: ${f(mr.gross)}`);
      out.push(`    ├ 給与所得控除: ${f(mr.employeeDeduction)}`);
      out.push(`    ├ 社会保険料控除: ${f(mr.socialInsuranceDeduction)} (厚年${f(mr.siPension)} 健保${f(mr.siHealth)} 介護${f(mr.siNursing)} 雇用${f(mr.siEmployment)})`);
      out.push(`    ├ 基礎控除: ${f(yr.basicDeduction)}`);
      if (mr.dependentDeduction > 0) out.push(`    ├ 扶養控除: ${f(mr.dependentDeduction)}`);
      if (yr.spouseDeductionAmount > 0 && label === "本人") out.push(`    ├ 配偶者控除: ${f(yr.spouseDeductionAmount)}`);
      if (mr.dcIdecoDeduction > 0) out.push(`    ├ DC/iDeCo控除: ${f(mr.dcIdecoDeduction)} (DC自己負担${f(mr.selfDCContribution)} + iDeCo${f(mr.idecoContribution)})`);
      if (mr.lifeInsuranceDeductionAmount > 0) out.push(`    ├ 生命保険料控除: ${f(mr.lifeInsuranceDeductionAmount)}`);
      if (mr.furusatoDeduction > 0) out.push(`    ├ ふるさと納税控除: ${f(mr.furusatoDeduction)} (寄付${f(mr.furusatoDonation)} 上限${f(mr.furusatoLimit)})`);
      out.push(`    → 課税所得: ${f(mr.taxableIncome)} (税率${mr.marginalRate}%)`);
      out.push(`    → 所得税: ${f(mr.incomeTax)}`);
      out.push(`    → 住民税: ${f(mr.residentTax)}`);
      if (mr.housingLoanDeductionAvail > 0) {
        out.push(`    → 住宅ローン控除: 可能額${f(mr.housingLoanDeductionAvail)} → IT${f(mr.housingLoanDeductionIT)} + RT${f(mr.housingLoanDeductionRT)} = ${f(mr.housingLoanDeduction)}`);
      }
      out.push(`    → 社会保険料(実額): ${f(mr.socialInsurance)}`);
      out.push(`    → 手取り: ${f(mr.takeHome)}`);
    }
    if (mr.pensionIncome > 0) {
      out.push(`    年金収入: ${f(mr.pensionIncome)} (控除${f(mr.pensionDeduction)} 雑所得${f(mr.pensionTaxableIncome)} IT${f(mr.pensionIncomeTax)} RT${f(mr.pensionResidentTax)})`);
    }
    if (mr.dcAsset > 0) out.push(`    DC資産: ${fm(mr.dcAsset)}`);
    if (mr.dcReceiveLumpSum > 0 || mr.dcReceiveAnnuityAnnual > 0) {
      out.push(`    DC受取: 一時金${fm(mr.dcReceiveLumpSum)} 年金${fm(mr.dcReceiveAnnuityAnnual)}/年 退職所得控除${fm(mr.dcRetirementDeduction)} 税${fm(mr.dcReceiveTax)}`);
    }
    if (mr.nisaAsset > 0) out.push(`    NISA: ${fm(mr.nisaAsset)} (簿価${fm(mr.nisaCostBasis)} 積立${fm(mr.nisaContribution)}/年)`);
    if (mr.loanBalance > 0) out.push(`    ローン残高: ${fm(mr.loanBalance)}`);
    if (mr.incomeTaxSaving > 0 || mr.residentTaxSaving > 0 || mr.socialInsuranceSaving > 0) {
      out.push(`    DC節税: IT${f(mr.incomeTaxSaving)} + RT${f(mr.residentTaxSaving)} + 社保${f(mr.socialInsuranceSaving)} = ${f(mr.incomeTaxSaving + mr.residentTaxSaving + mr.socialInsuranceSaving)}`);
    }
    return out;
  };

  for (const yr of yrs) {
    if ((yr.age - yrs[0].age) % interval !== 0 && yr.age !== yrs[yrs.length - 1].age) continue;
    lines.push("");
    lines.push(`━━━ ${yr.age}歳 ━━━`);

    // 本人・配偶者
    lines.push(...dumpMember("本人", yr.self, yr));
    lines.push(...dumpMember("配偶者", yr.spouse, yr));

    // 世帯
    lines.push(`  ■ 世帯`);
    lines.push(`    手取合計: ${f(yr.takeHomePay)}`);
    if (yr.childAllowance > 0) lines.push(`    児童手当: ${f(yr.childAllowance)}`);
    if (yr.survivorIncome > 0) {
      lines.push(`    遺族収入: ${f(yr.survivorIncome)} (基礎${fm(yr.survivorBasicPension)} 厚生${fm(yr.survivorEmployeePension)} 寡婦${fm(yr.survivorWidowSupplement)} 収入保障${fm(yr.survivorIncomeProtection)})`);
    }
    if (yr.pensionReduction > 0) lines.push(`    在職老齢年金減額: ${f(yr.pensionReduction)}`);
    lines.push(`    基本生活費: ${f(yr.baseLivingExpense)}`);
    if (yr.eventCostBreakdown.length > 0) {
      lines.push(`    イベント支出:`);
      for (const c of yr.eventCostBreakdown) {
        if (c.amount !== 0) lines.push(`      ${c.label}: ${f(c.amount)}${c.detail ? ` (${c.detail})` : ""}`);
      }
    }
    lines.push(`    支出合計: ${f(yr.totalExpense)}`);
    lines.push(`    年間CF: ${yr.annualNetCashFlow >= 0 ? "+" : ""}${f(yr.annualNetCashFlow)}`);
    lines.push(`    資産: DC${fm(yr.cumulativeDCAsset)} NISA${fm(yr.nisaAsset)} 特定${fm(yr.taxableAsset)}(含み益${fm(yr.taxableGain)}) 現金${fm(yr.cashSavings)} 再投資${fm(yr.cumulativeReinvest)} ローン残▲${fm(yr.loanBalance)}`);
    lines.push(`    → 純資産: ${fm(yr.totalWealth)}`);
    if (yr.inheritanceTax > 0) lines.push(`    相続税: ${fm(yr.inheritanceTax)} (課税遺産${fm(yr.inheritanceEstate)})`);
    if (yr.insurancePremiumTotal > 0) lines.push(`    保険料合計: ${f(yr.insurancePremiumTotal)}`);
    if (yr.insurancePayoutTotal > 0) lines.push(`    保険金: ${f(yr.insurancePayoutTotal)}`);
    if (yr.crashLoss > 0) lines.push(`    📉暴落評価損: ${f(yr.crashLoss)} (${yr.crashDetail.trim()}) ※支出ではなく含み損`);
  }
  return lines.join("\n");
}

// --- メイン ---
export function generateReport(
  result: ScenarioResult,
  params: { rr: number; inflationRate: number; hasRet: boolean; retAmt: number },
  isFirst: boolean = true,
  baseScenario?: Scenario | null,
): string {
  const { scenario: s, yearResults: yrs } = result;
  if (!yrs.length) return "(データなし)";
  return [
    settingsSummary(s, params, isFirst, baseScenario),
    "",
    incomeTable(yrs, s),
    "",
    expenseTableSection(yrs, s),
    "",
    assetTable(yrs, s),
    "",
    investFlowTable(yrs),
    "",
    detailDump(yrs),
    "",
    eventList(s.events, s.events),
    "",
    summarySection(result, yrs),
  ].join("\n");
}
