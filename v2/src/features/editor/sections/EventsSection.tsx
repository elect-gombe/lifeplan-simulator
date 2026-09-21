import { useState } from "react";
import { Trash2, Car, ShieldCheck, ArrowDownCircle, ArrowUpCircle, Plane, HeartPulse, Gift, Wrench } from "lucide-react";
import { newId, type LifeEvent, type CashEvent, type CarEvent, type InsuranceEvent } from "@/domain/model";
import { useActivePlan } from "@/state/store";
import { Card, NumField, Segmented, Row, Toggle, Modal, EmptyState, Pill, TextField, cx } from "@/ui/primitives";
import { SectionTitle, LinkedSection } from "../Editor";
import { MiniStackedBars } from "@/charts/Mini";
import { previewEventAmounts } from "@/engine/simulate";
import { fmtMan } from "@/lib/format";
import { useMemo } from "react";
import type { Plan } from "@/domain/model";

type Template = { label: string; icon: React.ReactNode; make: (selfAge: number, endAge: number) => LifeEvent };
const TEMPLATES: Template[] = [
  { label: "車", icon: <Car size={15} />, make: (a, e) => ({ id: newId("ev"), kind: "car", label: "車", enabled: true, startAge: a + 1, endAge: Math.max(Math.min(e, 80), a + 3), price: 300, loanYears: 0, loanRatePct: 2.5, replaceEveryYears: 9, runningAnnual: 40 }) },
  { label: "旅行・趣味", icon: <Plane size={15} />, make: (a, e) => ({ id: newId("ev"), kind: "expense", label: "旅行・趣味", enabled: true, startAge: a, years: e - a + 1, every: 1, amount: 30, inflate: true, taxable: false, stopOnSelfDeath: false }) },
  { label: "家電・リフォーム", icon: <Wrench size={15} />, make: (a) => ({ id: newId("ev"), kind: "expense", label: "リフォーム", enabled: true, startAge: a + 15, years: 1, every: 1, amount: 300, inflate: true, taxable: false, stopOnSelfDeath: false }) },
  { label: "親の介護", icon: <HeartPulse size={15} />, make: (a) => ({ id: newId("ev"), kind: "expense", label: "親の介護費用", enabled: true, startAge: a + 20, years: 5, every: 1, amount: 60, inflate: true, taxable: false, stopOnSelfDeath: false }) },
  { label: "相続・贈与を受ける", icon: <Gift size={15} />, make: (a) => ({ id: newId("ev"), kind: "income", label: "相続", enabled: true, startAge: a + 25, years: 1, every: 1, amount: 1000, inflate: false, taxable: false, stopOnSelfDeath: false }) },
  { label: "副収入・家賃収入", icon: <ArrowUpCircle size={15} />, make: (a) => ({ id: newId("ev"), kind: "income", label: "副収入", enabled: true, startAge: a, years: 20, every: 1, amount: 60, inflate: true, taxable: true, stopOnSelfDeath: true }) },
  { label: "生命保険", icon: <ShieldCheck size={15} />, make: (a) => ({ id: newId("ev"), kind: "insurance", label: "収入保障保険", enabled: true, member: "self", type: "incomeProtection", deductionType: "general", startAge: a, endAge: Math.max(65, a + 5), premiumMonthly: 0.4, payout: 15, payoutUntilAge: Math.max(65, a + 5) }) },
  { label: "その他の支出", icon: <ArrowDownCircle size={15} />, make: (a) => ({ id: newId("ev"), kind: "expense", label: "その他", enabled: true, startAge: a + 5, years: 1, every: 1, amount: 100, inflate: true, taxable: false, stopOnSelfDeath: false }) },
];

