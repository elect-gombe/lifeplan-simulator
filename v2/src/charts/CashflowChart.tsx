/** 年間の収入（上）・支出（下）を棒で、収支を線で。 */
import { memo, useMemo, useState } from "react";
import type { YearRow } from "@/engine/simulate";
import { fmtMan } from "@/lib/format";
import { useSize, linear, niceTicks, MARGIN, YAxis, XAxisAges, Tooltip, LegendItem, ChartEmpty, RectPath } from "./base";

const OUT_CATS = [
  { key: "living", label: "生活費", color: "var(--s-taxable)" },
  { key: "housing", label: "住居", color: "var(--s-home)" },
  { key: "education", label: "教育", color: "var(--s-dc)" },
  { key: "childcare", label: "養育", color: "#c98500" },
  { key: "insurance", label: "保険", color: "#9085e9" },
  { key: "car", label: "車", color: "#4a3aa7" },
  { key: "other", label: "その他", color: "var(--ink-3)" },
  { key: "tax", label: "税（一時）", color: "var(--s-loan)" },
] as const;

export const CashflowChart = memo(function CashflowChart({ rows, selectedAge, onSelectAge, height = 260 }: { rows: YearRow[]; selectedAge: number | null; onSelectAge: (a: number | null) => void; height?: number }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = size.width || 600;
  const m = MARGIN; const innerW = width - m.left - m.right, innerH = height - m.top - m.bottom;
  const { x, y, ticks } = useMemo(() => {
    const maxIn = Math.max(0, ...rows.map(r => r.totalIn));
    const maxOut = Math.max(0, ...rows.map(r => r.totalOut));
    const ticks = niceTicks(-maxOut, maxIn, 5);
    return { x: linear([rows[0]?.age ?? 0, rows[rows.length - 1]?.age ?? 1], [m.left, m.left + innerW]), y: linear([ticks[0], ticks[ticks.length - 1]], [m.top + innerH, m.top]), ticks };
  }, [rows, innerW, innerH, m.left, m.top]);
  const bw = Math.max(innerW / Math.max(rows.length, 1) - 1.5, 1);
  const gap = bw > 4 ? 1 : 0;
  const segmentsOf = (r: YearRow): { color: string; y0: number; y1: number }[] => {
    const out = [{ color: "var(--s-in)", y0: y(r.totalIn), y1: y(0) }];
    let acc = 0;
    for (const c of OUT_CATS) { const v = Math.max(r.byCategory[c.key], 0); if (v <= 0) continue; out.push({ color: c.color, y0: y(-acc), y1: y(-(acc + v)) }); acc += v; }
    return out;
  };
  const paths = useMemo(() => {
    const by = new Map<string, RectPath>();
    for (const r of rows) {
      const px = x(r.age) - bw / 2;
      for (const s of segmentsOf(r)) { let p = by.get(s.color); if (!p) { p = new RectPath(); by.set(s.color, p); } p.add(px, s.y0, s.y1, bw, s.color === "var(--s-in)" ? 0 : gap); }
    }
    return [...by.entries()].map(([color, p]) => ({ color, d: p.d }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, x, y, bw, gap]);
  if (!rows.length) return <ChartEmpty height={height} />;
  const active = hover ?? selectedAge;
  const row = active != null ? rows.find(r => r.age === active) : null;
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = Math.round((e.clientX - rect.left) / innerW * (rows.length - 1));
    const r = rows[Math.min(Math.max(idx, 0), rows.length - 1)]; if (r) setHover(r.age);
  };
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={width} height={height} className="block max-w-full">
        <YAxis y={y} ticks={ticks} x0={m.left} x1={m.left + innerW} />
        <g opacity={row ? 0.55 : 1}>{paths.map(p => <path key={p.color} d={p.d} fill={p.color} />)}</g>
        {row && segmentsOf(row).map((s, i) => <rect key={i} x={x(row.age) - bw / 2} y={Math.min(s.y0, s.y1)} width={bw} height={Math.max(Math.abs(s.y1 - s.y0) - (i === 0 ? 0 : gap), 0.5)} fill={s.color} />)}
        <path d={rows.map((r, i) => `${i === 0 ? "M" : "L"} ${x(r.age)} ${y(r.net)}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth={2} opacity={0.85} />
        <line x1={m.left} x2={m.left + innerW} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
        <XAxisAges x={x} ages={rows.map(r => r.age)} y0={m.top + innerH} />
        {active != null && <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + innerH} stroke="var(--accent)" strokeWidth={1.5} />}
        <rect x={m.left} y={0} width={innerW} height={height} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={() => onSelectAge(hover != null && hover === selectedAge ? null : hover)} style={{ cursor: "crosshair" }} />
      </svg>
      {row && (
        <Tooltip x={x(row.age)} y={10} width={width}>
          <div className="flex items-baseline justify-between gap-3 mb-1"><strong>{row.age}歳</strong><span className="ink-3">{row.year}年</span></div>
          <table className="w-full tabular"><tbody>
            <tr><td><LegendItem color="var(--s-in)" label="収入（手取り）" /></td><td className="text-right">{fmtMan(row.totalIn)}</td></tr>
            {OUT_CATS.map(c => row.byCategory[c.key] ? <tr key={c.key}><td><LegendItem color={c.color} label={c.label} /></td><td className="text-right">−{fmtMan(row.byCategory[c.key])}</td></tr> : null)}
            <tr className="border-t line"><td className="pt-1 font-semibold">収支</td><td className={`pt-1 text-right font-semibold ${row.net < 0 ? "text-[var(--critical)]" : ""}`}>{fmtMan(row.net, { sign: true })}</td></tr>
          </tbody></table>
        </Tooltip>
      )}
      <div className="absolute left-12 right-2 -bottom-1 flex flex-wrap gap-x-3 gap-y-0.5 pointer-events-none translate-y-full">
        <LegendItem color="var(--s-in)" label="収入" />
        {OUT_CATS.map(c => <LegendItem key={c.key} color={c.color} label={c.label} />)}
        <LegendItem color="var(--ink)" label="収支" />
      </div>
    </div>
  );
});
