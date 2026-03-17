import React, { useState, useEffect } from "react";
import type { LifeEvent, DeathParams, EventTarget } from "../lib/types";

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
    survivorPensionManPerYear: 0,  // 0 = 自動計算（calc.tsで年齢・子の数・年収から算出）
    incomeProtectionManPerMonth: 0,
    incomeProtectionUntilAge: 65,
  };

  const [deathAge, setDeathAge] = useState(currentAge + 10);
  const [dp, setDP] = useState<DeathParams>(defaults);
  const [target, setTarget] = useState<EventTarget>("self");
  const [childCount, setChildCount] = useState(2);
  const [avgAnnualSalaryMan, setAvgAnnualSalaryMan] = useState(700);

  useEffect(() => {
    if (existingEvent?.deathParams) {
      setDP(existingEvent.deathParams);
      setDeathAge(existingEvent.age);
      setTarget(existingEvent.target || "self");
    }
  }, [existingEvent]);

  // 遺族年金プレビュー（令和6年度基準、calc.ts calcSurvivorPension と同じ式）
  const calcPensionPreview = () => {
    const avgSalary = avgAnnualSalaryMan * 10000;
    // 遺族基礎年金（子がいる場合のみ）
    let basicPension = 0;
    if (childCount > 0) {
      basicPension = 816000;
      for (let i = 0; i < childCount; i++) {
        basicPension += i < 2 ? 234800 : 78300;
      }
    }
    // 遺族厚生年金
    const avgMonthly = Math.min(avgSalary / 12, 650000); // 標準報酬上限65万
    const contributionMonths = Math.max((deathAge - 22) * 12, 300);
    const employeePension = Math.round(avgMonthly * 5.481 / 1000 * contributionMonths * 3 / 4);
    // 中高齢寡婦加算（子なし、遺族40-65歳）
    const widowSupplement = childCount === 0 && deathAge >= 40 && deathAge < 65 ? 612000 : 0;
    const total = basicPension + employeePension + widowSupplement;
    return { basicPension, employeePension, widowSupplement, total, totalMan: Math.round(total / 10000) };
  };
  const pensionPreview = calcPensionPreview();

  if (!isOpen) return null;
  const u = (patch: Partial<DeathParams>) => setDP(prev => ({ ...prev, ...patch }));

  const protectionAnnual = dp.incomeProtectionManPerMonth * 12;
  const protectionYears = Math.max(dp.incomeProtectionUntilAge - deathAge, 0);
  const protectionTotal = protectionAnnual * protectionYears;

  const targetLabel = target === "spouse" ? "配偶者" : "本人";
  const handleSave = () => {
    onSave({
      id: existingEvent?.id || Date.now(),
      age: deathAge,
      type: "death",
      label: `${targetLabel}死亡(${deathAge}歳)`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
      target,
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
            世帯メンバーが死亡した場合の家計シミュレーションです。収入保障保険の必要保障額を検討するために使います。
          </div>

          {/* 対象者選択 */}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">死亡時年齢（{targetLabel}）</label>
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

          {/* 遺族年金（自動計算） */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">遺族年金（自動計算・令和6年度基準）</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-500 mb-0.5">18歳未満の子の数（プレビュー用）</label>
                <input type="number" value={childCount} min={0} max={10} step={1}
                  onChange={e => setChildCount(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
              </div>
              <div>
                <label className="block text-gray-500 mb-0.5">平均年収（プレビュー用・万円）</label>
                <input type="number" value={avgAnnualSalaryMan} min={0} step={50}
                  onChange={e => setAvgAnnualSalaryMan(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
              </div>
            </div>
            <div className="rounded bg-blue-50 p-2 text-gray-600 space-y-0.5">
              <div>遺族基礎年金: <b>{Math.round(pensionPreview.basicPension / 10000)}万円/年</b>
                {childCount > 0 ? ` (81.6万 + 子${childCount}人加算)` : " (子なし: 支給なし)"}</div>
              <div>遺族厚生年金: <b>{Math.round(pensionPreview.employeePension / 10000)}万円/年</b>
                {` (月額${Math.min(Math.round(avgAnnualSalaryMan * 10000 / 12), 650000).toLocaleString()}円×5.481/1000×${Math.max((deathAge - 22) * 12, 300)}月×3/4)`}</div>
              {pensionPreview.widowSupplement > 0 && (
                <div>中高齢寡婦加算: <b>{Math.round(pensionPreview.widowSupplement / 10000)}万円/年</b> (子なし・40-65歳)</div>
              )}
              <div className="font-bold border-t pt-1 mt-1">プレビュー合計: 約{pensionPreview.totalMan}万円/年</div>
              <div className="text-[10px] text-gray-400">
                実行時はシナリオの実際の年収履歴・子の年齢から毎年自動計算されます。
                子が18歳を超えると基礎年金が終了し、中高齢寡婦加算に切り替わる場合があります。
              </div>
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
            <div className="font-bold">死亡後の年間収入（プレビュー）</div>
            <div>遺族年金: 約{pensionPreview.totalMan}万円/年（自動計算）</div>
            {dp.incomeProtectionManPerMonth > 0 && <div>収入保障保険: {protectionAnnual}万円/年（{dp.incomeProtectionUntilAge}歳まで）</div>}
            <div className="font-bold">合計: 約{pensionPreview.totalMan + protectionAnnual}万円/年</div>
            <div className="border-t pt-1 mt-1">
              <div>生活費: 元の{dp.expenseReductionPct}%に削減</div>
              {dp.hasDanshin && <div className="text-green-600">団信: 住宅ローン残高免除</div>}
              <div>給与収入: 0（DC/iDeCo拠出も停止）</div>
            </div>
            <div className="border-t pt-1 mt-1">
              <div className="font-semibold text-gray-600">対象: {targetLabel}死亡時に発動する保険イベント</div>
              <div className="text-[10px] text-gray-400">シナリオ内の保険イベントで対象が「{targetLabel}」のものが自動的にトリガーされます（定期保険: 一時金、収入保障: 月額給付）</div>
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
