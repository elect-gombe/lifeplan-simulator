import React, { useState, useEffect, useMemo } from "react";
import type { LifeEvent, RelocationParams, PropertyParams } from "../lib/types";
import { resolveEventAge } from "../lib/types";
import { buildLoanSchedule } from "../lib/calc";
import { calcPropertyCapitalGainsTax } from "../lib/tax";
import { Modal, NumIn, NumField, Btns, Check } from "./ui";
import { PropertyFormWithPreview } from "./PropertyForm";
import { DEFAULT_PROPERTY_PARAMS } from "./PropertyModal";
import type { EventModalBaseProps } from "./EventModal";

export function RelocationModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent, allEvents, onUpdatePropertySale }: EventModalBaseProps & {
  allEvents?: LifeEvent[];
  onUpdatePropertySale?: (propertyEventId: number, patch: Partial<PropertyParams>) => void;
}) {
  // 既存物件
  const existingPropertyEvents = useMemo(() =>
    (allEvents || []).filter(e => e.propertyParams && !e.disabled && e.type === "property"), [allEvents]);
  const existingProp = existingPropertyEvents[0] ?? null;
  const existingPurchaseAge = existingProp ? resolveEventAge(existingProp, allEvents || []) : 0;

  // 初期relocAge: 既存リロケーションイベント > 既存物件のsaleAge > 60歳
  const initialAge = existingEvent?.age ?? existingProp?.propertyParams?.saleAge ?? 60;
  const [relocAge, setRelocAge] = useState(initialAge);
  const [rp, setRP] = useState<RelocationParams>({
    movingCostMan: 50, newHousingType: "rent", newRentAnnualMan: 120, newRentDurationYears: 25,
  });
  const [newPP, setNewPP] = useState<PropertyParams>({
    ...DEFAULT_PROPERTY_PARAMS, priceMan: 3000, downPaymentMan: 1000, loanYears: 25,
    maintenanceMonthlyMan: 1.5, taxAnnualMan: 10,
  });
  const [useSaleProceeds, setUseSaleProceeds] = useState(true);

  // 売却元のPPをローカルに持つ
  const [salePP, setSalePP] = useState<PropertyParams | null>(null);
  useEffect(() => {
    if (existingProp?.propertyParams) {
      const epp = existingProp.propertyParams;
      setSalePP({
        ...epp,
        saleAge: relocAge,
        saleIsResidence: epp.saleIsResidence ?? true,
        saleCostRate: epp.saleCostRate ?? 4,
        appreciationRate: epp.appreciationRate ?? -1,
      });
      // 既存物件にsaleAgeが設定済みならrelocAgeをそちらに合わせる
      if (epp.saleAge && !existingEvent) setRelocAge(epp.saleAge);
    }
  }, [existingProp?.id]);

  // relocAge変更 → salePP.saleAge連動 + 既存物件にリアルタイム反映
  const handleRelocAgeChange = (age: number) => {
    setRelocAge(age);
    if (salePP) setSalePP(prev => prev ? { ...prev, saleAge: age } : prev);
    // リアルタイムで既存物件のsaleAgeを更新
    if (existingProp && onUpdatePropertySale) {
      onUpdatePropertySale(existingProp.id, { saleAge: age });
    }
  };

  useEffect(() => {
    if (existingEvent?.relocationParams) {
      setRP(existingEvent.relocationParams);
      setRelocAge(existingEvent.age);
      if (existingEvent.relocationParams.newPropertyParams) setNewPP(existingEvent.relocationParams.newPropertyParams);
    }
  }, [existingEvent]);

  const uRP = (patch: Partial<RelocationParams>) => setRP(prev => ({ ...prev, ...patch }));

  // 売却見積もり
  const saleEstimate = useMemo(() => {
    if (!salePP) return null;
    const yearsSince = relocAge - existingPurchaseAge;
    if (yearsSince <= 0) return null;
    const purchasePrice = salePP.priceMan * 10000;
    const appRate = (salePP.appreciationRate ?? -1) / 100;
    const salePrice = salePP.salePriceMan != null ? salePP.salePriceMan * 10000 : Math.round(purchasePrice * Math.pow(1 + appRate, yearsSince));
    const schedule = buildLoanSchedule(salePP, existingPurchaseAge);
    const remainingLoan = yearsSince < schedule.length ? schedule[yearsSince]?.balance ?? 0 : 0;
    const costRate = salePP.saleCostRate ?? 4;
    const cgt = calcPropertyCapitalGainsTax(purchasePrice, salePrice, yearsSince, salePP.saleIsResidence ?? true, costRate);
    const transferCost = Math.round(salePrice * costRate / 100);
    const netProceeds = salePrice - remainingLoan - transferCost - cgt.tax;
    return { salePrice, remainingLoan, transferCost, tax: cgt.tax, netProceeds, cgt, yearsSince };
  }, [salePP, relocAge, existingPurchaseAge]);

  // 頭金に反映
  useEffect(() => {
    if (useSaleProceeds && saleEstimate && saleEstimate.netProceeds > 0 && rp.newHousingType === "purchase") {
      setNewPP(prev => ({ ...prev, downPaymentMan: Math.max(Math.round(saleEstimate.netProceeds / 10000), 0) }));
    }
  }, [useSaleProceeds, saleEstimate?.netProceeds, rp.newHousingType]);

  const handleSave = () => {
    // 既存物件の売却設定を自動反映
    if (existingProp && salePP && onUpdatePropertySale) {
      onUpdatePropertySale(existingProp.id, {
        saleAge: relocAge,
        appreciationRate: salePP.appreciationRate,
        salePriceMan: salePP.salePriceMan,
        saleIsResidence: salePP.saleIsResidence,
        saleCostRate: salePP.saleCostRate,
      });
    }
    onSave({
      id: existingEvent?.id || Date.now(),
      age: relocAge, type: "relocation",
      label: rp.newHousingType === "purchase" ? `住み替え(購入${newPP.priceMan}万)` : `住み替え(賃貸${rp.newRentAnnualMan}万/年)`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
      relocationParams: { ...rp, newPropertyParams: rp.newHousingType === "purchase" ? newPP : undefined },
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`🏡 住み替え${existingEvent ? "（編集）" : ""}`}
      onSave={handleSave} saveLabel={existingEvent ? "更新" : "追加"} wide>

      {/* ヘッダー設定 */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <NumIn label="住み替え年齢" value={relocAge} onChange={v => handleRelocAgeChange(v)} min={currentAge} max={99} unit="歳" fill />
        </div>
        <div>
          <NumIn label="引越費用" value={rp.movingCostMan} onChange={v => uRP({ movingCostMan: v })} step={10} min={0} unit="万円" fill />
        </div>
        <div>
          <label className="block font-semibold text-gray-600 mb-1">新居タイプ</label>
          <Btns options={[{ value: "purchase" as const, label: "購入" }, { value: "rent" as const, label: "賃貸" }]} value={rp.newHousingType} onChange={v => uRP({ newHousingType: v })} />
        </div>
      </div>

      {/* ===== STEP 1: 売却元物件 ===== */}
      {salePP && saleEstimate && (
        <details className="rounded border border-amber-200 bg-amber-50/50 mb-3" open>
          <summary className="cursor-pointer px-3 py-2 font-bold text-amber-800 text-sm">
            Step 1: 現住居の売却 — {existingProp?.label ?? "物件"}（{existingPurchaseAge}歳購入 → {relocAge}歳売却）
            <span className="font-normal text-amber-600 ml-2">手取り: {Math.round(saleEstimate.netProceeds / 10000).toLocaleString()}万</span>
          </summary>
          <div className="px-3 pb-3 space-y-2">
            {/* 売却条件 */}
            <>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1 text-[10px]">
                <NumIn label="売却価格" value={salePP.salePriceMan ?? null} step={100} min={0} unit="万" small placeholder={`${Math.round(saleEstimate.salePrice / 10000)}`} help="空欄＝購入価格×変動率で自動"
                  onChange={v => setSalePP(prev => prev ? { ...prev, salePriceMan: v } : prev)}
                  onClear={() => setSalePP(prev => prev ? { ...prev, salePriceMan: undefined } : prev)} />
                <NumIn label="価値変動" value={salePP.appreciationRate ?? -1} onChange={v => setSalePP(prev => prev ? { ...prev, appreciationRate: v } : prev)} step={0.5} min={-10} max={10} unit="%/年" small />
                <NumIn label="売却費用" value={salePP.saleCostRate ?? 4} onChange={v => setSalePP(prev => prev ? { ...prev, saleCostRate: v } : prev)} step={0.5} min={0} max={10} unit="%" small />
                <span className="pb-1"><Check label="居住用控除" checked={salePP.saleIsResidence ?? true} onChange={v => setSalePP(prev => prev ? { ...prev, saleIsResidence: v } : prev)} accent="accent-amber-600" /></span>
              </div>
            </>

            {/* 試算カード */}
            <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
              <div className="rounded bg-white p-1.5">
                <div className="text-gray-500">売却価格</div>
                <div className="font-bold">{Math.round(saleEstimate.salePrice / 10000).toLocaleString()}万</div>
              </div>
              <div className="rounded bg-white p-1.5">
                <div className="text-gray-500">残ローン</div>
                <div className="font-bold text-red-600">{Math.round(saleEstimate.remainingLoan / 10000).toLocaleString()}万</div>
              </div>
              <div className="rounded bg-white p-1.5">
                <div className="text-gray-500">売却費用</div>
                <div className="font-bold">{Math.round(saleEstimate.transferCost / 10000).toLocaleString()}万</div>
              </div>
              <div className="rounded bg-white p-1.5">
                <div className="text-gray-500">譲渡税</div>
                <div className="font-bold">{Math.round(saleEstimate.tax / 10000).toLocaleString()}万</div>
                <div className="text-[8px] text-gray-400">{saleEstimate.cgt.isLongTerm ? "長期20.3%" : "短期39.6%"}</div>
              </div>
              <div className="rounded bg-green-100 p-1.5">
                <div className="text-green-700 font-semibold">手取り</div>
                <div className="font-bold text-green-800">{Math.round(saleEstimate.netProceeds / 10000).toLocaleString()}万</div>
              </div>
            </div>

            {saleEstimate.netProceeds < 0 && (
              <div className="text-red-600 text-[10px] font-bold">残債超過: 売却手取りがマイナスです</div>
            )}
          </div>
        </details>
      )}

      {!existingProp && (
        <div className="text-[10px] text-gray-400 mb-3 px-1">住宅購入イベントがないため売却見積もりは表示されません</div>
      )}

      {/* ===== STEP 2: 新居 ===== */}
      {rp.newHousingType === "rent" ? (
        <div className="space-y-3">
          <div className="font-bold text-gray-700 text-sm">Step 2: 新居（賃貸）</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <NumIn label="年間家賃" value={rp.newRentAnnualMan ?? 120} onChange={v => uRP({ newRentAnnualMan: v })} step={10} min={0} unit="万円" fill />
            </div>
            <div>
              <NumIn label="賃貸期間" value={rp.newRentDurationYears ?? 25} onChange={v => uRP({ newRentDurationYears: v })} min={1} max={50} unit="年" fill />
            </div>
          </div>
          <div className="rounded bg-blue-50 p-2 text-gray-700">
            <div className="font-bold">住居費: 引越{rp.movingCostMan}万 + 家賃{rp.newRentAnnualMan ?? 120}万/年 × {rp.newRentDurationYears ?? 25}年 = 約{rp.movingCostMan + (rp.newRentAnnualMan ?? 120) * (rp.newRentDurationYears ?? 25)}万円</div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="font-bold text-gray-700 text-sm">Step 2: 新居（購入）</div>
            {saleEstimate && saleEstimate.netProceeds > 0 && (
              <label className="flex items-center gap-1 cursor-pointer text-[10px]">
                <input type="checkbox" checked={useSaleProceeds} onChange={e => setUseSaleProceeds(e.target.checked)} className="accent-green-600" />
                <span className="text-green-700">売却手取り{Math.round(saleEstimate.netProceeds / 10000).toLocaleString()}万→頭金</span>
              </label>
            )}
          </div>
          <PropertyFormWithPreview pp={newPP} onChange={setNewPP} purchaseAge={relocAge} />
        </div>
      )}
    </Modal>
  );
}
