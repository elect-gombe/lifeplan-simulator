/** チャート共通: サイズ計測・スケール・軸・ツールチップ。 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { axisMan } from "@/lib/format";

export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export interface Scale { (v: number): number; domain: [number, number]; range: [number, number] }
export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain; const [r0, r1] = range;
  const f = ((v: number) => (d1 === d0 ? r0 : r0 + (v - d0) / (d1 - d0) * (r1 - r0))) as Scale;
  f.domain = domain; f.range = range;
  return f;
}

/** きれいな目盛り（0 を含む） */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const lo = Math.min(min, 0), hi = Math.max(max, 0);
  const span = hi - lo || 1;
  const rough = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const stepN = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = stepN * mag;
  const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export const MARGIN = { top: 12, right: 12, bottom: 24, left: 48 };

/**
 * 多数の棒を 1 つの <path> にまとめるためのビルダー。
 * 60 年 × 数系列の <rect> を個別に描くと DOM 要素が数百になり、更新ごとの React/レイアウトコストが支配的になる。
 * 系列ごとに 1 パスにすると要素数が 1/50 程度になる（見た目は同じ）。
 */
export class RectPath {
  private parts: string[] = [];
  add(x: number, y0: number, y1: number, w: number, gap = 0): void {
    const top = Math.min(y0, y1), h = Math.abs(y1 - y0) - gap;
    if (h <= 0) { this.parts.push(`M${x.toFixed(1)} ${top.toFixed(1)}h${w.toFixed(1)}v0.5h${(-w).toFixed(1)}Z`); return; }
    this.parts.push(`M${x.toFixed(1)} ${top.toFixed(1)}h${w.toFixed(1)}v${h.toFixed(1)}h${(-w).toFixed(1)}Z`);
  }
  get d(): string { return this.parts.join(""); }
  get empty(): boolean { return this.parts.length === 0; }
}

export function YAxis({ y, ticks, x0, x1, fmt = axisMan }: { y: Scale; ticks: number[]; x0: number; x1: number; fmt?: (v: number) => string }) {
  return (
    <g>
      {ticks.map(t => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={x0 - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--ink-3)" className="tabular">{fmt(t)}</text>
        </g>
      ))}
    </g>
  );
}

export function XAxisAges({ x, ages, y0, every }: { x: Scale; ages: number[]; y0: number; every?: number }) {
  const n = ages.length; const step = every ?? (n > 40 ? 10 : 5);
  return (
    <g>
      {ages.filter(a => a % step === 0).map(a => (
        <text key={a} x={x(a)} y={y0 + 14} textAnchor="middle" fontSize={10} fill="var(--ink-3)" className="tabular">{a}</text>
      ))}
    </g>
  );
}

export function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width * 0.6;
  return (
    <div className="pointer-events-none absolute z-20 rounded-lg px-3 py-2 text-xs shadow-xl fade-in min-w-[180px] max-w-[280px]"
      style={{ left: flip ? undefined : x + 14, right: flip ? width - x + 14 : undefined, top: Math.max(y - 10, 0), background: "var(--surface-1)", border: "1px solid var(--line-strong)", color: "var(--ink)" }}>
      {children}
    </div>
  );
}

export function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] ink-2">
      {dashed ? <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: color }} /> : <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
      {label}
    </span>
  );
}

export function ChartEmpty({ height = 260 }: { height?: number }) {
  return <div className="flex items-center justify-center hint" style={{ height }}>データがありません</div>;
}
