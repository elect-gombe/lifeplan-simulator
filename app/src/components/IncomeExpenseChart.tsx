import React, { useState } from "react";
import { fmtMan } from "../lib/format";
import type { ScenarioResult, YearResult } from "../lib/types";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

// 支出カテゴリ分類
export type ExpenseCategory = "living" | "housing" | "child" | "car" | "insurance" | "other";
export const EXPENSE_CATS: { key: ExpenseCategory; label: string; color: string; match: (label: string) => boolean }[] = [
  { key: "living", label: "生活費", color: "#6366f1", match: () => false }, // baseLivingExpenseで別処理
  { key: "housing", label: "住居費", color: "#3b82f6", match: l => /ローン|管理費|固定資産税|頭金|家賃/.test(l) },
  { key: "child", label: "養育費", color: "#f59e0b", match: l => /子|教育|大学|高校|中学|小学|保育|幼稚|大学院/.test(l) },
  { key: "car", label: "車関連", color: "#10b981", match: l => /車|カー/.test(l) },
  { key: "insurance", label: "保険料", color: "#8b5cf6", match: l => /保険料/.test(l) },
  { key: "other", label: "その他", color: "#94a3b8", match: () => true },
];

function categorizeExpenses(yr: YearResult): Record<ExpenseCategory, number> {
  const result: Record<ExpenseCategory, number> = { living: yr.baseLivingExpense, housing: 0, child: 0, car: 0, insurance: 0, other: 0 };
  for (const c of yr.eventCostBreakdown) {
    if (c.amount <= 0) continue; // 控除・収入は除外
    const cat = EXPENSE_CATS.find(cat => cat.key !== "living" && cat.key !== "other" && cat.match(c.label));
    result[cat ? cat.key : "other"] += c.amount;
  }
  return result;
}

// 収入カテゴリ
type IncomeCategory = "selfGross" | "spouseGross" | "pension" | "survivor" | "allowance" | "insurancePayout";
const INCOME_CATS: { key: IncomeCategory; label: string; color: string }[] = [
  { key: "selfGross", label: "本人給与", color: "#2563eb" },
  { key: "spouseGross", label: "配偶者給与", color: "#ec4899" },
  { key: "pension", label: "老齢年金", color: "#f59e0b" },
  { key: "survivor", label: "遺族年金・保険", color: "#8b5cf6" },
  { key: "allowance", label: "児童手当", color: "#10b981" },
  { key: "insurancePayout", label: "保険金", color: "#06b6d4" },
];

function categorizeIncome(yr: YearResult): Record<IncomeCategory, number> {
  return {
    selfGross: yr.self.gross,
    spouseGross: yr.spouse.gross,
    pension: yr.self.pensionIncome + yr.spouse.pensionIncome,
    survivor: yr.survivorIncome,
    allowance: yr.childAllowance,
    insurancePayout: yr.insurancePayoutTotal,
  };
}

