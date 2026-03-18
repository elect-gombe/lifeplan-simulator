import React, { useState, useCallback } from "react";
import { fmtMan } from "../lib/format";
import { EVENT_TYPES, resolveEventAge } from "../lib/types";
import type { ScenarioResult, LifeEvent, EventYearCost } from "../lib/types";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

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

export function TimelineChart({ results, currentAge, retirementAge, onYearClick, onHoverAge }: {
  results: ScenarioResult[];
  currentAge: number;
  retirementAge: number;
  onYearClick?: (age: number) => void;
  onHoverAge?: (age: number | null) => void;
}) {
  const [hoverAge, setHoverAge] = useState<number | null>(null);
  const handleHover = (age: number | null) => { setHoverAge(age); onHoverAge?.(age); };
  const [collapsedParents, setCollapsedParents] = usePersistedSet("sim-tl-collapsed");
  const [selectedScenario, setSelectedScenario] = useState(0);
  if (!results.length || !results[0].yearResults.length) return null;

  const totalYears = retirementAge - currentAge;
  // Clamp selectedScenario to valid range
  const selIdx = Math.min(selectedScenario, results.length - 1);
  const s0 = results[selIdx]?.scenario;
  const baseScenario = results[0]?.scenario;
  // Merge events: for linked scenarios, combine base events (minus excluded) + own events
  const mergedEvents: LifeEvent[] = (() => {
    if (!s0) return [];
    if (selIdx === 0 || !s0.linkedToBase || !baseScenario) return [...(s0.events || [])];
    const excludedIds = s0.excludedBaseEventIds || [];
    const baseEvts = (baseScenario.events || []).filter(e => !excludedIds.includes(e.id));
    const ownEvts = s0.events || [];
    return [...baseEvts, ...ownEvts].sort((a, b) => a.age - b.age);
  })();
  const allEvents: LifeEvent[] = mergedEvents;

  // Build visible events: grouped by type (子供→住宅→車→保険→その他), then by age within group
  const parentEvents = allEvents.filter(e => !e.parentId);
  const typeOrder: Record<string, number> = { child: 0, education: 0, property: 1, car: 2, insurance: 3, death: 4, marriage: 5, rent: 6, travel: 7, custom: 8 };
  const sortedParents = [...parentEvents].sort((a, b) => {
    const ta = typeOrder[a.type] ?? 8, tb = typeOrder[b.type] ?? 8;
    if (ta !== tb) return ta - tb;
    return resolveEventAge(a, allEvents) - resolveEventAge(b, allEvents);
  });
  const visibleEvents: (LifeEvent & { _virtual?: boolean })[] = [];

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
        // Loan period
        visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.1, age: startAge, label: `ローン返済(${pp.rateType === "fixed" ? `固定${pp.fixedRate}%` : `変動${pp.variableInitRate}%`})`, type: "custom", durationYears: pp.rateType === "variable" ? pp.variableRiseAfter : pp.loanYears, oneTimeCostMan: 0, annualCostMan: 0 } as any);
        if (pp.rateType === "variable" && pp.variableRiseAfter < pp.loanYears) {
          visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.2, age: startAge + pp.variableRiseAfter, label: `金利上昇→${pp.variableRiskRate}%`, type: "custom", durationYears: pp.loanYears - pp.variableRiseAfter, oneTimeCostMan: 0, annualCostMan: 0 } as any);
        }
        if (pp.hasLoanDeduction) {
          visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.3, age: startAge, label: `住宅ローン控除(13年)`, type: "custom", durationYears: 13, oneTimeCostMan: 0, annualCostMan: 0 } as any);
        }
        visibleEvents.push({ ...p, _virtual: true, id: p.id + 0.4, age: startAge, label: `管理費・固定資産税`, type: "custom", durationYears: 0, oneTimeCostMan: 0, annualCostMan: pp.maintenanceMonthlyMan * 12 + pp.taxAnnualMan } as any);
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

  const xStep = w / Math.max(totalYears - 1, 1);
  const xForAge = (age: number) => pL + (age - currentAge) * xStep;

  // Y scale: account for both positive (wealth) and negative (loan balance, negative savings)
  const allValues = results.flatMap(r => r.yearResults.flatMap(yr => [yr.totalWealth, yr.cumulativeDCAsset, yr.cumulativeSavings, yr.nisaAsset, yr.taxableAsset, yr.cashSavings, -yr.loanBalance]));
  const yMax = Math.max(...allValues, 1);
  const yMin = Math.min(...allValues, 0);
  const yRange = yMax - yMin;
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
      <svg viewBox={`0 0 ${cW} ${cH}`} className="block w-full cursor-crosshair" onMouseLeave={() => handleHover(null)}>

        {/* === Event bars === */}
        {visibleEvents.map((evt, ei) => {
          const et = EVENT_TYPES[evt.type] || EVENT_TYPES.custom;
          const effectiveAge = resolveEventAge(evt, allEvents);
          const startX = xForAge(Math.max(effectiveAge, currentAge));
          const endAge = evt.durationYears > 0 ? Math.min(effectiveAge + evt.durationYears, retirementAge) : retirementAge;
          const endX = xForAge(endAge);
          const barY = pT + ei * 16;
          const barH = 12;
          const hasRealChildren = allEvents.some(c => c.parentId === evt.id);
          const hasStructured = !!(evt as any).propertyParams || !!(evt as any).carParams;
          const isParent = !evt.parentId && (hasRealChildren || hasStructured);
          const isChild = !!evt.parentId || !!(evt as any)._virtual;
          const isCollapsed = collapsedParents.has(evt.id);
          const realChildCount = allEvents.filter(c => c.parentId === evt.id).length;
          const childCount = hasStructured ? (evt.propertyParams ? 4 : 2) : realChildCount;
          return (
            <g key={`ev${evt.id}`}
              style={{ cursor: isParent ? "pointer" : undefined }}
              onClick={isParent && !(evt as any)._virtual ? (e) => { e.stopPropagation(); toggleParent(evt.id); } : undefined}>
              <rect x={isChild ? startX + 8 : startX} y={barY} width={Math.max((isChild ? endX - startX - 8 : endX - startX), 4)} height={barH}
                rx={3} fill={et.color} opacity={isChild ? 0.15 : 0.25} />
              <rect x={isChild ? startX + 8 : startX} y={barY} width={3} height={barH} rx={1} fill={et.color} opacity={0.8} />
              <text x={(isChild ? startX + 14 : startX + 6)} y={barY + 9} fontSize={8} fill={et.color} fontWeight="600">
                {isParent ? (isCollapsed ? "▶ " : "▼ ") : ""}{et.icon} {evt.label} {effectiveAge}歳{evt.durationYears > 0 ? `〜${effectiveAge + evt.durationYears}歳` : "〜"}
                {evt.annualCostMan > 0 ? ` ${evt.annualCostMan}万/年` : ""}
                {evt.oneTimeCostMan > 0 ? ` +${evt.oneTimeCostMan}万` : ""}
                {isParent && isCollapsed ? ` (${childCount}件)` : ""}
              </text>
            </g>
          );
        })}

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
                <div>支出 {fmtMan(yr.totalExpense)}（基本{fmtMan(yr.baseLivingExpense)} + イベント{fmtMan(yr.eventOngoing + yr.eventOnetime)}）</div>
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
