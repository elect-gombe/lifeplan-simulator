import React from "react";
import { fmtMan } from "../lib/format";
import type { ScenarioResult, YearResult, MemberResult } from "../lib/types";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

const LAYERS = [
  { key: "it", label: "所得税", color: "#ef4444" },
  { key: "rt", label: "住民税", color: "#f97316" },
  { key: "pension", label: "厚生年金", color: "#eab308" },
  { key: "health", label: "健保", color: "#f59e0b" },
  { key: "nursing", label: "介護", color: "#d97706" },
  { key: "employ", label: "雇用", color: "#b45309" },
  { key: "dc", label: "DC/iDeCo", color: "#3b82f6" },
] as const;

type Rates = { it: number; rt: number; pension: number; health: number; nursing: number; employ: number; dc: number; total: number; take: number };

function ratesOf(m: MemberResult): Rates {
  // 総収入 = 給与 + 年金（分母として使用）
  const totalIncome = m.gross + m.pensionIncome;
  if (totalIncome <= 0) return { it: 0, rt: 0, pension: 0, health: 0, nursing: 0, employ: 0, dc: 0, total: 0, take: 0 };
  const it = m.incomeTax / totalIncome * 100;
  const rt = m.residentTax / totalIncome * 100;
  const hasSIBreakdown = m.siPension > 0 || m.siHealth > 0 || m.siNursing > 0;
  const pension = hasSIBreakdown ? m.siPension / totalIncome * 100 : m.socialInsurance / totalIncome * 100;
  const health = hasSIBreakdown ? m.siHealth / totalIncome * 100 : 0;
  const nursing = hasSIBreakdown ? m.siNursing / totalIncome * 100 : 0;
  const employ = hasSIBreakdown ? (m.siEmployment + m.siChildSupport) / totalIncome * 100 : 0;
  const dc = (m.selfDCContribution + m.idecoContribution) / totalIncome * 100;
  const total = it + rt + pension + health + nursing + employ + dc;
  return { it, rt, pension, health, nursing, employ, dc, total, take: m.takeHome / totalIncome * 100 };
}

function maxTotalRate(m: MemberResult): number {
  return ratesOf(m).total;
}

type Member = "self" | "spouse";
const getMember = (yr: YearResult, who: Member): MemberResult => who === "self" ? yr.self : yr.spouse;