// 汎用スタックエリアチャート
function StackedAreaChart<K extends string>({ title, results, categories, getData, overlayLine, hoverAge, onHoverAge, selScenario, onSelScenario }: {
  title: string;
  results: ScenarioResult[];
  categories: { key: K; label: string; color: string }[];
  getData: (yr: YearResult) => Record<K, number>;
  overlayLine?: { label: string; color: string; fn: (yr: YearResult) => number };
  hoverAge: number | null;
  onHoverAge: (age: number | null) => void;
  selScenario: number;
  onSelScenario: (i: number) => void;
}) {
  const si = Math.min(selScenario, results.length - 1);
  const yrs = results[si]?.yearResults || [];
  const n = yrs.length;
  if (!n) return null;

  const hoverIdx = hoverAge != null ? (() => { const i = yrs.findIndex(yr => yr.age === hoverAge); return i >= 0 ? i : null; })() : null;

  const data = yrs.map(getData);
  const activeCats = categories.filter(c => data.some(d => d[c.key] > 0));
  if (!activeCats.length) return null;

  const W = 600, H = 180, pL = 50, pR = 10, pT = 8, pB = 22;
  const cW = W - pL - pR, cH = H - pT - pB;
  const xStep = cW / Math.max(n - 1, 1);
  const x = (i: number) => pL + i * xStep;

  // 積み上げ合計の最大
  const totals = data.map(d => activeCats.reduce((s, c) => s + Math.max(d[c.key], 0), 0));
  const yMax = Math.max(...totals, 1);
  const yScale = cH / yMax;
  const y = (v: number) => pT + (yMax - v) * yScale;

  // 積み上げパス
  const cumAt = (i: number, ci: number) => {
    let s = 0;
    for (let k = 0; k <= ci; k++) s += Math.max(data[i][activeCats[k].key], 0);
    return s;
  };
  const areaPath = (ci: number) => {
    const top = Array.from({ length: n }, (_, i) => `${x(i)},${y(cumAt(i, ci))}`).join(" L");
    const bot = ci === 0
      ? `${x(n - 1)},${y(0)} L${x(0)},${y(0)}`
      : Array.from({ length: n }, (_, i) => `${x(n - 1 - i)},${y(cumAt(n - 1 - i, ci - 1))}`).join(" L");
    return `M${top} L${bot} Z`;
  };

  // 合計ライン
  const totalLine = totals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  const hd = hoverIdx != null ? { yr: yrs[hoverIdx], d: data[hoverIdx], total: totals[hoverIdx] } : null;

  return (
    <div>
      {results.length > 1 && (
        <div className="flex gap-1 mb-1">
          {results.map((r, i) => (
            <button key={i} onClick={() => onSelScenario(i)}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${i === si ? "text-white" : "bg-gray-100 text-gray-500"}`}
              style={i === si ? { backgroundColor: COLORS[i] } : undefined}>
              {r.scenario.name}
            </button>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full cursor-crosshair" onMouseLeave={() => onHoverAge(null)}>
        {/* Y grid */}
        {Array.from({ length: 5 }, (_, i) => Math.round(yMax / 4 * i)).map((v, i) => (
          <g key={i}>
            <line x1={pL} y1={y(v)} x2={pL + cW} y2={y(v)} stroke="#e2e8f0" strokeWidth={0.5} />
            <text x={pL - 4} y={y(v) + 3} textAnchor="end" fontSize={7} fill="#94a3b8">{fmtMan(v)}</text>
          </g>
        ))}
        {/* Stacked areas */}
        {activeCats.map((c, ci) => (
          <path key={c.key} d={areaPath(ci)} fill={c.color} opacity={0.35} />
        ))}
        {/* Total line */}
        <path d={totalLine} fill="none" stroke="#334155" strokeWidth={1.5} opacity={0.5} />
        {/* Overlay line (e.g. net worth) */}
        {overlayLine && (() => {
          const vals = yrs.map(overlayLine.fn);
          const oPath = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(Math.max(v, 0))}`).join(" ");
          return <path d={oPath} fill="none" stroke={overlayLine.color} strokeWidth={2} strokeDasharray="4,2" opacity={0.8} />;
        })()}
        {/* X axis */}
        <line x1={pL} y1={pT + cH} x2={pL + cW} y2={pT + cH} stroke="#334155" strokeWidth={0.5} />
        {yrs.filter(yr => yr.age % 5 === 0).map(yr => {
          const i = yrs.indexOf(yr);
          return <text key={yr.age} x={x(i)} y={H - 4} textAnchor="middle" fontSize={7} fill="#64748b">{yr.age}</text>;
        })}
        {/* Hover zones */}
        {yrs.map((_, i) => (
          <rect key={i} x={x(i) - xStep / 2} y={pT} width={xStep} height={cH}
            fill="transparent" onMouseEnter={() => onHoverAge(yrs[i].age)} />
        ))}
        {hoverIdx != null && (
          <line x1={x(hoverIdx)} y1={pT} x2={x(hoverIdx)} y2={pT + cH} stroke="#475569" strokeWidth={1} strokeDasharray="2,2" />
        )}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] mt-1">
        {activeCats.map(c => (
          <span key={c.key} className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: c.color, opacity: 0.5 }} />{c.label}
          </span>
        ))}
        {overlayLine && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: overlayLine.color }} />{overlayLine.label}
          </span>
        )}
      </div>
      {/* Tooltip */}
      {hd && (
        <div className="mt-1 rounded bg-gray-50 border p-1.5 text-[10px] flex flex-wrap gap-x-3">
          <span className="font-bold">{hd.yr.age}歳 合計{fmtMan(hd.total)}</span>
          {activeCats.map(c => {
            const v = hd.d[c.key];
            return v > 0 ? <span key={c.key} style={{ color: c.color }}>{c.label} {fmtMan(v)}</span> : null;
          })}
          {overlayLine && <span className="font-bold" style={{ color: overlayLine.color }}>{overlayLine.label} {fmtMan(overlayLine.fn(hd.yr))}</span>}
        </div>
      )}
    </div>
  );
}

// 資産カテゴリ
type AssetCategory = "dc" | "nisa" | "taxable" | "cash" | "loanNeg";
const ASSET_CATS: { key: AssetCategory; label: string; color: string }[] = [
  { key: "dc", label: "DC/iDeCo", color: "#f59e0b" },
  { key: "nisa", label: "NISA", color: "#22c55e" },
  { key: "taxable", label: "特定口座", color: "#3b82f6" },
  { key: "cash", label: "現金", color: "#94a3b8" },
  { key: "loanNeg", label: "ローン残高", color: "#ef4444" },
];

function categorizeAssets(yr: YearResult): Record<AssetCategory, number> {
  return {
    dc: yr.cumulativeDCAsset,
    nisa: yr.nisaAsset,
    taxable: yr.taxableAsset,
    cash: Math.max(yr.cashSavings, 0),
    loanNeg: 0, // 負債は積み上げに入れない（ツールチップで表示）
  };
}

// 負債込みの純資産ライン用
function netWorth(yr: YearResult): number {
  return yr.totalWealth;
}

export function IncomeExpenseCharts({ results, hoverAge, onHoverAge }: { results: ScenarioResult[]; hoverAge: number | null; onHoverAge: (age: number | null) => void }) {
  const [selScenario, setSelScenario] = useState(0);
  if (!results.length || !results[0].yearResults.length) return null;
  const shared = { hoverAge, onHoverAge, selScenario, onSelScenario: setSelScenario };
  return (
    <details className="rounded-lg border bg-white" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-gray-700">収入・支出・資産の推移</summary>
      <div className="px-3 pb-3 space-y-4">
        <div>
          <div className="text-xs font-bold text-gray-600 mb-1">収入の内訳</div>
          <StackedAreaChart title="収入" results={results} categories={INCOME_CATS} getData={categorizeIncome} {...shared} />
        </div>
        <div>
          <div className="text-xs font-bold text-gray-600 mb-1">支出の内訳</div>
          <StackedAreaChart title="支出" results={results} categories={EXPENSE_CATS} getData={categorizeExpenses} {...shared} />
        </div>
        <div>
          <div className="text-xs font-bold text-gray-600 mb-1">資産の内訳</div>
          <StackedAreaChart title="資産" results={results} categories={ASSET_CATS} getData={categorizeAssets}
            overlayLine={{ label: "純資産", color: "#1e293b", fn: netWorth }} {...shared} />
        </div>
      </div>
    </details>
  );
}
