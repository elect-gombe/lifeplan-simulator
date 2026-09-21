import { useActivePlan } from "@/state/store";
import { Card, NumField, Row, Toggle, Collapsible, Segmented, TextField, cx } from "@/ui/primitives";
import { LIVING_ITEM_PRESET, LIVING_STATS, livingItemsTotal, newId } from "@/domain/model";
import { Plus, Trash2, BarChart3 } from "lucide-react";
import { ScheduleEditor } from "@/ui/ScheduleEditor";
import { fmtMan } from "@/lib/format";
import { SectionTitle, LinkedSection } from "../Editor";

export function LivingSection() {
  const { plan, update } = useActivePlan();
  const a = plan.assets;
  return (
    <>
      <SectionTitle title="生活費・いまの資産" desc="住居費・教育費・保険料・車は別セクションで入力するので、ここでは含めません。" />
      <LinkedSection group="living">
      <Card title="基本生活費" subtitle="食費・光熱費・通信・日用品・被服・交際・医療・小遣いなど（世帯合計、月額）"
        right={<Segmented size="sm" value={plan.living.detailed ? "detail" : "total"} onChange={v => update(d => { d.living.detailed = v === "detail"; if (v === "detail") { const t = livingItemsTotal(d.living.items); if (t > 0) d.living.monthly[0].value = t; else { /* 内訳が空なら現在の合計を「その他」に入れて始める */ const o = d.living.items.find(i => i.key === "other"); if (o) o.monthly = d.living.monthly[0].value; } } })}
          options={[{ value: "total", label: "合計で入力" }, { value: "detail", label: "内訳で入力" }]} />}>
        {plan.living.detailed && <LivingBreakdown />}
        <div className={cx(plan.living.detailed && "mt-4 pt-3 border-t line")}>
          {plan.living.detailed && <div className="label mb-1">今後の変化（現在の値は内訳の合計）</div>}
          <ScheduleEditor value={plan.living.monthly} onChange={s => update(d => { d.living.monthly = s; if (d.living.detailed) d.living.monthly[0].value = livingItemsTotal(d.living.items) || d.living.monthly[0].value; })} unit="万円/月" step={1} startAge={plan.self.age} endAge={plan.endAge} color="var(--s-taxable)" />
        </div>
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-3">
            <Toggle checked={plan.living.retirementMonthly != null} onChange={v => update(d => { d.living.retirementMonthly = v ? Math.round((d.living.monthly[d.living.monthly.length - 1]?.value ?? 20) * 0.8) : null; })} label="年金受給後は別の生活費にする" help="年金の受給が始まる年から、基本生活費を別の金額に切り替えます。現役時の 7〜8 割が目安。" />
            {plan.living.retirementMonthly != null && <NumField value={plan.living.retirementMonthly} unit="万円/月" step={1} min={0} onChange={v => update(d => { d.living.retirementMonthly = v; })} className="w-40" size="sm" />}
          </div>
          <Row>
            <NumField label="子1人の独立ごとに減らす" value={plan.living.reductionPerChildPct} unit="%" step={5} min={0} max={50} onChange={v => update(d => { d.living.reductionPerChildPct = v; })} help="子が独立年齢（子どもセクション）に達すると生活費を減らします。" />
            <NumField label="万一のとき（遺族）の生活費" value={plan.living.survivorPct} unit="%" step={5} min={30} max={100} onChange={v => update(d => { d.living.survivorPct = v; })} help="本人または配偶者が亡くなった後の基本生活費の比率。" />
          </Row>
          <p className="hint">生活費はインフレ率（前提セクション）で毎年上がります。</p>
        </div>
      </Card>
      <Card title="いまの資産" subtitle="現時点の残高（万円）。ローン残高は住まいセクションの物件設定から計算します。">
        <Row>
          <NumField label="現金・預金" value={a.cash} unit="万円" step={50} min={0} onChange={v => update(d => { d.assets.cash = v; })} help="すぐ使える預貯金の合計。生活防衛資金もここに含めます。" />
          <NumField label={`NISA（${plan.self.name}）`} value={a.nisaSelf} unit="万円" step={50} min={0} onChange={v => update(d => { d.assets.nisaSelf = v; d.assets.nisaSelfCost = Math.min(d.assets.nisaSelfCost, v) || v; })} help="本人名義の NISA の現在の時価。生涯枠の残りは下の取得価額から計算します。" />
          {plan.spouse && <NumField label={`NISA（${plan.spouse.name}）`} value={a.nisaSpouse} unit="万円" step={50} min={0} onChange={v => update(d => { d.assets.nisaSpouse = v; d.assets.nisaSpouseCost = Math.min(d.assets.nisaSpouseCost, v) || v; })} help="配偶者名義の NISA の現在の時価。" />}
          <NumField label="特定口座・株式など" value={a.taxable} unit="万円" step={50} min={0} onChange={v => update(d => { d.assets.taxable = v; d.assets.taxableCost = Math.min(d.assets.taxableCost, v) || v; })} help="課税口座の時価合計。売却時は含み益に 20.315% が課税されます（取得価額は下で指定）。" />
          <NumField label={`DC・iDeCo（${plan.self.name}）`} value={a.dcSelf} unit="万円" step={50} min={0} onChange={v => update(d => { d.assets.dcSelf = v; })} help="本人の企業型DC・iDeCo の現在の残高。受取方法は収入・年金セクションで設定します。" />
          {plan.spouse && <NumField label={`DC・iDeCo（${plan.spouse.name}）`} value={a.dcSpouse} unit="万円" step={50} min={0} onChange={v => update(d => { d.assets.dcSpouse = v; })} help="配偶者の企業型DC・iDeCo の現在の残高。" />}
        </Row>
        <Collapsible title="取得価額（含み益の計算用）" summary={a.taxable + a.nisaSelf + a.nisaSpouse > 0 ? `含み益 ${fmtMan((a.taxable - a.taxableCost + a.nisaSelf - a.nisaSelfCost + a.nisaSpouse - a.nisaSpouseCost) * 10_000)}` : "省略可"}>
          <Row>
            <NumField label="NISA 取得価額（本人）" value={a.nisaSelfCost} unit="万円" step={50} min={0} max={a.nisaSelf} onChange={v => update(d => { d.assets.nisaSelfCost = v; })} help="買ったときの金額（簿価）。時価との差が含み益です。NISA は非課税なので税額には影響しませんが、生涯枠の消費量の判定に使います。" />
            {plan.spouse && <NumField label="NISA 取得価額（配偶者）" value={a.nisaSpouseCost} unit="万円" step={50} min={0} max={a.nisaSpouse} onChange={v => update(d => { d.assets.nisaSpouseCost = v; })} help="配偶者が買ったときの金額（簿価）。生涯枠の判定に使います。" />}
            <NumField label="特定口座 取得価額" value={a.taxableCost} unit="万円" step={50} min={0} max={a.taxable} onChange={v => update(d => { d.assets.taxableCost = v; })} help="売却時に含み益へ 20.315% 課税します。" />
          </Row>
        </Collapsible>
      </Card>
      </LinkedSection>
    </>
  );
}

