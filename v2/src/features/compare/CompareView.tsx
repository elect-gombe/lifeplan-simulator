/** プラン比較: KPI 表と純資産・収支の重ね描き、設定の差分。 */
import { useDeferredValue, useMemo } from "react";
import { Copy } from "lucide-react";
import { useStore, usePlanActions, useResolvedPlans } from "@/state/store";
import { runSim } from "@/state/useSim";
import { LineCompare } from "@/charts/LineCompare";
import { Card, Toggle, cx } from "@/ui/primitives";
import { fmtMan, fmtManFine, fmtPct } from "@/lib/format";
import type { Plan } from "@/domain/model";

export function CompareView() {
  const { state, dispatch } = useStore();
  const act = usePlanActions();
  const resolved = useDeferredValue(useResolvedPlans());
  const plans = useMemo(() => resolved.filter(p => state.compareIds.includes(p.id)), [resolved, state.compareIds]);
  const sims = useMemo(() => plans.map(p => ({ plan: p, ...runSim(p) })), [plans]);
  const base = sims[0];
  const toggles = (
    <div className="flex flex-wrap gap-3 items-center">
      {state.plans.map(p => (
        <Toggle key={p.id} checked={state.compareIds.includes(p.id)} onChange={() => dispatch({ type: "compare/toggle", id: p.id })}
          label={<span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.name}</span>} />
      ))}
    </div>
  );
  const series = (get: (r: { age: number; balances: { netWorth: number; liquid: number }; net: number }) => number) =>
    sims.map(s => ({ id: s.plan.id, label: s.plan.name, color: s.plan.color, points: s.res.rows.map(r => ({ age: r.age, value: get(r) })) }));

  if (state.plans.length < 2) {
    return (
      <Card className="fade-in">
        <div className="text-center py-10 space-y-3">
          <p className="text-sm ink">比較するプランがまだ 1 つです。</p>
          <p className="hint">現在のプランを複製して「住宅を買わない」「配偶者が時短」「私立に進学」などの別案を作ると、ここで並べて比較できます。</p>
          <button className="btn btn-primary" onClick={() => act.duplicate(state.activeId, "プランB", true)}><Copy size={15} />現在のプランに連動する別案を作る</button>
        </div>
      </Card>
    );
  }

  if (!base) {
    return <div className="space-y-4 fade-in">{toggles}<Card><p className="hint py-6 text-center">比較するプランを 1 つ以上選んでください。</p></Card></div>;
  }

  return (
    <div className="space-y-4 fade-in">
      {toggles}
      <Card title="主要指標の比較">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead><tr className="text-xs ink-2"><th className="text-left py-2 font-medium">指標</th>{sims.map(s => <th key={s.plan.id} className="text-right py-2 font-medium"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.plan.color }} />{s.plan.name}</span></th>)}</tr></thead>
            <tbody>
              {[
                { label: "スコア", get: (s: typeof sims[number]) => s.summary.healthScore, fmt: (v: number) => String(v), higherBetter: true },
                { label: "資産が底をつく年齢", get: (s: typeof sims[number]) => s.summary.depletionAge ?? Infinity, fmt: (v: number) => (v === Infinity ? "なし" : `${v}歳`), higherBetter: true },
                { label: `退職時（${base.plan.self.retireAge}歳）の純資産`, get: (s: typeof sims[number]) => s.summary.retirementNetWorth ?? 0, fmt: fmtMan, higherBetter: true },
                { label: `最終年の純資産`, get: (s: typeof sims[number]) => s.summary.finalNetWorth, fmt: fmtMan, higherBetter: true },
                { label: "最終年の流動資産", get: (s: typeof sims[number]) => s.summary.finalLiquid, fmt: fmtMan, higherBetter: true },
                { label: "流動資産の最低値", get: (s: typeof sims[number]) => s.summary.minLiquid.value, fmt: fmtMan, higherBetter: true },
                { label: "公的年金（世帯・月額）", get: (s: typeof sims[number]) => s.summary.pensionMonthly ?? 0, fmt: fmtManFine, higherBetter: true },
                { label: "生涯の税・社会保険料", get: (s: typeof sims[number]) => s.summary.lifetime.taxAndSi, fmt: fmtMan, higherBetter: false },
                { label: "生涯の住居費", get: (s: typeof sims[number]) => s.summary.lifetime.housing, fmt: fmtMan, higherBetter: false },
                { label: "生涯の教育・養育費", get: (s: typeof sims[number]) => s.summary.lifetime.education, fmt: fmtMan, higherBetter: false },
                { label: "今年の貯蓄率", get: (s: typeof sims[number]) => s.summary.currentYear.savingsRate, fmt: (v: number) => fmtPct(v, 0), higherBetter: true },
              ].map(row => {
                const vals = sims.map(row.get);
                const best = row.higherBetter ? Math.max(...vals) : Math.min(...vals);
                return (
                  <tr key={row.label} className="border-t line">
                    <td className="py-2 ink-2 text-xs">{row.label}</td>
                    {sims.map((s, i) => {
                      const v = vals[i]; const diff = i > 0 && Number.isFinite(v) && Number.isFinite(vals[0]) ? v - vals[0] : null;
                      return (
                        <td key={s.plan.id} className={cx("py-2 text-right", v === best && sims.length > 1 && "font-semibold")}>
                          {row.fmt(v)}
                          {diff != null && diff !== 0 && row.fmt !== String && <div className={cx("text-[10px]", (row.higherBetter ? diff > 0 : diff < 0) ? "text-[var(--good)]" : "text-[var(--critical)]")}>{row.fmt === fmtMan || row.fmt === fmtManFine ? fmtMan(diff, { sign: true }) : (diff > 0 ? "+" : "") + (row.fmt === String ? diff : row.fmt(diff))}</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="純資産の推移" padded={false}><div className="px-2 pt-2 pb-14 sm:pb-8"><LineCompare series={series(r => r.balances.netWorth)} height={300} selectedAge={state.selectedAge} onSelectAge={a => dispatch({ type: "ui/selectAge", age: a })} /></div></Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="流動資産（現金・NISA・特定口座）" padded={false}><div className="px-2 pt-2 pb-14 sm:pb-8"><LineCompare series={series(r => r.balances.liquid)} height={240} /></div></Card>
        <Card title="年間収支" padded={false}><div className="px-2 pt-2 pb-14 sm:pb-8"><LineCompare series={series(r => r.net)} height={240} /></div></Card>
      </div>
      <Card title="設定の違い" subtitle={`${base.plan.name} との差分`}>
        <DiffTable plans={plans} />
      </Card>
    </div>
  );
}

function flat(p: Plan): Record<string, string> {
  const o: Record<string, string> = {};
  o["本人 年収"] = p.self.income.map(x => `${x.age}歳 ${x.value}万`).join(" / ");
  o["本人 退職"] = `${p.self.retireAge}歳`; o["本人 年金開始"] = `${p.self.pensionStartAge}歳`;
  o["本人 DC/iDeCo"] = `${(p.self.dc.company[0]?.value ?? 0) + (p.self.dc.matching[0]?.value ?? 0) + (p.self.dc.ideco[0]?.value ?? 0)}円/月`;
  o["配偶者"] = p.spouse ? `${p.spouse.name} ${p.spouse.age}歳 ${p.spouse.income.map(x => `${x.age}歳 ${x.value}万`).join(" / ")} 退職${p.spouse.retireAge}歳` : "なし";
  o["生活費"] = p.living.monthly.map(x => `${x.age}歳 ${x.value}万/月`).join(" / ") + (p.living.retirementMonthly != null ? ` → 老後 ${p.living.retirementMonthly}万/月` : "");
  o["住まい"] = [...p.housing].sort((a, b) => a.startAge - b.startAge).map(h => h.kind === "rent" ? `${h.startAge}歳〜 賃貸 ${h.rentMonthly}万/月` : `${h.startAge}歳〜 購入 ${h.property.price}万（頭金${h.property.downPayment}万・${h.property.loanYears}年・${h.property.rate.kind === "fixed" ? `固定${h.property.rate.pct}%` : `変動${h.property.rate.initialPct}→${h.property.rate.laterPct}%`}）`).join(" / ");
  o["子ども"] = p.children.length ? p.children.map(c => `${c.name}（本人${c.birthAge}歳）`).join("、") : "なし";
  o["NISA"] = p.invest.nisaEnabled ? `年 ${p.invest.nisaAnnualCapSelf}万${p.spouse ? `＋${p.invest.nisaAnnualCapSpouse}万` : ""}` : "使わない";
  o["現金キープ"] = `${p.invest.reserveMonths}〜${p.invest.reserveMaxMonths}ヶ月分`;
  if (p.invest.cashGoals.length) o["目標貯蓄"] = p.invest.cashGoals.map(g => `${g.label} ${g.amount}万（${g.age}歳）`).join("・");
  o["取り崩し"] = `${({ taxableFirst: "特定→NISA", nisaFirst: "NISA→特定", proportional: "残高比例" })[p.invest.withdrawalOrder]}${p.invest.withdrawal.mode === "fixedRate" ? `・${p.invest.withdrawal.startAge}歳から年${p.invest.withdrawal.ratePct}%` : p.invest.withdrawal.mode === "fixedAmount" ? `・${p.invest.withdrawal.startAge}歳から年${p.invest.withdrawal.amount}万` : "・必要時のみ"}`;
  o["想定リターン"] = `NISA ${p.invest.returns.nisaPct}% / 特定 ${p.invest.returns.taxablePct}% / DC ${p.invest.returns.dcPct}%`;
  o["インフレ率"] = `${p.economy.inflationPct}%`;
  o["イベント"] = p.events.filter(e => e.enabled).map(e => e.label).join("、") || "なし";
  o["いまの資産"] = `現金 ${p.assets.cash}万 / NISA ${p.assets.nisaSelf + p.assets.nisaSpouse}万 / 特定 ${p.assets.taxable}万 / DC ${p.assets.dcSelf + p.assets.dcSpouse}万`;
  return o;
}

function DiffTable({ plans }: { plans: Plan[] }) {
  const flats = plans.map(flat);
  const keys = Object.keys(flats[0]);
  const differing = keys.filter(k => flats.some(f => f[k] !== flats[0][k]));
  if (!differing.length) return <p className="hint">設定に違いはありません。</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="ink-2"><th className="text-left py-1.5 font-medium w-28">項目</th>{plans.map(p => <th key={p.id} className="text-left py-1.5 font-medium"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span></th>)}</tr></thead>
        <tbody>
          {differing.map(k => (
            <tr key={k} className="border-t line align-top">
              <td className="py-1.5 ink-2">{k}</td>
              {flats.map((f, i) => <td key={i} className={cx("py-1.5 pr-3 ink", i > 0 && f[k] !== flats[0][k] && "font-medium")}>{f[k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
