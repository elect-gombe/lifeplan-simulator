/** 横棒の内訳（1年の収入/支出の項目）。 */
import { memo } from "react";
import { fmtMan } from "@/lib/format";

export const HBars = memo(function HBars({ items, total, color, negative }: { items: { label: string; amount: number; note?: string }[]; total: number; color: string; negative?: boolean }) {
  const max = Math.max(total, ...items.map(i => Math.abs(i.amount)), 1);
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const w = Math.max(Math.abs(it.amount) / max * 100, 0.5);
        const isCredit = negative ? it.amount < 0 : it.amount < 0;
        return (
          <li key={i} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="ink truncate">{it.label}{it.note && <span className="ink-3 ml-1.5 text-[10px]">{it.note}</span>}</span>
              <span className={`tabular shrink-0 ${isCredit ? "text-[var(--good)]" : "ink"}`}>{isCredit ? "+" : ""}{fmtMan(Math.abs(it.amount))}</span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full surface-3 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${w}%`, background: isCredit ? "var(--good)" : color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
});

/** 小さな KPI 用スパークライン */
export function Sparkline({ values, color = "var(--accent)", width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const y = (v: number) => height - 2 - (height - 4) * ((v - min) / ((max - min) || 1));
  const x = (i: number) => 1 + (width - 2) * i / (values.length - 1);
  return (
    <svg width={width} height={height} className="block max-w-full" aria-hidden>
      <path d={values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ")} fill="none" stroke={color} strokeWidth={1.5} />
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--line)" />
    </svg>
  );
}
