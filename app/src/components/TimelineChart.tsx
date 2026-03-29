import React, { useState, useCallback } from "react";
import { fmtMan } from "../lib/format";
import { EVENT_TYPES, resolveEventAge } from "../lib/types";
import type { ScenarioResult, LifeEvent, EventYearCost, HousingPhase, YearResult } from "../lib/types";
import { EXPENSE_CATS, type ExpenseCategory } from "./IncomeExpenseChart";
import { buildLoanSchedule, resolveScenarioField } from "../lib/calc";
import { HousingPhaseBar } from "./HousingPhaseBar";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

function yearExpensePcts(yr: YearResult): { label: string; pct: number; color: string }[] {
  const data: Record<ExpenseCategory, number> = { living: yr.baseLivingExpense, housing: 0, child: 0, car: 0, insurance: 0, other: 0 };
  for (const c of yr.eventCostBreakdown) {
    if (c.amount <= 0) continue;
    const cat = EXPENSE_CATS.find(cat => cat.key !== "living" && cat.key !== "other" && cat.match(c.label));
    data[cat ? cat.key : "other"] += c.amount;
  }
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  return EXPENSE_CATS.filter(c => data[c.key] > 0).map(c => ({ label: c.label, pct: Math.round(data[c.key] / total * 100), color: c.color }));
}

function yearIncomePcts(yr: YearResult): { label: string; pct: number; color: string }[] {
  const items: { label: string; value: number; color: string }[] = [
    { label: "本人給与", value: yr.self.gross, color: "#2563eb" },
    { label: "配偶者給与", value: yr.spouse.gross, color: "#ec4899" },
    { label: "年金", value: yr.self.pensionIncome + yr.spouse.pensionIncome, color: "#f59e0b" },
    { label: "遺族年金", value: yr.survivorIncome, color: "#8b5cf6" },
    { label: "児童手当", value: yr.childAllowance, color: "#10b981" },
    { label: "保険金", value: yr.insurancePayoutTotal, color: "#06b6d4" },
  ];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];
  return items.filter(i => i.value > 0).map(i => ({ label: i.label, pct: Math.round(i.value / total * 100), color: i.color }));
}