function SingleChart({ result, color, label, yMax, member, hoverAge, onHoverAge }: {
  result: ScenarioResult; color: string; label: string; yMax: number; member: Member;
  hoverAge: number | null; onHoverAge: (age: number | null) => void;
}) {
  const yrs = result.yearResults;
  const hoverIdx = hoverAge != null ? (() => { const i = yrs.findIndex(yr => yr.age === hoverAge); return i >= 0 ? i : null; })() : null;
  const n = yrs.length;
  if (!n) return null;

  const rates = yrs.map(yr => ratesOf(getMember(yr, member)));
  if (rates.every(r => r.total === 0)) return null;

  const W = 500, H = 150, pL = 38, pR = 10, pT = 8, pB = 22;
  const cW = W - pL - pR, cH = H - pT - pB;
  const xStep = cW / Math.max(n - 1, 1);
  const xAt = (i: number) => pL + i * xStep;
  const yScale = cH / yMax;
  const yAt = (v: number) => pT + (yMax - v) * yScale;

  const cumKeys = ["it", "rt", "pension", "health", "nursing", "employ", "dc"] as const;
  const cumAt = (i: number, li: number) => {
    let s = 0;
    for (let k = 0; k <= li; k++) s += (rates[i] as any)[cumKeys[k]];
    return s;
  };

  const areaPath = (li: number) => {
    const top = Array.from({ length: n }, (_, i) => `${xAt(i)},${yAt(cumAt(i, li))}`).join(" L");
    const bot = li === 0
      ? `${xAt(n - 1)},${yAt(0)} L${xAt(0)},${yAt(0)}`
      : Array.from({ length: n }, (_, i) => `${xAt(n - 1 - i)},${yAt(cumAt(n - 1 - i, li - 1))}`).join(" L");
    return `M${top} L${bot} Z`;
  };

  const takeLine = rates.map((r, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(r.take)}`).join(" ");
  const h = hoverIdx != null ? { yr: yrs[hoverIdx], m: getMember(yrs[hoverIdx], member), r: rates[hoverIdx] } : null;
  const hTotalIncome = h ? h.m.gross + h.m.pensionIncome : 0;

  return (
    <div>
      <div className="text-xs font-bold mb-0.5" style={{ color }}>{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full cursor-crosshair" onMouseLeave={() => onHoverAge(null)}>
        {Array.from({ length: Math.floor(yMax / 10) + 1 }, (_, i) => i * 10).map(v => (
          <g key={v}>
            <line x1={pL} y1={yAt(v)} x2={pL + cW} y2={yAt(v)} stroke="#e2e8f0" strokeWidth={0.5} />
            <text x={pL - 3} y={yAt(v) + 3} textAnchor="end" fontSize={7} fill="#94a3b8">{v}%</text>
          </g>
        ))}
        {LAYERS.map((l, li) => (
          <path key={l.key} d={areaPath(li)} fill={l.color} opacity={0.25} />
        ))}
        <path d={takeLine} fill="none" stroke="#16a34a" strokeWidth={1.5} opacity={0.7} />
        <line x1={pL} y1={pT + cH} x2={pL + cW} y2={pT + cH} stroke="#334155" strokeWidth={0.5} />
        {yrs.filter(yr => yr.age % 5 === 0).map(yr => (
          <text key={yr.age} x={xAt(yrs.indexOf(yr))} y={H - 4} textAnchor="middle" fontSize={7} fill="#64748b">{yr.age}</text>
        ))}
        {yrs.map((_, i) => (
          <rect key={i} x={xAt(i) - xStep / 2} y={pT} width={xStep} height={cH}
            fill="transparent" onMouseEnter={() => onHoverAge(yrs[i].age)} />
        ))}
        {hoverIdx != null && (
          <line x1={xAt(hoverIdx)} y1={pT} x2={xAt(hoverIdx)} y2={pT + cH} stroke="#475569" strokeWidth={1} strokeDasharray="2,2" />
        )}
      </svg>
      {h && hTotalIncome > 0 && (
        <div className="rounded bg-gray-50 border p-1 text-[10px] flex flex-wrap gap-x-2 mt-0.5">
          <span className="font-bold">{h.yr.age}歳 {fmtMan(hTotalIncome)}{h.m.pensionIncome > 0 && h.m.gross > 0 ? `(給与${fmtMan(h.m.gross)}+年金${fmtMan(h.m.pensionIncome)})` : h.m.pensionIncome > 0 ? "(年金)" : ""}</span>
          <span className="text-red-500">所得税{h.r.it.toFixed(1)}%</span>
          <span className="text-orange-500">住民税{h.r.rt.toFixed(1)}%</span>
          {h.r.pension > 0 && <span style={{ color: "#eab308" }}>厚年{h.r.pension.toFixed(1)}%</span>}
          {h.r.health > 0 && <span style={{ color: "#f59e0b" }}>{h.m.gross > 0 ? "健保" : h.yr.age >= 75 ? "後期高齢" : "国保"}{h.r.health.toFixed(1)}%</span>}
          {h.r.nursing > 0 && <span style={{ color: "#d97706" }}>介護{h.r.nursing.toFixed(1)}%</span>}
          {h.r.employ > 0 && <span style={{ color: "#b45309" }}>雇用{h.r.employ.toFixed(1)}%</span>}
          {h.r.dc > 0 && <span className="text-blue-500">DC{h.r.dc.toFixed(1)}%</span>}
          <span className="font-bold text-red-700">負担{h.r.total.toFixed(1)}%</span>
          <span className="font-bold text-green-600">手取{h.r.take.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

export function TaxRateCharts({ results, hoverAge, onHoverAge }: { results: ScenarioResult[]; hoverAge: number | null; onHoverAge: (age: number | null) => void }) {
  if (!results.length || !results[0].yearResults.length) return null;

  const hasSpouse = results.some(r => r.scenario.spouse?.enabled);

  const yMax = Math.ceil(Math.max(
    ...results.flatMap(r => r.yearResults.flatMap(yr => [maxTotalRate(yr.self), maxTotalRate(yr.spouse)])),
    30,
  ) / 10) * 10;

  return (
    <details className="rounded-lg border bg-white" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-gray-700">税負担率の推移</summary>
      <div className="px-3 pb-3 space-y-3">
        {results.map((r, i) => (
          <div key={i} className={`${hasSpouse ? "grid grid-cols-2 gap-3" : ""}`}>
            <SingleChart result={r} color={COLORS[i]} label={`${r.scenario.name} — 本人`} yMax={yMax} member="self" hoverAge={hoverAge} onHoverAge={onHoverAge} />
            {hasSpouse && (
              <SingleChart result={r} color="#ec4899" label={`${r.scenario.name} — 配偶者`} yMax={yMax} member="spouse" hoverAge={hoverAge} onHoverAge={onHoverAge} />
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] justify-center">
          {LAYERS.map(l => (
            <span key={l.key} className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: l.color, opacity: 0.5 }} />{l.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-green-500" />手取り率
          </span>
        </div>
      </div>
    </details>
  );
}
