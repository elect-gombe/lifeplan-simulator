import React from "react";
import { fmt, fmtMan } from "../lib/format";
import type { ScenarioResult } from "../lib/types";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

export function SummaryCard({ s, idx, isBest, rr }: {
  s: ScenarioResult; idx: number; isBest: boolean; rr: number;
}) {
  const ly = s.yearResults[s.yearResults.length - 1];
  return (
    <div className={`min-w-0 rounded border-2 p-3 ${isBest ? "ring-2 ring-blue-600 bg-blue-50" : "bg-gray-50"}`} style={{ borderColor: COLORS[idx] }}>
      <div className="mb-2 text-sm font-bold" style={{ color: COLORS[idx] }}>{s.scenario.name} {isBest && "⭐"}</div>
      <div className="space-y-1 text-xs">
        {/* Wealth breakdown */}
        <div className="rounded bg-white p-2 space-y-1" style={{ borderLeft: `3px solid ${COLORS[idx]}` }}>
          <div className="flex justify-between font-bold text-sm">
            <span>最終総資産</span>
            <span className="font-mono">{fmtMan(s.finalWealth)}</span>
          </div>
          <div className="border-t pt-1 space-y-0.5">
            <div className="flex justify-between pl-2">
              <span className="text-gray-600">DC資産（課税後）</span>
              <span className="font-mono">{fmtMan(s.finalAssetNet)}</span>
            </div>
            <div className="flex justify-between pl-2">
              <span className="text-gray-600">再投資将来価値</span>
              <span className="font-mono">{fmtMan(s.fvB)}</span>
            </div>
            {ly && ly.nisaAsset > 0 ? (
              <>
                <div className="flex justify-between pl-2">
                  <span className="text-green-600">NISA資産</span>
                  <span className="font-mono">{fmtMan(ly.nisaAsset)}</span>
                </div>
                <div className="flex justify-between pl-2">
                  <span className="text-gray-600">現金</span>
                  <span className="font-mono">{fmtMan(Math.max(ly.cashSavings, 0))}</span>
                </div>
              </>
            ) : ly && (
              <div className="flex justify-between pl-2">
                <span className="text-gray-600">貯蓄（運用後）</span>
                <span className="font-mono">{fmtMan(Math.max(ly.cumulativeSavings, 0))}</span>
              </div>
            )}
          </div>
        </div>

        {/* Costs */}
        <div className="rounded bg-white p-2 space-y-0.5" style={{ borderLeft: "3px solid #ef4444" }}>
          <div className="flex justify-between pl-2">
            <span className="text-red-500">出口課税</span>
            <span className="font-mono text-red-500">¥{fmt(s.exitDelta)}</span>
          </div>
          <div className="flex justify-between pl-2">
            <span className="text-red-500">厚生年金損失</span>
            <span className="font-mono text-red-500">{fmtMan(s.pvPL)}</span>
          </div>
        </div>

        {/* Last year snapshot */}
        {ly && (
          <div className="rounded bg-white p-2 space-y-0.5" style={{ borderLeft: "3px solid #a3a3a3" }}>
            <div className="text-gray-500">退職直前（{ly.age}歳）</div>
            <div className="flex justify-between pl-2">
              <span className="text-gray-600">年収</span>
              <span className="font-mono">{Math.round(ly.grossMan)}万円</span>
            </div>
            <div className="flex justify-between pl-2">
              <span className="text-gray-600">手取り</span>
              <span className="font-mono">{fmtMan(ly.takeHomePay)}</span>
            </div>
            <div className="flex justify-between pl-2">
              <span className="text-gray-600">支出</span>
              <span className="font-mono">{fmtMan(ly.totalExpense)}</span>
            </div>
            <div className="flex justify-between pl-2">
              <span className="text-gray-600">節税メリット/年</span>
              <span className="font-mono">¥{fmt(ly.annualBenefit)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
