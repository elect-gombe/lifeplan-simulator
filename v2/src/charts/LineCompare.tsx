/** 複数プランの系列を線で比較。 */
import { memo, useMemo, useState } from "react";
import { fmtMan } from "@/lib/format";
import { useSize, linear, niceTicks, MARGIN, YAxis, XAxisAges, Tooltip, LegendItem, ChartEmpty } from "./base";
import { axisMan } from "@/lib/format";

export interface LineSeries { id: string; label: string; color: string; points: { age: number; value: number }[] }

export type LineUnit = "yen" | "pct" | "months" | "count";
const FMT: Record<LineUnit, (v: number) => string> = { yen: fmtMan, pct: v => `${Math.round(v * 10) / 10}%`, months: v => `${Math.round(v * 10) / 10}ヶ月`, count: v => `${Math.round(v * 10) / 10}` };
export const LineCompare = memo(function LineCompare({ series, height = 280, unitLabel, onSelectAge, selectedAge, unit = "yen", showLegend }: { series: LineSeries[]; height?: number; unitLabel?: string; onSelectAge?: (a: number | null) => void; selectedAge?: number | null; unit?: LineUnit; showLegend?: boolean }) {
  const legend = showLegend ?? series.length > 1; // 1 系列ならタイトルが名前を兼ねるので凡例は不要
  const fmt = FMT[unit];
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = size.width || 600;
  const m = MARGIN; const innerW = width - m.left - m.right, innerH = height - m.top - m.bottom;
  const ages = useMemo(() => { const s = new Set<number>(); series.forEach(q => q.points.forEach(p => s.add(p.age))); return [...s].sort((a, b) => a - b); }, [series]);
  const { x, y, ticks } = useMemo(() => {
    const vals = series.flatMap(s => s.points.map(p => p.value));
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
    return { x: linear([ages[0] ?? 0, ages[ages.length - 1] ?? 1], [m.left, m.left + innerW]), y: linear([ticks[0], ticks[ticks.length - 1]], [m.top + innerH, m.top]), ticks };
  }, [series, ages, innerW, innerH, m.left, m.top]);
  if (!ages.length) return <ChartEmpty height={height} />;
  const active = hover ?? selectedAge ?? null;
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = Math.round((e.clientX - rect.left) / innerW * (ages.length - 1));
    setHover(ages[Math.min(Math.max(idx, 0), ages.length - 1)]);
  };
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={width} height={height} className="block max-w-full">
        <YAxis y={y} ticks={ticks} x0={m.left} x1={m.left + innerW} fmt={unit === "yen" ? axisMan : fmt} />
        <line x1={m.left} x2={m.left + innerW} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
        {series.map(s => (
          <g key={s.id}>
            <path d={s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.age)} ${y(p.value)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            {s.points.length > 0 && <circle cx={x(s.points[s.points.length - 1].age)} cy={y(s.points[s.points.length - 1].value)} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />}
          </g>
        ))}
        <XAxisAges x={x} ages={ages} y0={m.top + innerH} />
        {active != null && <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + innerH} stroke="var(--accent)" strokeWidth={1.5} />}
        <rect x={m.left} y={0} width={innerW} height={height} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={() => onSelectAge?.(hover)} style={{ cursor: onSelectAge ? "crosshair" : "default" }} />
      </svg>
      {active != null && (
        <Tooltip x={x(active)} y={10} width={width}>
          <div className="mb-1"><strong>{active}歳</strong>{unitLabel && <span className="ink-3 ml-2">{unitLabel}</span>}</div>
          <table className="w-full tabular"><tbody>
            {series.map(s => { const p = s.points.find(q => q.age === active); return <tr key={s.id}><td className="pr-3"><LegendItem color={s.color} label={s.label} /></td><td className="text-right">{p ? fmt(p.value) : "–"}</td></tr>; })}
          </tbody></table>
        </Tooltip>
      )}
      {legend && (
        <div className="absolute left-12 right-2 -bottom-1 flex flex-wrap gap-x-3 gap-y-0.5 pointer-events-none translate-y-full">
          {series.map(s => <LegendItem key={s.id} color={s.color} label={s.label} />)}
        </div>
      )}
    </div>
  );
});
