import React, { useState, useRef } from "react";
import { fmt, fmtMan } from "../lib/format";
import type { ScenarioResult, BaseResult, YearResult, MemberResult } from "../lib/types";
import { EVENT_TYPES } from "../lib/types";
import { EXPENSE_CATS } from "./IncomeExpenseChart";
import { BRACKETS } from "../lib/tax";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

// Props shared between modal and inline panel
interface TaxDetailProps {
  age: number | null;
  results: ScenarioResult[];
  base: BaseResult;
  sirPct: number;
}

export function TaxDetailModal({ isOpen, onClose, age, results, base, sirPct }: TaxDetailProps & {
  isOpen: boolean; onClose: () => void;
}) {
  if (!isOpen || age == null) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-black/40" onClick={onClose}>
      <div className="flex-1 min-h-0 w-[calc(100%-60px)] max-w-[1400px] my-1 sm:my-2 rounded-lg bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-3 py-1.5 shrink-0">
          <p className="text-sm font-bold">{age}歳時点の詳細</p>
          <button onClick={onClose} className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100">閉じる</button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-1 sm:p-2">
          <TaxDetailContent age={age} results={results} base={base} sirPct={sirPct} />
        </div>
      </div>
    </div>
  );
}

/** Inline panel version (for side panel on wide screens) */
export function TaxDetailPanel({ age, results, base, sirPct, containerWidth, onHoverGraph, onPinGraph }: TaxDetailProps & { containerWidth?: number; onHoverGraph?: (g: { label: string; fn: GraphFn } | null) => void; onPinGraph?: (g: { label: string; fn: GraphFn }) => void }) {
  if (age == null) return null;
  return (
    <div className="h-full overflow-auto p-1">
      <p className="text-xs font-bold text-gray-600 mb-1 sticky top-0 bg-white/90 backdrop-blur-sm py-1">{age}歳時点の詳細</p>
      <TaxDetailContent age={age} results={results} base={base} sirPct={sirPct} compact containerWidth={containerWidth} onHoverGraph={onHoverGraph} onPinGraph={onPinGraph} />
    </div>
  );
}

// ===== 累進税率ブラケット図（シナリオごと） =====
function TaxBracketChart({ taxableIncome, color, label }: { taxableIncome: number; color: string; label: string }) {
  // 表示上限: 最後の使用ブラケットの上端 or 40M
  const visMax = Math.max(
    ...BRACKETS.filter(b => taxableIncome > b.lo).map(b => Math.min(b.hi, 40000000)),
    BRACKETS[1].hi // 最低でも330万まで表示
  ) * 1.1;

  const W = 500, H = 32;
  const pL = 0, barH = 16, barY = 0, labelY = barH + 11;
  const scale = (v: number) => pL + (v / visMax) * W;

  const m = (v: number) => v >= 10000000 ? `${Math.round(v / 10000000)}千万` : `${Math.round(v / 10000)}万`;
  const bracketColors = ["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"];

  return (
    <div className="mb-2">
      <div className="text-[10px] font-bold mb-0.5" style={{ color }}>{label} 課税所得 {m(taxableIncome)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        {/* Bracket bars */}
        {BRACKETS.map((b, i) => {
          const lo = Math.min(b.lo, visMax);
          const hi = Math.min(b.hi, visMax);
          if (lo >= visMax) return null;
          const x1 = scale(lo), x2 = scale(hi), w = x2 - x1;
          const filled = taxableIncome > b.lo;
          const fillW = filled ? scale(Math.min(taxableIncome, hi)) - x1 : 0;
          return (
            <g key={i}>
              <rect x={x1} y={barY} width={w} height={barH} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.5} />
              {fillW > 0 && <rect x={x1} y={barY} width={fillW} height={barH} fill={bracketColors[i]} opacity={0.8} />}
              {w > 25 && <text x={x1 + w / 2} y={barY + barH / 2 + 3} textAnchor="middle" fontSize={8} fontWeight="bold" fill={filled ? "#1e3a5f" : "#94a3b8"}>{b.r}%</text>}
              {i > 0 && <text x={x1} y={labelY} textAnchor="middle" fontSize={7} fill="#64748b">{m(b.lo)}</text>}
            </g>
          );
        })}
        {/* Current position marker */}
        {taxableIncome > 0 && taxableIncome < visMax && (
          <line x1={scale(taxableIncome)} y1={barY - 2} x2={scale(taxableIncome)} y2={barH + 2} stroke={color} strokeWidth={2} />
        )}
      </svg>
    </div>
  );
}

// ===== ミニラインチャート（行ホバーで表示） =====
export type GraphFn = (yr: YearResult) => number;

