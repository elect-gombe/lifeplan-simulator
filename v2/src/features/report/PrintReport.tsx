/**
 * 印刷用レポート（FP の提案書スタイル）。ページ単位で構成し、ブラウザの印刷から PDF にできる。
 *  1 表紙と総括 / 2-3 基本項目のご確認 / 4 所得税・住民税の計算 / 5 ライフイベント表 / 6 キャッシュフロー表 /
 *  7 収支と金融資産のグラフ / 8 お子さまのための支出 / 9 住宅ローン / 10 リタイア後の必要資金 / 11 公的年金の受取予想 /
 *  12 万一時の備え / 13 プラン比較
 * すべて既存のシミュレーション結果（YearRow）から導出し、レポート専用の計算ロジックは持たない。
 */
import { Fragment, useMemo } from "react";
import { Printer } from "lucide-react";
import type { Plan, Child, InsuranceEvent } from "@/domain/model";
import { STAGE_ORDER } from "@/domain/model";
import type { SimResult, YearRow } from "@/engine/simulate";
import { simulate } from "@/engine/simulate";
import type { Summary } from "@/engine/summary";
import { buildLoanSchedule } from "@/engine/mortgage";
import { coverageCurve } from "@/engine/coverage";
import { claimFactor } from "@/engine/pension";
import { STAGE_TABLE, totalEducationCost } from "@/engine/education";
import { MAN } from "@/engine/constants";
import { runSim } from "@/state/useSim";
import { WealthChart } from "@/charts/WealthChart";
import { CashflowChart } from "@/charts/CashflowChart";
import { LineCompare } from "@/charts/LineCompare";
import { MiniStackedBars, MiniLine } from "@/charts/Mini";
import { buildTaxGroups } from "@/features/dashboard/TaxDetail";
import { CHILD_COLORS } from "@/features/editor/sections/ChildrenSection";
import { fmtMan, fmtManFine, fmtPct, fmtYen } from "@/lib/format";
import { cx } from "@/ui/primitives";

const man = (yen: number) => Math.round(yen / MAN).toLocaleString();
const manS = (yen: number) => (yen < 0 ? "▲" : "") + Math.round(Math.abs(yen) / MAN).toLocaleString();
const EMP = { employee: "会社員・公務員", selfEmployed: "自営業", none: "無職" } as const;

function Page({ title, plan, children, first }: { title: string; plan: Plan; children: React.ReactNode; first?: boolean }) {
  return (
    <section className={cx("card p-5 sm:p-6 space-y-3 print-page", first && "print-first")}>
      <div className="flex items-baseline justify-between border-b line pb-1.5">
        <span className="text-[11px] ink-3">ライフプラン・レポート ｜ {plan.name} ｜ {plan.baseYear}年 {plan.self.age}歳時点</span>
        <h2 className="text-sm font-semibold ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function T({ head, rows, className, align = "right" }: { head?: (string | React.ReactNode)[]; rows: (string | number | React.ReactNode)[][]; className?: string; align?: "right" | "left" }) {
  // 年次表は狭い画面だと収まらないので表ごとに横スクロールさせる（ページ全体は横に動かさない）。
  // 印刷では table-scroll の overflow を visible に戻す（index.css）。
  return (
    <div className="table-scroll overflow-x-auto scroll-thin -mx-1 px-1">
    <table className={cx("w-full text-[11px] tabular border-collapse", className)}>
      {head && <thead><tr className="surface-2">{head.map((h, i) => <th key={i} className={cx("px-1.5 py-1 font-medium ink-2 border line whitespace-nowrap", i === 0 ? "text-left" : `text-${align}`)}>{h}</th>)}</tr></thead>}
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cx("px-1.5 py-0.5 border line whitespace-nowrap", j === 0 ? "text-left ink-2" : `text-${align} ink`)}>{c}</td>)}</tr>)}</tbody>
    </table>
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) { return <h3 className="text-xs font-semibold ink mt-2 mb-1 pl-2 border-l-4 border-[var(--accent)]">{children}</h3>; }

