/** ヘッダーのプランタブ（切替・複製・削除・名称変更）。 */
import { useState } from "react";
import { Plus, Copy, Trash2, Pencil, Check, Link2 } from "lucide-react";
import { useStore, usePlanActions } from "@/state/store";
import { cx } from "@/ui/primitives";

export function PlanTabs() {
  const { state } = useStore();
  const act = usePlanActions();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-1 overflow-x-auto scroll-thin min-w-0">
      {state.plans.map(p => {
        const active = p.id === state.activeId;
        return (
          <div key={p.id} className={cx("group flex items-center rounded-lg pl-2 pr-1 h-8 text-[13px] whitespace-nowrap transition-colors", active ? "surface-3 ink" : "ink-2 hover:surface-2")}>
            <span className="h-2 w-2 rounded-full mr-1.5 shrink-0" style={{ background: p.color }} />
            {p.link && <Link2 size={11} className="ink-3 mr-1 shrink-0" aria-label="ベースプランに連動" />}
            {editing === p.id ? (
              <form onSubmit={e => { e.preventDefault(); act.rename(p.id, name.trim() || p.name); setEditing(null); }} className="flex items-center">
                <input autoFocus value={name} onChange={e => setName(e.target.value)} onBlur={() => { act.rename(p.id, name.trim() || p.name); setEditing(null); }} className="underline-field w-28 bg-transparent border-b line outline-none text-[13px]" />
                <button type="submit" className="btn btn-ghost px-1 py-0.5"><Check size={13} /></button>
              </form>
            ) : (
              <button onClick={() => act.setActive(p.id)} className="tap font-medium max-w-[140px] truncate focus-ring rounded">{p.name}</button>
            )}
            {active && editing !== p.id && (
              <span className="ml-1 flex items-center opacity-70 group-hover:opacity-100">
                <button onClick={() => { setName(p.name); setEditing(p.id); }} className="tap btn btn-ghost px-1 py-0.5" aria-label="名前を変更"><Pencil size={12} /></button>
                <button onClick={() => act.duplicate(p.id, undefined, true)} disabled={state.plans.length >= 4} className="tap btn btn-ghost px-1 py-0.5" aria-label="連動する別案を作る" title="連動する別案を作る（変えたいセクションだけ上書き）"><Copy size={12} /></button>
                {state.plans.length > 1 && <button onClick={() => { if (confirm(`「${p.name}」を削除しますか？`)) act.remove(p.id); }} className="btn btn-ghost px-1 py-0.5 hover:text-[var(--critical)]" aria-label="削除"><Trash2 size={12} /></button>}
              </span>
            )}
          </div>
        );
      })}
      {state.plans.length < 4 && (
        <button onClick={() => act.duplicate(state.activeId, `プラン${String.fromCharCode(65 + state.plans.length)}`, true)} className="btn btn-ghost px-2 h-8 text-[13px]" title="現在のプランに連動する別案を作る。変えたいセクションだけ上書きできます"><Plus size={15} /><span className="hidden md:inline">別案を作る</span></button>
      )}
    </div>
  );
}
