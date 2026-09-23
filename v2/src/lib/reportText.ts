/**
 * テキスト（Markdown）レポート: ChatGPT 等の LLM に貼って相談するための全量ダンプ。
 * 構成: 前提サマリー → 毎年の表（収入・税 / 支出・収支 / 資産残高 / 運用フロー）→ 5年ごとの計算根拠 → できごと → 総括
 * を比較対象の全プランについて出力し、末尾に設定 JSON（再現用）と任意で LLM 分析指示を付ける。
 */
import type { Plan } from "@/domain/model";
import { STAGE_ORDER } from "@/domain/model";
import { LINK_GROUPS } from "@/domain/link";
import type { SimResult, YearRow } from "@/engine/simulate";
import type { Summary } from "@/engine/summary";
import { STAGE_TABLE, totalEducationCost } from "@/engine/education";
import { buildStatement } from "@/features/dashboard/YearStatement";
import { LLM_ANALYSIS_PROMPT } from "./llmPrompt";

const man = (v: number) => (Math.abs(v) < 5000 ? "-" : `${Math.round(v / 10000).toLocaleString("ja-JP")}万`);
const manS = (v: number) => (Math.abs(v) < 5000 ? "-" : `${v > 0 ? "+" : ""}${Math.round(v / 10000).toLocaleString("ja-JP")}万`);
const oku = (v: number) => { const o = Math.floor(Math.abs(v) / 1e8), m = Math.round((Math.abs(v) % 1e8) / 1e4); return `${v < 0 ? "−" : ""}${o > 0 ? `${o}億` : ""}${m.toLocaleString("ja-JP")}万円`; };

function mdTable(headers: string[], rows: string[][]): string {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(r => `| ${r.join(" | ")} |`)].join("\n");
}

function memberLabel(m: Plan["self"]): string {
  const emp = m.employment === "employee" ? "会社員・公務員" : m.employment === "selfEmployed" ? "自営業" : "働いていない";
  const inc = m.income.map(p => `${p.age}歳 ${p.value}万`).join(" → ");
  const dc = [(m.dc.company[0]?.value ?? 0) && `事業主掛金 ${m.dc.company[0].value.toLocaleString()}円/月`, (m.dc.matching[0]?.value ?? 0) && `選択制/マッチング ${m.dc.matching[0].value.toLocaleString()}円/月`, (m.dc.ideco[0]?.value ?? 0) && `iDeCo ${m.dc.ideco[0].value.toLocaleString()}円/月`].filter(Boolean).join("、");
  return `${m.name}: ${m.age}歳・${m.sex === "male" ? "男性" : "女性"}・${emp}。年収(額面) ${inc}、昇給 ${m.incomeGrowthPct}%/年、就職 ${m.workStartAge}歳、退職 ${m.retireAge}歳、年金開始 ${m.pensionStartAge}歳`
    + (m.severancePay ? `、退職金 ${m.severancePay}万` : "") + (m.furusato ? "、ふるさと納税あり" : "")
    + (dc ? `。DC: ${dc}（受取: ${m.dc.receive.method === "lump" ? "一時金" : m.dc.receive.method === "annuity" ? `年金${m.dc.receive.annuityYears}年` : `併用 一時金${m.dc.receive.lumpRatioPct}%`}・${m.dc.receive.startAge}歳〜）` : "");
}