const sumIn = (r: YearRow, cats: string[], member?: "self" | "spouse") => r.inflows.filter(f => cats.includes(f.category) && (member == null || f.member === member)).reduce((a, f) => a + f.amount, 0);
const taxSi = (r: YearRow) => [r.self, r.spouse].reduce((a, m) => a + (m?.tax ? m.tax.incomeTax + m.tax.residentTax + m.tax.socialInsurance.total : 0), 0) + r.byCategory.tax;
const childCost = (r: YearRow, c: Child) => r.outflows.filter(f => (f.category === "education" || f.category === "childcare") && f.label.startsWith(c.name + " ")).reduce((a, f) => a + f.amount, 0);
const chunk = <X,>(arr: X[], n: number): X[][] => { const out: X[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
/** 年次表の 1 ページあたりの年数。A4 縦・左右 10mm 余白＝印刷幅 190mm(≒718px) に収まる上限。
 *  15 年だと最大 1,005px になり右側 3 割が印刷で切れていた。 */
const YEARS_PER_PAGE = 10;

export function PrintReport({ plan, res, summary, comparePlans }: { plan: Plan; res: SimResult; summary: Summary; comparePlans: Plan[] }) {
  const rows = res.rows;
  const first = rows[0];
  const ownPhases = [...plan.housing].filter(h => h.kind === "own").sort((a, b) => a.startAge - b.startAge);
  const insurances = plan.events.filter((e): e is InsuranceEvent => e.kind === "insurance" && e.enabled);
  const pensionSelf = rows.find(r => r.self.publicPension > 0)?.self ?? null;
  const pensionSpouse = rows.find(r => (r.spouse?.publicPension ?? 0) > 0)?.spouse ?? null;

  // ── 万一時（本人・配偶者）: 翌年死亡のシナリオと必要保障額カーブ ──
  const risk = useMemo(() => (["self", "spouse"] as const).filter(w => plan.spouse && (w === "self" || plan.spouse)).map(who => {
    const curve = coverageCurve(plan, who, 1);
    const d = plan.self.age + 1;
    const events = [...plan.events.filter(e => !(e.kind === "death" && e.member === who)), { id: "__d", kind: "death" as const, member: who, age: d, label: "", enabled: true }];
    const sc = simulate(plan, { events });
    const after = sc.rows.filter(r => r.age >= d);
    const min = after.reduce((m, r) => (r.balances.liquid < m.balances.liquid ? r : m), after[0]);
    const survivorPension = after.find(r => (who === "self" ? r.spouse?.survivorPension : r.self.survivorPension))?.[who === "self" ? "spouse" : "self"]?.survivorPension ?? 0;
    const payout = after.reduce((a, r) => a + sumIn(r, ["insurance"]), 0);
    const checkpoints = [d, d + 10, d + 20].filter(a => a <= plan.endAge - 1).map(a => {
      const pt = curve.find(p => p.deathAge === a);
      const cover = insurances.filter(e => e.member === who && e.startAge <= a && a < e.endAge).reduce((s, e) => s + (e.type === "term" ? e.payout * MAN : e.payout * 12 * MAN * Math.max(e.payoutUntilAge - a, 0)), 0);
      const member = who === "self" ? plan.self : plan.spouse!;
      const deathBenefit = a < member.retireAge && member.employment !== "none" ? member.deathBenefit * MAN : 0;
      return { age: a, shortfall: pt?.shortfall ?? 0, cover, deathBenefit };
    });
    return { who, name: who === "self" ? plan.self.name : plan.spouse!.name, curve, scenario: sc, min, survivorPension, payout, checkpoints };
  }), [plan, insurances]);

  // ── リタイア後の必要資金 ──
  const retireChecks = [plan.self.retireAge, plan.self.retireAge + 5, plan.self.retireAge + 10].filter(a => a > plan.self.age && a < plan.endAge).map(cp => {
    const after = rows.filter(r => r.age >= cp);
    const need = { living: 0, housing: 0, insurance: 0, children: 0, car: 0, other: 0, tax: 0 };
    const inc = { salary: 0, pension: 0, other: 0 };
    for (const r of after) {
      need.living += r.byCategory.living; need.housing += r.byCategory.housing; need.insurance += r.byCategory.insurance;
      need.children += r.byCategory.education + r.byCategory.childcare; need.car += r.byCategory.car; need.other += r.byCategory.other; need.tax += taxSi(r);
      // 収入は手取りで集計（税・社会保険料は必要資金側に計上）
      inc.salary += sumIn(r, ["salary"]); inc.pension += sumIn(r, ["pension"]); inc.other += sumIn(r, ["public", "insurance", "asset", "other"]);
    }
    const needTotal = Object.values(need).reduce((a, b) => a + b, 0);
    const incTotal = inc.salary + inc.pension + inc.other;
    const prepared = rows.find(r => r.age === cp - 1)?.balances.liquid ?? first.balances.liquid;
    return { cp, need, inc, needTotal, incTotal, gap: incTotal - needTotal, prepared, own: incTotal - needTotal + prepared };
  });

  const compareSims = comparePlans.length > 1 ? comparePlans.map(p => ({ plan: p, ...runSim(p) })) : [];

  return (
    <div className="space-y-4 report-print">
      <div className="flex items-center justify-between no-print">
        <p className="hint">FP の提案書形式のレポート。ブラウザの印刷（⌘P）から PDF に保存できます。A4 縦、ページごとに改ページします。</p>
        <button className="btn btn-outline" onClick={() => window.print()}><Printer size={15} />印刷 / PDF</button>
      </div>

      {/* 1 表紙・総括 */}
      <Page title="ライフプラン診断の総括" plan={plan} first>
        <h1 className="text-xl font-semibold ink">{plan.self.name} 様 ライフプラン・レポート</h1>
        <p className="hint">計算基準: {plan.baseYear}年（{plan.self.name} {plan.self.age}歳{plan.spouse ? `・${plan.spouse.name} ${plan.spouse.age}歳` : ""}{plan.children.length ? `・お子さま ${plan.children.length}人` : ""}）／ {plan.endAge}歳まで試算・名目ベース・インフレ {plan.economy.inflationPct}%／年</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            ["総合スコア", `${summary.healthScore} / 100`],
            ["金融資産が底をつく年齢", summary.depletionAge != null ? `${summary.depletionAge}歳` : "なし"],
            [`退職時（${plan.self.retireAge}歳）の純資産`, summary.retirementNetWorth != null ? fmtMan(summary.retirementNetWorth) : "–"],
            ["老後の公的年金（世帯・月額）", summary.pensionMonthly != null ? fmtManFine(summary.pensionMonthly) : "–"],
          ].map(([l, v]) => <div key={l} className="rounded-lg surface-2 p-2.5"><div className="hint">{l}</div><div className="text-base font-semibold ink mt-0.5">{v}</div></div>)}
        </div>
        <Sub>診断の要点</Sub>
        <ul className="text-xs ink-2 space-y-1 list-disc pl-5">
          <li>今年の世帯収入（手取り）は {fmtMan(summary.currentYear.takeHome)}、支出は {fmtMan(summary.currentYear.out)} で、年間 {fmtMan(summary.currentYear.net, { sign: true })}（貯蓄率 {fmtPct(summary.currentYear.savingsRate, 0)}）です。</li>
          <li>{summary.depletionAge != null
            ? `入力された前提のもとでは ${summary.depletionAge}歳で流動資産（現金・NISA・特定口座）がマイナスになる結果です。生活費・住居費、働く期間、運用方針などの見直しが考えられます。`
            : `この試算では最終年（${plan.endAge}歳）まで流動資産が持続し、最終年の純資産は ${fmtMan(summary.finalNetWorth)} です。最も資産が少なくなるのは ${summary.minLiquid.age}歳（${fmtMan(summary.minLiquid.value)}）です。`}</li>
          <li>生涯の税・社会保険料は {fmtMan(summary.lifetime.taxAndSi)}（生涯の手取り収入 {fmtMan(summary.lifetime.income)} に対して {fmtPct(summary.lifetime.taxAndSi / Math.max(summary.lifetime.income, 1), 0)}）。生活費 {fmtMan(summary.lifetime.living)}、住居費 {fmtMan(summary.lifetime.housing)}、教育・養育費 {fmtMan(summary.lifetime.education)}。</li>
          {risk.map(rk => <li key={rk.who}>{rk.name} に万一の場合（翌年）、遺族の流動資産の最低は {rk.min.age}歳時点で {fmtMan(rk.min.balances.liquid)}。{Math.max(...rk.curve.map(c => c.shortfall), 0) > 0 ? `追加で必要な死亡保障は最大 ${fmtMan(Math.max(...rk.curve.map(c => c.shortfall)))}（${rk.curve.reduce((m, c) => (c.shortfall > m.shortfall ? c : m), rk.curve[0]).deathAge}歳で亡くなった場合）です。` : "この試算では、現在の保障・遺族年金・資産で遺族の生活が維持される結果です。"}</li>)}
        </ul>
        <p className="hint">この試算は入力された前提に基づく概算であり、将来の結果を保証するものではありません。税制・社会保険・年金制度は簡略化しています。金額は特記のない限り名目・万円。</p>
      </Page>

      {/* 2 基本項目（１） */}
      <Page title="基本項目のご確認（１）" plan={plan}>
        <Sub>1. 家族構成</Sub>
        <T head={["お名前", "続柄", "性別", `年齢（${plan.baseYear}年）`, "生年（西暦）", "働き方"]} align="left" rows={[
          [plan.self.name, "本人", plan.self.sex === "male" ? "男性" : "女性", `${plan.self.age}歳`, `${plan.baseYear - plan.self.age}年`, EMP[plan.self.employment]],
          ...(plan.spouse ? [[plan.spouse.name, "配偶者", plan.spouse.sex === "male" ? "男性" : "女性", `${plan.spouse.age}歳`, `${plan.baseYear - plan.spouse.age}年`, EMP[plan.spouse.employment]]] : []),
          ...plan.children.map(c => [c.name, "子", "—", c.birthAge <= plan.self.age ? `${plan.self.age - c.birthAge}歳` : `${c.birthAge - plan.self.age}年後に誕生`, `${plan.baseYear - plan.self.age + c.birthAge}年`, "—"]),
        ]} />
        <Sub>2. 現在の収入と支出の状況（{first.year}年・万円）</Sub>
        <div className="grid md:grid-cols-2 gap-3">
          <T head={["収入の部", "額面", "手取り"]} rows={[
            [`${plan.self.name} 収入`, man(first.self.salary + first.self.publicPension + first.self.dcAnnuity + first.self.otherTaxable), man(sumIn(first, ["salary", "pension"], "self") + sumIn(first, ["other"]))],
            ...(plan.spouse && first.spouse ? [[`${plan.spouse.name} 収入`, man(first.spouse.salary + first.spouse.publicPension + first.spouse.dcAnnuity), man(sumIn(first, ["salary", "pension"], "spouse"))]] : []),
            ["その他（児童手当・給付等）", "—", man(sumIn(first, ["public", "insurance", "asset"]))],
            [<b key="t">収入合計</b>, <b key="g">{man([first.self, first.spouse].reduce((a, m) => a + (m ? m.salary + m.publicPension + m.dcAnnuity + m.otherTaxable : 0), 0))}</b>, <b key="n">{man(first.totalIn)}</b>],
            ["税・社会保険料", `▲${man(taxSi(first))}`, "（額面との差）"],
          ]} />
          <T head={["支出の部", "年額"]} rows={[
            ["基本生活費", man(first.byCategory.living)],
            ...(plan.living.detailed ? plan.living.items.filter(i => i.monthly > 0).map(i => [`　${i.label}`, Math.round(i.monthly * 12).toLocaleString()]) : []),
            ["住居費（家賃・ローン返済・管理費等）", man(first.byCategory.housing)], ["支払保険料", man(first.byCategory.insurance)],
            ["子ども関連費（教育・養育）", man(first.byCategory.education + first.byCategory.childcare)], ["車関連", man(first.byCategory.car)], ["その他支出", man(first.byCategory.other + first.byCategory.tax)],
            [<b key="t">支出合計（税・社会保険料を除く）</b>, <b key="v">{man(first.totalOut)}</b>],
            [<b key="s">貯蓄額（収入合計 − 支出合計）</b>, <b key="v" className={first.net < 0 ? "text-[var(--critical)]" : ""}>{manS(first.net)}</b>],
          ]} />
        </div>
        <Sub>3. 金融資産（現在）</Sub>
        <T head={["区分", "残高（万円）", "保有割合", "想定利回り"]} rows={(() => {
          const items = [["現金・預金", plan.assets.cash, plan.invest.returns.cashPct], ["特定口座", plan.assets.taxable, plan.invest.returns.taxablePct], ["NISA", plan.assets.nisaSelf + plan.assets.nisaSpouse, plan.invest.returns.nisaPct], ["DC・iDeCo", plan.assets.dcSelf + plan.assets.dcSpouse, plan.invest.returns.dcPct]] as [string, number, number][];
          const total = items.reduce((a, i) => a + i[1], 0) || 1;
          return [...items.map(([l, v, r]) => [l, v.toLocaleString(), fmtPct(v / total, 1), `${r}%`]), [<b key="t">合計</b>, <b key="v">{total.toLocaleString()}</b>, "100%", `加重 ${(items.reduce((a, i) => a + i[1] * i[2], 0) / total).toFixed(2)}%`]];
        })()} />
        <p className="hint">運用方針: 現金は年間支出の {plan.invest.reserveMonths}〜{plan.invest.reserveMaxMonths}ヶ月分をキープし、超えた分は{plan.invest.nisaEnabled ? `NISA（年 ${plan.invest.nisaAnnualCapSelf}万${plan.spouse ? `＋${plan.invest.nisaAnnualCapSpouse}万` : ""}）` : ""}{plan.invest.useTaxableWhenNisaFull ? "→特定口座" : ""}へ。取り崩しは{({ taxableFirst: "特定口座→NISA", nisaFirst: "NISA→特定口座", proportional: "残高比例" })[plan.invest.withdrawalOrder]}の順{plan.invest.withdrawal.mode !== "asNeeded" ? `、${plan.invest.withdrawal.startAge}歳から${plan.invest.withdrawal.mode === "fixedRate" ? `年 ${plan.invest.withdrawal.ratePct}% の定率` : `年 ${plan.invest.withdrawal.amount}万の定額`}で計画的に取り崩し` : ""}。</p>
      </Page>

      {/* 3 基本項目（２） */}
      <Page title="基本項目のご確認（２）" plan={plan}>
        <Sub>4. お住まいの計画</Sub>
        <T head={["開始（本人年齢）", "形態", "内容", "月々の負担（当初）"]} align="left" rows={[...plan.housing].sort((a, b) => a.startAge - b.startAge).map(h => h.kind === "rent"
          ? [`${h.startAge}歳〜`, "賃貸", `家賃 ${h.rentMonthly}万/月${h.movingCost ? `・引越 ${h.movingCost}万` : ""}`, `${h.rentMonthly}万`]
          : [`${h.startAge}歳〜`, "購入", `物件 ${h.property.price.toLocaleString()}万・頭金 ${h.property.downPayment.toLocaleString()}万・ローン ${(h.property.price - h.property.downPayment).toLocaleString()}万／${h.property.loanYears}年・${h.property.rate.kind === "fixed" ? `固定 ${h.property.rate.pct}%` : `変動 ${h.property.rate.initialPct}%→${h.property.rate.laterPct}%（${h.property.rate.changeAfterYears}年後）`}・${h.property.repayment === "annuity" ? "元利均等" : "元金均等"}${h.property.danshin ? "・団信" : ""}${h.property.loanShareSelfPct < 100 ? `・ペアローン（本人 ${h.property.loanShareSelfPct}%）` : ""}`, `${(res.loanSchedules[h.id]?.firstYearMonthly ?? 0) ? Math.round(res.loanSchedules[h.id].firstYearMonthly / MAN * 10) / 10 : 0}万＋管理費等 ${h.property.maintenanceMonthly}万`])} />
        <Sub>5. 万一時の備え（生命保険・団信・死亡退職金）</Sub>
        {insurances.length === 0 && !ownPhases.some(h => h.property.danshin) && plan.self.deathBenefit === 0 ? <p className="hint">生命保険の加入はありません。</p> : (
          <T head={["名称", "被保険者", "種類・控除区分", "保険期間（本人年齢）", "保障", "保険料"]} align="left" rows={[
            ...insurances.map(e => [e.label, e.member === "self" ? plan.self.name : plan.spouse?.name ?? "配偶者", `${e.type === "term" ? "定期（一時金）" : "収入保障"}・${({ general: "一般", medical: "介護医療", pension: "個人年金" })[e.deductionType ?? "general"]}`, `${e.startAge}〜${e.endAge}歳`, e.type === "term" ? `死亡保険金 ${e.payout.toLocaleString()}万` : `月 ${e.payout}万を${e.payoutUntilAge}歳まで`, `${e.premiumMonthly}万/月`]),
            ...ownPhases.filter(h => h.property.danshin).map(h => [`団体信用生命保険（${h.startAge}歳〜の住宅ローン）`, h.property.loanShareSelfPct < 100 ? "本人・配偶者" : plan.self.name, "団信", "ローン期間中", "死亡時に残債を免除", "金利に含む"]),
            ...([plan.self, plan.spouse].filter(Boolean) as NonNullable<typeof plan.spouse>[]).filter(m => m.deathBenefit > 0).map(m => [`${m.name} 死亡退職金・弔慰金`, m.name, "勤務先", `〜${m.retireAge}歳（在職中）`, `${m.deathBenefit.toLocaleString()}万`, "—"]),
          ]} />
        )}
        <Sub>6. リタイア後のプラン（本人 {plan.self.retireAge}歳で退職）</Sub>
        <div className="grid md:grid-cols-2 gap-3">
          <T head={["項目", "内容"]} align="left" rows={[
            ["リタイア後の基本生活費", plan.living.retirementMonthly != null ? `${plan.living.retirementMonthly}万/月（現在価格）` : `現役時と同じ（${plan.living.monthly[plan.living.monthly.length - 1].value}万/月）`],
            [`${plan.self.name} 退職一時金`, plan.self.severancePay ? `${plan.self.retireAge}歳 ${plan.self.severancePay.toLocaleString()}万` : "なし"],
            ...(plan.spouse ? [[`${plan.spouse.name} 退職一時金`, plan.spouse.severancePay ? `${plan.spouse.retireAge}歳 ${plan.spouse.severancePay.toLocaleString()}万` : "なし"]] : []),
            [`${plan.self.name} DC・iDeCo`, `${plan.self.dc.receive.method === "lump" ? "一時金" : plan.self.dc.receive.method === "annuity" ? `年金（${plan.self.dc.receive.annuityYears}年）` : `併用（一時金 ${plan.self.dc.receive.lumpRatioPct}%）`}・${plan.self.dc.receive.startAge}歳から`],
          ]} />
          <T head={["年金収入（予想）", "開始", "年額", "月額"]} rows={[
            [`${plan.self.name} 公的年金`, `${plan.self.pensionStartAge}歳`, pensionSelf ? `${man(pensionSelf.publicPension)}万` : "—", pensionSelf ? `${(pensionSelf.publicPension / 12 / MAN).toFixed(1)}万` : "—"],
            ...(plan.spouse ? [[`${plan.spouse.name} 公的年金`, `${plan.spouse.pensionStartAge}歳`, pensionSpouse ? `${man(pensionSpouse.publicPension)}万` : "—", pensionSpouse ? `${(pensionSpouse.publicPension / 12 / MAN).toFixed(1)}万` : "—"]] : []),
            ...plan.events.filter(e => e.kind === "income" && e.enabled).map(e => e.kind === "income" ? [e.label, `${e.startAge}歳`, `${e.amount.toLocaleString()}${e.every > 1 ? `／${e.every}年ごと` : ""}`, e.every === 1 ? (e.amount / 12).toFixed(1) : "—"] : []),
          ]} />
        </div>
        <Sub>7. その他の収入・支出（イベント）</Sub>
        {plan.events.filter(e => e.enabled && (e.kind === "expense" || e.kind === "income" || e.kind === "car")).length === 0 ? <p className="hint">登録されたイベントはありません。</p> : (
          <T head={["イベント", "区分", "時期（本人年齢）", "金額", "備考"]} align="left" rows={plan.events.filter(e => e.enabled).flatMap(e => {
            if (e.kind === "expense" || e.kind === "income") return [[e.label, e.kind === "income" ? `収入${e.taxable ? "（課税）" : ""}` : "支出", e.years <= 1 ? `${e.startAge}歳` : `${e.startAge}〜${e.startAge + e.years - 1}歳${e.every > 1 ? `・${e.every}年ごと` : ""}`, `${e.amount.toLocaleString()}万${e.years <= 1 ? "" : "/回"}`, `${e.inflate ? "インフレ連動" : "固定額"}${e.stopOnSelfDeath ? "・本人死亡で停止" : ""}`]];
            if (e.kind === "car") return [[e.label, "車", `${e.startAge}〜${e.endAge}歳`, `${e.price.toLocaleString()}万${e.replaceEveryYears ? `／${e.replaceEveryYears}年ごと買替` : ""}`, `維持費 ${e.runningAnnual}万/年${e.loanYears ? `・ローン ${e.loanYears}年 ${e.loanRatePct}%` : ""}`]];
            return [];
          })} />
        )}
      </Page>

      {/* 4 税金 */}
      {[first.self, first.spouse].map((m, i) => m && m.alive && m.tax && m.tax.gross > 0 && (
        <Page key={i} title={`所得税／住民税の計算（${i === 0 ? plan.self.name : plan.spouse?.name}・${m.age}歳・${first.year}年）`} plan={plan}>
          <div className="columns-1 md:columns-2 gap-4 [&>*]:break-inside-avoid">
            {buildTaxGroups(m, m.tax).map(g => (
              <div key={g.title} className="mb-3">
                <table className="w-full text-[11px] tabular">
                  <thead><tr className="border-b line"><th className="text-left py-0.5 font-semibold ink">{g.title}</th>{g.cols.map(c => <th key={c} className="text-right py-0.5 font-medium ink-3 w-24">{c}</th>)}</tr></thead>
                  <tbody>{g.rows.map((r, j) => (
                    <tr key={j} className={cx("border-b line last:border-0 align-top", r.strong && "surface-2")}>
                      <td className={cx("py-0.5 pr-2", r.sub && "pl-3", r.strong ? "font-semibold ink" : "ink-2")}>{r.label}{r.formula && <div className="ink-3 font-normal text-[10px] leading-snug">{r.formula}</div>}</td>
                      {r.values.map((v, k) => <td key={k} className={cx("py-0.5 text-right whitespace-nowrap", r.strong ? "font-semibold ink" : "ink")}>{v == null ? "—" : typeof v === "string" ? v : `${v < 0 ? "−" : ""}${fmtYen(Math.abs(Math.round(v)))}`}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
                {g.note && <p className="hint mt-0.5">{g.note}</p>}
              </div>
            ))}
          </div>
          <p className="hint">※ 本ページの税額は今年の所得に対する課税額で、住民税は翌年に納付するものです。社会保険料は協会けんぽ平均の料率で概算しています。</p>
        </Page>
      ))}

      {/* 5 ライフイベント表 */}
      <Page title="ライフイベント表" plan={plan}>
        <T head={["西暦", plan.self.name, ...(plan.spouse ? [plan.spouse.name] : []), ...plan.children.map(c => c.name), "できごと"]} align="left" rows={rows.map(r => {
          const kids = plan.children.map((c, i) => { const ca = r.childAges[i]; const stage = STAGE_ORDER.find(k => c.education[k].enabled && STAGE_TABLE[k].from === ca); return { ca, start: stage ? `${STAGE_TABLE[stage].label}${c.education[stage].kind === "private" ? "(私)" : ""}入学` : null }; });
          const ev = [...r.markers, ...kids.map((k, i) => k.start ? `${plan.children[i].name} ${k.start}` : null).filter(Boolean) as string[]];
          return [r.year, `${r.age}`, ...(plan.spouse ? [r.spouse ? `${r.spouse.age}` : "—"] : []), ...kids.map(k => (k.ca >= 0 ? `${k.ca}` : "")), ev.join("・")];
        }).filter((r, i) => (r[r.length - 1] as string) !== "" || i % 5 === 0)} />
        <p className="hint">できごとの無い年は 5 年ごとに表示しています。年齢はその年の本人年齢基準。</p>
      </Page>

      {/* 6 キャッシュフロー表 */}
      {chunk(rows, YEARS_PER_PAGE).map((block, bi) => (
        <Page key={bi} title={`今後のキャッシュフロー表（${bi + 1}／${Math.ceil(rows.length / YEARS_PER_PAGE)}）`} plan={plan}>
          <T head={["西暦", ...block.map(r => String(r.year))]} rows={[
            [`${plan.self.name}（歳）`, ...block.map(r => r.age)],
            ...(plan.spouse ? [[`${plan.spouse.name}（歳）`, ...block.map(r => r.spouse?.alive ? r.spouse.age : "")]] : []),
            ...plan.children.map((c, i) => [`${c.name}（歳）`, ...block.map(r => (r.childAges[i] >= 0 ? r.childAges[i] : ""))]),
            [<b key="i">収入（手取り）</b>, ...block.map(() => "")],
            [`　${plan.self.name} 給与`, ...block.map(r => man(sumIn(r, ["salary"], "self")))],
            ...(plan.spouse ? [[`　${plan.spouse.name} 給与`, ...block.map(r => man(sumIn(r, ["salary"], "spouse")))]] : []),
            ["　公的年金・遺族年金・DC", ...block.map(r => man(sumIn(r, ["pension"]) + sumIn(r, ["asset"])))],
            ["　その他収入・給付・保険金", ...block.map(r => man(sumIn(r, ["other", "public", "insurance"])))],
            [<b key="it">　収入計</b>, ...block.map(r => <b key={r.age}>{man(r.totalIn)}</b>)],
            [<b key="o">支出</b>, ...block.map(() => "")],
            ["　基本生活費", ...block.map(r => man(r.byCategory.living))],
            ["　住居費（家賃・ローン・管理費）", ...block.map(r => man(r.byCategory.housing))],
            ["　支払保険料", ...block.map(r => man(r.byCategory.insurance))],
            ["　子ども関連費", ...block.map(r => man(r.byCategory.education + r.byCategory.childcare))],
            ["　車・その他", ...block.map(r => man(r.byCategory.car + r.byCategory.other))],
            ["　税（一時）", ...block.map(r => man(r.byCategory.tax))],
            [<b key="ot">　支出計</b>, ...block.map(r => <b key={r.age}>{man(r.totalOut)}</b>)],
            [<b key="n">年間収支</b>, ...block.map(r => <b key={r.age} className={r.net < 0 ? "text-[var(--critical)]" : ""}>{manS(r.net)}</b>)],
            ["運用への振替（積立−／取崩＋）", ...block.map(r => manS(-(r.flows.nisaIn + r.flows.taxableIn) + r.flows.nisaOut + r.flows.taxableOut))],
            [<b key="l">金融資産残高（流動）</b>, ...block.map(r => <b key={r.age} className={r.balances.liquid < 0 ? "text-[var(--critical)]" : ""}>{manS(r.balances.liquid)}</b>)],
            ["　うち現金", ...block.map(r => manS(r.balances.cash))],
            ["　うち NISA・特定口座", ...block.map(r => man(r.balances.nisa + r.balances.taxable))],
            ["DC・iDeCo 残高", ...block.map(r => man(r.balances.dc))],
            ["住宅ローン残高", ...block.map(r => (r.balances.loan ? man(r.balances.loan) : ""))],
            [<b key="nw">純資産（住宅時価込み）</b>, ...block.map(r => <b key={r.age}>{manS(r.balances.netWorth)}</b>)],
            ["主なできごと", ...block.map(r => <span key={r.age} className="text-[9px] whitespace-normal block max-w-[60px]">{r.markers.join("・")}</span>)],
          ]} />
          {bi === 0 && <p className="hint">収入は税・社会保険料を差し引いた手取り。給与の額面と税は「所得税／住民税の計算」ページおよび年表ビューを参照。金額は万円（名目）。</p>}
        </Page>
      ))}

      {/* 7 グラフ */}
      <Page title="今後の収支と金融資産残高の推移予想グラフ" plan={plan}>
        <Sub>収入と支出（手取り収入と支出の内訳・年間収支）</Sub>
        <div className="px-1 pb-10"><CashflowChart rows={rows} selectedAge={null} onSelectAge={() => {}} height={230} /></div>
        <Sub>資産の推移（現金・特定口座・NISA・DC・住宅時価、ローン残高、純資産）</Sub>
        <div className="px-1 pb-10"><WealthChart rows={rows} selectedAge={null} onSelectAge={() => {}} retireAge={plan.self.retireAge} height={260} /></div>
      </Page>

      {/* 8 子ども */}
      {plan.children.length > 0 && (() => {
        const kidRows = rows.filter(r => plan.children.some((_, i) => r.childAges[i] >= 0 && r.childAges[i] <= plan.childrenCommon.independenceAge + 4));
        if (kidRows.length === 0) return null;
        // 図は費用が発生する年だけに詰める（表の範囲は独立生計後の数年も含むため、末尾が空になる）。
        const kdCost = (r: YearRow) => plan.children.reduce((a, c) => a + childCost(r, c), 0);
        const kdFrom = kidRows.findIndex(r => kdCost(r) > 0);
        const kdTo = kidRows.length - 1 - [...kidRows].reverse().findIndex(r => kdCost(r) > 0);
        const figRows = kdFrom < 0 ? kidRows : kidRows.slice(kdFrom, kdTo + 1);
        const kdAges = figRows.map(r => r.age);
        // 支援（就学支援金・授業料減免）は棒にせず本文で示す。グレーの系列は子どもの識別色と見分けにくい（ΔE が基準未満）。
        const kdSeries = plan.children.map((c, i) => ({ label: c.name, color: CHILD_COLORS[i % CHILD_COLORS.length], values: figRows.map(r => childCost(r, c)) }));
        const kdGross = figRows.map(kdCost);
        const peakNet = Math.max(...kdGross);
        const peak = figRows[kdGross.indexOf(peakNet)];
        const kdSupport = kidRows.reduce((a, r) => a + r.support.hsSupport + r.support.tashiWaiver, 0);
        const drivers = plan.children.filter(c => childCost(peak, c) > 0);
        const overlap = figRows.filter(r => plan.children.filter(c => childCost(r, c) > 0).length >= 2);
        return (
          <Fragment>
            <Page title="お子さまのための支出（年ごと）" plan={plan}>
              <Sub>年ごとの教育費・養育費（支援を差し引く前）</Sub>
              <div className="px-1 pb-6"><MiniStackedBars ages={kdAges} series={kdSeries} height={210} /></div>
              <p className="hint">
                支出が最も大きくなるのは {plan.self.name} が {peak.age} 歳（{peak.year}年）の {man(peakNet)}万で、その年の手取り収入の {fmtPct(peak.totalIn > 0 ? peakNet / peak.totalIn : 0, 0)} にあたります
                {drivers.length ? `（${drivers.map(c => `${c.name} ${peak.childAges[plan.children.indexOf(c)]}歳`).join("・")}）` : ""}。
                {plan.children.length > 1 ? (overlap.length ? ` 複数のお子さまの費用が重なるのは ${overlap[0].age}〜${overlap[overlap.length - 1].age} 歳の ${overlap.length} 年です。` : " 複数のお子さまの費用が重なる年はありません。") : ""}
                {" "}期間全体では {man(kdGross.reduce((a, v) => a + v, 0))}万で、{kdSupport > 0 ? `ここから高校就学支援金・授業料減免 ${man(kdSupport)}万が差し引かれます（内訳は次ページ以降の表）。` : "この試算の前提では高校就学支援金・授業料減免の対象になりません。"}
              </p>
              <Sub>同じ期間の年間収支（貯蓄・投資に回せる額）</Sub>
              <div className="px-1 pb-6"><MiniLine ages={kdAges} values={figRows.map(r => r.net)} color="var(--s-net)" height={170} label="年間収支" /></div>
              <p className="hint">
                収入から生活費・住居費・教育費などを引いた、その年に手元に残る額です。子どもの費用が最も大きい {peak.age} 歳では {manS(peak.net)}万
                {(() => { const neg = figRows.filter(r => r.net < 0); return neg.length ? `、この期間では ${neg.length} 年（${neg[0].age}〜${neg[neg.length - 1].age}歳）がマイナスになる結果です。取り崩しでまかなう形になります。` : `で、この期間はマイナスにならない結果です。`; })()}
              </p>
            </Page>
            {chunk(kidRows, YEARS_PER_PAGE).map((block, bi) => (
          <Page key={bi} title={`お子さまのための支出推移表（${bi + 1}／${Math.ceil(kidRows.length / YEARS_PER_PAGE)}）`} plan={plan}>
            <T head={["西暦", ...block.map(r => String(r.year))]} rows={[
              [`${plan.self.name}（歳）`, ...block.map(r => r.age)],
              ...plan.children.map((c, i) => [`${c.name}（歳）`, ...block.map(r => (r.childAges[i] >= 0 ? r.childAges[i] : ""))]),
              ...plan.children.map(c => [`${c.name} 教育費・養育費`, ...block.map(r => man(childCost(r, c)))]),
              ["高校就学支援金・授業料減免（控除）", ...block.map(r => (r.support.hsSupport + r.support.tashiWaiver ? `▲${man(r.support.hsSupport + r.support.tashiWaiver)}` : ""))],
              [<b key="t">子ども関連費計</b>, ...block.map(r => <b key={r.age}>{man(r.byCategory.education + r.byCategory.childcare)}</b>)],
              ["収入計（手取り）", ...block.map(r => man(r.totalIn))],
              ["収入に占める割合", ...block.map(r => (r.totalIn > 0 ? fmtPct((r.byCategory.education + r.byCategory.childcare) / r.totalIn, 1) : "—"))],
              ["（参考）児童手当", ...block.map(r => (r.support.childAllowance ? man(r.support.childAllowance) : ""))],
            ]} />
            {bi === 0 && (
              <>
                <Sub>進路と教育費の合計（現在価格）</Sub>
                <T head={["お子さま", "進路", "教育費合計（現在価格）", "大学の住まい", "育休（本人／配偶者）"]} align="left" rows={plan.children.map(c => [c.name, STAGE_ORDER.filter(k => c.education[k].enabled).map(k => `${STAGE_TABLE[k].label}${c.education[k].kind === "private" ? "(私)" : ""}`).join("→"), `${totalEducationCost(c).toLocaleString()}万`, c.education.university.enabled ? ({ home: "自宅", rural: "地方で一人暮らし", urban: "都市で一人暮らし" })[c.education.university.away ?? "home"] : "—", `${c.leaveMonthsSelf}ヶ月／${c.leaveMonthsSpouse}ヶ月`])} />
                <p className="hint">養育費は 1 人あたり月 {plan.childrenCommon.careMonthly}万（{plan.childrenCommon.independenceAge}歳まで）、出産費用 {plan.childrenCommon.birthCost}万。教育費は文科省調査ベースの標準額にインフレ率を適用。</p>
              </>
            )}
          </Page>
            ))}
          </Fragment>
        );
      })()}

      {/* 9 住宅ローン */}
      {ownPhases.map(h => {
        const sc = res.loanSchedules[h.id]; if (!sc || sc.years.length === 0) return null;
        const noPrepay = h.property.prepayments.length ? buildLoanSchedule({ ...h.property, prepayments: [] }, h.startAge, plan.endAge) : null;
        const totalPay = sc.years.reduce((a, y) => a + y.payment + y.prepayment + y.refinanceCost, 0);
        // 返済が終わった後の空の年は落とす（表と同じ範囲）
        const lnYears = sc.years.filter(y => y.closingBalance > 0 || y.payment > 0 || y.prepayment > 0);
        const lnAges = lnYears.map(y => y.age);
        const hasPrepay = lnYears.some(y => y.prepayment > 0);
        // 返済の内訳（元金・利息・繰上返済）と残高は単位が違うので、軸を分けて 2 図にする
        const lnSeries = [
          { label: "元金", color: "var(--s-home)", values: lnYears.map(y => y.principal) },
          { label: "利息", color: "var(--s-loan)", values: lnYears.map(y => y.interest) },
          ...(hasPrepay ? [{ label: "繰上返済", color: "var(--s-cash)", values: lnYears.map(y => y.prepayment) }] : []),
        ];
        const halfIdx = lnYears.findIndex(y => y.principal >= y.interest);
        const intShare = (y: typeof lnYears[number]) => (y.payment > 0 ? y.interest / y.payment : 0);
        const lastPaid = [...lnYears].reverse().find(y => y.payment > 0) ?? lnYears[0];
        return (
          <Fragment key={`${h.id}-fig`}>
          <Page title={`住宅ローンの返済内訳と残高（${h.startAge}歳〜取得）`} plan={plan}>
            <Sub>年ごとの返済の内訳</Sub>
            <div className="px-1 pb-6"><MiniStackedBars ages={lnAges} series={lnSeries} height={200} /></div>
            <p className="hint">
              返済額に占める利息の割合は、初年度 {fmtPct(intShare(lnYears[0]), 0)} から最終年 {fmtPct(intShare(lastPaid), 0)} に下がります。元金が減るほど利息も減るためです。
              {halfIdx > 0 ? ` この試算では ${lnYears[halfIdx].age} 歳（借入から ${halfIdx} 年目）に元金が利息を上回ります。` : ""}
              {hasPrepay ? " 繰上返済をした年は、その分だけ棒が高くなります。" : ""}
            </p>
            <Sub>ローン残高の推移</Sub>
            <div className="px-1 pb-6"><MiniLine ages={lnAges} values={lnYears.map(y => y.closingBalance)} color="var(--s-loan)" height={170} label="年末残高" /></div>
            <p className="hint">
              残高は {sc.payoffAge != null ? `${sc.payoffAge} 歳で完済する結果です。` : `試算の最終年まで残る結果です。`}
              借入 {man(sc.principal)}万に対し、今後の返済総額は {man(totalPay)}万（うち利息 {man(sc.totalInterest)}万）です。
            </p>
          </Page>
          <Page title={`住宅ローンの返済推移（${h.startAge}歳〜取得）`} plan={plan}>
            <div className="grid md:grid-cols-[1fr_260px] gap-3">
              <T head={["年", "年齢", "返済額", "元金", "利息", "繰上返済", "年末残高", "金利", "備考"]} rows={sc.years.filter(y => y.closingBalance > 0 || y.openingBalance > 0).map(y => [y.yearIndex + 1, y.age, man(y.payment), man(y.principal), man(y.interest), y.prepayment ? man(y.prepayment) : "", man(y.closingBalance), `${y.ratePct}%`, y.events.join("・")])} />
              <div className="space-y-2 text-xs">
                <T head={["借入条件", ""]} align="left" rows={[["借入額", `${man(sc.principal)}万`], ["返済方式", h.property.repayment === "annuity" ? "元利均等" : "元金均等"], ["期間", `${h.property.loanYears}年`], ["金利", h.property.rate.kind === "fixed" ? `固定 ${h.property.rate.pct}%` : `変動 ${h.property.rate.initialPct}% → ${h.property.rate.laterPct}%（${h.property.rate.changeAfterYears}年後）`], ["当初の月返済額", `${(sc.firstYearMonthly / MAN).toFixed(1)}万`], ["完済", sc.payoffAge ? `${sc.payoffAge}歳` : "試算期間内に完済せず"]]} />
                <T head={["返済総額", ""]} align="left" rows={[["今後の返済総額", `${man(totalPay)}万`], ["うち利息合計", `${man(sc.totalInterest)}万`], ["住宅ローン控除（合計）", `${man(rows.reduce((a, r) => a + [r.self, r.spouse].reduce((b, m) => b + (m?.tax?.housingLoanCreditUsed ?? 0), 0), 0))}万`]]} />
                {noPrepay && (
                  <div className="rounded-lg p-2.5" style={{ background: "var(--accent-soft)" }}>
                    <div className="font-semibold ink">繰上返済による節約効果</div>
                    <div className="ink-2 mt-1">繰上返済なしの利息 {man(noPrepay.totalInterest)}万 → あり {man(sc.totalInterest)}万。<b className="ink">約 {man(noPrepay.totalInterest - sc.totalInterest)}万</b> の利息を節約{sc.payoffAge && noPrepay.payoffAge ? `、完済が ${noPrepay.payoffAge - sc.payoffAge} 年早まります` : ""}（繰上返済額 合計 {h.property.prepayments.reduce((a, p) => a + p.amount, 0).toLocaleString()}万）。</div>
                  </div>
                )}
              </div>
            </div>
          </Page>
          </Fragment>
        );
      })}

      {/* 10 リタイア後の必要資金 */}
      {retireChecks.length > 0 && (
        <Page title="リタイア後の必要資金" plan={plan}>
          <p className="hint">本人 {plan.self.retireAge}歳のリタイア以降、{plan.endAge}歳までに必要となる資金と、見込める収入・準備済み資産を各時点で累計したものです（名目・万円）。マイナスは不足を示します。</p>
          <T head={["", ...retireChecks.map(c => `${c.cp}歳時`)]} rows={[
            [<b key="a">a. リタイア後の必要資金</b>, ...retireChecks.map(c => <b key={c.cp}>{man(c.needTotal)}</b>)],
            ["　1. 生活資金", ...retireChecks.map(c => man(c.need.living))], ["　2. 住宅資金（家賃・ローン・管理費）", ...retireChecks.map(c => man(c.need.housing))], ["　3. 支払保険料", ...retireChecks.map(c => man(c.need.insurance))],
            ["　4. 子ども関連費", ...retireChecks.map(c => man(c.need.children))], ["　5. 車・その他支出", ...retireChecks.map(c => man(c.need.car + c.need.other))], ["　6. 税金・社会保険料", ...retireChecks.map(c => man(c.need.tax))],
            [<b key="b">b. リタイア後の収入予定額（手取り）</b>, ...retireChecks.map(c => <b key={c.cp}>{man(c.incTotal)}</b>)],
            ["　1. 勤労収入（配偶者含む）・退職金", ...retireChecks.map(c => man(c.inc.salary))], ["　2. 公的年金・DC 年金・遺族年金", ...retireChecks.map(c => man(c.inc.pension))], ["　3. その他収入・給付・DC 一時金", ...retireChecks.map(c => man(c.inc.other))],
            [<b key="c">c. 不足資金（b − a）</b>, ...retireChecks.map(c => <b key={c.cp} className={c.gap < 0 ? "text-[var(--critical)]" : ""}>{manS(c.gap)}</b>)],
            [<b key="d">d. 準備済み資金（前年末の流動資産）</b>, ...retireChecks.map(c => <b key={c.cp}>{manS(c.prepared)}</b>)],
            [<b key="e">リタイア後の必要自己資金（c ＋ d）</b>, ...retireChecks.map(c => <b key={c.cp} className={c.own < 0 ? "text-[var(--critical)]" : "text-[var(--good)]"}>{manS(c.own)}</b>)],
          ]} />
          <p className="hint">※ 税金・社会保険料は年金・給与にかかるものを必要資金側に計上しているため、収入は手取り＋その税額ではなく手取りで表示しています。DC 残高は「その他収入」に受取時点で含まれます。住宅の売却益・相続は含みません。</p>
        </Page>
      )}

      {/* 11 公的年金 */}
      {(pensionSelf || pensionSpouse) && (
        <Page title="公的（老齢）年金の受取予想" plan={plan}>
          <T head={["", "受給開始", "繰上げ／繰下げ", "老齢基礎年金", "老齢厚生年金", "在職老齢年金の停止（初年）", "年額（初年）", "月額"]} rows={[
            ...(pensionSelf ? [[plan.self.name, `${plan.self.pensionStartAge}歳`, `${Math.round((claimFactor(plan.self.pensionStartAge) - 1) * 1000) / 10}%`, man(pensionSelf.pensionBasic), man(pensionSelf.pensionEmployee), pensionSelf.pensionReduction ? `▲${man(pensionSelf.pensionReduction)}` : "—", `${man(pensionSelf.publicPension)}万`, `${(pensionSelf.publicPension / 12 / MAN).toFixed(1)}万`]] : []),
            ...(pensionSpouse && plan.spouse ? [[plan.spouse.name, `${plan.spouse.pensionStartAge}歳`, `${Math.round((claimFactor(plan.spouse.pensionStartAge) - 1) * 1000) / 10}%`, man(pensionSpouse.pensionBasic), man(pensionSpouse.pensionEmployee), pensionSpouse.pensionReduction ? `▲${man(pensionSpouse.pensionReduction)}` : "—", `${man(pensionSpouse.publicPension)}万`, `${(pensionSpouse.publicPension / 12 / MAN).toFixed(1)}万`]] : []),
          ]} />
          <div className="px-1 pb-10 pt-2">
            <LineCompare height={220} unitLabel="年額（名目）" series={[
              { id: "self", label: `${plan.self.name} 老齢年金`, color: "var(--s-cash)", points: rows.map(r => ({ age: r.age, value: r.self.publicPension })) },
              ...(plan.spouse ? [{ id: "spouse", label: `${plan.spouse.name} 老齢年金`, color: "var(--s-nisa)", points: rows.map(r => ({ age: r.age, value: r.spouse?.publicPension ?? 0 })) }] : []),
              { id: "hh", label: "世帯合計（遺族年金含む）", color: "var(--ink)", points: rows.map(r => ({ age: r.age, value: r.self.publicPension + (r.spouse?.publicPension ?? 0) + r.self.survivorPension + (r.spouse?.survivorPension ?? 0) })) },
            ]} />
          </div>
          <p className="hint">老齢基礎年金は 20〜59 歳の全期間納付を前提（満額 {fmtMan(831_700)}）。老齢厚生年金は就職年齢から退職までの平均年収（実質）×5.481/1000×加入月数。年金額はインフレ率＋マクロ経済スライド調整率で毎年改定した名目額。60 歳以降も働く場合は在職老齢年金（月 51 万超の 1/2）で厚生年金部分が支給停止されます。</p>
        </Page>
      )}

      {/* 12 万一 */}
      {risk.map(rk => (
        <Page key={rk.who} title={`${rk.name} に万一の場合の備え`} plan={plan}>
          <Sub>1. 翌年（{plan.self.age + 1}歳時点）に万一の場合の遺族の家計</Sub>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg surface-2 p-2.5"><div className="ink-3">遺族年金（初年度）</div><div className="font-semibold tabular">{rk.survivorPension ? `${fmtMan(rk.survivorPension)}/年` : "なし"}</div></div>
            <div className="rounded-lg surface-2 p-2.5"><div className="ink-3">保険金・死亡退職金の合計</div><div className="font-semibold tabular">{fmtMan(rk.payout)}</div></div>
            <div className="rounded-lg surface-2 p-2.5"><div className="ink-3">遺族の流動資産の最低（{rk.min.age}歳）</div><div className={cx("font-semibold tabular", rk.min.balances.liquid < 0 && "text-[var(--critical)]")}>{fmtMan(rk.min.balances.liquid)}</div></div>
            <div className="rounded-lg surface-2 p-2.5"><div className="ink-3">遺族の生活費</div><div className="font-semibold tabular">現役時の {plan.living.survivorPct}%</div></div>
          </div>
          <div className="px-1 pb-10 pt-1"><WealthChart rows={rk.scenario.rows} selectedAge={null} onSelectAge={() => {}} height={220} /></div>
          <Sub>2. 必要保障額と現在の死亡保障</Sub>
          <T head={["万一の時期（本人年齢）", ...rk.checkpoints.map(c => `${c.age}歳時`)]} rows={[
            ["(ア) 追加で必要な死亡保障（遺族の資産が枯渇しないために）", ...rk.checkpoints.map(c => <span key={c.age} className={c.shortfall > 0 ? "text-[var(--critical)] font-semibold" : "text-[var(--good)]"}>{c.shortfall > 0 ? `${man(c.shortfall)}万 不足` : "不足なし"}</span>)],
            ["(イ) その時点の死亡保険金（既存の保険）", ...rk.checkpoints.map(c => `${man(c.cover)}万`)],
            ["(ウ) 死亡退職金・弔慰金", ...rk.checkpoints.map(c => `${man(c.deathBenefit)}万`)],
          ]} />
          <p className="hint">(ア) は既存の保険・団信・遺族年金・死亡退職金・生活費 {plan.living.survivorPct}% を織り込んだうえで、遺族の流動資産が最も減る時点のマイナス分。0 は、この試算の前提では追加の保障がなくても不足しないことを示します。年齢別の推移は「万一・リスク」ビューで確認できます。</p>
          {rk.curve.some(p => p.shortfall > 0)
            ? <div className="px-1 pb-2"><LineCompare height={180} unitLabel="追加で必要な死亡保障" series={[{ id: "gap", label: "必要保障額（不足額）", color: "var(--warning)", points: rk.curve.map(p => ({ age: p.deathAge, value: p.shortfall })) }]} /></div>
            : <p className="text-xs ink-2 rounded-lg p-2.5" style={{ background: "var(--accent-soft)" }}>{plan.self.age + 1}〜{rk.curve[rk.curve.length - 1]?.deathAge ?? plan.endAge}歳のどの時点で亡くなっても、遺族の流動資産はマイナスにならない結果です。あくまでこの試算の前提のもとでは、追加の死亡保障は不要という結果になります。</p>}
        </Page>
      ))}

      {/* 13 プラン比較 */}
      {compareSims.length > 1 && (
        <Page title="プラン比較" plan={plan}>
          <T head={["", ...compareSims.map(s => s.plan.name)]} rows={[
            ["総合スコア", ...compareSims.map(s => s.summary.healthScore)],
            ["金融資産が底をつく年齢", ...compareSims.map(s => (s.summary.depletionAge != null ? `${s.summary.depletionAge}歳` : "なし"))],
            [`退職時（${plan.self.retireAge}歳）の純資産`, ...compareSims.map(s => (s.summary.retirementNetWorth != null ? `${man(s.summary.retirementNetWorth)}万` : "—"))],
            [`最終年（${plan.endAge}歳）の純資産`, ...compareSims.map(s => `${manS(s.summary.finalNetWorth)}万`)],
            ["生涯の手取り収入", ...compareSims.map(s => `${man(s.summary.lifetime.income)}万`)],
            ["生涯の税・社会保険料", ...compareSims.map(s => `${man(s.summary.lifetime.taxAndSi)}万`)],
            ["生涯の生活費／住居費／教育・養育費", ...compareSims.map(s => `${man(s.summary.lifetime.living)}／${man(s.summary.lifetime.housing)}／${man(s.summary.lifetime.education)}万`)],
            ["老後の公的年金（世帯・月額）", ...compareSims.map(s => (s.summary.pensionMonthly != null ? fmtManFine(s.summary.pensionMonthly) : "—"))],
          ]} />
          <div className="px-1 pb-10 pt-2"><LineCompare height={240} unitLabel="純資産" series={compareSims.map(s => ({ id: s.plan.id, label: s.plan.name, color: s.plan.color, points: s.res.rows.map(r => ({ age: r.age, value: r.balances.netWorth })) }))} /></div>
          <div className="px-1 pb-10"><LineCompare height={200} unitLabel="年間収支" series={compareSims.map(s => ({ id: s.plan.id, label: s.plan.name, color: s.plan.color, points: s.res.rows.map(r => ({ age: r.age, value: r.net })) }))} /></div>
        </Page>
      )}
    </div>
  );
}
