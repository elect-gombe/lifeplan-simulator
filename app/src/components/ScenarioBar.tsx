import { useState } from "react";
import type { Scenario } from "../lib/types";
import { SCENARIO_COLORS, MAX_SCENARIOS } from "../lib/scenarioFactory";

/** Scenario name tabs with duplicate/remove/add controls and a sticky toggle. */
export function ScenarioBar({ scenarios, onUpdate, onAdd, onDup, onRemove }: {
  scenarios: Scenario[]; onUpdate: (i: number, s: Scenario) => void;
  onAdd: () => void; onDup: (i: number) => void; onRemove: (i: number) => void;
}) {
  const [sticky, setSticky] = useState(false);
  const canAdd = scenarios.length < MAX_SCENARIOS;
  return (
    <div className={`${sticky ? "sticky top-0 z-30 bg-white/95 backdrop-blur-sm shadow-sm py-1 -mx-3 px-3" : ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {scenarios.map((s, i) => (
          <div key={s.id ?? i} className="flex items-center gap-1 rounded-lg border-2 px-2 py-1" style={{ borderColor: SCENARIO_COLORS[i] }}>
            <input value={s.name} onChange={(e) => onUpdate(i, { ...s, name: e.target.value })}
              className="w-24 border-b border-transparent bg-transparent text-xs font-bold outline-none hover:border-gray-300 focus:border-blue-500"
              style={{ color: SCENARIO_COLORS[i] }} />
            {canAdd && <button onClick={() => onDup(i)} className="text-[10px] text-gray-400 hover:text-blue-500">複製</button>}
            {scenarios.length > 1 && <button onClick={() => onRemove(i)} className="text-[10px] text-gray-400 hover:text-red-500">×</button>}
          </div>
        ))}
        {canAdd && <button onClick={onAdd} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">+ シナリオ</button>}
        <button onClick={() => setSticky(v => !v)}
          className={`rounded px-2 py-1 text-[10px] ${sticky ? "bg-amber-100 text-amber-700" : "text-gray-400 hover:bg-gray-100"}`}>
          {sticky ? "📌 固定中" : "📌 固定"}
        </button>
      </div>
    </div>
  );
}
