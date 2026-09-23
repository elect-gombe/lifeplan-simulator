import type { Scenario } from "../lib/types";
import { SCENARIO_COLORS, MAX_SCENARIOS } from "../lib/scenarioFactory";

/**
 * Scenario tabs. The active tab's editor is shown below; the name is edited inline.
 * Duplicate / remove / add controls live on the tabs so the editor column stays compact.
 */
export function ScenarioBar({ scenarios, activeIdx, onSelect, onUpdate, onAdd, onDup, onRemove, sideBySide, onToggleSideBySide }: {
  scenarios: Scenario[]; activeIdx: number; onSelect: (i: number) => void;
  onUpdate: (i: number, s: Scenario) => void;
  onAdd: () => void; onDup: (i: number) => void; onRemove: (i: number) => void;
  /** Side-by-side compare mode: every editor is shown, tabs only pick which one is "active" (rename / controls). */
  sideBySide?: boolean; onToggleSideBySide?: () => void;
}) {
  const canAdd = scenarios.length < MAX_SCENARIOS;
  return (
    <div className="flex flex-wrap items-end gap-1 border-b border-gray-200" role="tablist">
      {scenarios.map((s, i) => {
        const active = i === activeIdx;
        const color = SCENARIO_COLORS[i];
        return (
          <div key={s.id ?? i} role="tab" aria-selected={active} onClick={() => onSelect(i)}
            className={`group flex cursor-pointer items-center gap-1 rounded-t-md border border-b-0 px-2 py-1 text-xs ${active ? "bg-white shadow-sm" : "bg-gray-50 opacity-70 hover:opacity-100"}`}
            style={{ borderLeftColor: active ? color : "#e5e7eb", borderRightColor: active ? color : "#e5e7eb", borderTopWidth: 3, borderTopColor: color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {active ? (
              <input value={s.name} onChange={(e) => onUpdate(i, { ...s, name: e.target.value })} onClick={e => e.stopPropagation()}
                className="w-24 border-b border-transparent bg-transparent text-xs font-bold outline-none hover:border-gray-300 focus:border-blue-500"
                style={{ color }} title="クリックして名前を編集" />
            ) : (
              <span className="max-w-[7rem] truncate font-bold" style={{ color }}>{s.name}</span>
            )}
            {i > 0 && s.linkedToBase && <span className="text-[9px] text-gray-400" title="Aをベースに差分だけ設定">🔗</span>}
            {active && (
              <span className="ml-1 flex items-center gap-1 text-[10px] text-gray-400">
                {canAdd && <button type="button" onClick={(e) => { e.stopPropagation(); onDup(i); }} className="hover:text-blue-500" title="このシナリオを複製">複製</button>}
                {scenarios.length > 1 && <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(i); }} className="hover:text-red-500" title="削除">×</button>}
              </span>
            )}
          </div>
        );
      })}
      {canAdd && (
        <button type="button" onClick={onAdd} className="mb-0.5 ml-1 rounded px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50" title="Aをベースにした比較シナリオを追加">
          ＋ シナリオ
        </button>
      )}
      {onToggleSideBySide && scenarios.length > 1 && (
        <button type="button" onClick={onToggleSideBySide} aria-pressed={!!sideBySide}
          className={`mb-0.5 ml-auto rounded px-2 py-1 text-[10px] ${sideBySide ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:bg-gray-100"}`}
          title={sideBySide ? "タブ表示に戻す" : "全シナリオを横に並べて比較（入力列を広げると列数が増えます）"}>
          {sideBySide ? "▥ 並べて表示中" : "▥ 並べる"}
        </button>
      )}
    </div>
  );
}