function usePersistedSet(key: string): [Set<number>, (fn: (prev: Set<number>) => Set<number>) => void] {
  const [set, setSet] = useState<Set<number>>(() => {
    try { const v = localStorage.getItem(key); return v ? new Set(JSON.parse(v)) : new Set(); } catch { return new Set(); }
  });
  const update = useCallback((fn: (prev: Set<number>) => Set<number>) => {
    setSet(prev => {
      const next = fn(prev);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [key]);
  return [set, update];
}

// 共通イベントバー描画（SVG内で使用）
export function EventBars({ events, allEvents, currentAge, endAge, xForAge, pT, barH, barGap, collapsedParents, onToggle }: {
  events: (LifeEvent & { _virtual?: boolean })[]; allEvents: LifeEvent[];
  currentAge: number; endAge: number;
  xForAge: (age: number) => number; pT: number; barH: number; barGap: number;
  collapsedParents?: Set<number>; onToggle?: (id: number) => void;
}) {
  return <>{events.map((evt, ei) => {
    const et = EVENT_TYPES[evt.type] || EVENT_TYPES.custom;
    const effectiveAge = resolveEventAge(evt, allEvents);
    const startX = xForAge(Math.max(effectiveAge, currentAge));
    const eEnd = evt.durationYears > 0 ? Math.min(effectiveAge + evt.durationYears, endAge) : endAge;
    const endX = xForAge(eEnd);
    const barY = pT + ei * barGap;
    const hasRealChildren = allEvents.some(c => c.parentId === evt.id);
    const hasStructured = !!(evt as any).propertyParams || !!(evt as any).carParams;
    const hintChildCount = (evt as any)._childCount as number | undefined;
    const isParent = !evt.parentId && (hasRealChildren || hasStructured || hintChildCount != null);
    const isChild = !!evt.parentId || !!(evt as any)._virtual;
    const isCollapsed = collapsedParents?.has(evt.id);
    const realChildCount = allEvents.filter(c => c.parentId === evt.id).length;
    const childCount = hintChildCount != null ? hintChildCount : hasStructured ? (() => {
      if (evt.propertyParams) {
        const pp = evt.propertyParams;
        let c = 3; // ローン + 控除or管理費 + 管理費
        if (pp.rateType === "variable" && pp.variableRiseAfter < pp.loanYears) c++;
        if (pp.hasLoanDeduction) c++;
        c += (pp.prepayments || []).filter(p => p.amountMan > 0).length;
        if (pp.refinance) c++;
        if (pp.saleAge) c++;
        return c;
      }
      return 2;
    })() : realChildCount;
    // 無効イベント: 親が無効なら子も無効
    const isDisabled = !!evt.disabled || (evt.parentId != null && !!allEvents.find(p => p.id === evt.parentId)?.disabled);
    const disabledOpacity = isDisabled ? 0.25 : 1;
    return (
      <g key={`ev${evt.id}_${ei}`} opacity={disabledOpacity}
        style={{ cursor: isParent && onToggle ? "pointer" : undefined }}
        onClick={isParent && onToggle && !(evt as any)._virtual ? (e) => { e.stopPropagation(); onToggle(evt.id); } : undefined}>
        <rect x={isChild ? startX + 8 : startX} y={barY} width={Math.max((isChild ? endX - startX - 8 : endX - startX), 4)} height={barH}
          rx={3} fill={isDisabled ? "#9ca3af" : et.color} opacity={isChild ? 0.15 : 0.25} />
        <rect x={isChild ? startX + 8 : startX} y={barY} width={3} height={barH} rx={1} fill={isDisabled ? "#9ca3af" : et.color} opacity={0.8} />
        <text x={(isChild ? startX + 14 : startX + 6)} y={barY + barH - 3} fontSize={8} fill={isDisabled ? "#9ca3af" : et.color} fontWeight="600"
          textDecoration={isDisabled ? "line-through" : undefined}>
          {isParent && onToggle ? (isCollapsed ? "▶ " : "▼ ") : ""}{et.icon} {evt.label} {effectiveAge}歳{evt.durationYears > 0 ? `〜${effectiveAge + evt.durationYears}歳` : "〜"}
          {evt.annualCostMan > 0 ? ` ${evt.annualCostMan}万/年` : ""}
          {evt.oneTimeCostMan > 0 ? ` +${evt.oneTimeCostMan}万` : ""}
          {isParent && isCollapsed ? ` (${childCount}件)` : ""}
        </text>
      </g>
    );
  })}</>;
}

export function TimelineChart({ results, currentAge, retirementAge, onYearClick, hoverAge, onHoverAge, onHousingClick }: {
  results: ScenarioResult[];
  currentAge: number;
  retirementAge: number;
  onYearClick?: (age: number) => void;
  hoverAge?: number | null;
  onHoverAge?: (age: number | null) => void;
  onHousingClick?: (phaseIndex: number) => void;
}) {
  const handleHover = (age: number | null) => { onHoverAge?.(age); };
  const [collapsedParents, setCollapsedParents] = usePersistedSet("sim-tl-collapsed");
  const [selectedScenario, setSelectedScenario] = useState(0);
  if (!results.length || !results[0].yearResults.length) return null;

  const totalYears = Math.max(retirementAge - currentAge, 1);
  // Clamp selectedScenario to valid range
  const selIdx = Math.min(selectedScenario, results.length - 1);
  const s0 = results[selIdx]?.scenario;
  const baseScenario = results[0]?.scenario;
  // Merge events: for linked scenarios, combine base events (minus excluded) + own events
  const mergedEvents: LifeEvent[] = (() => {
    if (!s0) return [];
    if (selIdx === 0 || !s0.linkedToBase || !baseScenario) return [...(s0.events || [])];
    const excludedIds = s0.excludedBaseEventIds || [];
    const disabledIds = s0.disabledBaseEventIds || [];
    const baseEvts = (baseScenario.events || []).filter(e => !excludedIds.includes(e.id))
      .map(e => (disabledIds.includes(e.id) || e.disabled) ? { ...e, disabled: true } : e);
    const ownEvts = s0.events || [];
    return [...baseEvts, ...ownEvts].sort((a, b) => a.age - b.age);
  })();
  const allEvents: LifeEvent[] = mergedEvents;

  // Resolve housingTimeline (own or inherited from base)
  const housingTimeline: HousingPhase[] | undefined = (() => {
    if (s0.housingTimeline?.length) return s0.housingTimeline;
    if (selIdx > 0 && s0.linkedToBase && baseScenario?.housingTimeline?.length) return baseScenario.housingTimeline;
    return undefined;
  })();
  const simEndAge = resolveScenarioField(s0, selIdx > 0 ? baseScenario : null, "simEndAge") ?? 85;

  // Build visible events: grouped by type (子供→住宅→車→保険→その他), then by age within group
  // If housingTimeline is active, filter out rent/property/relocation (replaced by housing phases)
  const eventsForDisplay = housingTimeline ? allEvents.filter(e => e.type !== "rent" && e.type !== "property" && e.type !== "relocation") : allEvents;
  const parentEvents = eventsForDisplay.filter(e => !e.parentId);
  const typeOrder: Record<string, number> = { child: 0, education: 0, property: 1, car: 2, insurance: 3, death: 4, marriage: 5, rent: 6, travel: 7, custom: 8 };
  const sortedParents = [...parentEvents].sort((a, b) => {
    const ta = typeOrder[a.type] ?? 8, tb = typeOrder[b.type] ?? 8;
    if (ta !== tb) return ta - tb;
    return resolveEventAge(a, allEvents) - resolveEventAge(b, allEvents);
  });
  const visibleEvents: (LifeEvent & { _virtual?: boolean })[] = [];

  // === Housing timeline phases (built for SVG sub-bars when expanded) ===
  const housingExpanded = housingTimeline && housingTimeline.length > 0 && !collapsedParents.has(-9000);
  if (housingExpanded && housingTimeline) {
    for (let pi = 0; pi < housingTimeline.length; pi++) {
      const phase = housingTimeline[pi];
      const nextPhase = pi < housingTimeline.length - 1 ? housingTimeline[pi + 1] : null;
      const phaseEndAge = nextPhase ? nextPhase.startAge : simEndAge;
      const bid = -9100 - pi * 100;
      const phaseCollapsed = collapsedParents.has(bid);

      if (phase.type === "rent") {
        visibleEvents.push({ id: bid, age: phase.startAge, type: "rent",
          label: `家賃(${phase.rentMonthlyMan ?? 0}万/月)`,
          oneTimeCostMan: 0, annualCostMan: (phase.rentMonthlyMan ?? 0) * 12,
          durationYears: phaseEndAge - phase.startAge,
        } as any);
      } else if (phase.type === "own" && phase.propertyParams) {
        const pp = phase.propertyParams;
        const hasLoan = (pp.priceMan - pp.downPaymentMan) > 0;
        const schedule = hasLoan ? buildLoanSchedule(pp, phase.startAge) : [];
        const effectiveLoanYears = schedule.length > 0 ? schedule.length : (hasLoan ? pp.loanYears : 0);
        const saleAge = nextPhase ? phaseEndAge : pp.saleAge;
        const ownershipEndAge = saleAge ?? simEndAge;

        // Count sub-bars for collapsed hint
        let subCount = 0;
        if (hasLoan) { subCount++; if (pp.rateType === "variable" && pp.variableRiseAfter < effectiveLoanYears) subCount++; if (pp.hasLoanDeduction) subCount++; subCount += (pp.prepayments || []).filter(p => p.amountMan > 0).length; if (pp.refinance) subCount++; }
        subCount++; // 管理費
        if (saleAge) subCount++;

        // Phase parent bar (collapsible)
        visibleEvents.push({ id: bid, age: phase.startAge, type: "property",
          label: `住宅(${pp.priceMan}万)`,
          oneTimeCostMan: pp.downPaymentMan, annualCostMan: 0,
          durationYears: ownershipEndAge - phase.startAge,
          _childCount: subCount,
        } as any);

        if (!phaseCollapsed) {
          if (hasLoan) {
            const loanDur = Math.min(effectiveLoanYears, (saleAge ?? 999) - phase.startAge);
            if (loanDur > 0) visibleEvents.push({ id: bid + 1, age: phase.startAge, type: "custom", _virtual: true,
              label: `ローン返済(${pp.rateType === "fixed" ? `固定${pp.fixedRate}%` : `変動${pp.variableInitRate}%`}${effectiveLoanYears !== pp.loanYears ? ` ${effectiveLoanYears}年` : ""})`,
              oneTimeCostMan: 0, annualCostMan: 0, durationYears: loanDur } as any);
            if (pp.rateType === "variable" && pp.variableRiseAfter < effectiveLoanYears) {
              const riseEnd = Math.min(effectiveLoanYears - pp.variableRiseAfter, (saleAge ?? 999) - phase.startAge - pp.variableRiseAfter);
              if (riseEnd > 0) visibleEvents.push({ id: bid + 2, age: phase.startAge + pp.variableRiseAfter, type: "custom", _virtual: true,
                label: `金利上昇→${pp.variableRiskRate}%`, oneTimeCostMan: 0, annualCostMan: 0, durationYears: riseEnd } as any);
            }
            if (pp.hasLoanDeduction) visibleEvents.push({ id: bid + 3, age: phase.startAge, type: "custom", _virtual: true,
              label: `住宅ローン控除(13年)`, oneTimeCostMan: 0, annualCostMan: 0, durationYears: Math.min(13, (saleAge ?? 999) - phase.startAge) } as any);
            for (const prep of pp.prepayments || []) {
              if (prep.amountMan > 0 && (!saleAge || prep.age < saleAge))
                visibleEvents.push({ id: bid + 50 + prep.age, age: prep.age, type: "custom", _virtual: true,
                  label: `繰上${prep.amountMan}万(${prep.type === "reduce" ? "軽減" : "短縮"})`, oneTimeCostMan: prep.amountMan, annualCostMan: 0, durationYears: 1 } as any);
            }
            if (pp.refinance && (!saleAge || pp.refinance.age < saleAge))
              visibleEvents.push({ id: bid + 80, age: pp.refinance.age, type: "custom", _virtual: true,
                label: `借換→${pp.refinance.newRate}%/${pp.refinance.newLoanYears}年`, oneTimeCostMan: pp.refinance.costMan, annualCostMan: 0, durationYears: 1 } as any);
          }
          visibleEvents.push({ id: bid + 4, age: phase.startAge, type: "custom", _virtual: true,
            label: `管理費・固定資産税`, oneTimeCostMan: 0, annualCostMan: pp.maintenanceMonthlyMan * 12 + pp.taxAnnualMan,
            durationYears: ownershipEndAge - phase.startAge } as any);
          if (saleAge) visibleEvents.push({ id: bid + 90, age: saleAge, type: "custom", _virtual: true,
            label: `売却${pp.salePriceMan ? pp.salePriceMan + "万" : "(自動)"}`, oneTimeCostMan: 0, annualCostMan: 0, durationYears: 1 } as any);
        }
      }
    }
  }

  for (const p of sortedParents) {
    visibleEvents.push(p);
    const realChildren = allEvents.filter(c => c.parentId === p.id);
    const hasStructured = !!p.propertyParams || !!p.carParams;

    if (!collapsedParents.has(p.id)) {
      if (realChildren.length > 0) {
        visibleEvents.push(...realChildren);
      }
      // Generate virtual sub-bars for structured events
      if (hasStructured && p.propertyParams) {
        const pp = p.propertyParams;
        const startAge = resolveEventAge(p, allEvents);
        const schedule = buildLoanSchedule(pp, startAge);
        const effectiveLoanYears = schedule.length > 0 ? schedule.length : pp.loanYears;
        const loanEndAge = startAge + effectiveLoanYears;
        const saleAge = pp.saleAge;
        const endAge = saleAge ?? loanEndAge;

        // Loan period (adjusted for prepayment shortening)
        visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.1, age: startAge, label: `ローン返済(${pp.rateType === "fixed" ? `固定${pp.fixedRate}%` : `変動${pp.variableInitRate}%`}${effectiveLoanYears !== pp.loanYears ? ` ${effectiveLoanYears}年` : ""})`, type: "custom", durationYears: Math.min(effectiveLoanYears, (saleAge ?? 999) - startAge), oneTimeCostMan: 0, annualCostMan: 0 } as any);
        if (pp.rateType === "variable" && pp.variableRiseAfter < effectiveLoanYears) {
          const riseEnd = Math.min(effectiveLoanYears - pp.variableRiseAfter, (saleAge ?? 999) - startAge - pp.variableRiseAfter);
          if (riseEnd > 0) visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.2, age: startAge + pp.variableRiseAfter, label: `金利上昇→${pp.variableRiskRate}%`, type: "custom", durationYears: riseEnd, oneTimeCostMan: 0, annualCostMan: 0 } as any);
        }
        if (pp.hasLoanDeduction) {
          visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.3, age: startAge, label: `住宅ローン控除(13年)`, type: "custom", durationYears: Math.min(13, (saleAge ?? 999) - startAge), oneTimeCostMan: 0, annualCostMan: 0 } as any);
        }
        // 繰上返済マーカー
        for (const prep of pp.prepayments || []) {
          if (prep.amountMan > 0 && (!saleAge || prep.age < saleAge)) {
            visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.5 + prep.age * 0.001, age: prep.age, label: `繰上${prep.amountMan}万(${prep.type === "reduce" ? "軽減" : "短縮"})`, type: "custom", durationYears: 1, oneTimeCostMan: prep.amountMan, annualCostMan: 0 } as any);
          }
        }
        // 借換マーカー
        if (pp.refinance && (!saleAge || pp.refinance.age < saleAge)) {
          visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.6, age: pp.refinance.age, label: `借換→${pp.refinance.newRate}%/${pp.refinance.newLoanYears}年`, type: "custom", durationYears: 1, oneTimeCostMan: pp.refinance.costMan, annualCostMan: 0 } as any);
        }
        // 売却マーカー
        if (saleAge) {
          visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.7, age: saleAge, label: `売却${pp.salePriceMan ? pp.salePriceMan + "万" : "(自動)"}`, type: "custom", durationYears: 1, oneTimeCostMan: 0, annualCostMan: 0 } as any);
        }
        // 管理費・固定資産税（売却まで or 永続）
        visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.4, age: startAge, label: `管理費・固定資産税`, type: "custom", durationYears: saleAge ? saleAge - startAge : 0, oneTimeCostMan: 0, annualCostMan: pp.maintenanceMonthlyMan * 12 + pp.taxAnnualMan } as any);
      }
      if (hasStructured && p.carParams) {
        const cp = p.carParams;
        const startAge = resolveEventAge(p, allEvents);
        visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.1, age: startAge, label: `維持費 ${cp.maintenanceAnnualMan + cp.insuranceAnnualMan}万/年`, type: "custom", durationYears: 0, oneTimeCostMan: 0, annualCostMan: 0 } as any);
        if (cp.replaceEveryYears > 0) {
          visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.2, age: startAge, label: `${cp.replaceEveryYears}年毎に買替 ${cp.priceMan}万`, type: "custom", durationYears: 0, oneTimeCostMan: 0, annualCostMan: 0 } as any);
        }
      }
    } else if (hasStructured) {
      // Collapsed: count virtual children
    }
  }

  // Orphans
  const orphans = allEvents.filter(e => e.parentId && !allEvents.some(p => p.id === e.parentId));
  visibleEvents.push(...orphans);

  const toggleParent = (id: number) => {
    setCollapsedParents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Layout
  const cW = 700;
  const eventBarH = Math.max(visibleEvents.length * 16, 16);
  const chartH = 180;
  const pL = 55, pR = 20, pT = 8, gap = 8, pB = 30;
  const cH = pT + eventBarH + gap + chartH + pB;
  const w = cW - pL - pR;
  const chartTop = pT + eventBarH + gap;
  // Percentage padding to match SVG pL/pR for the HTML housing bar
  const htPadL = `${(pL / cW) * 100}%`;
  const htPadR = `${(pR / cW) * 100}%`;

  const xStep = w / Math.max(totalYears - 1, 1);
  const xForAge = (age: number) => pL + (age - currentAge) * xStep;

  // Y scale: account for both positive (wealth) and negative (loan balance, negative savings)
  const allValues = results.flatMap(r => r.yearResults.flatMap(yr => [yr.totalWealth, yr.cumulativeDCAsset, yr.cumulativeSavings, yr.nisaAsset, yr.taxableAsset, yr.cashSavings, -yr.loanBalance])).filter(v => isFinite(v));
  const yMax = Math.max(...allValues, 1);
  const yMin = Math.min(...allValues, 0);
  const yRange = Math.max(yMax - yMin, 1);
  const yScale = chartH / yRange;
  const yForVal = (v: number) => chartTop + (yMax - v) * yScale;

  // Y ticks: positive and negative
  const yTickCount = 4;
  const yTicksPos = Array.from({ length: yTickCount + 1 }, (_, i) => (yMax / yTickCount) * i);
  const yTicksNeg = yMin < 0 ? Array.from({ length: Math.ceil(-yMin / (yRange / yTickCount)) }, (_, i) => -(yRange / yTickCount) * (i + 1)).filter(v => v >= yMin) : [];
  const yTicks = [...yTicksPos, ...yTicksNeg];

  const hoverData = hoverAge != null ? results.map(r => r.yearResults.find(yr => yr.age === hoverAge)) : null;

  return (
    <div>
      {/* Scenario switcher for event display */}
      {results.length > 1 && (
        <div className="flex gap-1 mb-1">
          {results.map((r, i) => (
            <button key={i} onClick={() => setSelectedScenario(i)}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${i === selIdx ? "text-white" : "bg-gray-100 text-gray-500"}`}
              style={i === selIdx ? { backgroundColor: COLORS[i] } : undefined}>
              {r.scenario.name} イベント
            </button>
          ))}
        </div>
      )}
      {/* === Housing colored bar (HTML, aligned with SVG) === */}
      {housingTimeline && housingTimeline.length > 0 && (
        <div className="mb-1" style={{ paddingLeft: htPadL, paddingRight: htPadR }}>
          <div className="flex items-center gap-1 mb-0.5 cursor-pointer select-none" onClick={() => toggleParent(-9000)}>
            <span className="text-[10px] font-bold text-gray-500">{collapsedParents.has(-9000) ? "▶" : "▼"} 🏠 住居プラン</span>
          </div>
          <HousingPhaseBar phases={housingTimeline} currentAge={currentAge} endAge={simEndAge}
            showAgeLabels={!collapsedParents.has(-9000)}
            onPhaseClick={onHousingClick} />
        </div>
      )}

      <svg viewBox={`0 0 ${cW} ${cH}`} className="block w-full cursor-crosshair" onMouseLeave={() => handleHover(null)}>

        {/* === Event bars === */}
        <EventBars events={visibleEvents} allEvents={allEvents} currentAge={currentAge} endAge={retirementAge}
          xForAge={xForAge} pT={pT} barH={12} barGap={16}
          collapsedParents={collapsedParents} onToggle={toggleParent} />

        {/* === Chart Y grid === */}
        {yTicks.map((v, i) => (
          <g key={`yg${i}`}>
            <line x1={pL} y1={yForVal(v)} x2={pL + w} y2={yForVal(v)} stroke="#e2e8f0" strokeWidth={0.5} />
            <text x={pL - 4} y={yForVal(v) + 3} textAnchor="end" fontSize={7} fill="#94a3b8">{fmtMan(v)}</text>
          </g>
        ))}

        {/* Zero line */}
        {yMin < 0 && (
          <line x1={pL} y1={yForVal(0)} x2={pL + w} y2={yForVal(0)} stroke="#334155" strokeWidth={0.8} strokeDasharray="4,2" opacity={0.3} />
        )}

        {/* === Asset lines === */}
        {results.map((r, si) => {
          const wealthPath = r.yearResults.map((yr, yi) =>
            `${yi === 0 ? "M" : "L"}${xForAge(yr.age)},${yForVal(yr.totalWealth)}`
          ).join(" ");
          const dcPath = r.yearResults.map((yr, yi) =>
            `${yi === 0 ? "M" : "L"}${xForAge(yr.age)},${yForVal(yr.cumulativeDCAsset)}`
          ).join(" ");
          // NISA line
          const hasNISA = r.yearResults.some(yr => yr.nisaAsset > 0);
          const nisaPath = hasNISA ? r.yearResults.map((yr, yi) =>
            `${yi === 0 ? "M" : "L"}${xForAge(yr.age)},${yForVal(yr.nisaAsset)}`
          ).join(" ") : null;
          // Loan balance (shown as negative, below zero)
          const hasLoan = r.yearResults.some(yr => yr.loanBalance > 0);
          const loanPath = hasLoan ? r.yearResults.map((yr, yi) =>
            `${yi === 0 ? "M" : "L"}${xForAge(yr.age)},${yForVal(-yr.loanBalance)}`
          ).join(" ") : null;
          const loanFill = hasLoan ? (
            r.yearResults.map((yr, yi) =>
              `${yi === 0 ? "M" : "L"}${xForAge(yr.age)},${yForVal(-yr.loanBalance)}`
            ).join(" ") +
            ` L${xForAge(r.yearResults[r.yearResults.length - 1].age)},${yForVal(0)}` +
            ` L${xForAge(r.yearResults[0].age)},${yForVal(0)} Z`
          ) : null;
          // Fill area
          const areaPath = wealthPath +
            ` L${xForAge(r.yearResults[r.yearResults.length - 1].age)},${yForVal(0)}` +
            ` L${xForAge(r.yearResults[0].age)},${yForVal(0)} Z`;
          return (
            <g key={`asset${si}`}>
              <path d={areaPath} fill={COLORS[si]} opacity={0.06} />
              <path d={wealthPath} fill="none" stroke={COLORS[si]} strokeWidth={2} />
              <path d={dcPath} fill="none" stroke={COLORS[si]} strokeWidth={1.5} strokeDasharray="4,2" opacity={0.4} />
              {nisaPath && <path d={nisaPath} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="2,4" opacity={0.6} />}
              {loanFill && <path d={loanFill} fill="#ef4444" opacity={0.06} />}
              {loanPath && <path d={loanPath} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.6} />}
            </g>
          );
        })}

        {/* === X-axis === */}
        <line x1={pL} y1={chartTop + chartH} x2={pL + w} y2={chartTop + chartH} stroke="#334155" strokeWidth={1} />
        {Array.from({ length: totalYears }, (_, i) => currentAge + i)
          .filter(age => age % 5 === 0 || age === currentAge)
          .map(age => (
            <g key={`xt${age}`}>
              <line x1={xForAge(age)} y1={chartTop + chartH} x2={xForAge(age)} y2={chartTop + chartH + 4} stroke="#94a3b8" />
              <text x={xForAge(age)} y={chartTop + chartH + 14} textAnchor="middle" fontSize={8} fill="#64748b">{age}歳</text>
            </g>
          ))}

        {/* === Hover zones (chart area only, below event bars) === */}
        {Array.from({ length: totalYears }, (_, i) => currentAge + i).map(age => (
          <rect key={`h${age}`} x={xForAge(age) - xStep / 2} y={chartTop} width={xStep} height={chartH}
            fill="transparent" onMouseEnter={() => handleHover(age)} onClick={() => onYearClick?.(age)} />
        ))}

        {/* Hover line */}
        {hoverAge != null && (
          <line x1={xForAge(hoverAge)} y1={pT} x2={xForAge(hoverAge)} y2={chartTop + chartH}
            stroke="#475569" strokeWidth={1} strokeDasharray="2,2" />
        )}
        {hoverData?.map((yr, si) => yr && (
          <circle key={`d${si}`} cx={xForAge(yr.age)} cy={yForVal(yr.totalWealth)} r={4}
            fill={COLORS[si]} stroke="white" strokeWidth={1.5} />
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {results.map((r, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="h-2 w-4 rounded" style={{ backgroundColor: COLORS[i] }} />
            <span className="font-semibold" style={{ color: COLORS[i] }}>{r.scenario.name}</span>
          </div>
        ))}
        <span className="text-gray-400">実線=総資産 破線=DC</span>
        <span className="text-green-500">緑点線=NISA</span>
        <span className="text-red-400">赤破線=ローン残高</span>
      </div>

      {/* Tooltip */}
      {hoverAge != null && hoverData && (
        <div className="mt-2 rounded border bg-gray-50 p-2 text-xs">
          <div className="font-bold text-gray-700 mb-1">
            {hoverAge}歳
            <span className="font-normal text-gray-400 ml-2">クリックで詳細</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${results.length}, 1fr)` }}>
            {hoverData.map((yr, si) => yr && (
              <div key={si} className="space-y-0.5">
                <div className="font-bold" style={{ color: COLORS[si] }}>{results[si].scenario.name}</div>
                <div>年収 {Math.round(yr.grossMan)}万{yr.spouse.gross > 0 ? ` + 配偶者${Math.round(yr.spouse.gross / 10000)}万` : ""}
                  {(yr.self.pensionIncome > 0 || yr.spouse.pensionIncome > 0) && ` 年金${fmtMan(yr.self.pensionIncome + yr.spouse.pensionIncome)}`}
                  {" / "}手取り {fmtMan(yr.takeHomePay)}</div>
                <div className="flex items-center gap-0.5 flex-wrap">
                  <span className="text-gray-400">収入</span>
                  {yearIncomePcts(yr).map(p => <span key={p.label} style={{ color: p.color }}>{p.label}{p.pct}%</span>)}
                </div>
                <div>支出 {fmtMan(yr.totalExpense)}（基本{fmtMan(yr.baseLivingExpense)} + イベント{fmtMan(yr.eventOngoing + yr.eventOnetime)}）</div>
                <div className="flex items-center gap-0.5 flex-wrap">
                  <span className="text-gray-400">支出</span>
                  {yearExpensePcts(yr).map(p => <span key={p.label} style={{ color: p.color }}>{p.label}{p.pct}%</span>)}
                </div>
                <div className="font-bold">総資産 {fmtMan(yr.totalWealth)}</div>
                {yr.cumulativeDCAsset > 0 && (
                  <div className="text-gray-500">DC {fmtMan(yr.cumulativeDCAsset)}{yr.spouse.dcAsset > 0 ? ` (本人${fmtMan(yr.self.dcAsset)} 配偶者${fmtMan(yr.spouse.dcAsset)})` : ""}</div>
                )}
                {(yr.nisaAsset > 0 || yr.taxableAsset > 0) && (
                  <div className="text-green-600">
                    {yr.nisaAsset > 0 && `NISA ${fmtMan(yr.nisaAsset)}${yr.spouse.nisaAsset > 0 ? ` (本人${fmtMan(yr.self.nisaAsset)} 配偶者${fmtMan(yr.spouse.nisaAsset)})` : ""}`}
                    {yr.taxableAsset > 0 && ` 特定 ${fmtMan(yr.taxableAsset)}`}
                    {` 現金 ${fmtMan(yr.cashSavings)}`}
                  </div>
                )}
                {yr.loanBalance > 0 && <div className="text-red-500">ローン残高 {fmtMan(yr.loanBalance)}</div>}
                {yr.activeEvents.length > 0 && (
                  <div className="text-gray-400">
                    {yr.activeEvents.map(e => `${(EVENT_TYPES[e.type] || EVENT_TYPES.custom).icon}${e.label}`).join(" ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
