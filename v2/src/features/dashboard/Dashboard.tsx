/** ダッシュボード: KPI・資産推移・収支・選択年の内訳。 */
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, X, Sparkles } from "lucide-react";
import { useActivePlan, useStore } from "@/state/store";
import { useSim } from "@/state/useSim";
import { WealthChart } from "@/charts/WealthChart";
import { CashflowChart } from "@/charts/CashflowChart";
import { HBars, Sparkline } from "@/charts/Bars";
import { MiniStackedBars } from "@/charts/Mini";
import { Card, Pill, Segmented, Toggle, cx } from "@/ui/primitives";
import { fmtMan, fmtManFine, fmtPct } from "@/lib/format";
import { monteCarlo } from "@/engine/montecarlo";
import { YearDetail } from "./YearDetail";
import { YearStatement } from "./YearStatement";
import { PinnedMetrics } from "./PinnedMetrics";

export function Dashboard() {
  const { plan: livePlan } = useActivePlan();
  const { state, dispatch } = useStore();
  // 入力の反映を優先し、重いチャートの再描画は 1 テンポ遅らせる（連続入力中は途中の状態を描かない）
  const plan = useDeferredValue(livePlan);
  const { res, summary } = useSim(plan);
  const rows = res.rows;
  const [showMc, setShowMc] = useState(false);
  const mc = useMemo(() => (showMc ? monteCarlo(plan, 200) : null), [plan, showMc]);
  const [chartTab, setChartTab] = useState<"wealth" | "cashflow" | "tax">("wealth");
  const [detailTab, setDetailTab] = useState<"breakdown" | "statement">("breakdown");
  const selected = state.selectedAge != null ? rows.find(r => r.age === state.selectedAge) ?? null : null;
  const setAge = useCallback((a: number | null) => dispatch({ type: "ui/selectAge", age: a }), [dispatch]);
  const taxSeries = useMemo(() => [
    { label: "所得税", color: "var(--s-loan)", values: rows.map(r => (r.self.tax?.incomeTax ?? 0) + (r.spouse?.tax?.incomeTax ?? 0)) },
    { label: "住民税", color: "var(--s-taxable)", values: rows.map(r => (r.self.tax?.residentTax ?? 0) + (r.spouse?.tax?.residentTax ?? 0)) },
    { label: "健康・介護保険", color: "var(--s-nisa)", values: rows.map(r => (r.self.tax ? r.self.tax.socialInsurance.health + r.self.tax.socialInsurance.nursing : 0) + (r.spouse?.tax ? r.spouse.tax.socialInsurance.health + r.spouse.tax.socialInsurance.nursing : 0)) },
    { label: "年金保険料", color: "var(--s-cash)", values: rows.map(r => (r.self.tax?.socialInsurance.pension ?? 0) + (r.spouse?.tax?.socialInsurance.pension ?? 0)) },
    { label: "雇用保険等", color: "var(--s-dc)", values: rows.map(r => (r.self.tax ? r.self.tax.socialInsurance.employment + r.self.tax.socialInsurance.childSupport : 0) + (r.spouse?.tax ? r.spouse.tax.socialInsurance.employment + r.spouse.tax.socialInsurance.childSupport : 0)) },
  ], [rows]);
  const ages = useMemo(() => rows.map(r => r.age), [rows]);
  const sparkNet = useMemo(() => rows.map(r => r.balances.netWorth), [rows]);
  const sparkFlow = useMemo(() => rows.map(r => r.net), [rows]);
  const sparkPension = useMemo(() => rows.map(r => r.self.publicPension + (r.spouse?.publicPension ?? 0)), [rows]);
  const sparkTax = useMemo(() => rows.map(r => [r.self, r.spouse].reduce((a, m) => a + (m?.tax ? m.tax.incomeTax + m.tax.residentTax + m.tax.socialInsurance.total : 0), 0)), [rows]);

  const depletion = summary.depletionAge;
  const tone = depletion != null ? "critical" : summary.healthScore >= 80 ? "good" : "warning";

  return (
    <div className="space-y-4 fade-in">
      {/* ── 診断バナー ── */}
      <div className={cx("card p-4 flex flex-col sm:flex-row sm:items-center gap-3")}
        style={{ borderColor: `color-mix(in oklab, var(--${tone}) 45%, var(--line))`, background: `color-mix(in oklab, var(--${tone}) 6%, var(--surface-1))` }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid place-items-center h-12 w-12 rounded-full shrink-0 text-lg font-bold" style={{ background: `var(--${tone})`, color: "var(--on-fill-strong)" }}>{summary.healthScore}</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold ink">
              {depletion != null ? <><AlertTriangle size={16} className="text-[var(--critical)]" />{depletion}歳で資産が底をつく見込みです</> : <><CheckCircle2 size={16} className="text-[var(--good)]" />{plan.endAge}歳まで資産は持続します</>}
            </div>
            <p className="hint mt-0.5">
              {depletion != null
                ? `流動資産（現金・NISA・特定口座）が ${depletion} 歳でマイナスになります。生活費・住居費の見直し、収入の延長、運用方針の調整を検討してください。`
                : `最終年（${plan.endAge}歳）の純資産は ${fmtMan(summary.finalNetWorth)}、流動資産は ${fmtMan(summary.finalLiquid)}。最も資産が少なくなるのは ${summary.minLiquid.age} 歳（${fmtMan(summary.minLiquid.value)}）です。`}
            </p>
          </div>
        </div>
        {mc && <Pill tone={mc.depletionProb > 0.2 ? "critical" : mc.depletionProb > 0.05 ? "warning" : "good"} className="sm:ml-auto">運用のぶれを考慮した枯渇確率 {fmtPct(mc.depletionProb, 0)}</Pill>}
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={`退職時（${plan.self.retireAge}歳）の資産`} value={summary.retirementNetWorth != null ? fmtMan(summary.retirementNetWorth) : "–"} sub={summary.retirementLiquid != null ? `うち流動資産 ${fmtMan(summary.retirementLiquid)}` : undefined} spark={sparkNet} />
        <Kpi label="老後の公的年金（世帯・月額）" value={summary.pensionMonthly != null ? fmtManFine(summary.pensionMonthly) : "–"} sub={`${plan.self.pensionStartAge}歳から受給・額面`} spark={sparkPension} />
        <Kpi label="今年の貯蓄" value={fmtMan(summary.currentYear.net, { sign: true })} sub={`手取り ${fmtMan(summary.currentYear.takeHome)} − 支出 ${fmtMan(summary.currentYear.out)}（貯蓄率 ${fmtPct(summary.currentYear.savingsRate, 0)}）`} spark={sparkFlow} tone={summary.currentYear.net < 0 ? "critical" : undefined} />
        <Kpi label="生涯の税・社会保険料" value={fmtMan(summary.lifetime.taxAndSi)} sub={`生涯の手取り収入 ${fmtMan(summary.lifetime.income)} に対して ${fmtPct(summary.lifetime.taxAndSi / Math.max(summary.lifetime.income, 1), 0)}`} spark={sparkTax} />
      </div>

      {/* ── メインチャート ── */}
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-1">
          <Segmented value={chartTab} onChange={setChartTab} size="sm" options={[{ value: "wealth", label: "資産の推移" }, { value: "cashflow", label: "収入と支出" }, { value: "tax", label: "税・社会保険" }]} />
          <span className="hint hidden sm:inline">年をクリックすると内訳を表示</span>
          {chartTab === "wealth" && <Toggle className="ml-auto" checked={showMc} onChange={setShowMc} label={<span className="inline-flex items-center gap-1 text-xs"><Sparkles size={13} />運用のぶれ幅を表示</span>} help="リターンを年率の標準偏差（運用設定）で 200 回ランダムに揺らしたときの純資産の 10〜90 パーセンタイル帯。枯渇確率は流動資産がマイナスになる経路の割合。" />}
        </div>
        <div className="px-2 pb-14 sm:pb-8">
          {chartTab === "wealth" && <WealthChart rows={rows} selectedAge={state.selectedAge} onSelectAge={setAge} retireAge={plan.self.retireAge} height={320} bands={mc?.bands} />}
          {chartTab === "cashflow" && <CashflowChart rows={rows} selectedAge={state.selectedAge} onSelectAge={setAge} height={300} />}
          {chartTab === "tax" && (
            <div className="px-2 pt-2">
              <MiniStackedBars height={300} highlightAge={state.selectedAge} ages={ages} series={taxSeries} />
              <p className="hint mt-2">世帯の年間の税・社会保険料（住宅ローン控除・ふるさと納税の控除適用後）。額面に対する負担率は年表の「額面と税・社会保険」列で確認できます。</p>
            </div>
          )}
        </div>
      </Card>

      {/* ── 選択年の内訳 ── */}
      {selected ? (
        <Card title={<span className="inline-flex items-center gap-2">{selected.age}歳（{selected.year}年）の内訳{selected.markers.length > 0 && <Pill tone="accent">{selected.markers.join("・")}</Pill>}</span>}
          right={<div className="flex items-center gap-2"><Segmented size="sm" value={detailTab} onChange={setDetailTab} options={[{ value: "breakdown", label: "内訳" }, { value: "statement", label: "収支表" }]} /><button onClick={() => setAge(null)} className="btn btn-ghost px-2" aria-label="閉じる"><X size={16} /></button></div>}>
          {detailTab === "breakdown" ? <YearDetail row={selected} plan={plan} /> : <YearStatement rows={rows} age={selected.age} onChangeAge={setAge} plan={plan} />}
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="今年の収入（手取り）" subtitle={`合計 ${fmtMan(rows[0].totalIn)}`}>
            <HBars items={rows[0].inflows} total={rows[0].totalIn} color="var(--s-in)" />
          </Card>
          <Card title="今年の支出" subtitle={`合計 ${fmtMan(rows[0].totalOut)}`}>
            <HBars items={rows[0].outflows} total={rows[0].totalOut} color="var(--s-out)" />
          </Card>
        </div>
      )}

      <PinnedMetrics />

      {/* ── 生涯の内訳 ── */}
      <Card title="生涯の支出内訳" subtitle={`${plan.self.age}〜${plan.endAge}歳の合計（名目）`}>
        <LifetimeBar lifetime={summary.lifetime} />
      </Card>
    </div>
  );
}

const Kpi = memo(function Kpi({ label, value, sub, spark, tone }: { label: string; value: string; sub?: string; spark?: number[]; tone?: "critical" | "good" }) {
  return (
    <div className="card p-4 flex flex-col gap-1.5 min-w-0">
      <div className="label line-clamp-2 min-h-[2.1em] leading-tight">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className={cx("text-2xl font-semibold tracking-tight leading-none", tone === "critical" ? "text-[var(--critical)]" : "ink")}>{value}</div>
        {spark && <div className="hidden md:block shrink-0"><Sparkline values={spark} color="var(--ink-3)" /></div>}
      </div>
      {sub && <div className="hint leading-snug line-clamp-2 min-h-[2.4em]">{sub}</div>}
    </div>
  );
});

function LifetimeBar({ lifetime }: { lifetime: { taxAndSi: number; living: number; housing: number; education: number; other: number } }) {
  const items = [
    { label: "税・社会保険料", v: lifetime.taxAndSi, color: "var(--s-loan)" },
    { label: "生活費", v: lifetime.living, color: "var(--s-taxable)" },
    { label: "住居", v: lifetime.housing, color: "var(--s-home)" },
    { label: "教育・養育", v: lifetime.education, color: "var(--s-dc)" },
    { label: "その他", v: lifetime.other, color: "var(--ink-3)" },
  ];
  const total = items.reduce((a, i) => a + i.v, 0) || 1;
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden gap-px surface-3">
        {items.map(i => <div key={i.label} style={{ width: `${i.v / total * 100}%`, background: i.color }} title={`${i.label} ${fmtMan(i.v)}`} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
        {items.map(i => (
          <div key={i.label} className="flex items-baseline gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0 translate-y-0.5" style={{ background: i.color }} />
            <span className="ink-2">{i.label}</span>
            <span className="tabular font-medium ink">{fmtMan(i.v)}</span>
            <span className="ink-3">（{fmtPct(i.v / total, 0)}）</span>
          </div>
        ))}
      </div>
    </div>
  );
}
