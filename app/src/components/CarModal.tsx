import React, { useState, useEffect } from "react";
import type { LifeEvent, CarParams } from "../lib/types";

function calcMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (annualRate <= 0 || years <= 0) return years > 0 ? Math.round(principal / (years * 12)) : 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

export function CarModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number;
  retirementAge: number;
  existingEvent?: LifeEvent | null;
}) {
  const defaults: CarParams = {
    priceMan: 300, loanYears: 5, loanRate: 3.0,
    maintenanceAnnualMan: 15, insuranceAnnualMan: 8,
    replaceEveryYears: 7,
  };

  const [purchaseAge, setPurchaseAge] = useState(currentAge + 3);
  const [cp, setCP] = useState<CarParams>(defaults);

  useEffect(() => {
    if (existingEvent?.carParams) {
      setCP(existingEvent.carParams);
      setPurchaseAge(existingEvent.age);
    }
  }, [existingEvent]);

  if (!isOpen) return null;

  const u = (patch: Partial<CarParams>) => setCP(prev => ({ ...prev, ...patch }));

  const loanMonthly = cp.loanYears > 0 ? calcMonthlyPayment(cp.priceMan * 10000, cp.loanRate, cp.loanYears) : 0;
  const totalLoanPayment = loanMonthly * cp.loanYears * 12;
  const totalInterest = totalLoanPayment - cp.priceMan * 10000;

  const totalYearsOwned = cp.replaceEveryYears > 0 ? Math.min(retirementAge - purchaseAge, 50) : retirementAge - purchaseAge;
  const replacements = cp.replaceEveryYears > 0 ? Math.floor(totalYearsOwned / cp.replaceEveryYears) : 0;

  const annualRunningCost = cp.maintenanceAnnualMan + cp.insuranceAnnualMan;
  const firstYearTotal = (cp.loanYears > 0 ? Math.round(loanMonthly * 12 / 10000) : cp.priceMan) + annualRunningCost;

  const handleSave = () => {
    const duration = cp.replaceEveryYears > 0 ? 0 : (retirementAge - purchaseAge); // permanent if repeating
    const event: LifeEvent = {
      id: existingEvent?.id || Date.now(),
      age: purchaseAge,
      type: "car",
      label: `車(${cp.priceMan}万/${cp.replaceEveryYears > 0 ? cp.replaceEveryYears + "年毎" : "一度"})`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
      carParams: cp,
    };
    onSave(event);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3">
          <p className="text-sm font-bold">🚗 車の購入・買い替え{existingEvent ? "（編集）" : ""}</p>
        </div>
        <div className="p-4 space-y-4 text-xs">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">初回購入時年齢</label>
              <input type="number" value={purchaseAge} min={currentAge} max={retirementAge - 1}
                onChange={e => setPurchaseAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">車両価格（万円）</label>
              <input type="number" value={cp.priceMan} step={50}
                onChange={e => u({ priceMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
          </div>

          {/* Replacement cycle */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">買い替えサイクル</label>
            <div className="flex gap-2">
              <button onClick={() => u({ replaceEveryYears: 0 })}
                className={`rounded px-3 py-1 ${cp.replaceEveryYears === 0 ? "bg-blue-600 text-white" : "bg-gray-100"}`}>一度のみ</button>
              {[5, 7, 10].map(y => (
                <button key={y} onClick={() => u({ replaceEveryYears: y })}
                  className={`rounded px-3 py-1 ${cp.replaceEveryYears === y ? "bg-blue-600 text-white" : "bg-gray-100"}`}>{y}年毎</button>
              ))}
            </div>
            {cp.replaceEveryYears > 0 && (
              <div className="text-gray-400">
                {purchaseAge}歳から{cp.replaceEveryYears}年ごとに買い替え（約{replacements}回）。同額の車を想定。
              </div>
            )}
          </div>

          {/* Loan */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">ローン</label>
            <div className="flex gap-2">
              <button onClick={() => u({ loanYears: 0 })}
                className={`rounded px-3 py-1 ${cp.loanYears === 0 ? "bg-blue-600 text-white" : "bg-gray-100"}`}>一括購入</button>
              {[3, 5, 7].map(y => (
                <button key={y} onClick={() => u({ loanYears: y })}
                  className={`rounded px-3 py-1 ${cp.loanYears === y ? "bg-blue-600 text-white" : "bg-gray-100"}`}>{y}年ローン</button>
              ))}
            </div>
            {cp.loanYears > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-500 mb-1">金利（%）</label>
                  <input type="number" value={cp.loanRate} step={0.1} min={0}
                    onChange={e => u({ loanRate: Number(e.target.value) })} className="w-full rounded border px-2 py-1" />
                </div>
                <div className="flex items-end text-gray-400">
                  月額 <b className="ml-1">{Math.round(loanMonthly / 10000)}万円</b>
                  <span className="ml-1">（利息計{Math.round(totalInterest / 10000)}万）</span>
                </div>
              </div>
            )}
          </div>

          {/* Running costs */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">維持費（年額）</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-500 mb-1">車検・整備・税金（万円/年）</label>
                <input type="number" value={cp.maintenanceAnnualMan} step={1} min={0}
                  onChange={e => u({ maintenanceAnnualMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
              </div>
              <div>
                <label className="block text-gray-500 mb-1">保険料（万円/年）</label>
                <input type="number" value={cp.insuranceAnnualMan} step={1} min={0}
                  onChange={e => u({ insuranceAnnualMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
              </div>
            </div>
            <div className="text-gray-400">維持費合計: <b>{annualRunningCost}万円/年</b>（駐車場・ガソリン代は基本生活費に含める想定）</div>
          </div>

          {/* Summary */}
          <div className="rounded bg-blue-50 p-2 text-gray-700">
            <div className="font-bold mb-1">コスト概算</div>
            {cp.loanYears > 0 ? (
              <div>初年度: ローン返済{Math.round(loanMonthly * 12 / 10000)}万 + 維持費{annualRunningCost}万 = <b>{firstYearTotal}万円/年</b></div>
            ) : (
              <div>初年度: 車両{cp.priceMan}万（一括） + 維持費{annualRunningCost}万 = <b>{firstYearTotal}万円</b></div>
            )}
            {cp.replaceEveryYears > 0 && (
              <div className="text-gray-500">{cp.replaceEveryYears}年ごとの買い替え費用: {cp.priceMan}万円</div>
            )}
          </div>
        </div>

        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={handleSave} className="rounded bg-green-600 px-4 py-1.5 text-xs text-white font-bold hover:bg-green-700">{existingEvent ? "更新" : "追加"}</button>
        </div>
      </div>
    </div>
  );
}
