/**
 * ピン留めグラフ: 指標カタログから選んだ指標を、比較中の全プランで重ねて小さな折れ線で並べる（旧版の機能を継承）。
 * ピンは localStorage に保存。年の選択（クリック）はダッシュボードと連動。
 */
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Pin, Plus, X, Search } from "lucide-react";
import type { YearRow } from "@/engine/simulate";
import { useStore, useResolvedPlans } from "@/state/store";
import { runSim } from "@/state/useSim";
import { LineCompare, type LineUnit } from "@/charts/LineCompare";
import { Card, Modal, cx } from "@/ui/primitives";

interface Metric { key: string; group: string; label: string; unit: LineUnit; get: (r: YearRow, prev: YearRow | undefined) => number }
const taxOf = (m: YearRow["self"] | null) => (m?.tax ? m.tax.incomeTax + m.tax.residentTax + m.tax.socialInsurance.total : 0);
const grossOf = (m: YearRow["self"] | null) => (m ? m.salary + m.publicPension + m.dcAnnuity + m.otherTaxable : 0);
const sumIn = (r: YearRow, cat: string) => r.inflows.filter(f => f.category === cat).reduce((a, f) => a + f.amount, 0);

export const METRICS: Metric[] = [
  { key: "self.salary", group: "収入", label: "本人 額面給与", unit: "yen", get: r => r.self.salary },
  { key: "spouse.salary", group: "収入", label: "配偶者 額面給与", unit: "yen", get: r => r.spouse?.salary ?? 0 },
  { key: "self.takeHome", group: "収入", label: "本人 手取り", unit: "yen", get: r => r.self.tax?.takeHome ?? 0 },
  { key: "spouse.takeHome", group: "収入", label: "配偶者 手取り", unit: "yen", get: r => r.spouse?.tax?.takeHome ?? 0 },
  { key: "totalIn", group: "収入", label: "世帯 収入合計（手取り）", unit: "yen", get: r => r.totalIn },
  { key: "self.pension", group: "収入", label: "本人 公的年金", unit: "yen", get: r => r.self.publicPension },
  { key: "spouse.pension", group: "収入", label: "配偶者 公的年金", unit: "yen", get: r => r.spouse?.publicPension ?? 0 },
  { key: "pensionTotal", group: "収入", label: "世帯 年金（手取り）", unit: "yen", get: r => sumIn(r, "pension") },
  { key: "childAllowance", group: "収入", label: "児童手当・育休給付", unit: "yen", get: r => sumIn(r, "public") },
  { key: "survivor", group: "収入", label: "遺族年金", unit: "yen", get: r => r.self.survivorPension + (r.spouse?.survivorPension ?? 0) },
  { key: "insurancePayout", group: "収入", label: "保険金", unit: "yen", get: r => sumIn(r, "insurance") },
  { key: "self.incomeTax", group: "税・社会保険", label: "本人 所得税", unit: "yen", get: r => r.self.tax?.incomeTax ?? 0 },
  { key: "self.residentTax", group: "税・社会保険", label: "本人 住民税", unit: "yen", get: r => r.self.tax?.residentTax ?? 0 },
  { key: "self.si", group: "税・社会保険", label: "本人 社会保険料", unit: "yen", get: r => r.self.tax?.socialInsurance.total ?? 0 },
  { key: "self.taxable", group: "税・社会保険", label: "本人 課税所得", unit: "yen", get: r => r.self.tax?.taxableIt ?? 0 },
  { key: "self.marginal", group: "税・社会保険", label: "本人 限界税率", unit: "pct", get: r => (r.self.tax && r.self.tax.gross > 0 ? r.self.tax.marginalRate * 100 : 0) },
  { key: "self.burden", group: "税・社会保険", label: "本人 税・社保の負担率", unit: "pct", get: r => (grossOf(r.self) > 0 ? taxOf(r.self) / grossOf(r.self) * 100 : 0) },
  { key: "spouse.tax", group: "税・社会保険", label: "配偶者 税・社保", unit: "yen", get: r => taxOf(r.spouse) },
  { key: "spouse.burden", group: "税・社会保険", label: "配偶者 税・社保の負担率", unit: "pct", get: r => (grossOf(r.spouse) > 0 ? taxOf(r.spouse) / grossOf(r.spouse) * 100 : 0) },
  { key: "taxTotal", group: "税・社会保険", label: "世帯 税・社保合計", unit: "yen", get: r => taxOf(r.self) + taxOf(r.spouse) },
  { key: "furusato", group: "税・社会保険", label: "ふるさと納税 寄附額", unit: "yen", get: r => (r.self.tax?.furusatoDonation ?? 0) + (r.spouse?.tax?.furusatoDonation ?? 0) },
  { key: "hlCredit", group: "税・社会保険", label: "住宅ローン控除（適用額）", unit: "yen", get: r => (r.self.tax?.housingLoanCreditUsed ?? 0) + (r.spouse?.tax?.housingLoanCreditUsed ?? 0) },
  { key: "living", group: "支出", label: "基本生活費", unit: "yen", get: r => r.byCategory.living },
  { key: "housing", group: "支出", label: "住居費", unit: "yen", get: r => r.byCategory.housing },
  { key: "education", group: "支出", label: "教育費", unit: "yen", get: r => r.byCategory.education },
  { key: "childcare", group: "支出", label: "養育・出産費", unit: "yen", get: r => r.byCategory.childcare },
  { key: "insurance", group: "支出", label: "保険料", unit: "yen", get: r => r.byCategory.insurance },
  { key: "car", group: "支出", label: "車", unit: "yen", get: r => r.byCategory.car },
  { key: "totalOut", group: "支出", label: "支出合計", unit: "yen", get: r => r.totalOut },
  { key: "net", group: "支出", label: "年間収支", unit: "yen", get: r => r.net },
  { key: "savingsRate", group: "支出", label: "貯蓄率（収支 ÷ 収入）", unit: "pct", get: r => (r.totalIn > 0 ? r.net / r.totalIn * 100 : 0) },
  { key: "cash", group: "残高", label: "現金・預金", unit: "yen", get: r => r.balances.cash },
  { key: "nisa", group: "残高", label: "NISA", unit: "yen", get: r => r.balances.nisa },
  { key: "nisaGain", group: "残高", label: "NISA 含み益", unit: "yen", get: r => r.balances.nisa - r.balances.nisaCost },
  { key: "taxable", group: "残高", label: "特定口座", unit: "yen", get: r => r.balances.taxable },
  { key: "dc", group: "残高", label: "DC・iDeCo", unit: "yen", get: r => r.balances.dc },
  { key: "home", group: "残高", label: "住宅（時価）", unit: "yen", get: r => r.balances.home },
  { key: "loan", group: "残高", label: "住宅ローン残高", unit: "yen", get: r => r.balances.loan },
  { key: "liquid", group: "残高", label: "流動資産", unit: "yen", get: r => r.balances.liquid },
  { key: "netWorth", group: "残高", label: "純資産", unit: "yen", get: r => r.balances.netWorth },
  { key: "reserveMonths", group: "残高", label: "生活防衛資金（現金 ÷ 月間支出）", unit: "months", get: r => (r.totalOut > 0 ? r.balances.cash / (r.totalOut / 12) : 0) },
  { key: "nisaIn", group: "運用", label: "NISA 積立", unit: "yen", get: r => r.flows.nisaIn },
  { key: "nisaOut", group: "運用", label: "NISA 取り崩し", unit: "yen", get: r => r.flows.nisaOut },
  { key: "withdrawal", group: "運用", label: "取り崩し合計（NISA＋特定・税引前）", unit: "yen", get: r => r.flows.nisaOut + r.flows.taxableOut },
  { key: "planned", group: "運用", label: "計画的な取り崩し（税引後）", unit: "yen", get: r => r.flows.planned },
  { key: "drawRate", group: "運用", label: "取り崩し率（÷ 運用残高）", unit: "pct", get: (r, prev) => { const bal = prev ? prev.balances.nisa + prev.balances.taxable : 0; return bal > 0 ? (r.flows.nisaOut + r.flows.taxableOut) / bal * 100 : 0; } },
  { key: "taxableFlow", group: "運用", label: "特定口座 積立（−取崩）", unit: "yen", get: r => r.flows.taxableIn - r.flows.taxableOut },
  { key: "dcIn", group: "運用", label: "DC 拠出", unit: "yen", get: r => r.flows.dcIn },
  { key: "children", group: "家族", label: "扶養中の子の人数", unit: "count", get: r => r.childAges.filter(a => a >= 0 && a < 22).length },
];

