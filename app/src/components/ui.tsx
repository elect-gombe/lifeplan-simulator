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

export function Sec({ children, c, colSpan }: any) {
  return (
    <tr className={`${c || "bg-gray-100"} font-semibold`}>
      <td colSpan={colSpan} className="border border-gray-300 px-2 py-1 text-xs">{children}</td>
    </tr>
  );
}
