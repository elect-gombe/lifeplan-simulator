import { useState } from "react";
import type { LifeEvent } from "../../lib/types";
import { Btns } from "../ui";
import { ChildEventModal } from "../ChildEventModal";
import type { WizardData, StepProps } from "./types";

export function StepFamily({ data, onChange }: StepProps) {
  const u = (patch: Partial<WizardData>) => onChange({ ...data, ...patch });
  const [childModalOpen, setChildModalOpen] = useState(false);
  const [editingEvents, setEditingEvents] = useState<LifeEvent[] | undefined>();

  const childParents = data.childEvents.filter(e => e.type === "child" && !e.parentId);

  const handleAdd = (events: LifeEvent[]) => u({ childEvents: [...data.childEvents, ...events] });
  const handleUpdate = (oldIds: number[], newEvents: LifeEvent[]) => {
    const kept = data.childEvents.filter(e => !oldIds.includes(e.id));
    u({ childEvents: [...kept, ...newEvents] });
  };
  const handleRemove = (parentId: number) => {
    u({ childEvents: data.childEvents.filter(e => e.id !== parentId && e.parentId !== parentId) });
  };
  const handleEdit = (parent: LifeEvent) => {
    const related = data.childEvents.filter(e => e.id === parent.id || e.parentId === parent.id);
    setEditingEvents(related);
    setChildModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">家族構成を教えてください</h2>

      {/* 配偶者 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 w-16">配偶者</span>
          <Btns
            options={[{ value: true as const, label: "いる" }, { value: false as const, label: "いない" }]}
            value={data.hasSpouse}
            onChange={v => u({ hasSpouse: v })}
          />
        </div>
      </div>

      {/* 子供 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">子供</span>
          <button
            onClick={() => { setEditingEvents(undefined); setChildModalOpen(true); }}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            ＋ 追加
          </button>
        </div>
        {childParents.length === 0 && (
          <p className="text-xs text-gray-400">なし（後から追加可）</p>
        )}
        {childParents.map((parent) => {
          const subs = data.childEvents.filter(e => e.parentId === parent.id);
          const offset = parent.age - data.currentAge;
          const birthDesc = offset < 0 ? `現在${-offset}歳` : offset === 0 ? "今年" : `${offset}年後`;
          const eduTotal = subs.filter(e => e.type === "education")
            .reduce((s, e) => s + e.annualCostMan * e.durationYears, 0);
          return (
            <div key={parent.id} className="flex items-center justify-between rounded-lg border bg-gray-50 px-3 py-2 text-xs">
              <span className="text-gray-700">{parent.label} <span className="text-gray-400">{birthDesc}</span> <span className="text-blue-600 ml-1">教育費 {eduTotal}万</span></span>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(parent)} className="rounded border px-2 py-0.5 text-gray-500 hover:bg-white text-[10px]">編集</button>
                <button onClick={() => handleRemove(parent.id)} className="text-red-400 hover:text-red-600 px-1">✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {childModalOpen && (
        <ChildEventModal
          isOpen={childModalOpen}
          onClose={() => { setChildModalOpen(false); setEditingEvents(undefined); }}
          onAdd={handleAdd}
          currentAge={data.currentAge}
          retirementAge={data.retirementAge}
          existingEvents={editingEvents}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