function settings(plan: Plan, raw: Plan | undefined, allPlans: Plan[]): string {
  const L: string[] = [`## ${plan.name}`];
  if (raw?.link) {
    const base = allPlans.find(p => p.id === raw.link!.baseId);
    const ov = raw.link.overrides.map(g => LINK_GROUPS.find(x => x.key === g)?.label ?? g);
    L.push(`※ このプランは「${base?.name ?? "?"}」にリンクしています。上書きしているセクション: ${ov.length ? ov.join("・") : "なし（すべてベースと同じ）"}。以下の値はリンク解決後の実効値です。`);
  }
  L.push(`- 基準年 ${plan.baseYear}年、${plan.self.age}〜${plan.endAge}歳まで試算（名目、インフレ ${plan.economy.inflationPct}%/年、年金のマクロスライド ${plan.economy.macroSlidePct}%）`);
  L.push(`- ${memberLabel(plan.self)}`);
  L.push(plan.spouse ? `- ${memberLabel(plan.spouse)}` : "- 配偶者: なし");
  if (plan.children.length) {
    for (const c of plan.children) {
      const path = STAGE_ORDER.filter(k => c.education[k].enabled).map(k => `${STAGE_TABLE[k].label}${c.education[k].kind === "private" ? "(私立)" : ""}${c.education[k].away && c.education[k].away !== "home" ? `(${c.education[k].away === "urban" ? "都市部下宿" : "地方下宿"})` : ""}`).join("→");
      L.push(`- ${c.name}: 本人 ${c.birthAge}歳で誕生（${plan.self.age - c.birthAge >= 0 ? `現在 ${plan.self.age - c.birthAge}歳` : `${c.birthAge - plan.self.age}年後に誕生`}）。進路 ${path}、教育費合計 ${totalEducationCost(c).toLocaleString()}万。育休 本人${c.leaveMonthsSelf}ヶ月/配偶者${c.leaveMonthsSpouse}ヶ月`);
    }
    const cc = plan.childrenCommon;
    L.push(`- 子ども共通: 出産費用 ${cc.birthCost}万、養育費 ${cc.careMonthly}万/月/人（${cc.independenceAge}歳で独立）、育休給付 ${cc.leaveBenefit ? "あり" : "なし"}${([["returnSelf", plan.self.name], ...(plan.spouse ? [["returnSpouse", plan.spouse.name]] : [])] as [("returnSelf" | "returnSpouse"), string][]).map(([k, n]) => (cc[k].years > 0 && cc[k].ratioPct < 100 ? `、${n} は復帰後 ${cc[k].ratioPct}% × ${cc[k].years}年（時短）` : "")).join("")}`);
  } else L.push("- 子ども: なし");
  L.push(`- 基本生活費: ${plan.living.monthly.map(p => `${p.age}歳 ${p.value}万/月`).join(" → ")}${plan.living.retirementMonthly != null ? ` → 年金受給後 ${plan.living.retirementMonthly}万/月` : ""}。子1人独立ごと −${plan.living.reductionPerChildPct}%、遺族 ${plan.living.survivorPct}%`);
  const hs = [...plan.housing].sort((a, b) => a.startAge - b.startAge);
  L.push(`- 住まい: ${hs.map((h, i) => { const end = hs[i + 1]?.startAge ?? plan.endAge; if (h.kind === "rent") return `${h.startAge}〜${end}歳 賃貸 ${h.rentMonthly}万/月${h.movingCost ? `（初期費用 ${h.movingCost}万）` : ""}`; const p = h.property; return `${h.startAge}〜${end}歳 購入 ${p.price.toLocaleString()}万（頭金 ${p.downPayment}万、諸費用 ${p.closingCostPct}%、${p.loanYears}年 ${p.repayment === "annuity" ? "元利均等" : "元金均等"}、${p.rate.kind === "fixed" ? `固定 ${p.rate.pct}%` : `変動 ${p.rate.initialPct}%→${p.rate.changeAfterYears}年後 ${p.rate.laterPct}%`}、管理費等 ${p.maintenanceMonthly}万/月、固定資産税 ${p.propertyTaxAnnual}万/年、控除 ${p.deduction}、本人負担 ${p.loanShareSelfPct}%${p.danshin ? "、団信" : ""}${p.prepayments.length ? `、繰上返済 ${p.prepayments.map(x => `${x.age}歳 ${x.amount}万(${x.mode === "shorten" ? "期間短縮" : "返済額軽減"})`).join("/")}` : ""}${p.refinance ? `、借換 ${p.refinance.age}歳 ${p.refinance.pct}%/${p.refinance.years}年` : ""}、価値変動 ${p.appreciationPct}%/年${end < plan.endAge ? `、${end}歳で売却` : ""}）`; }).join("；")}`);
  const a = plan.assets;
  L.push(`- いまの資産: 現金 ${a.cash}万、特定口座 ${a.taxable}万（取得 ${a.taxableCost}万）、NISA 本人 ${a.nisaSelf}万/配偶者 ${a.nisaSpouse}万、DC 本人 ${a.dcSelf}万/配偶者 ${a.dcSpouse}万`);
  const inv = plan.invest;
  if (plan.living.detailed) L.push(`- 生活費の内訳（万円/月）: ${plan.living.items.filter(i => i.monthly > 0).map(i => `${i.label} ${i.monthly}`).join("、")}（合計 ${plan.living.items.reduce((a, i) => a + i.monthly, 0).toFixed(1)}）`);
  L.push(`- 運用方針: NISA ${inv.nisaEnabled ? `本人 ${inv.nisaAnnualCapSelf}万/年${plan.spouse ? `・配偶者 ${inv.nisaAnnualCapSpouse}万/年` : ""}（生涯 ${inv.nisaLifetimeCap}万）` : "使わない"}、枠超過分は${inv.useTaxableWhenNisaFull ? "特定口座" : "現金"}。現金は年間支出の ${inv.reserveMonths}〜${inv.reserveMaxMonths}ヶ月分をキープ。想定リターン NISA ${inv.returns.nisaPct}% / 特定 ${inv.returns.taxablePct}% / DC ${inv.returns.dcPct}% / 現金 ${inv.returns.cashPct}%（標準偏差 ${inv.volatilityPct}%）。取り崩し順序 ${({ taxableFirst: "特定口座→NISA", nisaFirst: "NISA→特定口座", proportional: "残高比例" })[inv.withdrawalOrder]}、計画的な取り崩し ${inv.withdrawal.mode === "asNeeded" ? "なし（現金が下限を割ったときだけ売却）" : inv.withdrawal.mode === "fixedRate" ? `${inv.withdrawal.startAge}歳から年初残高の ${inv.withdrawal.ratePct}%/年` : `${inv.withdrawal.startAge}歳から年 ${inv.withdrawal.amount}万円（インフレ連動）`}${inv.withdrawal.mode !== "asNeeded" && inv.withdrawal.stopInvesting ? "・開始後は新規投資なし" : ""}${inv.cashGoals.length ? `。目標貯蓄: ${inv.cashGoals.map(g => `${g.label} ${g.amount}万を${g.age}歳までに${g.years}年で積立${g.fromInvestments ? "（不足は運用資産から移す）" : ""}`).join("、")}` : ""}`);
  const evs = plan.events.filter(e => e.enabled);
  if (evs.length) {
    L.push("- イベント:");
    for (const e of evs) {
      if (e.kind === "death") L.push(`  - 死亡シナリオ: ${e.member === "self" ? plan.self.name : plan.spouse?.name} が本人 ${e.age}歳のとき`);
      else if (e.kind === "car") L.push(`  - 車「${e.label}」: ${e.startAge}〜${e.endAge}歳、${e.price}万${e.replaceEveryYears ? `を${e.replaceEveryYears}年ごと買替` : ""}${e.loanYears ? `、${e.loanYears}年ローン ${e.loanRatePct}%` : "、一括"}、維持費 ${e.runningAnnual}万/年`);
      else if (e.kind === "insurance") L.push(`  - 保険「${e.label}」(${e.member === "self" ? plan.self.name : plan.spouse?.name}): ${e.type === "term" ? `死亡保険金 ${e.payout.toLocaleString()}万` : `収入保障 月 ${e.payout}万を本人 ${e.payoutUntilAge}歳まで`}、保険料 ${e.premiumMonthly}万/月（${e.startAge}〜${e.endAge}歳）`);
      else L.push(`  - ${e.kind === "income" ? "収入" : "支出"}「${e.label}」: ${e.startAge}歳から${e.years <= 1 ? "単発" : `${e.years}年間${e.every > 1 ? `（${e.every}年ごと）` : ""}`} ${e.amount.toLocaleString()}万${e.inflate ? "（インフレ連動）" : ""}${e.kind === "income" && e.taxable ? "（課税）" : ""}`);
    }
  }
  if (plan.economy.stressTest.enabled) L.push(`- ストレステスト: ${plan.economy.stressTest.age}歳に −${plan.economy.stressTest.dropPct}%、${plan.economy.stressTest.recoveryYears}年で回復`);
  return L.join("\n");
}

