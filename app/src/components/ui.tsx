import React from "react";
import { fmt } from "../lib/format";

export function Slider({ label, value, onChange, min, max, step, unit, help }: any) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between gap-2 text-xs">
        <span className="font-semibold">{label}{help && <span className="ml-1 cursor-help text-gray-400" title={help}>ⓘ</span>}</span>
        <span className="font-mono">{typeof value === "number" ? value.toLocaleString() : value}{unit || ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full accent-blue-600" />
    </div>
  );
}

export function NumIn({ label, value, onChange, step, min, max, unit, help, small }: any) {
  return (
    <div>
      <label className="mb-0.5 block text-xs font-semibold">{label}{help && <span className="ml-1 cursor-help text-gray-400" title={help}>ⓘ</span>}</label>
      <div className="flex items-center gap-1">
        <input type="number" step={step || 1} min={min ?? 0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`rounded border px-2 py-1 text-sm ${small ? "w-20" : "w-32"}`} />
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
    </div>
  );
}

export function Tog({ label, checked, onChange }: any) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-blue-600" />
      <span>{label}</span>
    </label>
  );
}

export function Row({ l, vs, neg, bold, bg, sub, help, formula }: any) {
  return (
    <tr className={`${bold ? "font-bold " : ""}${bg || ""}`}>
      <td className={`break-words border border-gray-300 px-1.5 py-1 align-top text-[11px] leading-tight xl:text-xs ${sub ? "pl-3 text-gray-500" : ""}`}>
        {l}{help && <span className="ml-1 cursor-help text-gray-400" title={help}>ⓘ</span>}
        {formula && <div className="mt-0.5 text-[10px] font-normal leading-tight text-gray-400 xl:text-[11px]">{formula}</div>}
      </td>
      {vs.map((v: any, i: number) => (
        <td key={i} className={`border border-gray-300 px-1.5 py-1 text-right align-top text-[11px] leading-tight tabular-nums xl:text-xs ${neg && typeof v === "number" && v > 0 ? "text-red-600" : ""}`}>
          {typeof v === "string" ? v : `¥${fmt(v)}`}
        </td>
      ))}
    </tr>
  );
}

export function Modal({ isOpen, onClose, title, btnClass, onSave, saveLabel, wide, children }: {
  isOpen: boolean; onClose: () => void; title: string; btnClass?: string;
  onSave: () => void; saveLabel?: string; wide?: boolean; children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div className={`w-full rounded-lg bg-white shadow-xl ${wide ? "max-w-4xl" : "max-w-lg"}`} onClick={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3"><p className="text-sm font-bold">{title}</p></div>
        <div className="max-h-[75vh] overflow-y-auto p-4 space-y-4 text-xs">{children}</div>
        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={onSave} className={`rounded px-4 py-1.5 text-xs text-white font-bold ${btnClass || "bg-blue-600 hover:bg-blue-700"}`}>{saveLabel || "追加"}</button>
        </div>
      </div>
    </div>
  );
}

/** Bar chart wrapper with Y-axis labels (max / mid) */
export function BarChart({ height, maxValue, unit, children }: {
  height: number; maxValue: number; unit?: string; children: React.ReactNode;
}) {
  const fmt = (v: number) => {
    if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}万`;
    if (v >= 1000) return `${Math.round(v / 1000).toLocaleString()}千`;
    return `${Math.round(v)}`;
  };
  const label = unit || "万";
  const maxLabel = maxValue >= 10000 ? `${(maxValue / 10000).toFixed(maxValue >= 100000 ? 0 : 1)}${label}` : `${Math.round(maxValue)}${label}`;
  const midLabel = maxValue >= 10000 ? `${(maxValue / 2 / 10000).toFixed(maxValue >= 100000 ? 0 : 1)}` : `${Math.round(maxValue / 2)}`;
  return (
    <div className="flex">
      <div className="flex flex-col justify-between text-[8px] text-gray-400 pr-1 shrink-0 w-8 text-right" style={{ height }}>
        <span className="leading-none">{maxLabel}</span>
        <span className="leading-none">{midLabel}</span>
        <span className="leading-none">0</span>
      </div>
      <div className="flex-1 flex items-end gap-px border-l border-gray-200" style={{ height }}>
        {children}
      </div>
    </div>
  );
}

export function Sec({ children, c, colSpan }: any) {
  return (
    <tr className={`${c || "bg-gray-100"} font-semibold`}>
      <td colSpan={colSpan} className="border border-gray-300 px-2 py-1 text-xs">{children}</td>
    </tr>
  );
}
