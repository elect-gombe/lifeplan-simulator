import type { ScenarioResult, YearResult, MemberResult, Scenario, LifeEvent } from "./types";
import { EVENT_TYPES, resolveEventAge } from "./types";
import { EXPENSE_CATS, type ExpenseCategory } from "../components/IncomeExpenseChart";

// --- ヘルパー ---
const m = (v: number) => v === 0 ? "-" : `${Math.round(v / 10000)}万`;
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
    lines.push("※ 重要: linkedToBase:true かつ overrideSettings:[] のシナリオでは、JSON上の rr/inflationRate 等の値は");
    lines.push("  計算に使用されません（Aの値が適用されます）。JSONはUI状態の保存用であり、実効値は上記レポート本文を参照してください。");
    lines.push("※ nisa.returnRate はレガシーフィールドです。実際の利回りは Scenario.nisaReturnRate → Scenario.rr → グローバルrr の順に解決されます。");
    lines.push("※ 保険イベント: 定期保険(term_life)は死亡年にlumpSumPayoutManを一括支払い。収入保障(income_protection)はmonthlyPayoutMan×12を毎年payoutUntilAgeまで継続支払い（lumpSumPayoutManは使用されません）。");
    lines.push("※ 死亡イベント(deathParams)の incomeProtectionManPerMonth は保険イベントとは別枠の年額給付設定です（同一対象の保険イベントがある場合は無視されます）。");
    lines.push("※ 中高齢寡婦加算は令和7年改正(2028年施行)により段階的に廃止されます。死亡年が2028年以降の場合、逓減率が適用されます。");
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
  lines.push(`期間: ${effCurrentAge}〜${effSimEnd - 1}歳（${effSimEnd - effCurrentAge}年間） / 退職: ${effRetAge}歳`);

  const effectiveRR = resolve("rr", params.rr);
  const effectiveInflation = resolve("inflationRate", params.inflationRate);
  const rrSource = settingLinked("rr") ? '(Aから継承)' : (s.rr != null ? '(シナリオ独自)' : '');
  const infSource = settingLinked("inflationRate") ? '(Aから継承)' : (s.inflationRate != null ? '(シナリオ独自)' : '');
  const effectiveMacroSlide = resolve("macroSlideRate", -0.8);
  const msSource = settingLinked("macroSlideRate") ? '(Aから継承)' : (s.macroSlideRate != null ? '(シナリオ独自)' : '');
  lines.push(`運用利回り: ${effectiveRR}%${rrSource} / インフレ率: ${effectiveInflation}%${infSource} / マクロスライド: ${effectiveMacroSlide}%${msSource}`);

  // 個別利回り: リンク時はAの値にフォールバック
  const effDCRR = s.dcReturnRate ?? (linked ? base?.dcReturnRate : undefined);
  const effNisaRR = s.nisaReturnRate ?? (linked ? base?.nisaReturnRate : undefined);
  const effTaxRR = s.taxableReturnRate ?? (linked ? base?.taxableReturnRate : undefined);
  const effCashRR = s.cashInterestRate ?? (linked ? base?.cashInterestRate : undefined);
  if (effDCRR != null || effNisaRR != null || effTaxRR != null || effCashRR != null) {
    lines.push(`個別利回り: DC${effDCRR ?? '共通'}% / NISA${effNisaRR ?? '共通'}% / 特定${effTaxRR ?? '共通'}% / 現金${effCashRR ?? 0}%`);
  }
  if (params.hasRet) lines.push(`会社退職金: ${Math.round(params.retAmt / 10000)}万円`);

  // Phase 1: 生活費自動調整
  const ler = s.livingExpenseRules;
  if (ler?.enabled) {
    lines.push(`生活費自動調整: ON（子独立${ler.childIndependenceAge}歳時1人あたり-${ler.reductionPerChildPct}% / 本人万一後${ler.selfDeathReductionPct}% / 配偶者万一後${ler.spouseDeathReductionPct}%）`);
  }

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
  const hasSurvivor = yrs.some(yr => yr.survivorIncome > 0 || yr.insurancePayoutTotal > 0);
  const spH = hasSpouse ? ["配偶者給与", "配偶者課税所得", "配偶者税率", "配偶者所得税", "配偶者住民税", "配偶者社保"] : [];
  const surH = hasSurvivor ? ["遺族収入", "保険金"] : [];
  const headers = ["年齢", "本人給与", "本人課税所得", "本人税率", "本人所得税", "本人住民税", "本人社保", ...spH, "本人年金", ...(hasSpouse ? ["配偶者年金"] : []), ...surH, "手当", "ローン控除", "手取合計"];
  const rows = yrs.map(yr => {
    const loanDed = yr.self.housingLoanDeduction + yr.spouse.housingLoanDeduction;
    const spData = hasSpouse ? [
      m(yr.spouse.gross), m(yr.spouse.taxableIncome),
      yr.spouse.marginalRate > 0 ? `${yr.spouse.marginalRate}%` : "-",
      m(yr.spouse.incomeTax), m(yr.spouse.residentTax), m(yr.spouse.socialInsurance),
    ] : [];
    const surData = hasSurvivor ? [m(yr.survivorIncome), m(yr.insurancePayoutTotal)] : [];
    return [
      `${yr.age}`, m(yr.self.gross), m(yr.self.taxableIncome),
      yr.self.marginalRate > 0 ? `${yr.self.marginalRate}%` : "-",
      m(yr.self.incomeTax), m(yr.self.residentTax), m(yr.self.socialInsurance),
      ...spData,
      m(yr.self.pensionIncome), ...(hasSpouse ? [m(yr.spouse.pensionIncome)] : []),
      ...surData,
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
  const headers = ["年齢", "本人DC", ...(hasSpouse ? ["配偶者DC"] : []), "NISA", "NISA含み益", "特定", "特定含み益", "現金", "防衛月数", "ローン残", "金融資産計"];
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
  lines.push(`最終資産（${last.age}歳）: ${mRaw(last.totalWealth)}万円`);
  lines.push(`  DC: ${mRaw(last.cumulativeDCAsset)}万 / NISA: ${mRaw(last.nisaAsset)}万 / 特定: ${mRaw(last.taxableAsset)}万 / 現金: ${mRaw(last.cashSavings)}万`);

  const totalIncome = yrs.reduce((s, yr) => s + yr.takeHomePay, 0);
  const totalExpense = yrs.reduce((s, yr) => s + yr.totalExpense, 0);
  const okuInc = Math.floor(totalIncome / 100000000);
  const manInc = Math.round((totalIncome % 100000000) / 10000);
  const okuExp = Math.floor(totalExpense / 100000000);
  const manExp = Math.round((totalExpense % 100000000) / 10000);
  lines.push(`生涯手取り合計: ${okuInc > 0 ? `約${okuInc}億` : ""}${manInc}万円`);
  lines.push(`生涯支出合計: ${okuExp > 0 ? `約${okuExp}億` : ""}${manExp}万円`);

  // DC受取（本人＋配偶者）
  const dc = result.dcReceiveDetail;
  const spDC = result.spouseDCReceiveDetail;
  const totalDCTax = dc.totalTax + (spDC?.totalTax || 0);
  const totalDCNet = dc.netAmount + (spDC?.netAmount || 0);
  lines.push(`DC受取: ${dc.method} → 税額${mRaw(totalDCTax)}万 / 手取り${mRaw(totalDCNet)}万`);
  if (spDC && spDC.netAmount > 0) lines.push(`  (本人: ${mRaw(dc.netAmount)}万 / 配偶者: ${mRaw(spDC.netAmount)}万)`);

  // 最小値
  const minCF = yrs.reduce((min, yr) => yr.annualNetCashFlow < min.annualNetCashFlow ? yr : min, yrs[0]);
  const minWealth = yrs.reduce((min, yr) => yr.totalWealth < min.totalWealth ? yr : min, yrs[0]);
  lines.push(`年間CF最小: ${minCF.age}歳時 ${minCF.annualNetCashFlow >= 0 ? "+" : ""}${mRaw(minCF.annualNetCashFlow)}万`);
  lines.push(`金融資産計最小: ${minWealth.age}歳時 ${mRaw(minWealth.totalWealth)}万`);

  return lines.join("\n");
}

// --- セクション8: 5年毎の詳細計算根拠ダンプ ---
function detailDump(yrs: YearResult[], interval: number = 5): string {
  const lines: string[] = ["【計算根拠（5年毎の詳細）】"];
  const f = (v: number) => `¥${Math.round(v)}`; // 円表記
  const fm = (v: number) => v === 0 ? "-" : `${Math.round(v / 10000)}万`;

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
    if (yr.survivorIncome > 0 || yr.insurancePayoutTotal > 0) {
      const parts: string[] = [];
      if (yr.survivorIncome > 0) parts.push(`基礎${fm(yr.survivorBasicPension)} 厚生${fm(yr.survivorEmployeePension)} 寡婦${fm(yr.survivorWidowSupplement)}`);
      if (yr.survivorIncomeProtection > 0) parts.push(`収入保障${fm(yr.survivorIncomeProtection)}`);
      if (yr.insurancePayoutTotal > 0) parts.push(`保険${fm(yr.insurancePayoutTotal)}`);
      const total = yr.survivorIncome + yr.insurancePayoutTotal;
      lines.push(`    遺族収入: ${f(total)} (${parts.join(" ")})`);
    }
    if (yr.pensionReduction > 0) lines.push(`    在職老齢年金減額: ${f(yr.pensionReduction)}`);
    lines.push(`    基本生活費: ${f(yr.baseLivingExpense)}`);
    if (yr.eventCostBreakdown.length > 0) {
      const expenses = yr.eventCostBreakdown.filter(c => c.amount > 0);
      const transfers = yr.eventCostBreakdown.filter(c => c.amount < 0);
      if (expenses.length > 0) {
        lines.push(`    イベント支出:`);
        for (const c of expenses) {
          lines.push(`      ${c.label}: ${f(c.amount)}${c.detail ? ` (${c.detail})` : ""}`);
        }
      }
      if (transfers.length > 0) {
        lines.push(`    資産移転(収入):`);
        for (const c of transfers) {
          lines.push(`      ${c.label}: ${f(-c.amount)}${c.detail ? ` (${c.detail})` : ""}`);
        }
      }
    }
    lines.push(`    支出合計: ${f(yr.totalExpense)}`);
    lines.push(`    年間CF: ${yr.annualNetCashFlow >= 0 ? "+" : ""}${f(yr.annualNetCashFlow)}`);
    lines.push(`    資産: DC${fm(yr.cumulativeDCAsset)} NISA${fm(yr.nisaAsset)} 特定${fm(yr.taxableAsset)}(含み益${fm(yr.taxableGain)}) 現金${fm(yr.cashSavings)} 再投資${fm(yr.cumulativeReinvest)} ローン残▲${fm(yr.loanBalance)}`);
    lines.push(`    → 金融資産計: ${fm(yr.totalWealth)}`);
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

// --- LLM分析指示プロンプト ---
const LLM_ANALYSIS_PROMPT = `【ライフプラン分析指示】

あなたは中立的なライフプラン分析者です。
与えられたシミュレーション結果をもとに、家計の持続可能性、下振れ耐性、選択肢の柔軟性を評価し、相談者が意思決定しやすいレポートを作成してください。

この分析の目的は、一般論を述べることではなく、
「このケースでは何が家計を支えており、どこが脆く、何を動かすと改善余地が大きいか」
を具体的に示すことです。

────────────────
■ 最重要ルール
────────────────
- 入力に存在する事実だけで分析すること
- 数値根拠が取れない論点は評価しないこと
- 不明な点、不整合、制度依存の点は「不明」「要確認」と明記すること
- 本文要約より、表・数値・JSONなどの構造化データを優先すること
- 構造化データと本文が矛盾する場合は、まず構造化データを優先し、本文は補足扱いとすること
- すべての観点を無理に評価しないこと。重要度の高い論点だけを扱うこと
- 一般的なFP知識をそのまま列挙せず、このケースの数字・年齢・イベントに結びついた判断だけを書くこと
- 「教育費を見直す」「住居費を見直す」など抽象表現だけで終えず、どの費目・どの時期・どの構造が問題かまで具体化すること
- 断定しすぎず、複数の合理的な選択肢がある場合はトレードオフを示すこと
- 出力の見栄えより、数値整合性と論点の優先順位を重視すること

────────────────
■ 分析の基本姿勢
────────────────
- まず事実を整理し、その後に評価すること
- 先に結論を書こうとせず、どの数字が何を示しているかを確認してから総評を書くこと
- 「何が起きているか」だけでなく、「なぜ起きているか」「一時要因か構造要因か」まで踏み込むこと
- 「負担が大きい費目」ではなく、「見直し余地が大きい費目」「今しか動かせない意思決定」を重視すること
- 資産残高だけでなく、現金・課税口座・NISA等の内訳も見て、流動性と取崩し実務を評価すること
- 複数シナリオがある場合、単にどちらが良いかで終えず、差が生じるメカニズムを説明すること

────────────────
■ 優先順位
────────────────
重要論点は、原則として次の順で確認すること。
すべて扱う必要はない。重要度の高いものを優先すること。

1. 資金ショート、資産枯渇、家計維持不能
2. 長期の連続赤字、構造的な収支不一致
3. 老後資金の持続性、資産寿命、取崩し余地
4. 住宅取得・ローン・教育費など大型固定負担の集中
5. 死亡シナリオにおける初期ショック吸収力と長期持続性
6. 流動性不足、取り崩し順序、柔軟性低下
7. その他、将来の選択肢を狭める要因

────────────────
■ 内部分析手順
────────────────
以下の順で内部的に整理してから、最後にレポートを出力すること。
途中経過のメモは出力しなくてよい。

Step 1. 前提の事実整理
以下を入力から確認し、確認できないものは「不明」とする。
- 世帯類型（単身 / 片働き / 共働き）
- 就業期間、退職時期、年金開始の有無
- 子どもの有無・人数・誕生時期
- 賃貸 / 持家、住宅取得年齢、ローン条件、ペアローン有無
- 死亡シナリオ有無、死亡時年齢、団信・保険・遺族収入の有無
- 年間キャッシュフローの赤字年、連続赤字期間、最大赤字
- 金融資産・純資産の最低時点と最終時点
- 老後の赤字有無、年金開始後の資産推移
- 教育費・住居費・車・保険など主要支出のピーク時期
- 資産内訳（現金、NISA、特定口座、DC等）
- シナリオ比較に使える差分情報

Step 2. 赤字・負担の原因分解
赤字や資産減少がある場合は、単に「赤字がある」と書かず、主因を分解すること。
確認できる範囲で、以下を判定する。
- 主因は何か（教育費、住宅費、生活費、車、保険、収入減、老後収入不足など）
- その要因は一時的ショックか、構造的な収支不一致か
- 何年間続くか
- 自然回復する局面か、放置すると続く局面か
- その論点はA/Bどちらに特有か、両方に共通か

Step 3. 脆弱性と柔軟性の判定
以下を確認し、「成立している理由」と「崩れやすい条件」を整理する。
- 家計が成立している主因は何か（共働き収入、初期資産、運用益、保険、団信など）
- 下振れ時に吸収余地があるか
- 現金・低リスク資産がどれだけあるか
- 老後赤字をどの資産で埋める構造か
- 一度決めると戻しにくい意思決定は何か（住宅取得、進学方針など）
- 今動かないと後で調整しにくくなる論点は何か

Step 4. 重要論点の抽出
重要論点は最大3件を目安とする。
各論点は「金額が大きい」だけでなく、以下を踏まえて選ぶこと。
- 家計破綻や資産寿命に直結するか
- 長期に効くか
- 今しか動かせないか
- シナリオ差の主因になっているか
- 見直し効果が大きいか

Step 5. 改善提案の設計
提案は一般論にしないこと。
各提案では以下を必ず考慮すること。
- 何を動かす提案か
- どの論点の、どの構造に効くのか
- 効果が大きい理由は何か
- 実行可能性は高いか低いか
- いつまでに判断しないと効果が落ちるか
- 代替案はあるか
- 副作用やトレードオフは何か

────────────────
■ 詳細観点（該当する場合のみ評価）
────────────────

【家計収支の持続性】
- 赤字年の有無だけでなく、最長連続赤字、最大赤字、その前後の回復余地を見ること
- 単年イベント赤字か、構造赤字かを区別すること
- 現役期・教育期・老後期で性質が違う場合は分けて書くこと

【教育費・扶養イベント】
- 総額だけでなく、「何人分が同時に重なっているか」「何年続くか」を重視すること
- 最も厳しい年について、何のイベントが重なっているかを具体的に書くこと
- 教育費ピークが一過性か、数年継続かを判定すること
- 単なる総額論ではなく、時期集中リスクとして評価すること

【住宅取得・ローン】
- 購入時の単年ショックと、その後の固定費負担を分けて評価すること
- 返済負担が教育費や老後準備とどの時期に重なるかを見ること
- ペアローンの場合、死亡時にどの負担が消え、どの負担が残るかに着目すること
- 「買えるかどうか」ではなく、「買った後の柔軟性がどう変わるか」を見ること

【死亡シナリオ・保険】
- 死亡直後の資金ショック吸収力と、その後の長期収支を分けて評価すること
- 保険金・遺族収入・団信で初期不足が埋まっていても、長期で構造赤字ならその旨を明記すること
- 「保障が足りているか」ではなく、「どの期間に、どの役割を果たしているか」を見ること
- 制度依存の評価は断定せず要確認とすること

【老後資金】
- 最終資産額だけでなく、年金開始後の年間赤字と取崩し構造を重視すること
- 何歳までシミュレーションされているかを明記し、それ以降は断定しないこと
- 老後赤字があっても資産が厚いのか、薄いのかを区別すること
- 退職前後の資産構成と現金余力も確認すること

【資産内訳・流動性】
- 総資産額だけでなく、現金・NISA・課税口座・DCなどの内訳を見ること
- 取り崩しやすい資産が少ない場合は、柔軟性低下として評価すること
- 「資産はあるが現金が薄い」場合は、その旨を明記すること
- 老後の取り崩し順序まで断定は不要だが、実務上の扱いやすさ・柔軟性には言及してよい

【成立理由の特定】
- このプランが成立しているなら、その理由を特定すること
- 例: 共働き継続、初期資産の厚み、運用前提、団信、保険、教育費終了後の改善など
- その成立条件が崩れた場合に何が弱いかも示すこと

────────────────
■ 出力形式
────────────────

### 1. 前提整理
入力から確認できた前提を簡潔にまとめる。
- 世帯類型
- 子ども
- 住居
- 死亡シナリオ
- 赤字年・連続期間
- 金融資産の最低時点と最終時点
- 老後赤字と資産寿命の確認範囲
- 大きな支出イベントの集中時期
- 保険・遺族保障の把握範囲
不明点があれば明記する。

### 2. 総評
3〜5行で要約する。
最も重要な結論を最初に書くこと。
以下の3点をできるだけ含めること。
- このプランは現時点で成立しているのか
- 最も脆い局面はどこか
- 何が成立を支えているのか

### 3. 重要論点
重要なものだけを書く。最大3件を目安とする。
分類は以下のいずれかとする。
- 🔴 要対策: 放置すると資金不足・計画破綻・大きな選択肢制約につながる可能性が高い
- 🟡 要注意: 直ちに破綻ではないが、下振れ時に脆く、見直し余地が大きい
- 🟢 良好: 明確な余裕や強みがあり、プランの成立を支えている要素

各論点は必ず以下の順で書くこと。
- 論点
- 根拠（必ず具体的な年齢・年・金額・資産内訳など、入力から確認できる数値を引用）
- 主因（何がこの状態を生んでいるか）
- 判断
- 補足（不確実性、前提依存、トレードオフ）

※ 「主因」は必須。
※ 単に問題を言うだけでなく、その問題が一時要因か構造要因かが分かるように書くこと。

### 4. 論点の構造
重要論点ごとに、以下を簡潔に整理する。
- 一時要因か / 構造要因か
- いつまで続くか
- 調整しやすいか / しにくいか
- 今動くべきか / 後でもよいか
- シナリオA/Bのどちらに強く効くか

### 5. シナリオ比較（複数シナリオがある場合のみ）
以下を簡潔に示す。
- より安定しているシナリオ
- 差が出た主因
- 共通リスク
- 一方のシナリオだけで顕在化するリスク
- 最終資産差だけでなく、途中の家計柔軟性の差

### 6. 改善提案
影響度順に1〜3件。
各提案には以下を含めること。
- 何を見直すか
- どの論点の、どの構造に効くか
- なぜ優先度が高いか
- いつまでに判断・実行すべきか
- 期待できる効果（定量化できる場合のみ数値、難しい場合は定性的に）
- 実行難易度（すぐできる / 検討が必要 / 専門家に相談推奨）
- 代替案
- 副作用・注意点

※ 提案は抽象語で終えないこと。
※ 例: 「教育費を見直す」ではなく、「47〜52歳の同時在学ピークを緩和する方向で、どの進学イベントが負担の主因かを優先確認する」のように書くこと。
※ 効果が読めない提案は無理に定量化しないこと。

### 7. 継続監視ポイント
相談者が今後モニタリングすべき項目を2〜4件挙げる。
各項目について以下を書くこと。
- 何を確認するか
- いつ確認するか
- なぜ重要か

────────────────
■ 禁止事項
────────────────
- 入力にない制度詳細を断定しない
- 参考基準だけで機械的に良し悪しを決めない
- 数値根拠がないのに金額効果を推定しない
- 一般的なFPアドバイスを網羅列挙しない
- 重要でない論点まで無理に拾わない
- 総資産額だけ見て「問題ない」と短絡しない
- 「教育費が高い」「老後が不安」など、誰にでも当てはまる表現で終えない

────────────────
■ 補足
────────────────
- 死亡以外のリスクシナリオ（障害・就業不能等）が入力にない場合は、その旨を簡潔に注記してよい
- 相続税や制度評価など外部条件に依存する論点は、資産規模や論点の存在に触れる程度に留め、断定しないこと
- 運用利回りの妥当性は、アセットアロケーション等の前提が不明なら評価保留としてよい
- 長寿化リスクは、シミュレーション終了年齢を明示したうえで「以後は要確認」と書くこと`;

export function generateAnalysisPrompt(): string {
  return LLM_ANALYSIS_PROMPT;
}