export function EventsSection() {
  const { plan, update } = useActivePlan();
  const [editing, setEditing] = useState<string | null>(null);
  const events = plan.events.filter(e => e.kind !== "death");
  const add = (t: Template) => { const ev = t.make(plan.self.age, plan.endAge); update(d => { d.events.push(ev); }); setEditing(ev.id); };
  const target = editing ? plan.events.find(e => e.id === editing) ?? null : null;
  return (
    <>
      <SectionTitle title="ライフイベント" desc="車・旅行・介護・保険・臨時の収入や支出。テンプレートから追加して数値を調整します。" />
      <LinkedSection group="events">
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map(t => <button key={t.label} onClick={() => add(t)} className="btn btn-outline justify-start text-xs">{t.icon}{t.label}</button>)}
      </div>
      {events.length === 0
        ? <EmptyState title="イベントはまだありません" body="上のテンプレートから追加できます。" />
        : (
          <Card padded={false}>
            <ul className="divide-y line">
              {[...events].sort((a, b) => startOf(a) - startOf(b)).map(e => (
                <li key={e.id} className={cx("flex items-center gap-2 px-3 py-2", !e.enabled && "opacity-50")}>
                  <Toggle checked={e.enabled} ariaLabel={`${e.label} を有効にする`} onChange={v => update(d => { const t = d.events.find(x => x.id === e.id); if (t) t.enabled = v; })} />
                  <button onClick={() => setEditing(e.id)} className="flex-1 min-w-0 text-left focus-ring rounded">
                    <div className="text-sm ink truncate flex items-center gap-1.5">{iconOf(e)}{e.label}</div>
                    <div className="hint truncate">{describe(e)}</div>
                  </button>
                  <button onClick={() => update(d => { d.events = d.events.filter(x => x.id !== e.id); })} className="btn btn-ghost px-1.5 hover:text-[var(--critical)]" aria-label="削除"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      <Modal open={!!target} onClose={() => setEditing(null)} width="max-w-4xl" title={target ? <span className="inline-flex items-center gap-2">{iconOf(target)}イベントを編集</span> : ""}
        footer={<button className="btn btn-primary" onClick={() => setEditing(null)}>完了</button>}>
        {target && (
          <div className="grid lg:grid-cols-2 gap-5">
            <EventForm e={target} plan={plan} onChange={fn => update(d => { const t = d.events.find(x => x.id === target.id); if (t) fn(t as never); })} />
            <EventPreview e={target} plan={plan} />
          </div>
        )}
      </Modal>
      </LinkedSection>
    </>
  );
}

function startOf(e: LifeEvent): number { return e.kind === "death" ? e.age : e.startAge; }
function iconOf(e: LifeEvent) {
  return e.kind === "car" ? <Car size={14} /> : e.kind === "insurance" ? <ShieldCheck size={14} /> : e.kind === "income" ? <ArrowUpCircle size={14} className="text-[var(--good)]" /> : <ArrowDownCircle size={14} />;
}
function describe(e: LifeEvent): string {
  switch (e.kind) {
    case "car": return `${e.startAge}〜${e.endAge}歳・${e.price}万${e.replaceEveryYears ? ` / ${e.replaceEveryYears}年ごと買替` : ""}${e.loanYears ? `・${e.loanYears}年ローン` : ""}・維持費 ${e.runningAnnual}万/年`;
    case "insurance": return `${e.member === "self" ? "本人" : "配偶者"}・${e.type === "term" ? `死亡保険金 ${e.payout.toLocaleString()}万` : `月 ${e.payout}万を${e.payoutUntilAge}歳まで`}・保険料 ${e.premiumMonthly}万/月（〜${e.endAge}歳）`;
    case "expense": case "income": return e.years <= 1 ? `${e.startAge}歳に ${e.amount.toLocaleString()}万（単発）` : `${e.startAge}〜${e.startAge + e.years - 1}歳・${e.amount.toLocaleString()}万/年${e.every > 1 ? `（${e.every}年ごと）` : ""}${e.kind === "income" && e.taxable ? "・課税" : ""}`;
    default: return "";
  }
}

export function EventForm({ e, plan, onChange }: { e: LifeEvent; plan: { self: { age: number; name: string }; spouse: { name: string } | null; endAge: number }; onChange: (fn: (e: LifeEvent) => void) => void }) {
  const a0 = plan.self.age, aEnd = plan.endAge;
  return (
    <div className="space-y-3">
      <label className="block"><span className="label block mb-1">名前</span><TextField value={e.label} onChange={v => onChange(x => { x.label = v; })} ariaLabel="イベント名" /></label>
      {(e.kind === "expense" || e.kind === "income") && (
        <>
          <div><span className="label block mb-1">種類</span><Segmented size="sm" value={e.kind} onChange={v => onChange(x => { x.kind = v; })} options={[{ value: "expense", label: "支出" }, { value: "income", label: "収入" }]} /></div>
          <Row>
            <NumField label="開始年齢" value={e.startAge} unit="歳" min={a0} max={aEnd} onChange={v => onChange(x => { (x as CashEvent).startAge = v; })} help="本人の年齢が基準です（配偶者・子の年齢ではありません）。" />
            <NumField label="続く年数" value={e.years} unit="年" min={1} max={aEnd - a0 + 1} onChange={v => onChange(x => { (x as CashEvent).years = v; })} help="1 なら単発。" />
            <NumField label="間隔" value={e.every} unit="年ごと" min={1} max={20} onChange={v => onChange(x => { (x as CashEvent).every = v; })} help="1 なら毎年。3 なら 3 年に 1 回だけ発生します（車検・旅行など）。" />
          </Row>
          <Row>
            <NumField label={e.years <= 1 ? "金額" : "年額"} value={e.amount} unit="万円" step={10} min={0} onChange={v => onChange(x => { (x as CashEvent).amount = v; })} help="1 回あたりの金額。収入なら受け取る額、支出なら払う額を入れます。" />
            <div className="flex flex-col gap-2 justify-end col-span-2">
              <Toggle checked={e.inflate} onChange={v => onChange(x => { (x as CashEvent).inflate = v; })} label="インフレに連動" help="オンなら前提セクションのインフレ率で毎年増やします。ローン返済など固定額の支出はオフに。" />
              {e.kind === "income" && <Toggle checked={e.taxable} onChange={v => onChange(x => { (x as CashEvent).taxable = v; })} label="課税対象（雑所得など）" help="本人の所得に加算して所得税・住民税を計算します。" />}
              <Toggle checked={e.stopOnSelfDeath} onChange={v => onChange(x => { (x as CashEvent).stopOnSelfDeath = v; })} label="本人が亡くなったら止める" help="万一セクションで本人の死亡を設定したとき、この収支をその年から止めます。" />
            </div>
          </Row>
        </>
      )}
      {e.kind === "car" && (
        <>
          <Row>
            <NumField label="購入年齢" value={e.startAge} unit="歳" min={a0} max={aEnd} onChange={v => onChange(x => { (x as CarEvent).startAge = v; })} help="最初に購入する本人の年齢。買い替えサイクルを入れると、この年齢から周期的に買い替えます。" />
            <NumField label="手放す年齢" value={e.endAge} unit="歳" min={e.startAge} max={aEnd} onChange={v => onChange(x => { (x as CarEvent).endAge = v; })} help="この年齢で車を手放し、以降の維持費・買い替えをやめます。" />
            <NumField label="価格" value={e.price} unit="万円" step={10} min={0} onChange={v => onChange(x => { (x as CarEvent).price = v; })} help="1 台あたりの車両価格（買い替え時も同じ価格で計算）。" />
          </Row>
          <Row>
            <NumField label="買い替えサイクル" value={e.replaceEveryYears} unit="年" min={0} max={30} onChange={v => onChange(x => { (x as CarEvent).replaceEveryYears = v; })} help="0 なら買い替えなし。" />
            <NumField label="ローン期間" value={e.loanYears} unit="年" min={0} max={10} onChange={v => onChange(x => { (x as CarEvent).loanYears = v; })} help="0 なら一括購入。" />
            {e.loanYears > 0 && <NumField label="ローン金利" value={e.loanRatePct} unit="%" step={0.1} min={0} onChange={v => onChange(x => { (x as CarEvent).loanRatePct = v; })} help="マイカーローンの年利（元利均等）。" />}
            <NumField label="維持費" value={e.runningAnnual} unit="万円/年" step={5} min={0} onChange={v => onChange(x => { (x as CarEvent).runningAnnual = v; })} help="税・保険・車検・駐車場・燃料。" />
          </Row>
        </>
      )}
      {e.kind === "insurance" && (
        <>
          <Row>
            <div><span className="label block mb-1">被保険者</span><Segmented size="sm" value={e.member} onChange={v => onChange(x => { (x as InsuranceEvent).member = v; })} options={[{ value: "self", label: plan.self.name }, ...(plan.spouse ? [{ value: "spouse" as const, label: plan.spouse.name }] : [])]} /></div>
            <div className="col-span-2"><span className="label block mb-1">種類</span><Segmented size="sm" wrap value={e.type} onChange={v => onChange(x => { (x as InsuranceEvent).type = v; (x as InsuranceEvent).payout = v === "term" ? 3000 : 15; })} options={[{ value: "incomeProtection", label: "収入保障（月額）" }, { value: "term", label: "定期・終身（一時金）" }]} /></div>
          </Row>
          <Row>
            <NumField label="保険料" value={e.premiumMonthly} unit="万円/月" step={0.1} min={0} onChange={v => onChange(x => { (x as InsuranceEvent).premiumMonthly = v; })} help="生命保険料控除の対象。区分は下で選択。" />
            <NumField label="開始" value={e.startAge} unit="歳" min={a0} max={aEnd} onChange={v => onChange(x => { (x as InsuranceEvent).startAge = v; })} help="保険料の支払いが始まる本人の年齢。" />
            <NumField label="保険期間の終了" value={e.endAge} unit="歳" min={e.startAge} max={aEnd} onChange={v => onChange(x => { (x as InsuranceEvent).endAge = v; })} help="本人の年齢基準。" />
          </Row>
          <div><span className="label block mb-1">生命保険料控除の区分</span><Segmented size="sm" wrap value={e.deductionType ?? "general"} onChange={v => onChange(x => { (x as InsuranceEvent).deductionType = v; })} options={[{ value: "general", label: "一般生命保険料", title: "死亡保険・収入保障・養老など" }, { value: "medical", label: "介護医療保険料", title: "医療・がん・介護保険" }, { value: "pension", label: "個人年金保険料", title: "税制適格の個人年金" }]} /><p className="hint mt-1">区分ごとに所得税 4 万・住民税 2.8 万が上限（3 区分合計 12 万・7 万）。</p></div>
          <Row>
            {e.type === "term"
              ? <NumField label="死亡保険金" value={e.payout} unit="万円" step={100} min={0} onChange={v => onChange(x => { (x as InsuranceEvent).payout = v; })} help="被保険者が亡くなった年に一括で受け取る額。万一セクションで死亡シナリオを設定すると収支に反映されます。" />
              : <><NumField label="年金月額" value={e.payout} unit="万円/月" step={1} min={0} onChange={v => onChange(x => { (x as InsuranceEvent).payout = v; })} help="被保険者が亡くなったあと、下の年齢まで毎月受け取る額。" /><NumField label="何歳まで" value={e.payoutUntilAge} unit="歳" min={e.startAge} max={aEnd} onChange={v => onChange(x => { (x as InsuranceEvent).payoutUntilAge = v; })} help="収入保障を受け取り続ける本人の年齢。末子が独立するころまでが目安です。" /></>}
          </Row>
          <p className="hint">保険料は生命保険料控除（最大 4 万円）に自動反映。給付は「万一」セクションの死亡シナリオと必要保障額の分析で使われます。</p>
        </>
      )}
      <div className="flex gap-1.5"><Pill>{describe(e)}</Pill></div>
    </div>
  );
}

function EventPreview({ e, plan }: { e: LifeEvent; plan: Plan }) {
  const pts = useMemo(() => previewEventAmounts(e, plan), [e, plan]);
  const first = pts.findIndex(p => p.amount !== 0), last = pts.length - 1 - [...pts].reverse().findIndex(p => p.amount !== 0);
  const ages = pts.map(p => p.age);
  const total = pts.reduce((a, p) => a + p.amount, 0);
  const isIncome = e.kind === "income";
  return (
    <div className="space-y-3 lg:sticky lg:top-0 self-start">
      <div className="text-xs font-semibold ink-2 uppercase tracking-wider">プレビュー</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg surface-2 px-2.5 py-2"><div className="ink-3">期間</div><div className="font-semibold text-sm ink">{first < 0 ? "—" : `${ages[first]}〜${ages[last]}歳`}</div></div>
        <div className="rounded-lg surface-2 px-2.5 py-2"><div className="ink-3">{isIncome ? "収入の合計" : e.kind === "insurance" ? "保険料の合計" : "支出の合計"}（名目）</div><div className="font-semibold text-sm tabular ink">{fmtMan(Math.abs(total))}</div></div>
      </div>
      <div className="card p-3">
        <div className="text-xs font-medium ink mb-1">年ごとの金額</div>
        <div><MiniStackedBars ages={ages} series={[{ label: isIncome ? "収入" : e.kind === "insurance" ? "保険料" : "支出", color: isIncome ? "var(--s-in)" : e.kind === "car" ? "#4a3aa7" : e.kind === "insurance" ? "#9085e9" : "var(--s-out)", values: pts.map(p => Math.abs(p.amount)) }]} height={180} /></div>
      </div>
      {e.kind === "insurance" && <p className="hint">給付（死亡保険金・収入保障）は「万一」セクションで死亡シナリオを設定すると収支に反映されます。</p>}
    </div>
  );
}
