import React from "react";
import type { Scenario } from "../lib/types";
import { rDed } from "../lib/tax";
import { fmt } from "../lib/format";
import { NumIn, Tog, Slider } from "./ui";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

export function ScenarioCard({ s, onChange, onRemove, onDuplicate, idx, canRemove, canDuplicate, currentAge, retirementAge }: {
  s: Scenario; onChange: (s: Scenario) => void; onRemove: () => void; onDuplicate: () => void;
  idx: number; canRemove: boolean; canDuplicate: boolean;
  currentAge: number; retirementAge: number;
}) {
  const u = (k: string, v: any) => onChange({ ...s, [k]: v });

  return (
    <div className="min-w-0 space-y-2 rounded-lg border-2 p-3" style={{ borderColor: COLORS[idx] }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <input value={s.name} onChange={(e) => u("name", e.target.value)}
          className="min-w-0 flex-1 border-b border-transparent bg-transparent pr-2 text-sm font-bold outline-none hover:border-gray-300 focus:border-blue-500"
          style={{ color: COLORS[idx] }} />
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 self-end sm:self-auto">
          {canDuplicate && <button onClick={onDuplicate} className="rounded border px-2 py-1 text-[11px] leading-none text-gray-500 hover:border-blue-300 hover:text-blue-600">複製</button>}
          {canRemove && <button onClick={onRemove} className="rounded border px-2 py-1 text-[11px] leading-none text-gray-400 hover:border-red-300 hover:text-red-500">削除</button>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumIn label="現在の資産" value={s.currentAssetsMan} onChange={(v: number) => u("currentAssetsMan", v)} step={100} unit="万円" small help="預貯金+投資(DC/NISA除く)の合計。住宅等の実物資産は含めない" />
        <Slider label="昇給率" value={s.salaryGrowthRate} onChange={(v: number) => u("salaryGrowthRate", v)} min={-2} max={10} step={0.5} unit="%" help="年収KFの値に毎年複利で加算。一般的に1-3%" />
      </div>
      <div className="border-t pt-2">
        <NumIn label="退職所得控除の通算期間" value={s.years} onChange={(v: number) => u("years", v)} unit="年" small help="重複を省いた加入期間" />
        <div className="mt-1 text-xs text-gray-500">
          通算: <b>{s.years}年</b> → 控除: <b>¥{fmt(rDed(s.years))}</b>
          <span className="ml-1 text-gray-400">（参考: {retirementAge - currentAge}年）</span>
        </div>
      </div>
      <div className="border-t pt-2 flex items-center justify-between">
        <span className="text-xs font-semibold">ふるさと納税</span>
        <Tog label="利用する" checked={s.hasFurusato} onChange={(v: boolean) => u("hasFurusato", v)} />
      </div>
    </div>
  );
}
