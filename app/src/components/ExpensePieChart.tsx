import React, { useState } from "react";
import { fmtMan } from "../lib/format";
import type { ScenarioResult, YearResult } from "../lib/types";
import { EXPENSE_CATS, type ExpenseCategory } from "./IncomeExpenseChart";

const SCENARIO_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

// === 収入カテゴリ ===
type IncomeCategory = "selfGross" | "spouseGross" | "pension" | "survivor" | "allowance" | "insurancePayout";
const INCOME_CATS: { key: IncomeCategory; label: string; color: string }[] = [
  { key: "selfGross", label: "本人給与", color: "#2563eb" },
  { key: "spouseGross", label: "配偶者給与", color: "#ec4899" },
  { key: "pension", label: "老齢年金", color: "#f59e0b" },
  { key: "survivor", label: "遺族年金・保険", color: "#8b5cf6" },
  { key: "allowance", label: "児童手当", color: "#10b981" },
  { key: "insurancePayout", label: "保険金", color: "#06b6d4" },
];

// === 集計関数（年ごとの割合を平均） ===
// 各年でカテゴリ割合(%)を計算し、その割合を年数分平均する。
// インフレで後年の金額が膨らんでも割合ベースなので偏らない。
// 最終的な値は割合(0-1)で返すが、表示時に合計額も出すため元の平均額も保持。

function aggregateExpenses(yearResults: YearResult[]): Record<ExpenseCategory, number> {
  const keys: ExpenseCategory[] = ["living", "housing", "child", "car", "insurance", "other"];
  const ratioSum: Record<ExpenseCategory, number> = { living: 0, housing: 0, child: 0, car: 0, insurance: 0, other: 0 };
  const amountSum: Record<ExpenseCategory, number> = { living: 0, housing: 0, child: 0, car: 0, insurance: 0, other: 0 };
  const n = yearResults.length || 1;
  for (const yr of yearResults) {
    const yrData: Record<ExpenseCategory, number> = { living: yr.baseLivingExpense, housing: 0, child: 0, car: 0, insurance: 0, other: 0 };
    for (const c of yr.eventCostBreakdown) {
      if (c.amount <= 0) continue;
      const cat = EXPENSE_CATS.find(cat => cat.key !== "living" && cat.key !== "other" && cat.match(c.label));
      yrData[cat ? cat.key : "other"] += c.amount;
    }
    const yrTotal = keys.reduce((s, k) => s + yrData[k], 0);
    for (const k of keys) {
      ratioSum[k] += yrTotal > 0 ? yrData[k] / yrTotal : 0;
      amountSum[k] += yrData[k];
    }
  }
  // Return average amounts scaled by average ratio (so pie shows ratio-averaged proportions)
  const totalAvgAmount = keys.reduce((s, k) => s + amountSum[k] / n, 0);
  const result: Record<ExpenseCategory, number> = { living: 0, housing: 0, child: 0, car: 0, insurance: 0, other: 0 };
  for (const k of keys) result[k] = (ratioSum[k] / n) * totalAvgAmount;
  return result;
}

function aggregateIncome(yearResults: YearResult[]): Record<IncomeCategory, number> {
  const keys: IncomeCategory[] = ["selfGross", "spouseGross", "pension", "survivor", "allowance", "insurancePayout"];
  const ratioSum: Record<IncomeCategory, number> = { selfGross: 0, spouseGross: 0, pension: 0, survivor: 0, allowance: 0, insurancePayout: 0 };
  const amountSum: Record<IncomeCategory, number> = { selfGross: 0, spouseGross: 0, pension: 0, survivor: 0, allowance: 0, insurancePayout: 0 };
  const n = yearResults.length || 1;
  for (const yr of yearResults) {
    const yrData: Record<IncomeCategory, number> = {
      selfGross: yr.self.gross,
      spouseGross: yr.spouse.gross,
      pension: yr.self.pensionIncome + yr.spouse.pensionIncome,
      survivor: yr.survivorIncome,
      allowance: yr.childAllowance,
      insurancePayout: yr.insurancePayoutTotal,
    };
    const yrTotal = keys.reduce((s, k) => s + yrData[k], 0);
    for (const k of keys) {
      ratioSum[k] += yrTotal > 0 ? yrData[k] / yrTotal : 0;
      amountSum[k] += yrData[k];
    }
  }
  const totalAvgAmount = keys.reduce((s, k) => s + amountSum[k] / n, 0);
  const result: Record<IncomeCategory, number> = { selfGross: 0, spouseGross: 0, pension: 0, survivor: 0, allowance: 0, insurancePayout: 0 };
  for (const k of keys) result[k] = (ratioSum[k] / n) * totalAvgAmount;
  return result;
}

