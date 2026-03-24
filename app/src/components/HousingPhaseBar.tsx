import React from "react";
import type { HousingPhase } from "../lib/types";
import { buildLoanSchedule } from "../lib/calc";

interface PhaseInfo {
  phase: HousingPhase;
  index: number;
  startAge: number;
  endAge: number;
  widthPct: number;
  // own only
  loanEndAge?: number;
  effectiveLoanYears?: number;
  hasLoan?: boolean;
}

export function HousingPhaseBar({ phases, currentAge, endAge, onPhaseClick, showAgeLabels }: {
  phases: HousingPhase[];
  currentAge: number;
  endAge: number;
  onPhaseClick?: (index: number) => void;
  showAgeLabels?: boolean;
}) {
  const totalSpan = Math.max(endAge - currentAge, 1);
  const phaseEnd = (i: number) => i < phases.length - 1 ? phases[i + 1].startAge : endAge;

  const infos: PhaseInfo[] = phases.map((p, i) => {
    const end = phaseEnd(i);
    const info: PhaseInfo = {
      phase: p, index: i, startAge: p.startAge, endAge: end,
      widthPct: Math.max((end - p.startAge) / totalSpan * 100, 3),
    };
    if (p.type === "own" && p.propertyParams) {
      const pp = p.propertyParams;
      const hasLoan = (pp.priceMan - pp.downPaymentMan) > 0;
      const schedule = hasLoan ? buildLoanSchedule(pp, p.startAge) : [];
      const effectiveLoanYears = schedule.length > 0 ? schedule.length : (hasLoan ? pp.loanYears : 0);
      const saleAge = (i < phases.length - 1) ? end : pp.saleAge;
      info.loanEndAge = Math.min(p.startAge + effectiveLoanYears, saleAge ?? end);
      info.effectiveLoanYears = effectiveLoanYears;
      info.hasLoan = hasLoan;
    }
    return info;
  });

  return (
    <div>
      {/* Main bar */}
      <div className="flex rounded overflow-hidden h-6 border border-gray-200">
        {infos.map((info) => {
          const { phase: p, index: i, endAge: end } = info;

          if (p.type === "own" && p.propertyParams) {
            const pp = p.propertyParams;
            const loanPct = info.hasLoan ? Math.max((info.loanEndAge! - p.startAge) / (end - p.startAge) * 100, 0) : 100;
            const postPct = 100 - loanPct;

            return (
              <div key={i} className="relative group flex h-full"
                style={{ width: `${info.widthPct}%`, cursor: onPhaseClick ? "pointer" : undefined }}
                onClick={() => onPhaseClick?.(i)}>
                {/* Loan period - solid blue */}
                <div className="bg-blue-400 flex items-center justify-center" style={{ width: `${loanPct}%` }} />
                {/* Post-loan - stripe */}
                {postPct > 0 && (
                  <div style={{ width: `${postPct}%`, background: "repeating-linear-gradient(45deg, #93c5fd, #93c5fd 2px, #bfdbfe 2px, #bfdbfe 4px)" }} />
                )}
                {/* Divider line */}
                {postPct > 0 && loanPct > 0 && loanPct < 100 && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-blue-600" style={{ left: `${loanPct}%` }} />
                )}
                {/* Center label */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[8px] text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] whitespace-nowrap">
                    🏠{pp.priceMan}万
                  </span>
                </div>
                {/* Tooltip */}
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-2 py-1 text-[9px] whitespace-nowrap z-10 mb-1">
                  {p.startAge}〜{end}歳({end - p.startAge}年) 持家{pp.priceMan}万
                  {info.hasLoan && ` ローン${info.effectiveLoanYears}年(〜${info.loanEndAge}歳)`}
                  {postPct > 0 && ` → 完済後${end - info.loanEndAge!}年`}
                  {onPhaseClick && " クリックで編集"}
                </div>
              </div>
            );
          }

          // Rent phase
          return (
            <div key={i} className="bg-gray-400 relative group flex items-center justify-center text-[8px] text-white font-bold hover:opacity-90"
              style={{ width: `${info.widthPct}%`, cursor: onPhaseClick ? "pointer" : undefined }}
              onClick={() => onPhaseClick?.(i)}>
              🏢{p.rentMonthlyMan ?? "?"}万/月
              <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-2 py-1 text-[9px] whitespace-nowrap z-10 mb-1">
                {p.startAge}〜{end}歳({end - p.startAge}年) 賃貸{p.rentMonthlyMan}万/月
                {onPhaseClick && " クリックで編集"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Annotation labels below the bar */}
      <div className="relative" style={{ height: 14 }}>
        {infos.map((info) => {
          const { phase: p, index: i } = info;
          const leftPct = (info.startAge - currentAge) / totalSpan * 100;

          if (p.type === "rent") {
            return (
              <span key={`lbl${i}`} className="absolute text-[8px] text-gray-400" style={{ left: `${leftPct}%` }}>
                {info.startAge}歳 賃貸
              </span>
            );
          }

          if (p.type === "own" && info.hasLoan && info.loanEndAge! < info.endAge) {
            const loanEndPct = (info.loanEndAge! - currentAge) / totalSpan * 100;
            return (
              <React.Fragment key={`lbl${i}`}>
                <span className="absolute text-[8px] text-blue-500" style={{ left: `${leftPct}%` }}>
                  {info.startAge}歳 購入
                </span>
                <span className="absolute text-[8px] text-blue-400 font-semibold" style={{ left: `${loanEndPct}%` }}>
                  {info.loanEndAge}歳 完済✓
                </span>
              </React.Fragment>
            );
          }

          return (
            <span key={`lbl${i}`} className="absolute text-[8px] text-blue-500" style={{ left: `${leftPct}%` }}>
              {info.startAge}歳 購入
            </span>
          );
        })}
        {showAgeLabels !== false && (
          <span className="absolute right-0 text-[8px] text-gray-400">{endAge}歳</span>
        )}
      </div>
    </div>
  );
}
