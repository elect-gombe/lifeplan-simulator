import { RotateCcw } from "lucide-react";
import { useActivePlan, useStore } from "@/state/store";
import { Card, NumField, Row, SliderField } from "@/ui/primitives";
import { SectionTitle, LinkedSection } from "../Editor";

export function SettingsSection() {
  const { plan, update, isDraft } = useActivePlan();
  const { dispatch } = useStore();
  return (
    <>
      <SectionTitle title="前提条件" desc="経済の前提。プランごとに設定できます。" />
      <LinkedSection group="settings">
      <Card title="物価・年金">
        <div className="space-y-3">
          <SliderField label="インフレ率（物価上昇）" value={plan.economy.inflationPct} min={-1} max={5} step={0.1} unit="%" onChange={v => update(d => { d.economy.inflationPct = v; })} help="生活費・教育費・家賃・維持費などが毎年この率で増えます。給与は収入セクションの昇給率で別に設定。" />
          <SliderField label="年金のマクロ経済スライド" value={plan.economy.macroSlidePct} min={-2} max={0} step={0.1} unit="%" onChange={v => update(d => { d.economy.macroSlidePct = v; })} help="年金額の改定率 = インフレ率 ＋ この値（下限 0）。年金の実質価値が毎年これだけ目減りします。" />
        </div>
        <p className="hint mt-3">年金の受給額は、インフレ率＋スライド調整率で名目改定されるものとして計算しています（賃金上昇率は考慮せず、現在の年金水準を基準にしています）。</p>
      </Card>
      <Card title="期間">
        <Row>
          <NumField label="何歳まで試算" value={plan.endAge} unit="歳" min={plan.self.age + 5} max={110} onChange={v => update(d => { d.endAge = v; })} help="本人がこの年齢になる年まで計算します。長くすると老後の取り崩し・相続まで見られますが、必要保障額はこの年齢までの不足で判定します。" />
          <NumField label="基準年（西暦）" value={plan.baseYear} unit="年" min={2000} max={2100} onChange={v => update(d => { d.baseYear = v; })} help="本人が上の年齢である暦年。年表やレポートの「年」の表示、児童手当・就学支援金などの制度年に使います。" />
        </Row>
      </Card>
      <Card title="計算の前提（この試算の限界）">
        <ul className="text-xs ink-2 space-y-1 list-disc pl-4">
          <li>税・社会保険は 2025 年度改正後の恒久ルールを簡略化して適用（基礎控除 58 万、給与所得控除の最低 65 万、協会けんぽ平均料率など）。自治体・健保組合により実際は異なります。</li>
          <li>公的年金は現在の水準（基礎年金満額 83.2 万）を基準に、加入月数と平均年収から見込額を算出。ねんきん定期便の見込額とは差が出ます。</li>
          <li>国民健康保険・後期高齢者医療・介護保険は所得比例の概算です。</li>
          <li>相続税・譲渡所得税は簡易計算。贈与税・住民税の均等割以外の非課税判定などは省略。</li>
          <li>金額はすべて名目（インフレ込み）で表示しています。</li>
        </ul>
      </Card>
      </LinkedSection>
      <Card title="データ">
        {!isDraft && <button className="btn btn-outline text-[var(--critical)]" onClick={() => { if (confirm("すべてのプランを削除して初期状態に戻します。よろしいですか？")) dispatch({ type: "reset" }); }}><RotateCcw size={14} />すべてリセット</button>}
      </Card>
    </>
  );
}
