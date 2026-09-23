/** 万一・リスク: 必要保障額の年齢別カーブ、現在の保障、死亡シナリオの遺族キャッシュフロー。 */
import { useDeferredValue, useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useActivePlan, useStore } from "@/state/store";
import { coverageCurve } from "@/engine/coverage";
import { simulate } from "@/engine/simulate";
import { LineCompare } from "@/charts/LineCompare";
import { WealthChart } from "@/charts/WealthChart";
import { Card, Segmented, Pill, NumField } from "@/ui/primitives";
import { fmtMan } from "@/lib/format";

export function RiskView() {
  const { plan: livePlan } = useActivePlan();
  const plan = useDeferredValue(livePlan);
  const { dispatch } = useStore();
  const [who, setWho] = useState<"self" | "spouse">("self");
  const offset = (who === "spouse" && plan.spouse) ? plan.spouse.age - plan.self.age : 0;
  const ageLabel = (selfAge: number) => (offset ? `${selfAge + offset} 歳（本人 ${selfAge} 歳のとき）` : `${selfAge} 歳`);
  const [deathAge, setDeathAge] = useState<number | null>(null);
  const target = who === "self" ? plan.self : plan.spouse;
  const curve = useMemo(() => (plan.spouse ? coverageCurve(plan, who, 1) : []), [plan, who]);
  const maxPoint = curve.reduce((m, p) => (p.shortfall > (m?.shortfall ?? -1) ? p : m), curve[0]);
  const insurances = plan.events.filter(e => e.kind === "insurance" && e.enabled && e.member === who);
  const scenarioAge = deathAge ?? maxPoint?.deathAge ?? plan.self.age + 10;
  const scenario = useMemo(() => {
    if (!plan.spouse) return null;
    const events = [...plan.events.filter(e => !(e.kind === "death" && e.member === who)), { id: "__d", kind: "death" as const, member: who, age: scenarioAge, label: "", enabled: true }];
    return simulate(plan, { events });
  }, [plan, who, scenarioAge]);

  if (!plan.spouse) {
    return (
      <Card className="fade-in">
        <div className="text-center py-10 space-y-2">
          <ShieldCheck size={28} className="mx-auto ink-3" />
          <p className="text-sm ink">配偶者が設定されていないため、遺族の必要保障額は計算しません。</p>
          <p className="hint">配偶者を追加すると、「もし○歳で亡くなったら遺族の資産はどうなるか」を年齢別に分析できます。</p>
          <button className="btn btn-outline" onClick={() => dispatch({ type: "ui/section", section: "family" })}>家族を編集</button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={who} onChange={v => { setWho(v); setDeathAge(null); }} options={[{ value: "self", label: `${plan.self.name} に万一` }, { value: "spouse", label: `${plan.spouse.name} に万一` }]} />
        <span className="hint">現在の保険・遺族年金・団信・遺族の生活費（{plan.living.survivorPct}%）を織り込んだ結果です。</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <div className="card p-4 lg:col-span-2" style={{ borderColor: maxPoint && maxPoint.shortfall > 0 ? "color-mix(in oklab, var(--warning) 50%, var(--line))" : undefined }}>
          <div className="flex items-start gap-3">
            {maxPoint && maxPoint.shortfall > 0 ? <ShieldAlert className="text-[var(--warning)] shrink-0" /> : <ShieldCheck className="text-[var(--good)] shrink-0" />}
            <div>
              <div className="text-sm font-semibold ink">
                {maxPoint && maxPoint.shortfall > 0
                  ? `この試算では最大 ${fmtMan(maxPoint.shortfall)} の保障が不足する結果（${target?.name} が ${ageLabel(maxPoint.deathAge)}に亡くなった場合）`
                  : `この試算では、どの年齢で亡くなっても遺族の資産が ${plan.endAge} 歳まで持続する結果です`}
              </div>
              <p className="hint mt-1">
                {maxPoint && maxPoint.shortfall > 0
                  ? `不足額は、遺族の流動資産が最も少なくなる時点（${maxPoint.minLiquidAge}歳）のマイナス分。この金額を死亡保険金でカバーすれば、この試算上は資産が枯渇しない計算になります。掛け捨ての収入保障保険は、年齢とともに必要額が減るカーブに合わせやすい商品です。`
                  : "あくまでこの試算の前提のもとでは、追加の死亡保障がなくても遺族の資産は不足しない結果です。実際に必要な保障は、公的保障の見込みやご家族の状況によって変わります。"}
              </p>
            </div>
          </div>
        </div>
        <Card title="現在の保障">
          {insurances.length === 0 ? <p className="hint">{target?.name} を被保険者とする保険はありません。</p> : (
            <ul className="text-xs space-y-1.5">
              {insurances.map(e => e.kind === "insurance" && (
                <li key={e.id} className="flex justify-between gap-2"><span className="ink truncate">{e.label}</span><span className="tabular ink-2 shrink-0">{e.type === "term" ? `${e.payout.toLocaleString()}万` : `${e.payout}万/月 〜${e.payoutUntilAge}歳`}</span></li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {plan.housing.some(h => h.kind === "own" && h.property.danshin) && <Pill tone="good">団信あり</Pill>}
            <Pill>遺族の生活費 {plan.living.survivorPct}%</Pill>
          </div>
          <button className="tap mt-3 text-[11px] underline ink-2" onClick={() => dispatch({ type: "ui/section", section: "events" })}>保険を追加・編集 →</button>
        </Card>
      </div>
      {curve.some(p => p.shortfall > 0) ? (
        <Card title="年齢別の必要保障額（追加で必要な死亡保障）" subtitle={`横軸: 亡くなる時点の本人の年齢${offset ? `（${target?.name} は ${offset > 0 ? "+" : ""}${offset} 歳）` : ""}。縦軸: その場合に不足する金額。クリックで下のシナリオに反映。`} padded={false}>
          <div className="px-2 pt-2 pb-2">
            <LineCompare height={260} selectedAge={scenarioAge} onSelectAge={a => setDeathAge(a)}
              series={[{ id: "gap", label: "必要保障額", color: "var(--warning)", points: curve.map(p => ({ age: p.deathAge, value: p.shortfall })) }]} />
          </div>
        </Card>
      ) : (
        <Card title="年齢別の必要保障額（追加で必要な死亡保障）">
          <p className="text-sm ink-2">
            {plan.self.age + 1}〜{curve[curve.length - 1]?.deathAge ?? plan.endAge}歳のどの時点で亡くなっても、遺族の流動資産はマイナスにならない結果です（不足額 0）。
            <span className="hint block mt-1">この結果だけを見れば保障を減らす余地がありますが、前提の置き方によって変わります。下のシナリオで各年齢の遺族の家計を確認できます。</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="hint">シナリオの年齢:</span>
            <NumField value={scenarioAge} unit="歳" min={plan.self.age + 1} max={plan.endAge - 1} size="sm" className="w-32" onChange={v => setDeathAge(v)} />
          </div>
        </Card>
      )}
      {scenario && (
        <Card title={`シナリオ: ${target?.name} が ${ageLabel(scenarioAge)}に亡くなった場合の遺族の資産`} subtitle={`遺族年金・保険金・団信・生活費 ${plan.living.survivorPct}% を反映`} padded={false}>
          <div className="px-2 pt-2 pb-14 sm:pb-8">
            <WealthChart rows={scenario.rows} selectedAge={null} onSelectAge={() => {}} height={280} />
          </div>
          <div className="px-4 pb-4 grid sm:grid-cols-3 gap-2 text-xs">
            {(() => {
              const after = scenario.rows.filter(r => r.age >= scenarioAge);
              const surv = after.find(r => (who === "self" ? r.spouse?.survivorPension : r.self.survivorPension));
              const sp = who === "self" ? surv?.spouse?.survivorPension : surv?.self.survivorPension;
              const min = after.reduce((m, r) => (r.balances.liquid < m.balances.liquid ? r : m), after[0]);
              const payout = after.reduce((a, r) => a + r.inflows.filter(f => f.category === "insurance").reduce((x, f) => x + f.amount, 0), 0);
              return <>
                <div className="rounded-lg surface-2 p-2.5"><div className="ink-3">遺族年金（初年度）</div><div className="font-semibold tabular">{sp ? `${fmtMan(sp)}/年` : "なし"}</div></div>
                <div className="rounded-lg surface-2 p-2.5"><div className="ink-3">保険金の合計</div><div className="font-semibold tabular">{fmtMan(payout)}</div></div>
                <div className="rounded-lg surface-2 p-2.5"><div className="ink-3">流動資産の最低（{min?.age}歳）</div><div className={`font-semibold tabular ${min && min.balances.liquid < 0 ? "text-[var(--critical)]" : ""}`}>{min ? fmtMan(min.balances.liquid) : "–"}</div></div>
              </>;
            })()}
          </div>
        </Card>
      )}
    </div>
  );
}