export function MiniLineChart({ results, label, graphFn, selectedAge, hoverAge, onHoverAge }: {
  results: ScenarioResult[]; label: string; graphFn: GraphFn; selectedAge: number;
  hoverAge?: number | null; onHoverAge?: (age: number | null) => void;
}) {
  const [localHover, setLocalHover] = useState<number | null>(null);
  const allYrs = results[0]?.yearResults || [];
  const n = allYrs.length;
  if (!n) return null;

  const activeHover = hoverAge ?? localHover;
  const setHover = onHoverAge ?? setLocalHover;

  const W = 500, H = 80, pL = 45, pR = 8, pT = 4, pB = 16;
  const cW = W - pL - pR, cH = H - pT - pB;

  const series = results.map(r => r.yearResults.map(yr => graphFn(yr)));
  const allVals = series.flat();
  const yBottom = Math.min(...allVals, 0);
  const yTop = Math.max(...allVals, 0, 1);
  const range = yTop - yBottom || 1;

  const xStep = cW / Math.max(n - 1, 1);
  const x = (i: number) => pL + i * xStep;
  const y = (v: number) => pT + (yTop - v) / range * cH;

  const selIdx = allYrs.findIndex(yr => yr.age === selectedAge);
  const hIdx = activeHover != null ? allYrs.findIndex(yr => yr.age === activeHover) : -1;

  const yTicks = [yTop, 0];
  if (yBottom < 0) yTicks.push(yBottom);
  if (yTop > 0 && yBottom >= 0) yTicks.push(Math.round(yTop / 2));

  return (
    <div className="rounded border bg-white p-1 mt-1">
      <div className="text-[10px] font-bold text-gray-600 px-1">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full cursor-crosshair" onMouseLeave={() => setHover(null)}>
        {/* Y ticks */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={pL} y1={y(v)} x2={pL + cW} y2={y(v)} stroke={v === 0 ? "#94a3b8" : "#e2e8f0"} strokeWidth={v === 0 ? 1 : 0.5} />
            <text x={pL - 3} y={y(v) + 3} textAnchor="end" fontSize={7} fill="#94a3b8">{fmtMan(v)}</text>
          </g>
        ))}
        {/* Lines */}
        {series.map((vals, si) => {
          const path = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
          return <path key={si} d={path} fill="none" stroke={COLORS[si]} strokeWidth={1.5} opacity={0.8} />;
        })}
        {/* Selected age */}
        {selIdx >= 0 && <>
          <line x1={x(selIdx)} y1={pT} x2={x(selIdx)} y2={pT + cH} stroke="#f59e0b" strokeWidth={1.5} opacity={0.4} />
          {series.map((vals, si) => (
            <circle key={si} cx={x(selIdx)} cy={y(vals[selIdx])} r={3} fill={COLORS[si]} stroke="white" strokeWidth={1} />
          ))}
        </>}
        {/* Hover line + dots */}
        {hIdx >= 0 && <>
          <line x1={x(hIdx)} y1={pT} x2={x(hIdx)} y2={pT + cH} stroke="#475569" strokeWidth={1} strokeDasharray="2,2" />
          {series.map((vals, si) => (
            <circle key={si} cx={x(hIdx)} cy={y(vals[hIdx])} r={3.5} fill={COLORS[si]} stroke="white" strokeWidth={1.5} />
          ))}
        </>}
        {/* Hover zones */}
        {allYrs.map((yr, i) => (
          <rect key={i} x={x(i) - xStep / 2} y={pT} width={xStep} height={cH}
            fill="transparent" onMouseEnter={() => setHover(yr.age)} />
        ))}
        {/* X axis labels */}
        {allYrs.filter(yr => yr.age % 10 === 0).map(yr => {
          const i = allYrs.indexOf(yr);
          return <text key={yr.age} x={x(i)} y={H - 2} textAnchor="middle" fontSize={7} fill="#94a3b8">{yr.age}</text>;
        })}
      </svg>
      {/* Tooltip */}
      {hIdx >= 0 && (
        <div className="text-[10px] flex flex-wrap gap-x-3 px-1">
          <span className="font-bold">{allYrs[hIdx].age}歳</span>
          {series.map((vals, si) => (
            <span key={si} style={{ color: COLORS[si] }}>{results[si].scenario.name} {fmtMan(vals[hIdx])}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TaxDetailContent({ age, results, base, sirPct, compact, containerWidth, onHoverGraph, onPinGraph }: TaxDetailProps & { compact?: boolean; containerWidth?: number; onHoverGraph?: (g: { label: string; fn: GraphFn } | null) => void; onPinGraph?: (g: { label: string; fn: GraphFn }) => void }) {
  const [hovered, setHovered] = useState<{ label: string; fn: GraphFn; top: number; cx: number; cy: number } | null>(null);
  const setHoveredAndNotify = (h: { label: string; fn: GraphFn; top: number; cx: number; cy: number } | null) => {
    setHovered(h);
    onHoverGraph?.(h ? { label: h.label, fn: h.fn } : null);
  };
  const tableRef = useRef<HTMLTableElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  if (age == null) return null;

  const yrs = results.map(r => r.yearResults.find(yr => yr.age === age));
  const hasSpouse = results.some(r => r.scenario.spouse?.enabled) || yrs.some(yr => yr && yr.spouse.pensionIncome > 0);
  const hasNISA = yrs.some(yr => yr && (yr.nisaAsset > 0 || yr.taxableAsset > 0));
  const hasInsurance = yrs.some(yr => yr && (yr.insurancePremiumTotal > 0 || yr.insurancePayoutTotal > 0));

  // 万円表記ヘルパー
  const m = (v: number) => `${Math.round(v / 10000)}万`;
  // シナリオAの本人データで計算式を生成
  const y0 = yrs[0];
  const s0 = y0?.self;

  const subCols = hasSpouse ? ["本人", "配偶者", "世帯"] as const : ["本人"] as const;
  const subCount = subCols.length;
  // データ列数に応じて必要な幅を推定（1列あたり約90px + 項目列120px + 計算式列250px）
  const showHintCol = compact ? (containerWidth ?? 0) >= 120 + 250 + results.length * subCount * 90 : true;
  const totalCols = (showHintCol ? 2 : 1) + results.length * subCount;

  type Sub = "本人" | "配偶者" | "世帯";
  type ValFn = (yr: YearResult, sub: Sub) => any;

  // ヘルパー: MemberResult のフィールドアクセサから per() を生成
  const field = (fn: (m: MemberResult) => number): ValFn =>
    (yr, s) => {
      if (s === "本人") { const v = fn(yr.self); return v ? v : "-"; }
      if (s === "配偶者") { const v = fn(yr.spouse); return v ? v : "-"; }
      const v = fn(yr.self) + fn(yr.spouse); return v ? v : "-";
    };
  // per(selfFn, spouseFn) → 本人=selfFn, 配偶者=spouseFn, 世帯=self+spouse (0は"-")
  const per = (selfFn: (yr: YearResult) => number, spouseFn: (yr: YearResult) => number): ValFn =>
    (yr, s) => {
      if (s === "本人") { const v = selfFn(yr); return v ? v : "-"; }
      if (s === "配偶者") { const v = spouseFn(yr); return v ? v : "-"; }
      const v = selfFn(yr) + spouseFn(yr); return v ? v : "-";
    };
  // household(fn) → 世帯 or 配偶者なし時のみ表示
  const household = (fn: (yr: YearResult) => number): ValFn =>
    (yr, s) => (s === "世帯" || !hasSpouse) ? (fn(yr) || "-") : "-";

  const makeCells = (fn: ValFn, bold?: boolean, neg?: boolean) => {
    const out: React.ReactNode[] = [];
    for (let si = 0; si < results.length; si++) {
      const yr = yrs[si];
      for (let ci = 0; ci < subCols.length; ci++) {
        const sub = subCols[ci];
        const v = yr ? fn(yr, sub) : "-";
        const isFirst = ci === 0, isLast = ci === subCols.length - 1;
        const borderL = isFirst ? "border-l-2 border-l-gray-500" : "border-l border-l-gray-200";
        const borderR = isLast ? "border-r-2 border-r-gray-500" : "";
        const bgCol = sub === "世帯" ? "bg-amber-50/40" : "";
        out.push(
          <td key={`${si}-${ci}`}
            className={`${borderL} ${borderR} border-y border-gray-200 px-1 py-0.5 text-right text-[11px] tabular-nums ${bgCol} ${neg && typeof v === "number" && v > 0 ? "text-red-600" : ""} ${bold ? "font-bold" : ""}`}>
            {typeof v === "string" ? v : `¥${fmt(v)}`}
          </td>
        );
      }
    }
    return out;
  };

  const R = ({ l, fn, bold, bg, sub: isSub, neg, hint, graphFn, onClick: rowClick }: {
    l: string; fn: ValFn; bold?: boolean; bg?: string; sub?: boolean; neg?: boolean; hint?: string;
    graphFn?: GraphFn; onClick?: () => void;
  }) => (
    <tr className={`${bg || ""} ${hovered?.label === l ? "!bg-amber-100/60" : ""} ${rowClick ? "cursor-pointer hover:bg-gray-50" : ""}`}
      onClick={rowClick}>
      <td className={`border-y border-gray-200 border-r border-r-gray-200 px-1 py-0.5 text-[11px] whitespace-nowrap ${isSub ? "pl-2 text-gray-500" : ""} ${bold ? "font-bold" : ""}`}>
        {graphFn && <span className="text-[9px] text-amber-400 mr-0.5 cursor-pointer inline-block hover:scale-125 transition-transform"
          onMouseEnter={(e) => {
            const tr = e.currentTarget.closest("tr");
            const top = tr ? tr.offsetTop + tr.offsetHeight : 0;
            setHoveredAndNotify({ label: l, fn: graphFn, top, cx: e.clientX, cy: e.clientY });
          }}
          onMouseMove={(e) => setHovered(prev => prev ? { ...prev, cx: e.clientX, cy: e.clientY } : prev)}
          onMouseLeave={() => setHoveredAndNotify(null)}
          onClick={onPinGraph ? (e) => { e.stopPropagation(); onPinGraph({ label: l, fn: graphFn }); } : undefined}
        >📈</span>}{l}
        {hint && !showHintCol && <span className="block text-[10px] font-normal text-blue-500/70 leading-tight whitespace-normal">{hint}</span>}
      </td>
      {showHintCol && <td className="border-y border-gray-200 border-r-2 border-r-gray-300 px-1.5 py-0.5 text-[10px] text-blue-500/70 whitespace-normal max-w-[320px] leading-tight">
        {hint || ""}
      </td>}
      {makeCells(fn, bold, neg)}
    </tr>
  );

  const S = ({ children, bg }: { children: string; bg?: string }) => (
    <tr className={bg || "bg-gray-100"}>
      <td colSpan={totalCols} className="border-y-2 border-gray-400 px-2 py-1 text-[11px] font-bold tracking-wide">{children}</td>
    </tr>
  );

  // Cost labels grouped by category
  const costLabels: string[] = [];
  for (const yr of yrs) {
    if (!yr) continue;
    for (const c of yr.eventCostBreakdown) {
      if (!costLabels.includes(c.label)) costLabels.push(c.label);
    }
  }
  // Categorize labels
  const catLabel = (label: string) => {
    const cat = EXPENSE_CATS.find(c => c.key !== "living" && c.key !== "other" && c.match(label));
    return cat?.key || "other";
  };
  const expenseGroups = EXPENSE_CATS
    .filter(c => c.key !== "living") // baseLivingExpense handled separately
    .map(cat => ({ ...cat, items: costLabels.filter(l => catLabel(l) === cat.key) }))
    .filter(g => g.items.length > 0);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setOpenGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // 折りたたみグループヘッダー行
  const CG = ({ id, label, color, count, graphFn, fn, neg }: {
    id: string; label: string; color: string; count?: number;
    graphFn?: GraphFn; fn: ValFn; neg?: boolean;
  }) => {
    const isOpen = openGroups.has(id);
    return (
      <tr className="cursor-pointer hover:bg-gray-50 select-none" onClick={() => toggleGroup(id)}>
        <td className="border-y border-gray-200 border-r border-r-gray-200 px-1 py-0.5 text-[11px] whitespace-nowrap font-semibold" style={{ color }}>
          {graphFn && <span className="text-[9px] text-amber-400 mr-0.5 cursor-pointer inline-block hover:scale-125 transition-transform"
            onMouseEnter={(e) => {
              const tr = e.currentTarget.closest("tr");
              const top = tr ? tr.offsetTop + tr.offsetHeight : 0;
              setHoveredAndNotify({ label, fn: graphFn, top, cx: e.clientX, cy: e.clientY });
            }}
            onMouseMove={(e) => setHovered(prev => prev ? { ...prev, cx: e.clientX, cy: e.clientY } : prev)}
            onMouseLeave={() => setHoveredAndNotify(null)}
            onClick={onPinGraph ? (e) => { e.stopPropagation(); onPinGraph({ label, fn: graphFn }); } : undefined}
          >📈</span>}
          <span className={`inline-block w-3 text-[9px] text-center transition-transform duration-150 ${isOpen ? "rotate-0" : "-rotate-90"}`}>▼</span>
          {" "}{label}
          {count != null && <span className="text-gray-400 font-normal ml-1">({count}件)</span>}
        </td>
        {showHintCol && <td className="border-y border-gray-200 border-r-2 border-r-gray-300 px-1.5 py-0.5 text-[10px] text-gray-400">
          {isOpen ? "クリックで閉じる" : "クリックで詳細表示"}
        </td>}
        {makeCells(fn, false, neg)}
      </tr>
    );
  };


  return (<>
          <div ref={wrapRef} className="relative">
          <table ref={tableRef} className={`border-collapse text-[11px] leading-tight whitespace-nowrap ${compact ? "" : "w-full"}`}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th rowSpan={2} className="bg-gray-300 border-2 border-gray-500 px-1 py-1 text-left">項目</th>
                {showHintCol && <th rowSpan={2} className="bg-gray-300 border-2 border-gray-500 px-1 py-1 text-left text-[10px] text-blue-600/60">計算式</th>}
                {results.map((r, si) => (
                  <th key={si} colSpan={subCount}
                    className="border-2 border-gray-500 px-1 py-1 text-center text-xs"
                    style={{ backgroundColor: `${COLORS[si]}15`, color: COLORS[si] }}>
                    {r.scenario.name}
                  </th>
                ))}
              </tr>
              <tr>
                {results.map((_, si) =>
                  subCols.map((sub, ci) => (
                    <th key={`${si}-${ci}`}
                      className={`bg-gray-100 px-1 py-0.5 text-center text-[10px] border-y-2 border-gray-500 ${ci === 0 ? "border-l-2 border-l-gray-500" : "border-l border-l-gray-200"} ${ci === subCols.length - 1 ? "border-r-2 border-r-gray-500" : ""} ${sub === "世帯" ? "bg-amber-50" : ""}`}>
                      {sub === "本人" ? <span className="text-gray-700">本人</span>
                       : sub === "配偶者" ? <span className="text-pink-600">配偶者</span>
                       : <span className="text-amber-700">世帯</span>}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {/* ===== 収入 ===== */}
              <S bg="bg-emerald-50">■ 収入</S>
              {yrs.some(yr => yr && (yr.self.gross > 0 || yr.spouse.gross > 0)) && (<>
                <R l="給与収入" bold hint="キーフレーム×昇給率" graphFn={yr => yr.self.gross + yr.spouse.gross} fn={(yr, s) => s === "本人" ? `${Math.round(yr.grossMan)}万` : s === "配偶者" ? (yr.spouse.gross > 0 ? `${Math.round(yr.spouse.gross / 10000)}万` : "-") : `${Math.round(yr.grossMan + yr.spouse.gross / 10000)}万`} />
                <CG id="inc_deductions" label="所得控除" color="#6b7280"
                  graphFn={yr => yr.self.employeeDeduction + yr.self.socialInsuranceDeduction + yr.basicDeduction + yr.self.dependentDeduction + yr.spouseDeductionAmount + yr.self.dcIdecoDeduction + yr.self.lifeInsuranceDeductionAmount + yr.self.furusatoDeduction}
                  fn={field(m => m.employeeDeduction + m.socialInsuranceDeduction + 480000 + m.dependentDeduction + m.dcIdecoDeduction + m.lifeInsuranceDeductionAmount + m.furusatoDeduction)} />
                {openGroups.has("inc_deductions") && <>
                  <R l="    給与所得控除" sub graphFn={yr => yr.self.employeeDeduction}
                    hint={s0 ? `${m(s0.gross)}−DC${m(s0.dcIdecoDeduction)}=${m(s0.gross - s0.dcIdecoDeduction)} → 控除${m(s0.employeeDeduction)}` : "DC控除後の年収に応じた控除(55万〜195万)"}
                    fn={field(m => m.employeeDeduction)} />
                  <R l="    社会保険料控除" sub graphFn={yr => yr.self.socialInsuranceDeduction}
                    hint={s0 ? (s0.siPension > 0
                      ? `厚年${m(s0.siPension)}+健保${m(s0.siHealth)}${s0.siNursing > 0 ? `+介護${m(s0.siNursing)}` : ""}+雇用${m(s0.siEmployment)}=${m(s0.socialInsuranceDeduction)}`
                      : `(${m(s0.gross)}−DC${m(s0.selfDCContribution)})×${sirPct}%=${m(s0.socialInsuranceDeduction)}`)
                      : `社保料合計（所得控除）`}
                    fn={field(m => m.socialInsuranceDeduction)} />
                  <R l="    基礎控除" sub hint="一律48万円" fn={(yr, s) => s === "配偶者" ? yr.basicDeduction : s === "本人" ? yr.basicDeduction : yr.basicDeduction * 2} />
                  {yrs.some(yr => yr && yr.self.dependentDeduction > 0) &&
                    <R l="    扶養控除" sub hint="16-18歳:38万 19-22歳:63万(特定) ※世帯主集約" graphFn={yr => yr.self.dependentDeduction} fn={(yr, s) => {
                      if (!hasSpouse) return yr.self.dependentDeduction || "-";
                      if (s === "本人") return yr.self.dependentDeduction || "-";
                      if (s === "配偶者") return "-";
                      return yr.self.dependentDeduction || "-";
                    }} />}
                  {yrs.some(yr => yr && yr.spouseDeductionAmount > 0) &&
                    <R l="    配偶者控除" sub graphFn={yr => yr.spouseDeductionAmount} hint={s0 && y0 && y0.spouseDeductionAmount > 0 ? `本人所得${m(s0.gross - s0.employeeDeduction)} 配偶者所得${m(y0.spouse.gross - y0.spouse.employeeDeduction)} → ${m(y0.spouseDeductionAmount)}` : "配偶者の所得に応じた控除(最大38万)"} fn={(yr, s) => {
                      if (s === "配偶者") return "-";
                      return yr.spouseDeductionAmount > 0 ? yr.spouseDeductionAmount : "-";
                    }} />}
                  {yrs.some(yr => yr && yr.self.dcIdecoDeduction > 0) &&
                    <R l="    DC/iDeCo控除" sub hint="小規模企業共済等掛金控除(全額所得控除)" graphFn={yr => yr.self.dcIdecoDeduction} fn={field(m => m.dcIdecoDeduction)} />}
                  {yrs.some(yr => yr && yr.self.lifeInsuranceDeductionAmount > 0) &&
                    <R l="    生命保険料控除" sub hint={s0 && y0 && s0.lifeInsuranceDeductionAmount > 0 ? `保険料${m(y0.insurancePremiumTotal)}→控除${m(s0.lifeInsuranceDeductionAmount)}(上限4万)` : "年間保険料に応じた控除(新制度・上限4万円)"}
                    fn={field(m => m.lifeInsuranceDeductionAmount)} />}
                  {yrs.some(yr => yr && yr.self.furusatoDeduction > 0) &&
                    <R l="    ふるさと納税控除" sub graphFn={yr => yr.self.furusatoDeduction} hint={s0 && s0.furusatoDeduction > 0 ? `寄付${m(s0.furusatoDeduction + 2000)}−自己負担2000=${m(s0.furusatoDeduction)}` : "寄付額−2000円"}
                    fn={field(m => m.furusatoDeduction)} />}
                </>}
                <R l="  課税所得" sub bold graphFn={yr => yr.self.taxableIncome}
                  hint={s0 ? `${m(s0.gross)}−${m(s0.employeeDeduction)}(給与)−${m(s0.socialInsuranceDeduction)}(社保)−48万(基礎)${s0.dependentDeduction > 0 ? `−${m(s0.dependentDeduction)}(扶養)` : ""}${y0 && y0.spouseDeductionAmount > 0 ? `−${m(y0.spouseDeductionAmount)}(配偶者)` : ""}−${m(s0.dcIdecoDeduction)}(DC)${s0.lifeInsuranceDeductionAmount > 0 ? `−${m(s0.lifeInsuranceDeductionAmount)}(生保)` : ""}${s0.furusatoDeduction > 0 ? `−${m(s0.furusatoDeduction)}(ふるさと)` : ""}=${m(s0.taxableIncome)}` : "収入−全所得控除"}
                  fn={field(m => m.taxableIncome)} />
                <R l="  最高税率" sub hint="累進税率5-45%+住民税10%" fn={(yr, s) => {
                  const r = s === "配偶者" ? yr.spouse.marginalRate : s === "世帯" ? Math.max(yr.self.marginalRate, yr.spouse.marginalRate) : yr.self.marginalRate;
                  return r > 0 ? `${r}%+住10%` : "-";
                }} />
                <CG id="inc_tax" label="税金" color="#ef4444"
                  graphFn={yr => yr.self.incomeTax + yr.self.residentTax + yr.spouse.incomeTax + yr.spouse.residentTax}
                  fn={field(m => m.incomeTax + m.residentTax)} neg />
                {openGroups.has("inc_tax") && <>
                  <R l="    所得税" sub neg graphFn={yr => yr.self.incomeTax}
                    hint={s0 ? `iTx(${m(s0.taxableIncome)})${s0.housingLoanDeductionIT > 0 ? `−HL控除${m(s0.housingLoanDeductionIT)}` : ""}=${m(s0.incomeTax)}` : "iTx(課税所得)"}
                    fn={field(m => m.incomeTax)} />
                  <R l="    住民税" sub neg graphFn={yr => yr.self.residentTax}
                    hint={s0 ? `${m(s0.taxableIncome)}×10%${s0.housingLoanDeductionRT > 0 ? `−HL控除${m(s0.housingLoanDeductionRT)}` : ""}=${m(s0.residentTax)}` : "課税所得×10%"}
                    fn={field(m => m.residentTax)} />
                  {yrs.some(yr => yr && (yr.self.housingLoanDeductionAvail > 0 || yr.spouse.housingLoanDeductionAvail > 0)) && (<>
                    <R l="      住宅ローン控除額" sub graphFn={yr => yr.self.housingLoanDeductionAvail + yr.spouse.housingLoanDeductionAvail}
                      hint={s0 ? `残高×0.7% 上限35万/年(13年間)` : "残高×0.7% 上限35万"}
                      fn={(yr, s) => {
                        if (s === "本人") return yr.self.housingLoanDeductionAvail > 0 ? yr.self.housingLoanDeductionAvail : "-";
                        if (s === "配偶者") return yr.spouse.housingLoanDeductionAvail > 0 ? yr.spouse.housingLoanDeductionAvail : "-";
                        const total = yr.self.housingLoanDeductionAvail + yr.spouse.housingLoanDeductionAvail;
                        return total > 0 ? total : "-";
                      }} />
                    <R l="      うち所得税から" sub hint="所得税額を上限に控除" graphFn={yr => yr.self.housingLoanDeductionIT}
                      fn={field(m => m.housingLoanDeductionIT)} />
                    <R l="      うち住民税から" sub hint="残額を住民税から(上限: 課税所得×5% 最大97,500円)" graphFn={yr => yr.self.housingLoanDeductionRT}
                      fn={field(m => m.housingLoanDeductionRT)} />
                  </>)}
                </>}
                <CG id="inc_si" label="社会保険料" color="#f59e0b"
                  graphFn={yr => yr.self.socialInsurance + yr.spouse.socialInsurance}
                  fn={field(m => m.socialInsurance)} neg />
                {openGroups.has("inc_si") && <>
                  {yrs.some(yr => yr && yr.self.siPension > 0) && (<>
                    <R l="    厚生年金" sub hint="9.15%(被保険者負担) 月額報酬65万上限" graphFn={yr => yr.self.siPension} fn={field(m => m.siPension)} />
                    <R l="    健康保険" sub hint="組合により異なる(協会けんぽ全国平均~5%)" graphFn={yr => yr.self.siHealth} fn={field(m => m.siHealth)} />
                    {yrs.some(yr => yr && yr.self.siNursing > 0) &&
                      <R l="    介護保険" sub hint="40歳以上65歳未満のみ" graphFn={yr => yr.self.siNursing} fn={field(m => m.siNursing)} />}
                    <R l="    雇用+子育支援" sub hint="雇用0.6%+子ども子育て支援金" graphFn={yr => yr.self.siEmployment + yr.self.siChildSupport} fn={(yr, s) => {
                      const mem = s === "配偶者" ? yr.spouse : yr.self;
                      const v = mem.siEmployment + mem.siChildSupport;
                      if (s === "世帯") { const t = yr.self.siEmployment + yr.self.siChildSupport + yr.spouse.siEmployment + yr.spouse.siChildSupport; return t || "-"; }
                      return v || "-";
                    }} />
                  </>)}
                </>}
              </>)}
              {yrs.some(yr => yr && (yr.self.pensionIncome > 0 || yr.spouse.pensionIncome > 0)) && (<>
                <CG id="inc_pension" label="老齢年金" color="#16a34a"
                  graphFn={yr => yr.self.pensionIncome + yr.spouse.pensionIncome}
                  fn={field(m => m.pensionIncome)} />
                {openGroups.has("inc_pension") && <>
                  {yrs.some(yr => yr && yr.pensionReduction > 0) &&
                    <R l="    在職老齢年金減額" sub neg hint="基本月額+総報酬月額>50万/月→超過額の1/2を厚生年金から支給停止" graphFn={yr => yr.pensionReduction} fn={household(yr => yr.pensionReduction)} />}
                  <R l="    年金課税" sub neg hint="公的年金等控除後の所得税+住民税" graphFn={yr => yr.pensionTax} fn={household(yr => yr.pensionTax)} />
                </>}
              </>)}
              {/* 遺族年金・保険金（死亡後） */}
              {yrs.some(yr => yr && yr.survivorIncome > 0) && <>
                <CG id="inc_survivor" label="遺族年金・保険" color="#8b5cf6"
                  graphFn={yr => yr.survivorIncome} fn={household(yr => yr.survivorIncome)} />
                {openGroups.has("inc_survivor") && <>
                  {yrs.some(yr => yr && yr.survivorBasicPension > 0) &&
                    <R l="    遺族基礎年金" sub hint="子のある配偶者に支給（81.6万+子の加算）" graphFn={yr => yr.survivorBasicPension} fn={household(yr => yr.survivorBasicPension)} />}
                  {yrs.some(yr => yr && yr.survivorEmployeePension > 0) &&
                    <R l="    遺族厚生年金" sub hint="報酬比例×3/4（65歳以降は老齢厚生年金との差額支給）" graphFn={yr => yr.survivorEmployeePension} fn={household(yr => yr.survivorEmployeePension)} />}
                  {yrs.some(yr => yr && yr.survivorWidowSupplement > 0) &&
                    <R l="    中高齢寡婦加算" sub hint="40-65歳の妻（子なし）に62.4万/年 ※2028年〜段階的廃止" graphFn={yr => yr.survivorWidowSupplement} fn={household(yr => yr.survivorWidowSupplement)} />}
                  {yrs.some(yr => yr && yr.survivorIncomeProtection > 0) &&
                    <R l="    収入保障保険" sub hint="死亡イベントの収入保障（月額×12）" graphFn={yr => yr.survivorIncomeProtection} fn={household(yr => yr.survivorIncomeProtection)} />}
                  {yrs.some(yr => yr && yr.insurancePayoutTotal > 0) &&
                    <R l="    保険金(イベント)" sub hint="保険イベントからの一時金or月額給付" graphFn={yr => yr.insurancePayoutTotal} fn={household(yr => yr.insurancePayoutTotal)} />}
                </>}
              </>}
              {yrs.some(yr => yr && yr.childAllowance > 0) &&
                <R l="児童手当" hint="0-2歳:1.5万/月 3-18歳:1万/月 第3子以降:3万/月" graphFn={yr => yr.childAllowance} fn={household(yr => yr.childAllowance)} />}
              {/* 手取り合計 */}
              <R l="手取り合計" bold bg="bg-emerald-100" hint="給与+年金−税・社保−DC+手当+保険" graphFn={yr => yr.takeHomePay} fn={(yr, s) => {
                return s === "本人" ? Math.round(yr.takeHomePay - yr.spouse.takeHome) : s === "配偶者" ? Math.round(yr.spouse.takeHome) : Math.round(yr.takeHomePay);
              }} />

              {/* ===== 税優遇 ===== */}
              {(yrs.some(yr => yr && yr.annualBenefit > 0) || (results.some(r => r.hasFuru) && yrs.some(yr => yr && yr.self.furusatoDonation > 0))) && (<>
                <S bg="bg-green-50">■ 税優遇</S>
                {yrs.some(yr => yr && yr.annualBenefit > 0) && (<>
                  <CG id="tax_dc" label="DC/iDeCo節税" color="#ea580c"
                    graphFn={yr => yr.annualBenefit}
                    fn={(yr, s) => {
                      const sp = yr.spouse.incomeTaxSaving + yr.spouse.residentTaxSaving;
                      return s === "本人" ? yr.annualBenefit : s === "配偶者" ? (sp || "-") : yr.annualBenefit + sp;
                    }} />
                  {openGroups.has("tax_dc") && <>
                    <R l="    所得税" sub graphFn={yr => yr.self.incomeTaxSaving}
                      hint={s0 ? `DC無しiTx(${m(s0.taxableIncome + s0.dcIdecoDeduction)})−有りiTx(${m(s0.taxableIncome)})=${m(s0.incomeTaxSaving)}` : "DC/iDeCo控除前後の所得税差額"}
                      fn={field(m => m.incomeTaxSaving)} />
                    <R l="    住民税" sub graphFn={yr => yr.self.residentTaxSaving}
                      hint={s0 ? `${m(s0.dcIdecoDeduction)}×10%=${m(s0.residentTaxSaving)}` : "DC控除額×住民税率10%"}
                      fn={field(m => m.residentTaxSaving)} />
                    <R l="    社保" sub graphFn={yr => yr.self.socialInsuranceSaving}
                      hint={s0 ? `DC自己負担分の社保料差額=${m(s0.socialInsuranceSaving)}` : "DC選択制による社保料削減"}
                      fn={(yr, s) => s === "本人" ? yr.self.socialInsuranceSaving : "-"} />
                  </>}
                </>)}
                {results.some(r => r.hasFuru) && yrs.some(yr => yr && yr.self.furusatoDonation > 0) && (<>
                  <CG id="tax_furusato" label="ふるさと納税" color="#2563eb"
                    graphFn={yr => yr.self.furusatoDonation}
                    fn={field(m => m.furusatoDonation)} />
                  {openGroups.has("tax_furusato") && <>
                    <R l="    控除上限額" sub graphFn={yr => yr.self.furusatoLimit}
                      hint={s0 ? `(${m(s0.taxableIncome)}×10%${s0.housingLoanDeductionRT > 0 ? `−HL${m(s0.housingLoanDeductionRT)}` : ""})×20%÷(90%−${s0.marginalRate}%×1.021)+2000=${m(s0.furusatoLimit)}` : "住民税所得割×20%÷(90%−税率×1.021)+2000"}
                      fn={field(m => m.furusatoLimit)} />
                    <R l="    実質控除額" sub
                      hint={s0 && s0.furusatoDeduction > 0 ? `¥${fmt(s0.furusatoDonation)}−2,000=¥${fmt(s0.furusatoDeduction)}` : "寄付額−自己負担2000円"}
                      fn={field(m => m.furusatoDeduction)} />
                  </>}
                </>)}
                {yrs.some(yr => yr && (yr.self.housingLoanDeduction > 0 || yr.spouse.housingLoanDeduction > 0)) &&
                  <R l="住宅ローン控除効果" hint="所得税+住民税からの税額控除合計" graphFn={yr => yr.self.housingLoanDeduction + yr.spouse.housingLoanDeduction}
                    fn={field(m => m.housingLoanDeduction)} />}
                {yrs.some(yr => yr && yr.dependentDeduction > 0) &&
                  <R l="扶養控除効果" hint="控除額×(所得税率+住民税10%) ※世帯主に集約" fn={(yr, s) => {
                    if (s === "配偶者") return "-";
                    const rate = (yr.self.marginalRate + 10) / 100;
                    const effect = Math.round(yr.dependentDeduction * rate);
                    return effect > 0 ? effect : "-";
                  }} />}
                {yrs.some(yr => yr && yr.pensionLossAnnual > 0) &&
                  <R l="厚生年金減少" neg hint="DC自己負担月額×5.481/1000×12" graphFn={yr => yr.pensionLossAnnual} fn={(yr, s) => s === "本人" ? yr.pensionLossAnnual : "-"} />}
              </>)}

              {/* ===== 退職金・相続 ===== */}
              {yrs.some(yr => yr && (yr.dcReceiveTax > 0 || yr.inheritanceTax > 0 || yr.inheritanceEstate > 0)) && <>
                <S bg="bg-orange-50">■ 退職金・相続</S>
                {yrs.some(yr => yr && yr.dcReceiveTax > 0) &&
                  <R l="DC受取時税金" neg bold hint="退職所得税: (DC−退職所得控除)×1/2に課税" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.dcReceiveTax > 0 ? yr.dcReceiveTax : "-") : "-"} />}
                {yrs.some(yr => yr && yr.inheritanceEstate > 0) &&
                  <R l="  課税遺産総額" sub hint="遺産−基礎控除(3000万+600万×法定相続人)" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.inheritanceEstate > 0 ? yr.inheritanceEstate : "-") : "-"} />}
                {yrs.some(yr => yr && yr.inheritanceTax > 0) &&
                  <R l="相続税" neg bold hint="法定相続分課税方式（配偶者軽減適用）" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.inheritanceTax > 0 ? yr.inheritanceTax : "-") : "-"} />}
              </>}

              {/* ===== 支出 ===== */}
              <S>■ 支出</S>
              <R l="基本生活費" hint="月額KF×12×インフレ率^経過年" graphFn={yr => yr.baseLivingExpense} fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.baseLivingExpense : "-"} />
              {/* DC拠出 */}
              {yrs.some(yr => yr && (yr.self.dcContribution > 0 || yr.spouse.dcContribution > 0)) &&
                <R l="DC/iDeCo拠出" hint="(DC+iDeCo)×12" graphFn={yr => yr.self.dcContribution + yr.spouse.dcContribution} fn={field(m => m.dcContribution)} />}
              {/* カテゴリ別折りたたみ */}
              {expenseGroups.map(cat => {
                const catTotal = (yr: YearResult) => cat.items.reduce((s, l) => s + (yr.eventCostBreakdown.find(c => c.label === l)?.amount ?? 0), 0);
                const hasAmount = yrs.some(yr => yr && catTotal(yr) !== 0);
                if (!hasAmount) return null;
                return <React.Fragment key={cat.key}>
                  <CG id={`exp_${cat.key}`} label={cat.label} color={cat.color} count={cat.items.length}
                    graphFn={catTotal} neg
                    fn={(yr, s) => { if (s === "配偶者") return "-"; const v = catTotal(yr); return v !== 0 ? v : "-"; }} />
                  {openGroups.has(`exp_${cat.key}`) && cat.items.map(label => {
                    const detail = (() => { for (const yr of yrs) { if (!yr) continue; const it = yr.eventCostBreakdown.find(c => c.label === label); if (it?.detail) return it.detail; } return undefined; })();
                    return <R key={label} l={`    ${label}`} sub hint={detail}
                      graphFn={yr => yr.eventCostBreakdown.find(c => c.label === label)?.amount ?? 0}
                      fn={(yr, s) => {
                        if (s === "配偶者") return "-";
                        const item = yr.eventCostBreakdown.find(c => c.label === label);
                        return item ? item.amount : 0;
                      }} />;
                  })}
                </React.Fragment>;
              })}
              <R l="支出合計" bold hint="基本生活費+イベント(継続+一時)" graphFn={yr => yr.totalExpense} fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.totalExpense : "-"} />
              <R l="年間CF" bold bg="bg-blue-50" hint="手取り−支出合計" graphFn={yr => yr.annualNetCashFlow} fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.annualNetCashFlow : "-"} />

              <S bg="bg-teal-100">■ 累積資産</S>
              <R l="DC資産" hint="毎年: 前年残高×(1+利回り)+年間拠出" graphFn={yr => yr.cumulativeDCAsset} fn={(yr, s) => {
                if (!hasSpouse) return Math.round(yr.cumulativeDCAsset);
                if (s === "本人") return Math.round(yr.self.dcAsset);
                if (s === "配偶者") return Math.round(yr.spouse.dcAsset);
                return Math.round(yr.cumulativeDCAsset);
              }} />
              <R l="再投資(目安)" hint="節税メリット分を複利運用した場合の参考値。総資産には含まない" graphFn={yr => yr.cumulativeReinvest} fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.cumulativeReinvest) : "-"} />
              {hasNISA ? (<>
                <CG id="asset_nisa" label="NISA" color="#22c55e"
                  graphFn={yr => yr.nisaAsset}
                  fn={(yr, s) => {
                    if (!hasSpouse) return Math.round(yr.nisaAsset);
                    if (s === "本人") return Math.round(yr.self.nisaAsset);
                    if (s === "配偶者") return Math.round(yr.spouse.nisaAsset);
                    return Math.round(yr.nisaAsset);
                  }} />
                {openGroups.has("asset_nisa") && <>
                  <R l="    元本(簿価)" sub hint="生涯枠判定に使用。売却で枠復活" graphFn={yr => yr.self.nisaCostBasis + yr.spouse.nisaCostBasis} fn={(yr, s) => {
                    if (!hasSpouse) return Math.round(yr.self.nisaCostBasis + yr.spouse.nisaCostBasis);
                    if (s === "本人") return Math.round(yr.self.nisaCostBasis);
                    if (s === "配偶者") return Math.round(yr.spouse.nisaCostBasis);
                    return Math.round(yr.self.nisaCostBasis + yr.spouse.nisaCostBasis);
                  }} />
                  <R l="    含み益" sub hint="時価−簿価（非課税）" graphFn={yr => yr.nisaGain} fn={(yr, s) => {
                    if (!hasSpouse) return Math.round(yr.nisaGain);
                    if (s === "本人") return Math.round(yr.self.nisaAsset - yr.self.nisaCostBasis);
                    if (s === "配偶者") return Math.round(yr.spouse.nisaAsset - yr.spouse.nisaCostBasis);
                    return Math.round(yr.nisaGain);
                  }} />
                  <R l="    積立(年間)" sub hint="余剰→NISA枠に自動配分" graphFn={yr => yr.nisaContribution} fn={(yr, s) => {
                    if (!hasSpouse) return yr.nisaContribution > 0 ? Math.round(yr.nisaContribution) : "-";
                    if (s === "本人") return yr.self.nisaContribution > 0 ? Math.round(yr.self.nisaContribution) : "-";
                    if (s === "配偶者") return yr.spouse.nisaContribution > 0 ? Math.round(yr.spouse.nisaContribution) : "-";
                    return yr.nisaContribution > 0 ? Math.round(yr.nisaContribution) : "-";
                  }} />
                  {yrs.some(yr => yr && yr.nisaWithdrawal > 0) &&
                    <R l="    取崩" sub hint="売却: 非課税。簿価分の枠が翌年復活" graphFn={yr => -yr.nisaWithdrawal} fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.nisaWithdrawal > 0 ? Math.round(-yr.nisaWithdrawal) : "-"} />}
                </>}
                <CG id="asset_taxable" label="特定口座" color="#3b82f6"
                  graphFn={yr => yr.taxableAsset}
                  fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableAsset) : "-"} />
                {openGroups.has("asset_taxable") && <>
                  <R l="    含み益" sub hint="評価額−取得原価" graphFn={yr => yr.taxableGain} fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableGain) : "-"} />
                  <R l="    課税額" sub neg hint="含み益×20.315%(所得税15.315%+住民税5%)" graphFn={yr => Math.round(yr.taxableGain * 0.20315)} fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableGain * 0.20315) : "-"} />
                  <R l="    積立(年間)" sub hint="NISA枠超過分を特定口座に自動配分" graphFn={yr => yr.taxableContribution} fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.taxableContribution > 0 ? Math.round(yr.taxableContribution) : "-") : "-"} />
                  {yrs.some(yr => yr && yr.taxableWithdrawal > 0) &&
                    <R l="    取崩" sub neg hint="売却時に含み益比率で課税" graphFn={yr => -yr.taxableWithdrawal} fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.taxableWithdrawal > 0 ? Math.round(-yr.taxableWithdrawal) : "-"} />}
                </>}
                <R l="現金" hint="生活防衛資金(月額×N月)を維持" graphFn={yr => yr.cashSavings} fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.cashSavings) : "-"} />
              </>) : (
                <R l="貯蓄" hint="前年残高×(1+利回り)+年間CF" graphFn={yr => yr.cumulativeSavings} fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(Math.max(yr.cumulativeSavings, 0)) : "-"} />
              )}
              {yrs.some(yr => yr && yr.loanBalance > 0) && <R l="ローン残高" neg hint="元利/元金均等の残高計算" graphFn={yr => -yr.loanBalance} fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.loanBalance > 0 ? -yr.loanBalance : "-"} />}
              <R l="総資産" bold bg="bg-teal-50" hint="DC+NISA+特定(税引後)+現金" graphFn={yr => yr.totalWealth} fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.totalWealth) : "-"} />
            </tbody>
          </table>

          {/* 累進税率ブラケット図 */}
          {yrs.some(yr => yr && (yr.self.taxableIncome > 0 || yr.spouse.taxableIncome > 0)) && (
            <div className="mt-3 rounded border p-2 space-y-1">
              <div className="text-[11px] font-bold text-gray-600">所得税 累進税率ブラケット（{age}歳時点）</div>
              {results.map((r, si) => {
                const yr = yrs[si];
                if (!yr || (yr.self.taxableIncome <= 0 && yr.spouse.taxableIncome <= 0)) return null;
                return (
                  <div key={si}>
                    {yr.self.taxableIncome > 0 && <TaxBracketChart taxableIncome={yr.self.taxableIncome} color={COLORS[si]} label={`${r.scenario.name} 本人`} />}
                    {hasSpouse && yr.spouse.taxableIncome > 0 && (
                      <TaxBracketChart taxableIncome={yr.spouse.taxableIncome} color="#ec4899" label={`${r.scenario.name} 配偶者`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 行ホバーでミニグラフ（マウス位置にオーバーレイ） */}
          {hovered && (() => {
            const graphW = 800;
            const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
            const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
            // カーソル右下に表示、画面外にはみ出す場合は左に
            let left = hovered.cx + 16;
            if (left + graphW > vw) left = hovered.cx - graphW - 16;
            left = Math.max(0, left);
            const top = Math.min(hovered.cy + 8, vh - 120);
            return (
              <div className="fixed z-50 pointer-events-none" style={{ top, left, width: graphW }}>
                <MiniLineChart results={results} label={hovered.label} graphFn={hovered.fn} selectedAge={age} />
              </div>
            );
          })()}
          </div>
  </>);
}
