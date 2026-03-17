import React, { useState, useEffect } from "react";
import type { LifeEvent, InsuranceParams, EventTarget } from "../lib/types";

export function InsuranceModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number;
  retirementAge: number;
  existingEvent?: LifeEvent | null;
}) {
  const defaults: InsuranceParams = {
    insuranceType: "income_protection",
    premiumMonthlyMan: 0.5,
    lumpSumPayoutMan: 3000,
    monthlyPayoutMan: 15,
    payoutUntilAge: 65,
    coverageEndAge: 65,
  };

  const [startAge, setStartAge] = useState(currentAge);
  const [ip, setIP] = useState<InsuranceParams>(defaults);
  const [target, setTarget] = useState<EventTarget>("self");

  useEffect(() => {
    if (existingEvent?.insuranceParams) {
      setIP(existingEvent.insuranceParams);
      setStartAge(existingEvent.age);
      setTarget(existingEvent.target || "self");
    }
  }, [existingEvent]);

  if (!isOpen) return null;
  const u = (patch: Partial<InsuranceParams>) => setIP(prev => ({ ...prev, ...patch }));

  const coverageYears = Math.max(ip.coverageEndAge - startAge, 0);
  const totalPremium = ip.premiumMonthlyMan * 12 * coverageYears;

  // Payout calculation
  const payoutYears = ip.insuranceType === "income_protection"
    ? Math.max(ip.payoutUntilAge - startAge, 0)
    : 0;
  const totalPayout = ip.insuranceType === "term_life"
    ? ip.lumpSumPayoutMan
    : ip.monthlyPayoutMan * 12 * payoutYears;

  const targetLabel = target === "spouse" ? "配偶者" : "本人";
  const handleSave = () => {
    const typeLabel = ip.insuranceType === "term_life"
      ? `定期保険(${ip.lumpSumPayoutMan}万)`
      : `収入保障(${ip.monthlyPayoutMan}万/月)`;
    onSave({
      id: existingEvent?.id || Date.now(),
      age: startAge,
      type: "insurance",
      label: `${targetLabel}${typeLabel}`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: coverageYears,
      target,
      insuranceParams: ip,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3">
          <p className="text-sm font-bold">🛡️ 保険{existingEvent ? "（編集）" : ""}</p>
        </div>
        <div className="p-4 space-y-4 text-xs">

          <div className="rounded bg-gray-50 p-2 text-gray-600">
            対象者の死亡イベントと連動。死亡時に保険料停止→保険金支払い。
          </div>

          {/* 対象者（被保険者） */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">被保険者（誰に掛ける保険か）</label>
            <div className="flex gap-2">
              <button onClick={() => setTarget("self")}
                className={`rounded px-3 py-1.5 ${target === "self" ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>本人</button>
              <button onClick={() => setTarget("spouse")}
                className={`rounded px-3 py-1.5 ${target === "spouse" ? "bg-pink-600 text-white" : "bg-gray-100"}`}>配偶者</button>
            </div>
            <div className="text-gray-400 text-[10px]">{targetLabel}の死亡イベント発生時に保険金が支払われます</div>
          </div>

          {/* Insurance type */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">保険タイプ</label>
            <div className="flex gap-2">
              <button onClick={() => u({ insuranceType: "term_life" })}
                className={`rounded px-3 py-1.5 ${ip.insuranceType === "term_life" ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>
                定期保険（一時金）
              </button>
              <button onClick={() => u({ insuranceType: "income_protection" })}
                className={`rounded px-3 py-1.5 ${ip.insuranceType === "income_protection" ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>
                収入保障保険（月額）
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">加入時年齢</label>
              <input type="number" value={startAge} min={currentAge} max={retirementAge - 1}
                onChange={e => setStartAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">保険期間（歳まで）</label>
              <input type="number" value={ip.coverageEndAge} min={startAge + 1} max={80}
                onChange={e => u({ coverageEndAge: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
          </div>

          {/* Premium */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">保険料（万円/月）</label>
            <input type="number" value={ip.premiumMonthlyMan} step={0.1} min={0}
              onChange={e => u({ premiumMonthlyMan: Number(e.target.value) })} className="w-32 rounded border px-2 py-1.5" />
            <div className="text-gray-400">
              年額: <b>{(ip.premiumMonthlyMan * 12).toFixed(1)}万円</b>
              　{coverageYears}年間の総支払: <b>{totalPremium.toFixed(0)}万円</b>
            </div>
          </div>

          {/* Payout */}
          {ip.insuranceType === "term_life" ? (
            <div className="rounded border p-3 space-y-2">
              <label className="block font-semibold text-gray-600">死亡保険金（万円）</label>
              <input type="number" value={ip.lumpSumPayoutMan} step={100} min={0}
                onChange={e => u({ lumpSumPayoutMan: Number(e.target.value) })} className="w-32 rounded border px-2 py-1.5" />
              <div className="text-gray-400">死亡時に一括で受け取る保険金額</div>
            </div>
          ) : (
            <div className="rounded border p-3 space-y-2">
              <label className="block font-semibold text-gray-600">月額保障（万円/月）</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input type="number" value={ip.monthlyPayoutMan} step={1} min={0}
                    onChange={e => u({ monthlyPayoutMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1">保障期間（歳まで）</label>
                  <input type="number" value={ip.payoutUntilAge} min={startAge} max={80}
                    onChange={e => u({ payoutUntilAge: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
                </div>
              </div>
              <div className="text-gray-400">
                年額: <b>{(ip.monthlyPayoutMan * 12).toFixed(0)}万円</b>
                　最大受取総額: <b>{totalPayout.toLocaleString()}万円</b>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded bg-indigo-50 p-3 space-y-1 text-gray-700">
            <div className="font-bold">保険の概要</div>
            <div>タイプ: {ip.insuranceType === "term_life" ? "定期保険（一時金型）" : "収入保障保険（月額型）"}</div>
            <div>保険期間: {startAge}歳〜{ip.coverageEndAge}歳（{coverageYears}年間）</div>
            <div>保険料: {ip.premiumMonthlyMan}万円/月（年{(ip.premiumMonthlyMan * 12).toFixed(1)}万）</div>
            {ip.insuranceType === "term_life" ? (
              <div>保険金: {ip.lumpSumPayoutMan.toLocaleString()}万円（一時金）</div>
            ) : (
              <div>保障: {ip.monthlyPayoutMan}万円/月（{ip.payoutUntilAge}歳まで）</div>
            )}
            <div className="border-t pt-1 mt-1 text-gray-500">
              総支払保険料: {totalPremium.toFixed(0)}万円 → 最大受取: {totalPayout.toLocaleString()}万円
            </div>
          </div>

        </div>
        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={handleSave} className="rounded bg-indigo-600 px-4 py-1.5 text-xs text-white font-bold hover:bg-indigo-700">{existingEvent ? "更新" : "追加"}</button>
        </div>
      </div>
    </div>
  );
}