const KEY = "lifeplan-pins";
function loadPins(): string[] { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter(k => METRICS.some(m => m.key === k)) : []; } catch { return []; } }

export function PinnedMetrics() {
  const { state, dispatch } = useStore();
  const resolved = useDeferredValue(useResolvedPlans());
  const [pins, setPins] = useState<string[]>(loadPins);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");
  const [overlay, setOverlay] = useState(true);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(pins)); }, [pins]);
  const plans = useMemo(() => (overlay ? resolved.filter(p => state.compareIds.includes(p.id) || p.id === state.activeId) : resolved.filter(p => p.id === state.activeId)), [resolved, state.compareIds, state.activeId, overlay]);
  const sims = useMemo(() => plans.map(p => ({ plan: p, rows: runSim(p).res.rows })), [plans]);
  const toggle = (k: string) => setPins(p => (p.includes(k) ? p.filter(x => x !== k) : [...p, k]));
  const selectAge = useCallback((a: number | null) => dispatch({ type: "ui/selectAge", age: a }), [dispatch]);
  const groups = [...new Set(METRICS.map(m => m.group))];
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Pin size={15} />ピン留めグラフ</span>} subtitle="気になる指標を選んで並べます。年をクリックすると内訳と連動。" className="no-print"
      right={<div className="flex items-center gap-2">
        {sims.length > 1 || state.plans.length > 1 ? <button onClick={() => setOverlay(o => !o)} className={cx("btn text-xs px-2 py-1", overlay ? "surface-3 ink" : "btn-ghost")}>{overlay ? "比較プランを重ねる: ON" : "比較プランを重ねる: OFF"}</button> : null}
        <button onClick={() => setPicker(true)} className="btn btn-outline text-xs"><Plus size={14} />指標を追加</button>
        {pins.length > 0 && <button onClick={() => setPins([])} className="btn btn-ghost text-xs">全部外す</button>}
      </div>}>
      {pins.length === 0 ? (
        <p className="hint py-4 text-center">「指標を追加」から、限界税率・防衛月数・NISA 含み益など {METRICS.length} 種類の指標を選べます。</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {pins.map(k => {
            const m = METRICS.find(x => x.key === k)!;
            return (
              <div key={k} className="rounded-xl border line p-2 relative">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-xs font-medium ink">{m.label}<span className="hint ml-1.5">{m.group}</span></span>
                  <button onClick={() => toggle(k)} className="tap btn btn-ghost px-1 py-0.5" aria-label={`${m.label} を外す`}><X size={13} /></button>
                </div>
                <div className={sims.length > 1 ? "pb-6" : "pb-1"}>
                  <PinnedChart metric={m} sims={sims} selectedAge={state.selectedAge} onSelectAge={selectAge} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {picker && <Modal open={picker} onClose={() => setPicker(false)} title="指標を選ぶ" width="max-w-3xl" footer={<button className="btn btn-primary" onClick={() => setPicker(false)}>完了</button>}>
        <div className="flex items-center gap-2 mb-3"><Search size={15} className="ink-3" /><input className="field" placeholder="検索（例: 税率、NISA、防衛）" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="space-y-4">
          {groups.map(g => {
            const items = METRICS.filter(m => m.group === g && (!q || m.label.includes(q)));
            if (!items.length) return null;
            return (
              <div key={g}>
                <div className="label mb-1.5">{g}</div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(m => <button key={m.key} onClick={() => toggle(m.key)} aria-pressed={pins.includes(m.key)} className={cx("btn text-xs px-2.5 py-1", pins.includes(m.key) ? "btn-primary" : "btn-outline")}>{pins.includes(m.key) && <Pin size={11} />}{m.label}</button>)}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>}
    </Card>
  );
}

/** 1 指標分のグラフ。系列の組み立てを memo し、他のピンやホバーの再レンダーに巻き込まれないようにする。 */
const PinnedChart = memo(function PinnedChart({ metric, sims, selectedAge, onSelectAge }: { metric: Metric; sims: { plan: { id: string; name: string; color: string }; rows: YearRow[] }[]; selectedAge: number | null; onSelectAge: (a: number | null) => void }) {
  const series = useMemo(() => sims.map(s => ({ id: s.plan.id, label: s.plan.name, color: s.plan.color, points: s.rows.map((r, i) => ({ age: r.age, value: metric.get(r, s.rows[i - 1]) })) })), [sims, metric]);
  return <LineCompare height={170} unit={metric.unit} selectedAge={selectedAge} onSelectAge={onSelectAge} series={series} />;
});
