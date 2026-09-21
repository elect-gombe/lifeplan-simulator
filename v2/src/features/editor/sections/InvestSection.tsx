import { useActivePlan } from "@/state/store";
import { useSim } from "@/state/useSim";
import { Card, NumField, Row, Toggle, SliderField, Segmented, TextField } from "@/ui/primitives";
import { Plus, Trash2, Home } from "lucide-react";
import { newId } from "@/domain/model";
import { fmtMan } from "@/lib/format";
import { SectionTitle, LinkedSection } from "../Editor";

export function InvestSection() {
  const { plan, update } = useActivePlan();
  const { res } = useSim(plan);
  const inv = plan.invest;
  const totalNisaIn = res.rows.reduce((a, r) => a + r.flows.nisaIn, 0);
  const wp = inv.withdrawal;
  const firstDraw = res.rows.find(r => r.flows.planned > 0);
  const drawTotal = res.rows.reduce((a, r) => a + r.flows.planned, 0);
  const ORDER_LABEL = { taxableFirst: "特定口座→NISA", nisaFirst: "NISA→特定口座", proportional: "残高比例" } as const;
  return (
    <>
      <SectionTitle title="資産運用の方針" desc="毎年の余ったお金をどう振り分けるか、足りないときどこから取り崩すかのルールです。" />
      <LinkedSection group="invest">
      <Card title="現金のキープ量（生活防衛資金）" subtitle="現金がこの範囲に収まるように、超えた分は投資へ、足りなければ取り崩します。">
        <Row>
          <NumField label="下限" value={inv.reserveMonths} unit="ヶ月分" min={0} max={60} onChange={v => update(d => { d.invest.reserveMonths = v; d.invest.reserveMaxMonths = Math.max(d.invest.reserveMaxMonths, v); })} help={`年間支出 ÷ 12 × 月数。これを割り込むと「${ORDER_LABEL[inv.withdrawalOrder]}」の順で売却。`} />
          <NumField label="上限" value={inv.reserveMaxMonths} unit="ヶ月分" min={inv.reserveMonths} max={120} onChange={v => update(d => { d.invest.reserveMaxMonths = v; })} help="これを超えた現金は NISA（→特定口座）に回します。" />
        </Row>
        <p className="hint mt-2">今年の支出 {fmtMan(res.rows[0].totalOut)} なら、現金は {fmtMan(res.rows[0].totalOut / 12 * inv.reserveMonths)} 〜 {fmtMan(res.rows[0].totalOut / 12 * inv.reserveMaxMonths)} に保たれます。</p>
      </Card>
      <Card title="NISA" right={<Toggle checked={inv.nisaEnabled} onChange={v => update(d => { d.invest.nisaEnabled = v; })} label="使う" help="オフにすると余剰資金を NISA に回さず、特定口座か現金で持ちます。" />}>
        {inv.nisaEnabled ? (
          <>
            <Row>
              <NumField label={`年間上限（${plan.self.name}）`} value={inv.nisaAnnualCapSelf} unit="万円/年" step={10} min={0} max={360} onChange={v => update(d => { d.invest.nisaAnnualCapSelf = v; })} help="つみたて投資枠 120万 ＋ 成長投資枠 240万 = 最大 360万。" />
              {plan.spouse && <NumField label={`年間上限（${plan.spouse.name}）`} value={inv.nisaAnnualCapSpouse} unit="万円/年" step={10} min={0} max={360} onChange={v => update(d => { d.invest.nisaAnnualCapSpouse = v; })} help="配偶者名義の NISA の年間投資枠。夫婦で別々に枠を持てます。" />}
              <NumField label="生涯上限（1人）" value={inv.nisaLifetimeCap} unit="万円" step={100} min={0} max={1800} onChange={v => update(d => { d.invest.nisaLifetimeCap = v; })} help="NISA の生涯非課税枠（簿価ベース）。売却するとその簿価分の枠が翌年から再利用できます。" />
            </Row>
            <div className="mt-3"><Toggle checked={inv.useTaxableWhenNisaFull} onChange={v => update(d => { d.invest.useTaxableWhenNisaFull = v; })} label="NISA 枠を超えた余剰は特定口座で運用" help="オフにすると余剰は現金のまま。" /></div>
            <p className="hint mt-2">この方針では生涯で {fmtMan(totalNisaIn)} を NISA に積み立てます。</p>
          </>
        ) : <p className="hint">余剰資金は{inv.useTaxableWhenNisaFull ? "特定口座（課税）で運用" : "現金のまま保有"}します。</p>}
      </Card>
      <Card title="取り崩し" subtitle="足りないときにどこから売るか、老後に計画的にいくら取り崩すか。">
        <div className="space-y-3">
          <div>
            <span className="label block mb-1">売る順番</span>
            <Segmented size="sm" wrap value={inv.withdrawalOrder} onChange={v => update(d => { d.invest.withdrawalOrder = v; })}
              options={[{ value: "taxableFirst", label: "特定口座→NISA", title: "非課税枠を長く残す（一般的な推奨）" }, { value: "nisaFirst", label: "NISA→特定口座", title: "先に非課税で現金化。特定口座の含み益課税を後ろに送る" }, { value: "proportional", label: "残高比例", title: "両口座から残高の比率で売る" }]} />
            <p className="hint mt-1">現金が下限を割ったときも、下の計画的な取り崩しも、この順番で売ります。特定口座は含み益に 20.315% が課税されます。</p>
          </div>
          <div>
            <span className="label block mb-1">計画的な取り崩し</span>
            <Segmented size="sm" wrap value={wp.mode} onChange={v => update(d => { d.invest.withdrawal.mode = v; })}
              options={[{ value: "asNeeded", label: "必要なときだけ", title: "現金が下限を割ったときだけ売る" }, { value: "fixedRate", label: "定率（年 x%）", title: "毎年、年初の運用資産の x% を現金化" }, { value: "fixedAmount", label: "定額（年 x 万円）", title: "毎年決めた額を現金化（インフレ連動）" }]} />
          </div>
          {wp.mode !== "asNeeded" && (
            <>
              <Row>
                <NumField label="開始年齢（本人）" value={wp.startAge} unit="歳" min={plan.self.age} max={plan.endAge} onChange={v => update(d => { d.invest.withdrawal.startAge = v; })} help="退職や年金開始に合わせるのが一般的。" />
                {wp.mode === "fixedRate"
                  ? <NumField label="取り崩し率" value={wp.ratePct} unit="%/年" step={0.5} min={0} max={20} onChange={v => update(d => { d.invest.withdrawal.ratePct = v; })} help="年初の NISA＋特定口座の残高に対する割合。4% ルールが目安。残高が減れば取り崩し額も減るので枯渇しにくい。" />
                  : <NumField label="年額" value={wp.amount} unit="万円/年" step={10} min={0} onChange={v => update(d => { d.invest.withdrawal.amount = v; })} help="現在の物価での金額。毎年インフレ率で増やします。運用資産がなくなれば止まります。" />}
              </Row>
              <Toggle checked={wp.stopInvesting} onChange={v => update(d => { d.invest.withdrawal.stopInvesting = v; })} label="開始後は余剰現金を投資に回さない" help="オフにすると、取り崩して余った現金が上限を超えた分は再び NISA・特定口座に戻ります（取り崩しと積立が同時に起きる）。" />
              <p className="hint">
                {firstDraw ? <>初年（{firstDraw.age}歳）に {fmtMan(firstDraw.flows.planned)}、生涯で {fmtMan(drawTotal)} を現金化します。</> : <>この設定では取り崩しが発生しません（開始年齢時点で運用資産がない、または試算期間外）。</>}
                取り崩した現金は生活費に充て、残りは「現金のキープ量」の範囲で保有します。
              </p>
            </>
          )}
        </div>
      </Card>
      <Card title="目標貯蓄（使う予定のお金を現金で積み立てる）" subtitle="住宅の頭金や車・教育資金など、使う年が決まっているお金は、直前に運用資産を売るのではなく、期間を決めて現金で積み立てます。"
        right={<button className="btn btn-outline text-xs" onClick={() => update(d => { d.invest.cashGoals.push({ id: newId("goal"), label: "目標貯蓄", age: Math.min(d.self.age + 5, d.endAge), amount: 300, inflate: true, years: 5, fromInvestments: false }); })}><Plus size={14} />追加</button>}>
        {plan.housing.filter(h => h.kind === "own" && h.startAge > plan.self.age && !inv.cashGoals.some(g => g.label.includes("頭金") && g.age === h.startAge)).map(h => (
          <button key={h.id} className="btn btn-ghost text-xs mb-2" onClick={() => update(d => { d.invest.cashGoals.push({ id: newId("goal"), label: `住宅の頭金・諸費用（${h.startAge}歳）`, age: h.startAge, amount: Math.round(h.property.downPayment + h.property.price * h.property.closingCostPct / 100), inflate: false, years: Math.min(Math.max(h.startAge - d.self.age, 1), 10), fromInvestments: false }); })}>
            <Home size={13} />{h.startAge}歳の住宅購入（頭金 {h.property.downPayment.toLocaleString()}万＋諸費用 {Math.round(h.property.price * h.property.closingCostPct / 100).toLocaleString()}万）を目標に追加
          </button>
        ))}
        {inv.cashGoals.length === 0 ? <p className="hint">目標がなければ、余剰は「現金のキープ量」の上限を超えた分から投資に回り、大きな支出の年に不足分を売却します。</p> : (
          <div className="space-y-3">
            {inv.cashGoals.map(g => {
              const startAge = g.age - g.years;
              const goalRow = res.rows.find(r => r.age === g.age - 1);
              const target = g.amount * (g.inflate ? Math.pow(1 + plan.economy.inflationPct / 100, Math.max(g.age - plan.self.age, 0)) : 1);
              const reached = goalRow ? goalRow.balances.cash / 10_000 : null;
              const set = (fn: (x: typeof g) => void) => update(d => { const t = d.invest.cashGoals.find(x => x.id === g.id); if (t) fn(t); });
              return (
                <div key={g.id} className="rounded-xl border line p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <TextField value={g.label} onChange={v => set(x => { x.label = v; })} className="flex-1" />
                    <button className="btn btn-ghost px-2" aria-label="削除" onClick={() => update(d => { d.invest.cashGoals = d.invest.cashGoals.filter(x => x.id !== g.id); })}><Trash2 size={14} /></button>
                  </div>
                  <Row>
                    <NumField label="使う年（本人）" value={g.age} unit="歳" min={plan.self.age + 1} max={plan.endAge} onChange={v => set(x => { x.age = v; x.years = Math.min(x.years, Math.max(v - plan.self.age, 1)); })} help="このお金を使う本人の年齢。前年末までに目標額が現金で用意されているようにします。" />
                    <NumField label="目標額" value={g.amount} unit="万円" step={50} min={0} onChange={v => set(x => { x.amount = v; })} help="現在の物価での金額。" />
                    <NumField label="積立期間" value={g.years} unit="年" min={1} max={Math.max(g.age - plan.self.age, 1)} onChange={v => set(x => { x.years = v; })} help={`${Math.max(startAge, plan.self.age)}歳から毎年 約 ${Math.round(g.amount / g.years).toLocaleString()}万ずつ現金を積み増します。`} />
                  </Row>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Toggle checked={g.inflate} onChange={v => set(x => { x.inflate = v; })} label="インフレ連動" help="オンなら目標額を前提セクションのインフレ率で毎年増やします。数年後の住宅価格や学費のように値上がりするものはオンに。" />
                    <Toggle checked={g.fromInvestments} onChange={v => set(x => { x.fromInvestments = v; })} label="足りない分は運用資産から毎年移す" help="オンにすると、収支の余剰だけで目標に届かない年は差額を売却して現金にします（売却が数年に分散）。オフなら余剰の範囲で積み立て、不足は使う年にまとめて売却。" />
                  </div>
                  <p className="hint">
                    {plan.self.age >= g.age ? "使う年を過ぎています。" : <>目標 {Math.round(target).toLocaleString()}万（{g.age}歳時点）。{reached != null && <>前年末の現金は {Math.round(reached).toLocaleString()}万 → {reached >= target ? <span className="text-[var(--good)]">目標達成</span> : <span className="text-[var(--warning)]">約 {Math.round(target - reached).toLocaleString()}万 不足（使う年に売却で補います）</span>}</>}</>}
                  </p>
                </div>
              );
            })}
            <p className="hint">積立中は「現金のキープ量」の上限がこの分だけ上がり、余剰が投資に回らず現金に残ります。使う年が来ると上限は元に戻ります。</p>
          </div>
        )}
      </Card>
      <Card title="想定リターン（年率・名目）" subtitle="長期の期待値。インフレ率は前提セクション。">
        <div className="space-y-3">
          <SliderField label="NISA" value={inv.returns.nisaPct} min={0} max={10} step={0.5} unit="%" onChange={v => update(d => { d.invest.returns.nisaPct = v; })} help="NISA で運用する資産の期待リターン（年率・名目）。インフレ率を引くと実質リターンになります。" />
          <SliderField label="特定口座" value={inv.returns.taxablePct} min={0} max={10} step={0.5} unit="%" onChange={v => update(d => { d.invest.returns.taxablePct = v; })} help="課税口座の期待リターン（年率・名目）。売却時に含み益へ 20.315% が課税されます。" />
          <SliderField label="DC・iDeCo" value={inv.returns.dcPct} min={0} max={10} step={0.5} unit="%" onChange={v => update(d => { d.invest.returns.dcPct = v; })} help="DC・iDeCo の期待リターン（年率・名目）。運用中は非課税です。" />
          <SliderField label="現金・預金" value={inv.returns.cashPct} min={0} max={3} step={0.1} unit="%" onChange={v => update(d => { d.invest.returns.cashPct = v; })} help="普通預金・定期預金の利率。インフレ率より低いと実質的な価値は目減りします。" />
          <SliderField label="リスク（年率の標準偏差）" value={inv.volatilityPct} min={0} max={30} step={1} unit="%" onChange={v => update(d => { d.invest.volatilityPct = v; })} help="ダッシュボードの「運用のぶれ幅」で使います。全世界株式なら 15〜18%、株式50%なら 8〜10% 程度。" />
        </div>
      </Card>
      </LinkedSection>
    </>
  );
}
