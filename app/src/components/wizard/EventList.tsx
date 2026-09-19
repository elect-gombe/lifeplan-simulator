import type { LifeEvent } from "../../lib/types";

/** Compact add/edit/remove list used for insurance and car events in the wizard. */
export function EventList({ label, icon, events, onAdd, onEdit, onRemove }: {
  label: string; icon: string; events: LifeEvent[];
  onAdd: () => void; onEdit: (e: LifeEvent) => void; onRemove: (id: number) => void;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{icon} {label}</span>
        <button onClick={onAdd} className="rounded bg-gray-600 px-3 py-1 text-xs text-white hover:bg-gray-700">＋ 追加</button>
      </div>
      {events.length === 0 && <p className="text-xs text-gray-400">なし（後から追加可）</p>}
      {events.map(e => (
        <div key={e.id} className="flex items-center justify-between rounded border bg-gray-50 px-3 py-1.5 text-xs">
          <span className="text-gray-700">{e.label}</span>
          <div className="flex gap-1">
            <button onClick={() => onEdit(e)} className="rounded border px-2 py-0.5 text-gray-500 hover:bg-white text-[10px]">編集</button>
            <button onClick={() => onRemove(e.id)} className="text-red-400 hover:text-red-600 px-1">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