const memberTax = (r: YearRow, k: "self" | "spouse") => { const m = k === "self" ? r.self : r.spouse; const t = m?.tax; return t ? t.incomeTax + t.residentTax + t.socialInsurance.total : 0; };

function incomeTable(rows: YearRow[], plan: Plan): string {
  const sp = !!plan.spouse;
  const h = ["年齢", "年", "本人 額面", "本人 課税所得", "本人 税率", "本人 税・社保", "本人 手取り", ...(sp ? ["配偶者 額面", "配偶者 課税所得", "配偶者 税・社保", "配偶者 手取り"] : []), "年金(額面)", "遺族年金", "手当・給付", "保険金", "資産受取", "収入合計(手取)"];
  const rows_ = rows.map(r => {
    const s = r.self, p = r.spouse;
    const sum = (cat: string) => r.inflows.filter(f => f.category === cat).reduce((a, f) => a + f.amount, 0);
    return [
      `${r.age}`, `${r.year}`, man(s.salary), man(s.tax?.taxableIt ?? 0), s.tax && s.tax.gross > 0 ? `${Math.round(s.tax.marginalRate * 100)}%` : "-", man(memberTax(r, "self")), man(s.tax?.takeHome ?? 0),
      ...(sp ? [man(p?.salary ?? 0), man(p?.tax?.taxableIt ?? 0), man(memberTax(r, "spouse")), man(p?.tax?.takeHome ?? 0)] : []),
      man(s.publicPension + s.dcAnnuity + (p?.publicPension ?? 0) + (p?.dcAnnuity ?? 0)), man(s.survivorPension + (p?.survivorPension ?? 0)), man(sum("public")), man(sum("insurance")), man(sum("asset") + r.inflows.filter(f => f.category === "salary" && f.label.includes("退職金")).reduce((a, f) => a + f.amount, 0)), man(r.totalIn),
    ];
  });
  return "### 収入・税・手取り（毎年、万円）\n手取り = 額面 − 所得税 − 住民税 − 社会保険料 − ふるさと納税寄附。収入合計は世帯の手取りベース。\n\n" + mdTable(h, rows_);
}

