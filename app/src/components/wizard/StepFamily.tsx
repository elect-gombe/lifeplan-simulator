import { useState } from "react";
import { Btns } from "../ui";
import { ChildrenModal } from "../ChildrenModal";
import { eventsToChildPlans, childCostTotals } from "../../lib/childPlan";
import type { WizardData, StepProps } from "./types";

export function StepFamily({ data, onChange }: StepProps) {
  const u = (patch: Partial<WizardData>) => onChange({ ...data, ...patch });
  const [open, setOpen] = useState(false);
  const [focusId, setFocusId] = useState<number | undefined>();

  const { plans, common } = eventsToChildPlans(data.childEvents);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">家族構成を教えてください</h2>

      {/* 配偶者 */}
      <div className="flex items-center gap-2">
        <span className="w-16 text-sm font-semibold text-gray-700">配偶者</span>
        <Btns options={[{ value: true as const, label: "いる" }, { value: false as const, label: "いない" }]} value={data.hasSpouse} onChange={v => u({ hasSpouse: v })} />
      </div>

      {/* 子供: 一覧はここ、編集は一括モーダル */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">子供{plans.length > 0 && <span className="ml-1 text-xs font-normal text-gray-400">{plans.length}人</span>}</span>
          <button onClick={() => { setFocusId(undefined); setOpen(true); }} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">
            {plans.length === 0 ? "＋ 追加" : "まとめて編集"}
          </button>
        </div>
        {plans.length === 0 && <p className="text-xs text-gray-400">なし（後から追加可）</p>}
        {plans.map(p => {
          const t = childCostTotals(p, common);
          const offset = p.birthAge - data.currentAge;
          const birthDesc = offset < 0 ? `現在${-offset}歳` : offset === 0 ? "今年" : `${offset}年後`;
          const leave = [p.leaveSelfMonths > 0 && `本人${p.leaveSelfMonths}ヶ月`, p.leaveSpouseMonths > 0 && `配偶者${p.leaveSpouseMonths}ヶ月`].filter(Boolean).join("・");
          return (
            <button key={p.id} type="button" onClick={() => { setFocusId(p.id); setOpen(true); }}
              className="flex w-full items-center justify-between rounded-lg border bg-gray-50 px-3 py-2 text-left text-xs hover:bg-white">
              <span className="text-gray-700">
                {p.name} <span className="text-gray-400">{birthDesc}</span>
                <span className="ml-1 text-blue-600">教育費 {t.edu}万</span>
                {leave && <span className="ml-1 text-pink-600">🍼{leave}</span>}
              </span>
              <span className="text-[10px] text-gray-400">編集 ›</span>
            </button>
          );
        })}
      </div>

      <ChildrenModal isOpen={open} onClose={() => setOpen(false)} events={data.childEvents}
        onSave={evts => u({ childEvents: evts })}
        currentAge={data.currentAge} retirementAge={data.retirementAge} focusChildId={focusId} />
    </div>
  );
}
