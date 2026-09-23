/**
 * 資産推移: 現金・特定口座・NISA・DC・住宅（時価）を積み上げ、ローンを負側に。純資産を線で重ねる。
 * ホバー/クリックで年を選択。イベントマーカーを上部に表示。
 */
import { memo, useMemo, useState } from "react";
import type { YearRow } from "@/engine/simulate";
import { fmtMan } from "@/lib/format";
import { useSize, linear, niceTicks, MARGIN, YAxis, XAxisAges, Tooltip, LegendItem, ChartEmpty, RectPath } from "./base";

const SERIES = [
  { key: "cash", label: "現金・預金", color: "var(--s-cash)" },
  { key: "taxable", label: "特定口座", color: "var(--s-taxable)" },
  { key: "nisa", label: "NISA", color: "var(--s-nisa)" },
  { key: "dc", label: "DC・iDeCo", color: "var(--s-dc)" },
  { key: "home", label: "住宅（時価）", color: "var(--s-home)" },
] as const;

export const WealthChart = memo(function WealthChart({ rows, selectedAge, onSelectAge, height = 300, retireAge, bands }: {
  rows: YearRow[]; selectedAge: number | null; onSelectAge: (a: number | null) => void; height?: number; retireAge?: number;
  bands?: { age: number; p10: number; p90: number; p25: number; p75: number }[];
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = size.width || 600;
  const m = { ...MARGIN, top: 26 };
  const innerW = width - m.left - m.right, innerH = height - m.top - m.bottom;

  const { x, y, ticks } = useMemo(() => {
    const ages = rows.map(r => r.age);
    const maxPos = Math.max(0, ...rows.map(r => r.balances.cash + Math.max(r.balances.taxable, 0) + r.balances.nisa + r.balances.dc + r.balances.home), ...(bands ?? []).map(b => b.p90));
    const minNeg = Math.min(0, ...rows.map(r => -r.balances.loan + Math.min(r.balances.cash, 0)), ...(bands ?? []).map(b => b.p10));
    const ticks = niceTicks(minNeg, maxPos, 5);
    const x = linear([ages[0], ages[ages.length - 1]], [m.left, m.left + innerW]);
    const y = linear([ticks[0], ticks[ticks.length - 1]], [m.top + innerH, m.top]);
    return { x, y, ticks };
  }, [rows, innerW, innerH, m.left, m.top, bands]);

  const bw = Math.max((innerW / Math.max(rows.length, 1)) - 1.5, 1);
  const gap = bw > 4 ? 1 : 0;
  /** 1 行分の積み上げセグメント（正側: 資産、負側: ローン・マイナス現金） */
  const segmentsOf = (r: YearRow): { v: number; color: string; y0: number; y1: number }[] => {
    const b = r.balances; let acc = 0;
    const out: { v: number; color: string; y0: number; y1: number }[] = [];
    for (const s of [{ v: Math.max(b.cash, 0), color: "var(--s-cash)" }, { v: Math.max(b.taxable, 0), color: "var(--s-taxable)" }, { v: b.nisa, color: "var(--s-nisa)" }, { v: b.dc, color: "var(--s-dc)" }, { v: b.home, color: "var(--s-home)" }]) {
      if (s.v > 0) { out.push({ ...s, y0: y(acc + s.v), y1: y(acc) }); acc += s.v; }
    }
    if (b.loan > 0) out.push({ v: b.loan, color: "var(--s-loan)", y0: y(0), y1: y(-b.loan) });
    if (b.cash < 0) out.push({ v: -b.cash, color: "var(--critical)", y0: y(0), y1: y(b.cash) });
    return out;
  };
  // 系列ごとに 1 パス（ホバーで変わらないので memo）
  const paths = useMemo(() => {
    const by = new Map<string, RectPath>();
    for (const r of rows) {
      const px = x(r.age) - bw / 2;
      for (const s of segmentsOf(r)) { let p = by.get(s.color); if (!p) { p = new RectPath(); by.set(s.color, p); } p.add(px, s.y0, s.y1, bw, gap); }
    }
    return [...by.entries()].map(([color, p]) => ({ color, d: p.d }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, x, y, bw, gap]);

  if (!rows.length) return <ChartEmpty height={height} />;

  const active = hover ?? selectedAge;
  const row = active != null ? rows.find(r => r.age === active) : null;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left + m.left;
    const idx = Math.round((px - m.left) / innerW * (rows.length - 1));
    const r = rows[Math.min(Math.max(idx, 0), rows.length - 1)];
    if (r) setHover(r.age);
  };

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={width} height={height} className="block max-w-full">
        <YAxis y={y} ticks={ticks} x0={m.left} x1={m.left + innerW} />
        {/* モンテカルロ帯 */}
        {bands && bands.length > 1 && (
          <>
            <path d={bandPath(bands, x, y, "p10", "p90")} fill="var(--s-cash)" opacity={0.10} />
            <path d={bandPath(bands, x, y, "p25", "p75")} fill="var(--s-cash)" opacity={0.16} />
          </>
        )}
        {/* 積み上げ棒: 系列ごとに 1 パス。選択中は全体を薄くし、選択列だけ上に濃く描く */}
        <g opacity={row ? 0.55 : 1}>
          {paths.map(p => <path key={p.color} d={p.d} fill={p.color} opacity={p.color === "var(--s-loan)" ? 0.75 : 1} />)}
        </g>
        {row && segmentsOf(row).map((s, i) => <rect key={i} x={x(row.age) - bw / 2} y={Math.min(s.y0, s.y1)} width={bw} height={Math.max(Math.abs(s.y1 - s.y0) - gap, 0.5)} fill={s.color} opacity={s.color === "var(--s-loan)" ? 0.75 : 1} />)}
        {/* 純資産ライン */}
        <path d={rows.map((r, i) => `${i === 0 ? "M" : "L"} ${x(r.age)} ${y(r.balances.netWorth)}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" opacity={0.85} />
        <line x1={m.left} x2={m.left + innerW} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
        {/* 退職ライン */}
        {retireAge != null && retireAge > rows[0].age && retireAge <= rows[rows.length - 1].age && (
          <g>
            <line x1={x(retireAge)} x2={x(retireAge)} y1={m.top - 4} y2={m.top + innerH} stroke="var(--ink-3)" strokeDasharray="3 3" />
            <text x={x(retireAge) + 4} y={m.top + 4} fontSize={10} fill="var(--ink-3)">退職 {retireAge}歳</text>
          </g>
        )}
        {/* マーカー */}
        {rows.filter(r => r.markers.length).map(r => (
          <g key={`mk${r.age}`}>
            <circle cx={x(r.age)} cy={m.top - 12} r={3.5} fill="var(--surface-1)" stroke="var(--ink-2)" strokeWidth={1.5} />
            <line x1={x(r.age)} x2={x(r.age)} y1={m.top - 8} y2={m.top + innerH} stroke="var(--ink-3)" strokeWidth={0.6} opacity={0.5} />
          </g>
        ))}
        <XAxisAges x={x} ages={rows.map(r => r.age)} y0={m.top + innerH} />
        {active != null && <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + innerH} stroke="var(--accent)" strokeWidth={1.5} />}
        <rect x={m.left} y={0} width={innerW} height={height} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)}
          onClick={() => onSelectAge(hover != null && hover === selectedAge ? null : hover)} style={{ cursor: "crosshair" }} />
      </svg>
      {row && (
        <Tooltip x={x(row.age)} y={20} width={width}>
          <div className="flex items-baseline justify-between gap-3 mb-1"><strong>{row.age}歳</strong><span className="ink-3">{row.year}年</span></div>
          <table className="w-full tabular"><tbody>
            {SERIES.map(s => { const v = row.balances[s.key]; return v ? <tr key={s.key}><td className="pr-2"><LegendItem color={s.color} label={s.label} /></td><td className="text-right">{fmtMan(v)}</td></tr> : null; })}
            {row.balances.loan > 0 && <tr><td className="pr-2"><LegendItem color="var(--s-loan)" label="住宅ローン" /></td><td className="text-right">−{fmtMan(row.balances.loan)}</td></tr>}
            <tr className="border-t line"><td className="pt-1 font-semibold">純資産</td><td className="pt-1 text-right font-semibold">{fmtMan(row.balances.netWorth)}</td></tr>
          </tbody></table>
          {row.markers.length > 0 && <div className="mt-1.5 ink-2">{row.markers.join("・")}</div>}
        </Tooltip>
      )}
      <div className="absolute left-12 right-2 -bottom-1 flex flex-wrap gap-x-3 gap-y-0.5 pointer-events-none translate-y-full">
        {SERIES.map(s => <LegendItem key={s.key} color={s.color} label={s.label} />)}
        <LegendItem color="var(--s-loan)" label="住宅ローン" />
        <LegendItem color="var(--ink)" label="純資産" />
        {bands && <LegendItem color="color-mix(in oklab, var(--s-cash) 30%, transparent)" label="純資産のぶれ幅 (10–90%)" />}
      </div>
    </div>
  );
});

function bandPath(bands: { age: number; [k: string]: number }[], x: (v: number) => number, y: (v: number) => number, lo: string, hi: string): string {
  let top = "", bottom = "";
  bands.forEach((b, i) => { top += `${i === 0 ? "M" : "L"} ${x(b.age)} ${y(b[hi])} `; bottom = `L ${x(b.age)} ${y(b[lo])} ` + bottom; });
  return `${top}${bottom} Z`;
}