function expenseTable(rows: YearRow[], plan: Plan): string {
  const h = ["年齢", "基本生活費", "住居", "教育", "養育・出産", "保険料", "車", "その他", "税(一時)", "支出合計", "年間収支", "NISA積立", "NISA取崩", "特定積立", "特定取崩", "現金増減"];
  const rows_ = rows.map((r, i) => {
    const c = r.byCategory; const f = r.flows; const prev = rows[i - 1];
    return [`${r.age}`, man(c.living), man(c.housing), man(c.education), man(c.childcare), man(c.insurance), man(c.car), man(c.other), man(c.tax), man(r.totalOut), manS(r.net), man(f.nisaIn), man(f.nisaOut), man(f.taxableIn), man(f.taxableOut), manS(r.balances.cash - (prev ? prev.balances.cash : plan.assets.cash * 10000))];
  });
  return "### 支出・収支・運用フロー（毎年、万円）\n年間収支 = 収入合計 − 支出合計。現金増減 = 年間収支 − 積立 + 取崩 + 利息。\n\n" + mdTable(h, rows_);
}

function balanceTable(rows: YearRow[]): string {
  const h = ["年齢", "現金", "NISA", "NISA含み益", "特定口座", "特定含み益", "DC", "住宅(時価)", "ローン残", "流動資産", "純資産", "防衛月数", "できごと"];
  const rows_ = rows.map(r => {
    const b = r.balances; const months = r.totalOut > 0 ? Math.round(b.cash / (r.totalOut / 12) * 10) / 10 : 0;
    return [`${r.age}`, man(b.cash), man(b.nisa), man(b.nisa - b.nisaCost), man(b.taxable), man(b.taxable - b.taxableCost), man(b.dc), man(b.home), b.loan ? `▲${Math.round(b.loan / 1e4).toLocaleString()}万` : "-", man(b.liquid), man(b.netWorth), months ? `${months}ヶ月` : "-", r.markers.join("・")];
  });
  return "### 年末残高（毎年、万円）\n流動資産 = 現金 + NISA + 特定口座（税引後）。純資産 = 流動資産 + DC + 住宅 − ローン。防衛月数 = 現金 ÷ 月間支出。\n\n" + mdTable(h, rows_);
}

function detailDump(rows: YearRow[], plan: Plan, interval = 5): string {
  const L: string[] = [`### 計算根拠（${interval}年ごとの収支表、円）`];
  rows.forEach((r, i) => {
    if (i % interval !== 0 && i !== rows.length - 1 && !r.markers.length) return;
    L.push("", `━━━ ${r.age}歳（${r.year}年）${r.markers.length ? ` — ${r.markers.join("・")}` : ""} ━━━`);
    for (const s of buildStatement(r, rows[i - 1], plan)) {
      L.push(`■ ${s.title}`);
      for (const l of s.lines) {
        const v = l.value != null ? `${l.value < 0 ? "−" : ""}¥${Math.abs(Math.round(l.value)).toLocaleString("ja-JP")}` : "";
        L.push(`${"  ".repeat((l.indent ?? 0) + 1)}${l.kind === "total" || l.kind === "sub" ? "→ " : ""}${l.label}${v ? `: ${v}` : ""}${l.note ? `  (${l.note})` : ""}`);
      }
    }
  });
  return L.join("\n");
}