// === 汎用パイチャート ===
function PieSlice({ cx, cy, r, startAngle, endAngle, color }: {
  cx: number; cy: number; r: number; startAngle: number; endAngle: number; color: string;
}) {
  if (endAngle - startAngle >= Math.PI * 2 - 0.001) {
    return <circle cx={cx} cy={cy} r={r} fill={color} stroke="white" strokeWidth={1.5} />;
  }
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
  return <path d={d} fill={color} stroke="white" strokeWidth={1.5} />;
}

function GenericPie<K extends string>({ data, categories, centerLabel, size = 160 }: {
  data: Record<K, number>;
  categories: { key: K; label: string; color: string }[];
  centerLabel: string;
  size?: number;
}) {
  const entries = categories.filter(c => (data[c.key] || 0) > 0).map(c => ({ ...c, value: data[c.key] }));
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total <= 0) return <div className="text-xs text-gray-400">データなし</div>;

  const cx = size / 2, cy = size / 2, r = size / 2 - 8;
  let angle = -Math.PI / 2;

  return (
    <div className="inline-block">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {entries.map((e) => {
          const sliceAngle = (e.value / total) * Math.PI * 2;
          const startAngle = angle;
          angle += sliceAngle;
          const midAngle = startAngle + sliceAngle / 2;
          const labelR = r * 0.65;
          const lx = cx + labelR * Math.cos(midAngle);
          const ly = cy + labelR * Math.sin(midAngle);
          const pct = Math.round(e.value / total * 100);
          return (
            <g key={e.key}>
              <PieSlice cx={cx} cy={cy} r={r} startAngle={startAngle} endAngle={angle} color={e.color} />
              {pct >= 5 && (
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="white" fontWeight="700">
                  {pct}%
                </text>
              )}
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={r * 0.3} fill="white" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={8} fill="#374151" fontWeight="700">{centerLabel}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={9} fill="#374151" fontWeight="700">{fmtMan(total)}</text>
      </svg>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 justify-center">
        {entries.map(e => (
          <div key={e.key} className="flex items-center gap-0.5 text-[9px]">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: e.color }} />
            <span className="text-gray-600">{e.label}</span>
            <span className="text-gray-400">{fmtMan(e.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// === ミニ積み上げ面グラフ ===
function MiniStackedArea<K extends string>({ yearResults, categories, getData, width = 300, height = 80 }: {
  yearResults: YearResult[];
  categories: { key: K; label: string; color: string }[];
  getData: (yr: YearResult) => Record<K, number>;
  width?: number; height?: number;
}) {
  if (yearResults.length < 2) return null;
  const keys = categories.map(c => c.key);
  const data = yearResults.map(yr => getData(yr));
  const maxTotal = Math.max(...data.map(d => keys.reduce((s, k) => s + Math.max(d[k] || 0, 0), 0)), 1);
  const pL = 30, pR = 4, pT = 4, pB = 14;
  const w = width - pL - pR, h = height - pT - pB;
  const xStep = w / Math.max(yearResults.length - 1, 1);

  // Build stacked paths (bottom-up)
  const paths: { key: K; color: string; d: string }[] = [];
  const baseline = yearResults.map(() => 0);
  for (const cat of [...categories].reverse()) {
    const top = data.map((d, i) => baseline[i] + Math.max(d[cat.key] || 0, 0));
    const pathUp = top.map((v, i) => `${i === 0 ? "M" : "L"}${pL + i * xStep},${pT + h - (v / maxTotal) * h}`).join(" ");
    const pathDown = [...baseline].reverse().map((v, i) => `L${pL + (yearResults.length - 1 - i) * xStep},${pT + h - (v / maxTotal) * h}`).join(" ");
    paths.push({ key: cat.key, color: cat.color, d: `${pathUp} ${pathDown} Z` });
    for (let i = 0; i < top.length; i++) baseline[i] = top[i];
  }

  const startAge = yearResults[0].age;
  const endAge = yearResults[yearResults.length - 1].age;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {paths.reverse().map(p => <path key={p.key} d={p.d} fill={p.color} opacity={0.7} />)}
      {/* Y ticks */}
      {[0, 0.5, 1].map(r => (
        <g key={r}>
          <line x1={pL} y1={pT + h * (1 - r)} x2={pL + w} y2={pT + h * (1 - r)} stroke="#e5e7eb" strokeWidth={0.5} />
          <text x={pL - 2} y={pT + h * (1 - r) + 3} textAnchor="end" fontSize={7} fill="#9ca3af">{fmtMan(maxTotal * r)}</text>
        </g>
      ))}
      {/* X labels */}
      <text x={pL} y={height - 2} fontSize={7} fill="#9ca3af">{startAge}歳</text>
      <text x={pL + w} y={height - 2} textAnchor="end" fontSize={7} fill="#9ca3af">{endAge}歳</text>
    </svg>
  );
}

function getExpenseData(yr: YearResult): Record<ExpenseCategory, number> {
  const r: Record<ExpenseCategory, number> = { living: yr.baseLivingExpense, housing: 0, child: 0, car: 0, insurance: 0, other: 0 };
  for (const c of yr.eventCostBreakdown) {
    if (c.amount <= 0) continue;
    const cat = EXPENSE_CATS.find(cat => cat.key !== "living" && cat.key !== "other" && cat.match(c.label));
    r[cat ? cat.key : "other"] += c.amount;
  }
  return r;
}
function getIncomeData(yr: YearResult): Record<IncomeCategory, number> {
  return {
    selfGross: yr.self.gross, spouseGross: yr.spouse.gross,
    pension: yr.self.pensionIncome + yr.spouse.pensionIncome,
    survivor: yr.survivorIncome, allowance: yr.childAllowance, insurancePayout: yr.insurancePayoutTotal,
  };
}

// === StackedAreaChart互換のパイ表示（年割合平均） ===
export function PieForArea<K extends string>({ results, categories, getData }: {
  results: ScenarioResult[];
  categories: { key: K; label: string; color: string }[];
  getData: (yr: YearResult) => Record<K, number>;
}) {
  const keys = categories.map(c => c.key);
  function aggregate(yearResults: YearResult[]): Record<K, number> {
    const ratioSum = Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>;
    const amountSum = Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>;
    const n = yearResults.length || 1;
    for (const yr of yearResults) {
      const d = getData(yr);
      const total = keys.reduce((s, k) => s + Math.max(d[k] || 0, 0), 0);
      for (const k of keys) { ratioSum[k] += total > 0 ? Math.max(d[k] || 0, 0) / total : 0; amountSum[k] += Math.max(d[k] || 0, 0); }
    }
    const totalAvg = keys.reduce((s, k) => s + amountSum[k] / n, 0);
    const result = Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>;
    for (const k of keys) result[k] = (ratioSum[k] / n) * totalAvg;
    return result;
  }
  return (
    <div className="flex flex-wrap gap-6 justify-center">
      {results.map((r, i) => (
        <div key={i} className="text-center">
          <div className="text-xs font-bold mb-1" style={{ color: SCENARIO_COLORS[i] }}>{r.scenario.name}</div>
          <GenericPie data={aggregate(r.yearResults)} categories={categories} centerLabel="年平均" size={150} />
        </div>
      ))}
    </div>
  );
}

// === エクスポート ===
// シナリオごとに縦に並べ、収入・支出は横に並べる。ホバーで年次推移グラフ表示
export function ExpensePieCharts({ results }: { results: ScenarioResult[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (!results.length) return null;
  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-end">
        <div />
        <div className="text-[10px] font-bold text-gray-400 text-center">収入割合（年平均）</div>
        <div className="text-[10px] font-bold text-gray-400 text-center">支出割合（年平均）</div>
      </div>
      {results.map((r, i) => (
        <div key={i} className="border-t pt-2 first:border-t-0 first:pt-0"
          onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-start">
            {/* Scenario label */}
            <div className="text-xs font-bold pt-8 pr-1 whitespace-nowrap" style={{ color: SCENARIO_COLORS[i] }}>{r.scenario.name}</div>
            {/* Income pie */}
            <div className="flex justify-center">
              <GenericPie data={aggregateIncome(r.yearResults)} categories={INCOME_CATS} centerLabel="年平均" size={140} />
            </div>
            {/* Expense pie */}
            <div className="flex justify-center">
              <GenericPie data={aggregateExpenses(r.yearResults)} categories={EXPENSE_CATS} centerLabel="年平均" size={140} />
            </div>
          </div>
          {/* Hover: yearly breakdown sparklines */}
          {hoveredIdx === i && (
            <div className="grid grid-cols-[auto_1fr_1fr] gap-2 mt-1">
              <div className="text-[9px] text-gray-400 pt-2 pr-1">年次推移</div>
              <MiniStackedArea yearResults={r.yearResults} categories={INCOME_CATS} getData={getIncomeData} />
              <MiniStackedArea yearResults={r.yearResults} categories={EXPENSE_CATS} getData={getExpenseData} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
