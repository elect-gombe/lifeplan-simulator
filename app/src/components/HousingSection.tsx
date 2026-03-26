import React, { useState, useMemo } from "react";
import type { LifeEvent, Scenario, PropertyParams, HousingPhase } from "../lib/types";
import { Section } from "./Section";
import { Modal } from "./ui";
import { PropertyModal } from "./PropertyModal";
import { HousingPhaseBar } from "./HousingPhaseBar";
import { buildLoanSchedule } from "../lib/calc";
import { calcPropertyCapitalGainsTax } from "../lib/tax";

// ===== Housing Timeline Section =====

export function HousingSection({ s, onChange, currentAge, retirementAge, open, onToggle, allEvents, isLinked, baseScenario }: {
  s: Scenario; onChange: (s: Scenario) => void;
  currentAge: number; retirementAge: number;
  open: boolean; onToggle: () => void;
  allEvents: LifeEvent[];
  isLinked?: boolean; baseScenario?: Scenario | null;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addingType, setAddingType] = useState<"rent" | "own" | null>(null);
  const linked = !!(isLinked && baseScenario);
  const inheritedFromBase = !s.housingTimeline && linked && !!baseScenario?.housingTimeline;

  // External trigger to open edit modal (from timeline click)
  React.useEffect(() => {
    const idx = (s as any)._housingEditIdx;
    if (idx != null && open) {
      setEditingIdx(idx);
      // Clear the trigger
      const { _housingEditIdx, ...clean } = s as any;
      onChange(clean);
    }
  }, [(s as any)._housingEditIdx, open]);
  const DEFAULT_PP: PropertyParams = {
    priceMan: 5000, downPaymentMan: 500, loanYears: 35, repaymentType: "equal_payment",
    rateType: "variable", fixedRate: 1.8, variableInitRate: 0.5, variableRiskRate: 1.5, variableRiseAfter: 10,
    maintenanceMonthlyMan: 2, taxAnnualMan: 15, hasLoanDeduction: true,
    loanStructure: "single", pairRatio: 50, deductionTarget: "self", danshinTarget: "self",
  };

  const phases: HousingPhase[] = useMemo(() => {
    if (s.housingTimeline?.length) return s.housingTimeline;
    if (inheritedFromBase && baseScenario?.housingTimeline) return baseScenario.housingTimeline;
    return [{ startAge: currentAge, type: "rent" as const, rentMonthlyMan: 10 }];
  }, [s.housingTimeline, inheritedFromBase, baseScenario?.housingTimeline, currentAge]);

  const setPhases = (p: HousingPhase[]) => onChange({ ...s, housingTimeline: p });
  const updatePhase = (i: number, patch: Partial<HousingPhase>) => { const np = [...phases]; np[i] = { ...np[i], ...patch }; setPhases(np); };
  const removePhase = (i: number) => {
    const np = [...phases];
    // 前フェーズが持家で売却年齢が削除するフェーズに連動していたらクリア
    if (i > 0 && np[i - 1].type === "own" && np[i - 1].propertyParams?.saleAge === np[i].startAge) {
      np[i - 1] = { ...np[i - 1], propertyParams: { ...np[i - 1].propertyParams!, saleAge: undefined, salePriceMan: undefined, appreciationRate: undefined } };
    }
    const result = np.filter((_, j) => j !== i);
    setPhases(result.length ? result : [{ startAge: currentAge, type: "rent", rentMonthlyMan: 10 }]);
  };

  const simEnd = s.simEndAge ?? 85;
  const phaseEnd = (i: number) => i < phases.length - 1 ? phases[i + 1].startAge : simEnd;
  const isManaged = !!s.housingTimeline;
  const isReadOnly = inheritedFromBase && !isManaged;
  const canEdit = isManaged && !isReadOnly;
  if (!s.housingTimeline && !isReadOnly) { setTimeout(() => setPhases(phases), 0); }

  const saleEstimate = (phase: HousingPhase, nextAge: number) => {
    if (phase.type !== "own" || !phase.propertyParams) return null;
    const pp = phase.propertyParams, ys = nextAge - phase.startAge;
    if (ys <= 0) return null;
    const price = pp.priceMan * 10000;
    const sp = pp.salePriceMan != null ? pp.salePriceMan * 10000 : Math.round(price * Math.pow(1 + (pp.appreciationRate ?? -1) / 100, ys));
    const sch = buildLoanSchedule(pp, phase.startAge);
    const rem = ys < sch.length ? sch[ys]?.balance ?? 0 : 0;
    const cgt = calcPropertyCapitalGainsTax(price, sp, ys, pp.saleIsResidence ?? true, pp.saleCostRate ?? 4);
    const cost = Math.round(sp * (pp.saleCostRate ?? 4) / 100);
    return { sp, rem, cost, tax: cgt.tax, net: sp - rem - cost - cgt.tax };
  };

  const summary = phases.map((p, i) => p.type === "rent" ? `賃貸${p.startAge}-${phaseEnd(i)}` : `持家${p.startAge}-${phaseEnd(i)}`).join("→");
  const [tempPhase, setTempPhase] = useState<HousingPhase | null>(null);

  const openAdd = (type: "rent" | "own") => {
    const lastEnd = phases.length > 0 ? phases[phases.length - 1].startAge + 10 : currentAge;
    setTempPhase(type === "rent" ? { startAge: lastEnd, type: "rent", rentMonthlyMan: 10 } : { startAge: lastEnd, type: "own", propertyParams: { ...DEFAULT_PP } });
    setAddingType(type);
  };
  const saveNewPhase = (phase: HousingPhase) => { setPhases([...phases, phase].sort((a, b) => a.startAge - b.startAge)); setAddingType(null); setTempPhase(null); };
  const editPhase = editingIdx != null ? phases[editingIdx] : null;

  return (
    <Section id="housing-section" title="住居プラン" icon="🏠" borderColor="#3b82f6" bgOpen="bg-blue-50/30" open={open} onToggle={onToggle}
      linked={isReadOnly} badge={<span className="font-normal text-gray-400 text-[10px]">({summary})</span>}
      right={linked && baseScenario?.housingTimeline ? (
        <button onClick={() => isReadOnly ? setPhases([...phases]) : onChange({ ...s, housingTimeline: undefined })}
          className={`text-[10px] px-1.5 py-0.5 rounded ${isReadOnly ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-600"}`}
          title={isReadOnly ? "Aにリンク中（クリックで独自設定）" : "独自設定中（クリックでAにリンク）"}
        >{isReadOnly ? "🔗A" : "✏️独自"}</button>
      ) : undefined}>
      <div className="space-y-1.5">
        <HousingPhaseBar phases={phases} currentAge={currentAge} endAge={simEnd}
          onPhaseClick={canEdit ? (i) => setEditingIdx(i) : undefined} />

        {phases.map((p, i) => {
          const end = phaseEnd(i);
          const next = i < phases.length - 1 ? phases[i + 1] : null;
          const sale = next ? saleEstimate(p, end) : null;
          return (
            <div key={i} className={`rounded border p-1.5 text-[10px] space-y-0.5 ${p.type === "own" ? "border-blue-200 bg-blue-50/30" : "border-gray-200"}`}>
              <div className="flex items-center gap-1.5">
                <span className="font-bold">{p.type === "own" ? "🏠" : "🏢"}</span>
                <span className="text-gray-500">{p.startAge}〜{end}歳</span>
                {p.type === "rent" && <span className="text-gray-600">{p.rentMonthlyMan}万/月（年{(p.rentMonthlyMan ?? 0) * 12}万）</span>}
                {p.type === "own" && p.propertyParams && <span className="text-blue-600">{p.propertyParams.priceMan}万</span>}
                {canEdit && <button onClick={() => setEditingIdx(i)} className="text-blue-500 hover:underline ml-auto">✏️</button>}
                {canEdit && phases.length > 1 && <button onClick={() => removePhase(i)} className="text-gray-300 hover:text-red-500">×</button>}
              </div>
              {sale && p.type === "own" && (
                <div className="flex flex-wrap items-center gap-1 text-[9px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                  →売却 {Math.round(sale.sp / 10000)}万 残債{Math.round(sale.rem / 10000)}万 税{Math.round(sale.tax / 10000)}万
                  <span className="font-bold text-green-700">手取{Math.round(sale.net / 10000)}万</span>
                  {next?.type === "own" && next.propertyParams && <span className="text-blue-600">→頭金{next.propertyParams.downPaymentMan}万</span>}
                </div>
              )}
            </div>
          );
        })}

        {canEdit && (
          <div className="flex gap-1.5">
            <button onClick={() => openAdd("rent")} className="rounded border px-2 py-0.5 text-[10px] hover:bg-gray-50">+ 🏢 賃貸</button>
            <button onClick={() => openAdd("own")} className="rounded border px-2 py-0.5 text-[10px] hover:bg-blue-50">+ 🏠 購入</button>
          </div>
        )}

        {/* 賃貸モーダル（編集） */}
        {editingIdx != null && editPhase?.type === "rent" && (
          <Modal isOpen={true} onClose={() => setEditingIdx(null)} title="🏢 賃貸設定" onSave={() => setEditingIdx(null)} saveLabel="閉じる">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-semibold text-gray-600 mb-1">開始年齢</label>
                <input type="number" value={editPhase.startAge} min={currentAge} max={simEnd - 1}
                  onChange={e => updatePhase(editingIdx, { startAge: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
              <div><label className="block font-semibold text-gray-600 mb-1">月額家賃（万円/月）</label>
                <input type="number" value={editPhase.rentMonthlyMan ?? 10} step={0.5} min={0}
                  onChange={e => updatePhase(editingIdx, { rentMonthlyMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
            </div>
            <div className="rounded bg-blue-50 p-2 text-gray-700">年額: <b>{((editPhase.rentMonthlyMan ?? 10) * 12)}万円/年</b></div>
          </Modal>
        )}
        {/* 賃貸モーダル（新規） */}
        {addingType === "rent" && tempPhase && (
          <Modal isOpen={true} onClose={() => { setAddingType(null); setTempPhase(null); }} title="🏢 賃貸追加"
            onSave={() => saveNewPhase(tempPhase)} saveLabel="追加">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-semibold text-gray-600 mb-1">開始年齢</label>
                <input type="number" value={tempPhase.startAge} min={currentAge} max={simEnd - 1}
                  onChange={e => setTempPhase({ ...tempPhase, startAge: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
              <div><label className="block font-semibold text-gray-600 mb-1">月額家賃（万円/月）</label>
                <input type="number" value={tempPhase.rentMonthlyMan ?? 10} step={0.5} min={0}
                  onChange={e => setTempPhase({ ...tempPhase, rentMonthlyMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
            </div>
            <div className="rounded bg-blue-50 p-2 text-gray-700">年額: <b>{((tempPhase.rentMonthlyMan ?? 10) * 12)}万円/年</b></div>
          </Modal>
        )}
        {/* 購入モーダル（編集） */}
        {editingIdx != null && editPhase?.type === "own" && editPhase.propertyParams && (() => {
          // 次フェーズがあれば売却年齢を自動設定
          const nextPhaseStartAge = editingIdx < phases.length - 1 ? phases[editingIdx + 1].startAge : undefined;
          const ppWithSale = nextPhaseStartAge
            ? { ...editPhase.propertyParams, saleAge: editPhase.propertyParams.saleAge ?? nextPhaseStartAge }
            : editPhase.propertyParams;
          return <PropertyModal isOpen={true} onClose={() => setEditingIdx(null)}
            onSave={(evt) => {
              if (evt.propertyParams) {
                updatePhase(editingIdx, { propertyParams: evt.propertyParams, startAge: evt.age });
                // 売却年齢が変更されたら次フェーズのstartAgeも連動
                if (evt.propertyParams.saleAge && editingIdx < phases.length - 1) {
                  const np = [...phases];
                  np[editingIdx + 1] = { ...np[editingIdx + 1], startAge: evt.propertyParams.saleAge };
                  np[editingIdx] = { ...np[editingIdx], propertyParams: evt.propertyParams, startAge: evt.age };
                  setPhases(np);
                }
              }
              setEditingIdx(null);
            }}
            currentAge={editPhase.startAge} retirementAge={simEnd}
            existingEvent={{ id: -1, age: editPhase.startAge, type: "property", label: "", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, propertyParams: ppWithSale }} />;
        })()}
        {/* 購入モーダル（新規） */}
        {addingType === "own" && tempPhase?.propertyParams && (
          <PropertyModal isOpen={true} onClose={() => { setAddingType(null); setTempPhase(null); }}
            onSave={(evt) => { if (evt.propertyParams) saveNewPhase({ startAge: evt.age, type: "own", propertyParams: evt.propertyParams }); }}
            currentAge={tempPhase.startAge} retirementAge={simEnd} />
        )}
      </div>
    </Section>
  );
}
