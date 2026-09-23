/** モーダル内プレビュー用の小さなチャート（積み上げ棒・折れ線）。ホバーで値を表示。 */
import { memo, useState } from "react";
import { fmtMan } from "@/lib/format";
import { useSize, linear, niceTicks, LegendItem, RectPath } from "./base";

export interface MiniSeries { label: string; color: string; values: number[] }

export const MiniStackedBars = memo(function MiniStackedBars({ ages, series, height = 180, unit = "円/年", highlightAge, onHover }: { ages: number[]; series: MiniSeries[]; height?: number; unit?: string; highlightAge?: number | null; onHover?: (age: number | null) => void }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = size.width || 400;
  const m = { top: 8, right: 8, bottom: 20, left: 44 };
  const iw = width - m.left - m.right, ih = height - m.top - m.bottom;
  const totals = ages.map((_, i) => series.reduce((a, s) => a + Math.max(s.values[i] ?? 0, 0), 0));
  const negs = ages.map((_, i) => series.reduce((a, s) => a + Math.min(s.values[i] ?? 0, 0), 0));
  const ticks = niceTicks(Math.min(0, ...negs), Math.max(0, ...totals), 4);
  const x = linear([0, Math.max(ages.length - 1, 1)], [m.left, m.left + iw]);
  const y = linear([ticks[0], ticks[ticks.length - 1]], [m.top + ih, m.top]);
  const bw = Math.max(iw / Math.max(ages.length, 1) - 1.5, 1);
  const hi = hover ?? (highlightAge != null ? ages.indexOf(highlightAge) : -1);
  const gap = bw > 3 ? 1 : 0;
  const segmentsAt = (i: number): { color: string; y0: number; y1: number }[] => {
    let acc = 0, accN = 0; const out: { color: string; y0: number; y1: number }[] = [];
    for (const s of series) {
      const v = s.values[i] ?? 0; if (!v) continue;
      if (v > 0) { out.push({ color: s.color, y0: y(acc + v), y1: y(acc) }); acc += v; }
      else { out.push({ color: s.color, y0: y(accN), y1: y(accN + v) }); accN += v; }
    }
    return out;
  };
  const paths = (() => {
    const by = new Map<string, RectPath>();
    ages.forEach((_, i) => { const px = x(i) - bw / 2; for (const s of segmentsAt(i)) { let p = by.get(s.color); if (!p) { p = new RectPath(); by.set(s.color, p); } p.add(px, s.y0, s.y1, bw, gap); } });
    return [...by.entries()].map(([color, p]) => ({ color, d: p.d }));
  })();
  if (!ages.length) return <div className="hint" style={{ height }}>データなし</div>;
  return (
    <div className="w-full">
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={width} height={height} className="block max-w-full">
        {ticks.map(t => <g key={t}><line x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={m.left - 4} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--ink-3)">{fmtMan(t)}</text></g>)}
        <g opacity={hi >= 0 ? 0.6 : 1}>{paths.map(p => <path key={p.color} d={p.d} fill={p.color} />)}</g>
        {hi >= 0 && segmentsAt(hi).map((s, i) => <rect key={i} x={x(hi) - bw / 2} y={Math.min(s.y0, s.y1)} width={bw} height={Math.max(Math.abs(s.y1 - s.y0) - gap, 0.5)} fill={s.color} />)}
        {ages.filter((a, i) => i === 0 || a % 5 === 0).map(a => <text key={a} x={x(ages.indexOf(a))} y={height - 6} textAnchor="middle" fontSize={9} fill="var(--ink-3)">{a}</text>)}
        <rect x={m.left} y={0} width={iw} height={height} fill="transparent"
          onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round((e.clientX - r.left) / iw * (ages.length - 1)); const c = Math.min(Math.max(i, 0), ages.length - 1); setHover(c); onHover?.(ages[c]); }}
          onMouseLeave={() => { setHover(null); onHover?.(null); }} />
      </svg>
      {hi >= 0 && (
        <div className="pointer-events-none absolute top-1 rounded-md px-2 py-1 text-[11px] shadow-lg" style={{ left: Math.min(x(hi) + 8, width - 170), background: "var(--surface-1)", border: "1px solid var(--line-strong)" }}>
          <div className="font-semibold">{ages[hi]}歳</div>
          {series.filter(s => s.values[hi]).map(s => <div key={s.label} className="flex justify-between gap-3"><LegendItem color={s.color} label={s.label} /><span className="tabular">{fmtMan(s.values[hi])}</span></div>)}
          <div className="flex justify-between gap-3 border-t line mt-0.5 pt-0.5"><span>合計</span><span className="tabular">{fmtMan(totals[hi] + negs[hi])}{unit === "円/年" ? "" : ""}</span></div>
        </div>
      )}
    </div>
    <div className="mt-1 pl-11 flex flex-wrap gap-x-3 gap-y-0.5">{series.filter(s => s.values.some(v => v)).map(s => <LegendItem key={s.label} color={s.color} label={s.label} />)}</div>
    </div>
  );
});

export function MiniLine({ ages, values, color = "var(--accent)", height = 120, label }: { ages: number[]; values: number[]; color?: string; height?: number; label?: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = size.width || 400;
  const m = { top: 8, right: 8, bottom: 18, left: 44 };
  const iw = width - m.left - m.right, ih = height - m.top - m.bottom;
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 3);
  const x = linear([0, Math.max(ages.length - 1, 1)], [m.left, m.left + iw]);
  const y = linear([ticks[0], ticks[ticks.length - 1]], [m.top + ih, m.top]);
  if (!ages.length) return null;
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={width} height={height} className="block max-w-full">
        {ticks.map(t => <g key={t}><line x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={m.left - 4} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--ink-3)">{fmtMan(t)}</text></g>)}
        <path d={values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ") + ` L ${x(values.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={color} opacity={0.12} />
        <path d={values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ")} fill="none" stroke={color} strokeWidth={2} />
        {ages.filter((a, i) => i === 0 || a % 5 === 0).map(a => <text key={a} x={x(ages.indexOf(a))} y={height - 4} textAnchor="middle" fontSize={9} fill="var(--ink-3)">{a}</text>)}
        {hover != null && <><line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} stroke="var(--accent)" /><circle cx={x(hover)} cy={y(values[hover])} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} /></>}
        <rect x={m.left} y={0} width={iw} height={height} fill="transparent" onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.min(Math.max(Math.round((e.clientX - r.left) / iw * (ages.length - 1)), 0), ages.length - 1)); }} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover != null && <div className="pointer-events-none absolute top-1 rounded-md px-2 py-1 text-[11px] shadow-lg" style={{ left: Math.min(x(hover) + 8, width - 140), background: "var(--surface-1)", border: "1px solid var(--line-strong)" }}><b>{ages[hover]}歳</b> {label ?? ""} {fmtMan(values[hover])}</div>}
    </div>
  );
}
