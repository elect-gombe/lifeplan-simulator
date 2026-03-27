import React, { useState, useEffect } from "react";
import type { DeathParams, EventTarget } from "../lib/types";
import { EventModal, type EventModalBaseProps, type EventModalDef } from "./EventModal";

const deathDef: EventModalDef<DeathParams> = {
  type: "death",
  title: "⚰️ 死亡イベント（収入保障シミュレーション）",
  btnClass: "bg-slate-700 hover:bg-slate-800",
  defaults: {
    expenseReductionPct: 70, hasDanshin: true,
    survivorPensionManPerYear: 0, incomeProtectionManPerMonth: 0, incomeProtectionUntilAge: 65,
  },
  paramsKey: "deathParams",
  ageOffset: 10,
  buildLabel: () => "", // overridden via buildExtra
};

export function DeathModal(props: EventModalBaseProps) {
  const { existingEvent } = props;
  const [target, setTarget] = useState<EventTarget>("self");

  useEffect(() => {
    if (existingEvent?.deathParams) {
      setTarget(existingEvent.target || "self");
    }
  }, [existingEvent]);

  const def: EventModalDef<DeathParams> = {
    ...deathDef,
    buildLabel: (_, age) => `${target === "spouse" ? "配偶者" : "本人"}死亡(${age}歳)`,
    buildExtra: () => ({ target }),
  };

  return (
    <EventModal def={def} {...props}>
      {({ age, setAge, currentAge: curAge, retirementAge, params: dp, u }) => {
        const targetLabel = target === "spouse" ? "配偶者" : "本人";
        return (<>
          {/* 対象者 */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">対象者</label>
            <div className="flex gap-2">
              <button onClick={() => setTarget("self")}
                className={`rounded px-3 py-1.5 ${target === "self" ? "bg-slate-700 text-white" : "bg-gray-100"}`}>本人</button>
              <button onClick={() => setTarget("spouse")}
                className={`rounded px-3 py-1.5 ${target === "spouse" ? "bg-pink-600 text-white" : "bg-gray-100"}`}>配偶者</button>
            </div>
            <div className="text-gray-400 text-[10px]">
              {target === "self" ? "本人死亡: 本人の収入→0、DC/iDeCo停止。配偶者は継続。" : "配偶者死亡: 配偶者の収入→0、配偶者DC/iDeCo停止。本人は継続。"}
            </div>
          </div>

          {/* 死亡時年齢 */}
          <div>
            <label className="block font-semibold text-gray-600 mb-1">死亡時年齢（{targetLabel}）</label>
            <input type="number" value={age} min={curAge} max={retirementAge - 1}
              onChange={e => setAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
          </div>

          {/* 団信 */}
          <div className="rounded border p-3">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-600">
              <input type="checkbox" checked={dp.hasDanshin} onChange={e => u({ hasDanshin: e.target.checked })} className="accent-blue-600" />
              団体信用生命保険（団信）に加入
            </label>
            <div className="mt-1 text-gray-400">加入の場合、死亡時に住宅ローン残高が免除されます</div>
          </div>
        </>);
      }}
    </EventModal>
  );
}
