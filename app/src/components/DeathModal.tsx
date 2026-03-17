import React, { useState, useEffect } from "react";
import type { LifeEvent, DeathParams } from "../lib/types";

export function DeathModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number;
  retirementAge: number;
  existingEvent?: LifeEvent | null;
}) {
  const defaults: DeathParams = {
    expenseReductionPct: 70,
    hasDanshin: true,
    survivorPensionManPerYear: 180,
    incomeProtectionManPerMonth: 0,
    incomeProtectionUntilAge: 65,
  };

  const [deathAge, setDeathAge] = useState(currentAge + 10);
  const [dp, setDP] = useState<DeathParams>(defaults);

  useEffect(() => {
    if (existingEvent?.deathParams) {
      setDP(existingEvent.deathParams);
      setDeathAge(existingEvent.age);
    }
  }, [existingEvent]);

  if (!isOpen) return null;
  const u = (patch: Partial<DeathParams>) => setDP(prev => ({ ...prev, ...patch }));

  const protectionAnnual = dp.incomeProtectionManPerMonth * 12;
  const protectionYears = Math.max(dp.incomeProtectionUntilAge - deathAge, 0);
  const protectionTotal = protectionAnnual * protectionYears;

  const handleSave = () => {
    onSave({
      id: existingEvent?.id || Date.now(),
      age: deathAge,
      type: "death",
      label: `死亡(${deathAge}歳)`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
      deathParams: dp,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3">
          <p className="text-sm font-bold">⚰️ 死亡イベント（収入保障シミュレーション）</p>
        </div>
        <div className="p-4 space-y-4 text-xs">

          <div className="rounded bg-gray-50 p-2 text-gray-600">
            主な収入源が死亡した場合の家計シミュレーションです。収入保障保険の必要保障額を検討するために使います。
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">死亡時年齢</label>
              <input type="number" value={deathAge} min={currentAge} max={retirementAge - 1}
                onChange={e => setDeathAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">生活費（元の何%）</label>
              <input type="number" value={dp.expenseReductionPct} min={10} max={100} step={5}
                onChange={e => u({ expenseReductionPct: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
              <div className="mt-0.5 text-gray-400">遺族の生活費は一般に7割程度</div>
            </div>
          </div>

          {/* 団信 */}
          <div className="rounded border p-3">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-600">
              <input type="checkbox" checked={dp.hasDanshin} onChange={e => u({ hasDanshin: e.target.checked })} className="accent-blue-600" />
              団体信用生命保険（団信）に加入
            </label>
            <div className="mt-1 text-gray-400">加入の場合、死亡時に住宅ローン残高が免除されます</div>
          </div>

          {/* 遺族年金 */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">遺族年金（万円/年）</label>
            <input type="number" value={dp.survivorPensionManPerYear} step={10} min={0}
              onChange={e => u({ survivorPensionManPerYear: Number(e.target.value) })} className="w-32 rounded border px-2 py-1.5" />
            <div className="text-gray-400 space-y-0.5">
              <div>遺族基礎年金: 約78万 + 子の加算(1-2人目: 各22.4万)</div>
              <div>遺族厚生年金: 報酬比例部分の3/4（年収700万で約50-60万/年）</div>
              <div>子が18歳になるまで支給。その後は遺族厚生年金のみ。</div>
              <div className="font-semibold text-gray-500">目安: 子2人で約180万/年 → 子が独立後は約60万/年</div>
            </div>
          </div>

          {/* 収入保障保険 */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">収入保障保険</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-500 mb-1">月額保障（万円/月）</label>
                <input type="number" value={dp.incomeProtectionManPerMonth} step={5} min={0}
                  onChange={e => u({ incomeProtectionManPerMonth: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
              </div>
              <div>
                <label className="block text-gray-500 mb-1">保障期間（歳まで）</label>
                <input type="number" value={dp.incomeProtectionUntilAge} min={deathAge} max={80}
                  onChange={e => u({ incomeProtectionUntilAge: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
              </div>
            </div>
            {dp.incomeProtectionManPerMonth > 0 && (
              <div className="text-gray-500">
                年額: <b>{protectionAnnual}万円</b> × {protectionYears}年 = 総額<b>{protectionTotal.toLocaleString()}万円</b>
              </div>
            )}
            <div className="text-gray-400">0にすると保険なしでのシミュレーション。必要保障額の目安を確認できます。</div>
          </div>

          {/* Summary */}
          <div className="rounded bg-slate-100 p-3 space-y-1 text-gray-700">
            <div className="font-bold">死亡後の年間収入</div>
            <div>遺族年金: {dp.survivorPensionManPerYear}万円/年</div>
            {dp.incomeProtectionManPerMonth > 0 && <div>収入保障保険: {protectionAnnual}万円/年（{dp.incomeProtectionUntilAge}歳まで）</div>}
            <div className="font-bold">合計: {dp.survivorPensionManPerYear + protectionAnnual}万円/年</div>
            <div className="border-t pt-1 mt-1">
              <div>生活費: 元の{dp.expenseReductionPct}%に削減</div>
              {dp.hasDanshin && <div className="text-green-600">団信: 住宅ローン残高免除</div>}
              <div>給与収入: 0（DC/iDeCo拠出も停止）</div>
            </div>
          </div>

        </div>
        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={handleSave} className="rounded bg-slate-700 px-4 py-1.5 text-xs text-white font-bold hover:bg-slate-800">{existingEvent ? "更新" : "追加"}</button>
        </div>
      </div>
    </div>
  );
}
