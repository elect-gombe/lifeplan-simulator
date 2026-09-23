/** 保障: 亡くなったときの家計を決める前提だけを置く。「もし○歳で亡くなったら」の分析は万一の分析ビュー。 */
import { useActivePlan, useStore } from "@/state/store";
import { Card, NumField, Row, Pill } from "@/ui/primitives";
import { SectionTitle, LinkedSection } from "../Editor";

export function RiskSection() {
  const { plan, update } = useActivePlan();
  const { dispatch } = useStore();
  const deaths = plan.events.filter(e => e.kind === "death");
  const insurances = plan.events.filter(e => e.kind === "insurance" && e.enabled);
  const nameOf = (m: "self" | "spouse") => (m === "self" ? plan.self.name : plan.spouse?.name ?? "配偶者");
  return (
    <>
      <SectionTitle title="保障" desc="亡くなったときに遺族の家計がどうなるかを決める前提です。「もし○歳で亡くなったら」を年齢ごとに試すのは「万一の分析」ビューで行います。" />
      <LinkedSection group="risk">
      <Card title="遺族の家計の前提">
        <Row>
          <NumField label="葬儀費用" value={plan.funeralCost} unit="万円" step={10} min={0} onChange={v => update(d => { d.funeralCost = v; })} help="亡くなった年に一時支出として計上し、相続税では債務控除として遺産から差し引きます。" />
        </Row>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Pill>遺族の生活費 {plan.living.survivorPct}%</Pill>
          <button className="tap text-[11px] underline ink-2" onClick={() => dispatch({ type: "ui/section", section: "living" })}>生活費セクションで変更 →</button>
        </div>
      </Card>
      <Card title="いまの保障" subtitle="保険はイベントとして登録します。ここでは死亡時に効くものを一覧にしています。">
        {insurances.length === 0 ? <p className="hint">死亡保険は登録されていません。</p> : (
          <ul className="text-xs space-y-1.5">
            {insurances.map(e => e.kind === "insurance" && (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="ink truncate">{e.label}<span className="ink-3">（{nameOf(e.member)}）</span></span>
                <span className="tabular ink-2 shrink-0">{e.type === "term" ? `${e.payout.toLocaleString()}万` : `${e.payout}万/月 〜${e.payoutUntilAge}歳`}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {plan.housing.some(h => h.kind === "own" && h.property.danshin) && <Pill tone="good">団信あり</Pill>}
          {(plan.self.deathBenefit > 0 || (plan.spouse?.deathBenefit ?? 0) > 0) && <Pill>死亡退職金あり</Pill>}
          <button className="tap text-[11px] underline ink-2" onClick={() => dispatch({ type: "ui/section", section: "events" })}>保険を追加・編集 →</button>
        </div>
      </Card>
      {deaths.length > 0 && (
        <Card title="このプランに入っている死亡の前提" subtitle="このプランは、次の前提で全ビュー・レポートを計算しています。">
          <ul className="space-y-2">
            {deaths.map(e => e.kind === "death" && (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="ink">{nameOf(e.member)} が {e.age} 歳（本人年齢）で亡くなる</span>
                <button className="tap text-[11px] underline ink-2" onClick={() => update(d => { d.events = d.events.filter(x => x.id !== e.id); })}>解除</button>
              </li>
            ))}
          </ul>
          <p className="hint mt-2">年齢を変えて試すだけなら、プランを書き換えずに「万一の分析」ビューでできます。</p>
        </Card>
      )}
      </LinkedSection>
      <div className="px-1">
        <button className="btn btn-outline" onClick={() => dispatch({ type: "ui/view", view: "risk" })}>万一の分析を開く →</button>
        <p className="hint mt-1.5">年齢別の必要保障額と、遺族の資産がどう推移するかを確認できます。</p>
      </div>
    </>
  );
}
