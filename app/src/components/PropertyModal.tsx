import React, { useState, useEffect } from "react";
import type { LifeEvent, PropertyParams } from "../lib/types";
import { calcMonthlyPaymentEqual, loanBalanceAfterYears } from "../lib/calc";

export function PropertyModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number;
  retirementAge: number;
  existingEvent?: LifeEvent | null;
}) {
  const defaults: PropertyParams = {
    priceMan: 5000, downPaymentMan: 500, loanYears: 35,
    repaymentType: "equal_payment",
    rateType: "variable", fixedRate: 1.8,
    variableInitRate: 0.5, variableRiskRate: 1.5, variableRiseAfter: 10,
    maintenanceMonthlyMan: 2, taxAnnualMan: 15, hasLoanDeduction: true,
    loanStructure: "single", pairRatio: 50,
    deductionTarget: "self", danshinTarget: "self",
  };

  const [purchaseAge, setPurchaseAge] = useState(currentAge + 5);
  const [pp, setPP] = useState<PropertyParams>(defaults);

  useEffect(() => {
    if (existingEvent?.propertyParams) {
      setPP(existingEvent.propertyParams);
      setPurchaseAge(existingEvent.age);
    }
  }, [existingEvent]);

  if (!isOpen) return null;

  const u = (patch: Partial<PropertyParams>) => setPP(prev => ({ ...prev, ...patch }));
  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;

  const isPrincipalEqual = pp.repaymentType === "equal_principal";
  const fixedMonthly = isPrincipalEqual
    ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (pp.fixedRate / 100 / 12))
    : calcMonthlyPaymentEqual(loanAmount, pp.fixedRate, pp.loanYears);
  const varInitMonthly = isPrincipalEqual
    ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (pp.variableInitRate / 100 / 12))
    : calcMonthlyPaymentEqual(loanAmount, pp.variableInitRate, pp.loanYears);
  const varRiskMonthly = isPrincipalEqual
    ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (pp.variableRiskRate / 100 / 12))
    : calcMonthlyPaymentEqual(loanAmount, pp.variableRiskRate, pp.loanYears);
  const displayMonthly = pp.rateType === "fixed" ? fixedMonthly : varInitMonthly;

  // Loan balance at various points for preview
  const rate0 = pp.rateType === "fixed" ? pp.fixedRate : pp.variableInitRate;
  const bal5 = loanBalanceAfterYears(loanAmount, rate0, pp.loanYears, 5);
  const bal10 = loanBalanceAfterYears(loanAmount, rate0, pp.loanYears, 10);
  const bal13 = loanBalanceAfterYears(loanAmount, rate0, pp.loanYears, 13);
  const deductionYear1 = Math.min(Math.round(loanAmount * 0.007), 350000);
  const deductionYear13 = Math.min(Math.round(bal13 * 0.007), 350000);
  const totalDeduction13 = Array.from({ length: 13 }, (_, i) =>
    Math.min(Math.round(loanBalanceAfterYears(loanAmount, rate0, pp.loanYears, i) * 0.007), 350000)
  ).reduce((a, b) => a + b, 0);

  const handleSave = () => {
    const event: LifeEvent = {
      id: existingEvent?.id || Date.now(),
      age: purchaseAge,
      type: "property",
      label: `住宅(${pp.priceMan}万)`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, // 0=永続（管理費・固定資産税はローン完済後も継続）
      propertyParams: pp,
    };
    onSave(event);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3">
          <p className="text-sm font-bold">🏠 住宅購入{existingEvent ? "（編集）" : ""}</p>
        </div>
        <div className="p-4 space-y-4 text-xs">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">購入時年齢</label>
              <input type="number" value={purchaseAge} min={currentAge} max={retirementAge - 1}
                onChange={e => setPurchaseAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">物件価格（万円）</label>
              <input type="number" value={pp.priceMan} step={100}
                onChange={e => u({ priceMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">頭金（万円）</label>
              <input type="number" value={pp.downPaymentMan} step={100}
                onChange={e => u({ downPaymentMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">ローン期間（年）</label>
              <input type="number" value={pp.loanYears} min={1} max={50}
                onChange={e => u({ loanYears: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
          </div>

          <div className="text-gray-500">借入額: <b>{(pp.priceMan - pp.downPaymentMan).toLocaleString()}万円</b>　諸費用: 約{Math.round(pp.priceMan * 0.07)}万円（7%概算）</div>

          {/* Repayment type */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">返済方式</label>
            <div className="flex gap-2">
              <button onClick={() => u({ repaymentType: "equal_payment" })}
                className={`rounded px-3 py-1 ${pp.repaymentType !== "equal_principal" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>元利均等</button>
              <button onClick={() => u({ repaymentType: "equal_principal" })}
                className={`rounded px-3 py-1 ${pp.repaymentType === "equal_principal" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>元金均等</button>
            </div>
            <div className="text-gray-400 text-[10px]">
              {pp.repaymentType === "equal_principal"
                ? "元金均等: 毎月の元金返済額が一定。初期は返済額が大きいが総利息が少ない。"
                : "元利均等: 毎月の返済額が一定。返済額は変わらないが総利息が多い。"}
            </div>
          </div>

          {/* Rate type */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">金利タイプ</label>
            <div className="flex gap-2">
              <button onClick={() => u({ rateType: "fixed" })}
                className={`rounded px-3 py-1 ${pp.rateType === "fixed" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>固定金利</button>
              <button onClick={() => u({ rateType: "variable" })}
                className={`rounded px-3 py-1 ${pp.rateType === "variable" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>変動金利</button>
            </div>

            {pp.rateType === "fixed" ? (
              <div>
                <label className="block text-gray-500 mb-1">固定金利（%）</label>
                <input type="number" value={pp.fixedRate} step={0.1} min={0}
                  onChange={e => u({ fixedRate: Number(e.target.value) })} className="w-32 rounded border px-2 py-1" />
                <div className="mt-1 text-gray-400">月額返済: <b>{Math.round(fixedMonthly / 10000).toLocaleString()}万円</b></div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-gray-500 mb-1">当初金利（%）</label>
                    <input type="number" value={pp.variableInitRate} step={0.1} min={0}
                      onChange={e => u({ variableInitRate: Number(e.target.value) })} className="w-full rounded border px-2 py-1" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">上昇後（%）</label>
                    <input type="number" value={pp.variableRiskRate} step={0.1} min={0}
                      onChange={e => u({ variableRiskRate: Number(e.target.value) })} className="w-full rounded border px-2 py-1" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">上昇開始（年後）</label>
                    <input type="number" value={pp.variableRiseAfter} min={1} max={pp.loanYears}
                      onChange={e => u({ variableRiseAfter: Number(e.target.value) })} className="w-full rounded border px-2 py-1" />
                  </div>
                </div>
                <div className="rounded bg-amber-50 p-2 text-amber-700">
                  <div>当初{pp.variableRiseAfter}年: <b>{Math.round(varInitMonthly / 10000).toLocaleString()}万円/月</b></div>
                  <div>{pp.variableRiseAfter}年後〜: <b>{Math.round(varRiskMonthly / 10000).toLocaleString()}万円/月</b>（+{Math.round((varRiskMonthly - varInitMonthly) / 10000).toLocaleString()}万）</div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">管理費・修繕（万円/月）</label>
              <input type="number" value={pp.maintenanceMonthlyMan} step={0.5} min={0}
                onChange={e => u({ maintenanceMonthlyMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">固定資産税（万円/年）</label>
              <input type="number" value={pp.taxAnnualMan} step={1} min={0}
                onChange={e => u({ taxAnnualMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
          </div>

          {/* ローン構造: 単独 / ペアローン */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">ローン構造</label>
            <div className="flex gap-2">
              <button onClick={() => u({ loanStructure: "single" })}
                className={`rounded px-3 py-1 ${(pp.loanStructure || "single") === "single" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>単独ローン</button>
              <button onClick={() => u({ loanStructure: "pair" })}
                className={`rounded px-3 py-1 ${pp.loanStructure === "pair" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>ペアローン</button>
            </div>
            {pp.loanStructure === "pair" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">本人負担</span>
                  <input type="number" value={pp.pairRatio ?? 50} min={1} max={99} step={5}
                    onChange={e => u({ pairRatio: Number(e.target.value) })} className="w-16 rounded border px-2 py-1" />
                  <span className="text-gray-400">% / 配偶者 {100 - (pp.pairRatio ?? 50)}%</span>
                </div>
                <div className="text-gray-400 text-[10px]">
                  本人: {Math.round((pp.priceMan - pp.downPaymentMan) * (pp.pairRatio ?? 50) / 100)}万円
                  ／ 配偶者: {Math.round((pp.priceMan - pp.downPaymentMan) * (100 - (pp.pairRatio ?? 50)) / 100)}万円
                </div>
              </div>
            )}
          </div>

          {/* 団信の対象 */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">団信の対象</label>
            <div className="flex gap-2">
              {(["self", "spouse", "both"] as const).map(v => (
                <button key={v} onClick={() => u({ danshinTarget: v })}
                  className={`rounded px-3 py-1 ${(pp.danshinTarget || "self") === v ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                  {v === "self" ? "本人のみ" : v === "spouse" ? "配偶者のみ" : "両方"}
                </button>
              ))}
            </div>
            <div className="text-gray-400 text-[10px]">
              {pp.loanStructure === "pair"
                ? "ペアローンの場合、それぞれの負担分に対して団信が適用されます"
                : "単独ローンの場合、ローン名義人のみが対象です"}
            </div>
          </div>

          {/* 住宅ローン控除 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={pp.hasLoanDeduction} onChange={e => u({ hasLoanDeduction: e.target.checked })} className="accent-blue-600" />
            <span className="font-semibold text-gray-600">住宅ローン控除（13年間）</span>
          </label>
          {pp.hasLoanDeduction && (
            <div className="rounded border p-2 space-y-1">
              <label className="block text-gray-600 font-semibold text-[11px]">控除の対象</label>
              <div className="flex gap-2">
                {(["self", "spouse", "both"] as const).map(v => (
                  <button key={v} onClick={() => u({ deductionTarget: v })}
                    className={`rounded px-2 py-0.5 text-[10px] ${(pp.deductionTarget || "self") === v ? "bg-green-600 text-white" : "bg-gray-100"}`}>
                    {v === "self" ? "本人" : v === "spouse" ? "配偶者" : "両方"}
                  </button>
                ))}
              </div>
              <div className="text-gray-400 text-[10px]">
                {pp.loanStructure === "pair" && (pp.deductionTarget === "both" || !pp.deductionTarget)
                  ? `本人: 残高×${pp.pairRatio ?? 50}%×0.7% / 配偶者: 残高×${100 - (pp.pairRatio ?? 50)}%×0.7%`
                  : "単独の場合は名義人のみ。ペアローンでは各自の負担分に適用。"}
              </div>
            </div>
          )}

          {/* Loan deduction detail */}
          {pp.hasLoanDeduction && (
            <div className="rounded bg-green-50 p-2 text-green-800 space-y-0.5">
              <div className="font-bold">住宅ローン控除の推移（残高×0.7%、上限35万/年）</div>
              <div>1年目: 残高{Math.round(loanAmount / 10000)}万 → 控除 <b>¥{deductionYear1.toLocaleString()}</b>/年</div>
              <div>5年目: 残高{Math.round(bal5 / 10000)}万 → 控除 <b>¥{Math.min(Math.round(bal5 * 0.007), 350000).toLocaleString()}</b>/年</div>
              <div>10年目: 残高{Math.round(bal10 / 10000)}万 → 控除 <b>¥{Math.min(Math.round(bal10 * 0.007), 350000).toLocaleString()}</b>/年</div>
              <div>13年目: 残高{Math.round(bal13 / 10000)}万 → 控除 <b>¥{deductionYear13.toLocaleString()}</b>/年</div>
              <div className="border-t pt-1 font-bold">13年間の控除合計: 約{Math.round(totalDeduction13 / 10000)}万円</div>
            </div>
          )}

          {/* Annual summary */}
          <div className="rounded bg-blue-50 p-2 text-gray-700">
            <div className="font-bold mb-1">初年度の年間コスト</div>
            <div>ローン返済: {Math.round(displayMonthly * 12 / 10000)}万円</div>
            <div>管理費等: {pp.maintenanceMonthlyMan * 12}万円</div>
            <div>固定資産税: {pp.taxAnnualMan}万円</div>
            {pp.hasLoanDeduction && <div className="text-green-600">ローン控除: -{Math.round(deductionYear1 / 10000)}万円</div>}
            <div className="font-bold mt-1">
              合計: 約{Math.round(displayMonthly * 12 / 10000) + pp.maintenanceMonthlyMan * 12 + pp.taxAnnualMan - (pp.hasLoanDeduction ? Math.round(deductionYear1 / 10000) : 0)}万円/年
            </div>
          </div>
        </div>

        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={handleSave} className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white font-bold hover:bg-blue-700">{existingEvent ? "更新" : "追加"}</button>
        </div>
      </div>
    </div>
  );
}