function summarySection(rows: YearRow[], s: Summary, plan: Plan): string {
  const last = rows[rows.length - 1];
  const L = ["### 総括"];
  L.push(`- 総合スコア ${s.healthScore}/100。${s.depletionAge != null ? `**${s.depletionAge}歳で流動資産がマイナス**` : `${plan.endAge}歳まで流動資産はプラスを維持する結果`}`);
  L.push(`- 最終年（${last.age}歳）: 純資産 ${oku(last.balances.netWorth)}、流動資産 ${oku(last.balances.liquid)}（現金 ${man(last.balances.cash)} / NISA ${man(last.balances.nisa)} / 特定 ${man(last.balances.taxable)}）、DC ${man(last.balances.dc)}、住宅 ${man(last.balances.home)}、ローン ${man(-last.balances.loan)}`);
  if (s.retirementNetWorth != null) L.push(`- 退職時（${plan.self.retireAge}歳）: 純資産 ${oku(s.retirementNetWorth)}、流動資産 ${oku(s.retirementLiquid ?? 0)}`);
  L.push(`- 流動資産の最低: ${s.minLiquid.age}歳 ${oku(s.minLiquid.value)}／最高: ${s.peakLiquid.age}歳 ${oku(s.peakLiquid.value)}`);
  const minCf = rows.reduce((m, r) => (r.net < m.net ? r : m), rows[0]);
  const redYears = rows.filter(r => r.net < 0).map(r => r.age);
  L.push(`- 年間収支の最小: ${minCf.age}歳 ${manS(minCf.net)}。赤字の年: ${redYears.length ? `${redYears.length}年（${compressAges(redYears)}）` : "なし"}`);
  if (s.pensionMonthly != null) L.push(`- 公的年金（世帯・額面・受給開始翌年）: 月 ${Math.round(s.pensionMonthly / 1e4 * 10) / 10}万`);
  L.push(`- 生涯（${rows[0].age}〜${last.age}歳）: 手取り収入 ${oku(s.lifetime.income)}、税・社会保険料 ${oku(s.lifetime.taxAndSi)}、基本生活費 ${oku(s.lifetime.living)}、住居 ${oku(s.lifetime.housing)}、教育・養育 ${oku(s.lifetime.education)}、その他 ${oku(s.lifetime.other)}`);
  return L.join("\n");
}

function compressAges(ages: number[]): string {
  const out: string[] = []; let start = ages[0], prev = ages[0];
  for (const a of ages.slice(1)) { if (a === prev + 1) { prev = a; continue; } out.push(start === prev ? `${start}` : `${start}〜${prev}`); start = prev = a; }
  out.push(start === prev ? `${start}` : `${start}〜${prev}`);
  return out.join(", ") + "歳";
}

export interface ReportInput { plan: Plan; raw?: Plan; res: SimResult; summary: Summary }

export function generateTextReport(items: ReportInput[], allPlans: Plan[], opts: { json?: string; llmPrompt?: boolean; detailInterval?: number } = {}): string {
  const parts: string[] = [];
  parts.push("# ライフプラン・シミュレーション レポート");
  parts.push(`生成: ${new Date().toISOString().slice(0, 10)}。金額は名目（インフレ込み）。`);
  parts.push("※ 以下はすべて、入力された前提のもとでのシミュレーション結果です。将来の家計や制度を予測・保証するものではなく、前提を変えれば結果も変わります。断定的な結論ではなく、前提と結果の関係として読んでください。");
  parts.push("※ 税・社会保険は 2025 年度改正後の恒久ルールを簡略化（基礎控除 58 万、給与所得控除 最低 65 万、協会けんぽ平均料率）。公的年金は現在の水準（基礎年金満額 83.2 万）を基準に加入月数と平均年収から見込み、インフレ率＋マクロスライド調整率で名目改定。国保・後期高齢者医療・介護保険は所得比例の概算。相続税・譲渡税は簡易計算。");
  parts.push("※ 「手取り」= 額面 − 所得税 − 住民税 − 社会保険料 − ふるさと納税寄附。iDeCo・選択制 DC の拠出は支出「その他」または給与から控除。NISA/特定口座への積立は収支の後の運用フロー。");
  if (items.length > 1) parts.push(`※ 比較対象 ${items.length} プラン: ${items.map(i => i.plan.name).join(" / ")}。リンクしているプランは、上書きしていないセクションがベースプランと同一です。`);
  for (const it of items) {
    parts.push("", "=".repeat(60), "", settings(it.plan, it.raw, allPlans), "", summarySection(it.res.rows, it.summary, it.plan), "", incomeTable(it.res.rows, it.plan), "", expenseTable(it.res.rows, it.plan), "", balanceTable(it.res.rows), "", detailDump(it.res.rows, it.plan, opts.detailInterval ?? 5));
  }
  if (opts.json) parts.push("", "=".repeat(60), "", "## 設定 JSON（シミュレーターで再現するための入力。値の意味は上のサマリーを優先）", "```json", opts.json, "```");
  if (opts.llmPrompt) parts.push("", "=".repeat(60), "", LLM_ANALYSIS_PROMPT);
  return parts.join("\n");
}
