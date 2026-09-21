import { newId } from "@/domain/model";
import { useActivePlan, useStore } from "@/state/store";
import { Card, NumField, Row, Toggle, Pill } from "@/ui/primitives";
import { SectionTitle, LinkedSection } from "../Editor";

export function RiskSection() {
  const { plan, update } = useActivePlan();
  const { dispatch } = useStore();
  const deathSelf = plan.events.find(e => e.kind === "death" && e.member === "self");
  const deathSpouse = plan.events.find(e => e.kind === "death" && e.member === "spouse");
  const st = plan.economy.stressTest;
  const toggleDeath = (member: "self" | "spouse", on: boolean) => update(d => {
    d.events = d.events.filter(e => !(e.kind === "death" && e.member === member));
    if (on) d.events.push({ id: newId("ev"), kind: "death", member, label: "死亡", enabled: true, age: d.self.age + 10 });
  });
  return (
    <>
      <SectionTitle title="万一・リスク" desc="「もし○歳で亡くなったら」「暴落が来たら」を同じプランに重ねて確認できます。追加で必要な保険金額は「万一・リスク」ビューで年齢ごとに分析します。" />
      <LinkedSection group="risk">
      <Card title="死亡シナリオ" subtitle="遺族年金・団信・生命保険・遺族の生活費（生活費セクション）・相続税を自動で反映します。">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Toggle checked={!!deathSelf} onChange={v => toggleDeath("self", v)} label={`${plan.self.name} が亡くなる`} help="この年に本人が亡くなった前提で試算します。遺族年金・団信・保険金・遺族の生活費・相続税をまとめて反映します。" />
            {deathSelf && deathSelf.kind === "death" && <NumField value={deathSelf.age} unit="歳" min={plan.self.age + 1} max={plan.endAge} size="sm" className="w-28" onChange={v => update(d => { const t = d.events.find(e => e.id === deathSelf.id); if (t && t.kind === "death") t.age = v; })} />}
          </div>
          {plan.spouse && (
            <div className="flex flex-wrap items-center gap-3">
              <Toggle checked={!!deathSpouse} onChange={v => toggleDeath("spouse", v)} label={`${plan.spouse.name} が亡くなる`} help="この年に配偶者が亡くなった前提で試算します。" />
              {deathSpouse && deathSpouse.kind === "death" && <NumField value={deathSpouse.age} unit="歳（本人年齢）" min={plan.self.age + 1} max={plan.endAge} size="sm" className="w-40" onChange={v => update(d => { const t = d.events.find(e => e.id === deathSpouse.id); if (t && t.kind === "death") t.age = v; })} />}
            </div>
          )}
          <Row>
            <NumField label="葬儀費用" value={plan.funeralCost} unit="万円" step={10} min={0} onChange={v => update(d => { d.funeralCost = v; })} help="亡くなった年に一時支出として計上し、相続税では債務控除として遺産から差し引きます。" />
          </Row>
          <div className="flex flex-wrap gap-1.5">
            <Pill>遺族の生活費 {plan.living.survivorPct}%</Pill>
            <Pill>保険 {plan.events.filter(e => e.kind === "insurance").length} 件</Pill>
            <button className="text-[11px] underline ink-2" onClick={() => dispatch({ type: "ui/view", view: "risk" })}>必要保障額を年齢別に見る →</button>
          </div>
        </div>
      </Card>
      <Card title="市場の急落（ストレステスト）" right={<Toggle checked={st.enabled} onChange={v => update(d => { d.economy.stressTest.enabled = v; })} label="適用" help="指定した年に運用資産が一度大きく下がるシナリオを重ねます。モンテカルロ（ダッシュボードのぶれ幅）とは別の、決まった 1 回の下落です。" />}>
        {st.enabled ? (
          <Row>
            <NumField label="いつ" value={st.age} unit="歳" min={plan.self.age} max={plan.endAge} onChange={v => update(d => { d.economy.stressTest.age = v; })} help="下落が起きる本人の年齢。NISA・特定口座・DC の残高がこの年に一気に減ります。" />
            <NumField label="下落率" value={st.dropPct} unit="%" step={5} min={5} max={90} onChange={v => update(d => { d.economy.stressTest.dropPct = v; })} help="運用資産の時価がこの割合だけ下がります。リーマン級なら 40〜50%。" />
            <NumField label="回復にかかる年数" value={st.recoveryYears} unit="年" min={0} max={20} onChange={v => update(d => { d.economy.stressTest.recoveryYears = v; })} help="この年数で元の成長軌道に戻ると仮定（0 なら回復なし）。" />
          </Row>
        ) : <p className="hint">NISA・特定口座・DC の残高が指定の年に一気に下落し、その後回復するシナリオを重ねます。</p>}
      </Card>
      </LinkedSection>
    </>
  );
}