/** 生活費の内訳入力。各項目の合計を生活費スケジュールの現在値に同期する。 */
function LivingBreakdown() {
  const { plan, update } = useActivePlan();
  const items = plan.living.items;
  const total = livingItemsTotal(items);
  const sync = (d: typeof plan) => { d.living.monthly[0].value = livingItemsTotal(d.living.items); };
  const applyStats = (kind: "family" | "single") => update(d => {
    const stats = LIVING_STATS[kind];
    for (const it of d.living.items) if (stats[it.key] != null) it.monthly = stats[it.key];
    for (const p of LIVING_ITEM_PRESET) if (!d.living.items.some(i => i.key === p.key)) d.living.items.push({ key: p.key, label: p.label, monthly: stats[p.key] ?? 0 });
    sync(d);
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="hint">統計データを入れる:</span>
        <button className="btn btn-outline text-xs" onClick={() => applyStats(plan.spouse ? "family" : "single")}><BarChart3 size={13} />{plan.spouse ? "二人以上の世帯の平均" : "単身世帯の平均"}</button>
        <button className="btn btn-ghost text-xs" onClick={() => applyStats(plan.spouse ? "single" : "family")}>{plan.spouse ? "単身世帯" : "二人以上の世帯"}</button>
        <span className="hint">（総務省 家計調査 2024 年、住居・教育・車・保険を除く概算）</span>
      </div>
      <div className="grid grid-cols-1 gap-y-1.5">
        {items.map(it => {
          const preset = LIVING_ITEM_PRESET.find(p => p.key === it.key);
          return (
            <div key={it.key} className="flex items-center gap-2">
              {preset ? <span className="text-sm ink w-28 shrink-0" title={preset.hint || undefined}>{it.label}</span>
                : <TextField value={it.label} onChange={v => update(d => { const t = d.living.items.find(x => x.key === it.key); if (t) t.label = v; })} className="w-28 shrink-0" />}
              <NumField value={it.monthly} unit="万円/月" step={0.1} min={0} size="sm" className="flex-1 max-w-[220px]" onChange={v => update(d => { const t = d.living.items.find(x => x.key === it.key); if (t) t.monthly = v; sync(d); })} />
              {!preset && <button className="btn btn-ghost px-1.5" aria-label="削除" onClick={() => update(d => { d.living.items = d.living.items.filter(x => x.key !== it.key); sync(d); })}><Trash2 size={13} /></button>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <button className="btn btn-ghost text-xs" onClick={() => update(d => { d.living.items.push({ key: newId("li"), label: "項目", monthly: 0 }); })}><Plus size={13} />項目を追加</button>
        <div className="text-sm"><span className="ink-3 mr-2">合計</span><b className="tabular ink">{total.toLocaleString()} 万円/月</b><span className="hint ml-2">（年 {Math.round(total * 12).toLocaleString()}万）</span></div>
      </div>
      <p className="hint">住居費（家賃・ローン・管理費）は住まい、教育費・養育費は子ども、保険料と車は イベント で入力するので、ここには含めません。</p>
    </div>
  );
}
