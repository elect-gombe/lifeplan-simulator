import React, { useState, useEffect } from "react";
import type { LifeEvent, RelocationParams, PropertyParams } from "../lib/types";
import { calcMonthlyPaymentEqual } from "../lib/calc";
import { Modal } from "./ui";

export function RelocationModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number;
  retirementAge: number;
  existingEvent?: LifeEvent | null;
}) {
  const defaultPropertyParams: PropertyParams = {
    priceMan: 3000, downPaymentMan: 1000, loanYears: 25,
    repaymentType: "equal_payment",
    rateType: "variable", fixedRate: 1.8,
    variableInitRate: 0.5, variableRiskRate: 1.5, variableRiseAfter: 10,
    maintenanceMonthlyMan: 1.5, taxAnnualMan: 10, hasLoanDeduction: true,
    loanStructure: "single", pairRatio: 50,
    deductionTarget: "self", danshinTarget: "self",
  };

  const defaultRP: RelocationParams = {
    movingCostMan: 50,
    newHousingType: "rent",
    newRentAnnualMan: 120,
    newRentDurationYears: 25,
  };

  const [relocAge, setRelocAge] = useState(60);
  const [rp, setRP] = useState<RelocationParams>(defaultRP);
  const [newPP, setNewPP] = useState<PropertyParams>(defaultPropertyParams);

  useEffect(() => {
    if (existingEvent?.relocationParams) {
      setRP(existingEvent.relocationParams);
      setRelocAge(existingEvent.age);
      if (existingEvent.relocationParams.newPropertyParams) {
        setNewPP(existingEvent.relocationParams.newPropertyParams);
      }
    }
  }, [existingEvent]);

  const uRP = (patch: Partial<RelocationParams>) => setRP(prev => ({ ...prev, ...patch }));
  const uPP = (patch: Partial<PropertyParams>) => setNewPP(prev => ({ ...prev, ...patch }));

  // Purchase calculations
  const loanAmount = (newPP.priceMan - newPP.downPaymentMan) * 10000;
  const fixedMonthly = calcMonthlyPaymentEqual(loanAmount, newPP.fixedRate, newPP.loanYears);
  const varInitMonthly = calcMonthlyPaymentEqual(loanAmount, newPP.variableInitRate, newPP.loanYears);
  const varRiskMonthly = calcMonthlyPaymentEqual(loanAmount, newPP.variableRiskRate, newPP.loanYears);
  const displayMonthly = newPP.rateType === "fixed" ? fixedMonthly : varInitMonthly;

  // Cost summary
  const annualCostRent = rp.newRentAnnualMan || 0;
  const annualCostPurchase = Math.round(displayMonthly * 12 / 10000) + newPP.maintenanceMonthlyMan * 12 + newPP.taxAnnualMan;

  const handleSave = () => {
    const params: RelocationParams = {
      ...rp,
      newPropertyParams: rp.newHousingType === "purchase" ? newPP : undefined,
    };
    const event: LifeEvent = {
      id: existingEvent?.id || Date.now(),
      age: relocAge,
      type: "relocation",
      label: rp.newHousingType === "purchase"
        ? `住み替え(購入${newPP.priceMan}万)`
        : `住み替え(賃貸${rp.newRentAnnualMan}万/年)`,
      oneTimeCostMan: 0,
      annualCostMan: 0,
      durationYears: 0,
      relocationParams: params,
    };
    onSave(event);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`🏡 住み替え${existingEvent ? "（編集）" : ""}`}
      onSave={handleSave} saveLabel={existingEvent ? "更新" : "追加"}>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">住み替え年齢</label>
              <input type="number" value={relocAge} min={currentAge} max={99}
                onChange={e => setRelocAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">引越費用（万円）</label>
              <input type="number" value={rp.movingCostMan} step={10} min={0}
                onChange={e => uRP({ movingCostMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
          </div>

          {/* Housing type selection */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">新居タイプ</label>
            <div className="flex gap-2">
              <button onClick={() => uRP({ newHousingType: "purchase" })}
                className={`rounded px-3 py-1 ${rp.newHousingType === "purchase" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>購入</button>
              <button onClick={() => uRP({ newHousingType: "rent" })}
                className={`rounded px-3 py-1 ${rp.newHousingType === "rent" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>賃貸</button>
            </div>
          </div>

          {/* Rent options */}
          {rp.newHousingType === "rent" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-gray-600 mb-1">年間家賃（万円）</label>
                <input type="number" value={rp.newRentAnnualMan ?? 120} step={10} min={0}
                  onChange={e => uRP({ newRentAnnualMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
              </div>
              <div>
                <label className="block font-semibold text-gray-600 mb-1">賃貸期間（年）</label>
                <input type="number" value={rp.newRentDurationYears ?? 25} min={1} max={50}
                  onChange={e => uRP({ newRentDurationYears: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
              </div>
            </div>
          )}

          {/* Purchase options */}
          {rp.newHousingType === "purchase" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-600 mb-1">物件価格（万円）</label>
                  <input type="number" value={newPP.priceMan} step={100}
                    onChange={e => uPP({ priceMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-600 mb-1">頭金（万円）</label>
                  <input type="number" value={newPP.downPaymentMan} step={100}
                    onChange={e => uPP({ downPaymentMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-600 mb-1">ローン期間（年）</label>
                  <input type="number" value={newPP.loanYears} min={1} max={50}
                    onChange={e => uPP({ loanYears: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
                </div>
              </div>

              <div className="text-gray-500">借入額: <b>{(newPP.priceMan - newPP.downPaymentMan).toLocaleString()}万円</b>　諸費用: 約{Math.round(newPP.priceMan * 0.07)}万円（7%概算）</div>

              {/* Rate type */}
              <div className="rounded border p-3 space-y-2">
                <label className="block font-semibold text-gray-600">金利タイプ</label>
                <div className="flex gap-2">
                  <button onClick={() => uPP({ rateType: "fixed" })}
                    className={`rounded px-3 py-1 ${newPP.rateType === "fixed" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>固定金利</button>
                  <button onClick={() => uPP({ rateType: "variable" })}
                    className={`rounded px-3 py-1 ${newPP.rateType === "variable" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>変動金利</button>
                </div>

                {newPP.rateType === "fixed" ? (
                  <div>
                    <label className="block text-gray-500 mb-1">固定金利（%）</label>
                    <input type="number" value={newPP.fixedRate} step={0.1} min={0}
                      onChange={e => uPP({ fixedRate: Number(e.target.value) })} className="w-32 rounded border px-2 py-1" />
                    <div className="mt-1 text-gray-400">月額返済: <b>{Math.round(fixedMonthly / 10000).toLocaleString()}万円</b></div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-gray-500 mb-1">当初金利（%）</label>
                        <input type="number" value={newPP.variableInitRate} step={0.1} min={0}
                          onChange={e => uPP({ variableInitRate: Number(e.target.value) })} className="w-full rounded border px-2 py-1" />
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">上昇後（%）</label>
                        <input type="number" value={newPP.variableRiskRate} step={0.1} min={0}
                          onChange={e => uPP({ variableRiskRate: Number(e.target.value) })} className="w-full rounded border px-2 py-1" />
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">上昇開始（年後）</label>
                        <input type="number" value={newPP.variableRiseAfter} min={1} max={newPP.loanYears}
                          onChange={e => uPP({ variableRiseAfter: Number(e.target.value) })} className="w-full rounded border px-2 py-1" />
                      </div>
                    </div>
                    <div className="rounded bg-amber-50 p-2 text-amber-700">
                      <div>当初{newPP.variableRiseAfter}年: <b>{Math.round(varInitMonthly / 10000).toLocaleString()}万円/月</b></div>
                      <div>{newPP.variableRiseAfter}年後〜: <b>{Math.round(varRiskMonthly / 10000).toLocaleString()}万円/月</b>（+{Math.round((varRiskMonthly - varInitMonthly) / 10000).toLocaleString()}万）</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-600 mb-1">管理費・修繕（万円/月）</label>
                  <input type="number" value={newPP.maintenanceMonthlyMan} step={0.5} min={0}
                    onChange={e => uPP({ maintenanceMonthlyMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-600 mb-1">固定資産税（万円/年）</label>
                  <input type="number" value={newPP.taxAnnualMan} step={1} min={0}
                    onChange={e => uPP({ taxAnnualMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
                </div>
              </div>
            </>
          )}

          {/* Cost summary */}
          <div className="rounded bg-blue-50 p-2 text-gray-700">
            <div className="font-bold mb-1">コストまとめ</div>
            <div>引越費用: {rp.movingCostMan}万円（一時）</div>
            {rp.newHousingType === "rent" ? (
              <>
                <div>年間家賃: {annualCostRent}万円/年</div>
                <div>賃貸期間: {rp.newRentDurationYears ?? 25}年</div>
                <div className="font-bold mt-1">
                  住居費総額: 約{rp.movingCostMan + annualCostRent * (rp.newRentDurationYears ?? 25)}万円
                </div>
              </>
            ) : (
              <>
                <div>ローン返済: {Math.round(displayMonthly * 12 / 10000)}万円/年</div>
                <div>管理費等: {newPP.maintenanceMonthlyMan * 12}万円/年</div>
                <div>固定資産税: {newPP.taxAnnualMan}万円/年</div>
                <div className="font-bold mt-1">
                  初年度合計: 約{rp.movingCostMan + newPP.downPaymentMan + Math.round(newPP.priceMan * 0.07)}万円（初期）+ {annualCostPurchase}万円/年
                </div>
              </>
            )}
          </div>

    </Modal>
  );
}
