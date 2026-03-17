import React from "react";
import { fmt, fmtMan } from "../lib/format";
import type { ScenarioResult } from "../lib/types";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

export function TotalAssetBar({ res, bestIdx }: { res: ScenarioResult[]; bestIdx: number }) {
  if (!res.length) return null;
  const maxVal = Math.max(...res.map((s) => s.finalWealth));
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="mb-2 text-sm font-bold text-gray-700">最終資産の比較</p>
      <div className="space-y-2">
        {res.map((s, i) => {
          const pct = maxVal > 0 ? (s.finalWealth / maxVal) * 100 : 0;
          const ly = s.yearResults[s.yearResults.length - 1];
          return (
            <div key={i}>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="font-bold" style={{ color: COLORS[i] }}>{s.scenario.name}{i === bestIdx ? " 🏆" : ""}</span>
                <span className="font-mono font-bold">{fmtMan(s.finalWealth)}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <span>DC: {fmtMan(s.finalAssetNet)}</span>
                <span>+再投資: {fmtMan(s.fvB)}</span>
                {ly && ly.nisaAsset > 0 ? (
                  <>
                    <span className="text-green-500">+NISA: {fmtMan(ly.nisaAsset)}</span>
                    <span>+現金: {fmtMan(Math.max(ly.cashSavings, 0))}</span>
                  </>
                ) : ly && <span>+貯蓄: {fmtMan(Math.max(ly.cumulativeSavings, 0))}</span>}
              </div>
              <div className="mt-0.5 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: COLORS[i] }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
