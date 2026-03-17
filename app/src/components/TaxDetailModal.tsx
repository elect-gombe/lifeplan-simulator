import React from "react";
import { fmt, fmtMan } from "../lib/format";
import { EVENT_TYPES, isEventActive } from "../lib/types";
import { Row, Sec } from "./ui";
import type { ScenarioResult, BaseResult, YearResult } from "../lib/types";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

export function TaxDetailModal({ isOpen, onClose, age, results, base, sirPct }: {
  isOpen: boolean; onClose: () => void; age: number | null;
  results: ScenarioResult[]; base: BaseResult; sirPct: number;
}) {
  if (!isOpen || age == null) return null;

  const yearData: (YearResult | undefined)[] = results.map(r => r.yearResults.find(yr => yr.age === age));
  const colSpan = results.length + 1;
  const g = (fn: (yr: YearResult | undefined, r: ScenarioResult) => any) => results.map((r, i) => fn(yearData[i], r));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-bold">{age}歳時点の詳細</p>
          <button onClick={onClose} className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100">閉じる</button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">
          <table className="w-full table-fixed border-collapse border border-gray-400 text-[11px] leading-tight">
            <thead className="sticky top-0 z-10 bg-gray-200">
              <tr>
                <th className="w-[45%] border border-gray-300 px-1.5 py-1 text-left">項目</th>
                {results.map((r, i) => (
                  <th key={i} className="border border-gray-300 px-1.5 py-1 text-center" style={{ color: COLORS[i] }}>{r.scenario.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Sec c="bg-gray-100" colSpan={colSpan}>■ 収入・税金</Sec>
              <Row l="年収" vs={g((yr) => yr ? `${Math.round(yr.grossMan)}万円` : "-")} bold />
              <Row l="所得税" vs={g((yr) => yr ? yr.incomeTax : "-")} />
              <Row l="住民税" vs={g((yr) => yr ? yr.residentTax : "-")} />
              <Row l="社会保険" vs={g((yr) => yr ? yr.socialInsurance : "-")} formula={`社保率 ${sirPct}%`} />

              <Sec c="bg-purple-50" colSpan={colSpan}>■ 扶養・児童手当</Sec>
              <Row l="扶養人数" vs={g((yr) => yr ? `${yr.childCount}人` : "-")} />
              <Row l="扶養控除合計" vs={g((yr) => yr ? yr.dependentDeduction : "-")} formula="16-18歳:38万 / 19-22歳:63万（特定扶養）" />
              <Row l="児童手当（年額）" vs={g((yr) => yr ? yr.childAllowance : "-")} formula="0-2歳:1.5万/月, 3-18歳:1万/月, 第3子以降:3万/月" />
              <Row l="手取り（税引後+手当）" vs={g((yr) => yr ? Math.round(yr.takeHomePay) : "-")} bold bg="bg-green-50" />

              <Sec c="bg-gray-100" colSpan={colSpan}>■ 支出詳細</Sec>
              <Row l="基本生活費" vs={g((yr) => yr ? yr.baseLivingExpense : "-")} />
              {/* Event cost breakdown from calc engine */}
              {(() => {
                const allLabels = new Set<string>();
                for (const yr of yearData) {
                  if (yr) for (const c of yr.eventCostBreakdown) allLabels.add(c.label);
                }
                return [...allLabels].map(label => (
                  <Row key={label} l={`  ${label}`}
                    vs={g((yr) => {
                      if (!yr) return "-";
                      const item = yr.eventCostBreakdown.find(c => c.label === label);
                      return item ? item.amount : 0;
                    })} sub
                    formula={(() => {
                      for (const yr of yearData) {
                        if (!yr) continue;
                        const item = yr.eventCostBreakdown.find(c => c.label === label);
                        if (item?.detail) return item.detail;
                      }
                      return undefined;
                    })()} />
                ));
              })()}
              <Row l="支出合計" vs={g((yr) => yr ? yr.totalExpense : "-")} bold />
              <Row l="年間キャッシュフロー" vs={g((yr) => yr ? yr.annualNetCashFlow : "-")} bold bg="bg-blue-50" />

              {/* Housing detail: only show when property costs exist */}
              {yearData.some(yr => yr?.eventCostBreakdown.some(c => c.label.includes("ローン") || c.label.includes("住宅"))) && (
                <>
                  <Sec c="bg-blue-50" colSpan={colSpan}>■ 住宅ローン明細</Sec>
                  {(() => {
                    const housingLabels = new Set<string>();
                    for (const yr of yearData) {
                      if (!yr) continue;
                      for (const c of yr.eventCostBreakdown) {
                        if (c.label.includes("ローン") || c.label.includes("住宅") || c.label.includes("管理費") || c.label.includes("固定資産税") || c.label.includes("頭金")) {
                          housingLabels.add(c.label);
                        }
                      }
                    }
                    return [...housingLabels].map(label => {
                      const items = yearData.map(yr => yr?.eventCostBreakdown.find(c => c.label === label));
                      const hasPhaseChange = items.some(it => it?.isPhaseChange);
                      return (
                        <Row key={`h_${label}`}
                          l={`${items.find(it => it)?.icon || ""} ${label}${hasPhaseChange ? " ⚡" : ""}`}
                          vs={g((yr) => {
                            if (!yr) return "-";
                            const item = yr.eventCostBreakdown.find(c => c.label === label);
                            return item ? item.amount : 0;
                          })}
                          formula={(() => {
                            for (const it of items) {
                              if (it?.detail) return it.detail;
                              if (it?.phaseLabel) return it.phaseLabel;
                            }
                            return undefined;
                          })()}
                          neg={false}
                          sub />
                      );
                    });
                  })()}
                </>
              )}

              <Sec c="bg-gray-100" colSpan={colSpan}>■ DC/iDeCo</Sec>
              <Row l="DC月額" vs={g((yr) => yr ? yr.dcMonthly : "-")} />
              <Row l="会社DC" vs={g((yr) => yr ? yr.companyDC : "-")} />
              <Row l="iDeCo月額" vs={g((yr) => yr ? yr.idecoMonthly : "-")} />
              <Row l="年間拠出合計" vs={g((yr) => yr ? yr.annualContribution : "-")} bold />

              <Sec c="bg-green-50" colSpan={colSpan}>■ 節税メリット</Sec>
              <Row l="所得税 節税" vs={g((yr) => yr ? yr.incomeTaxSaving : "-")} />
              <Row l="住民税 節税" vs={g((yr) => yr ? yr.residentTaxSaving : "-")} />
              <Row l="社保 節約" vs={g((yr) => yr ? yr.socialInsuranceSaving : "-")} />
              <Row l="メリット合計" vs={g((yr) => yr ? yr.annualBenefit : "-")} bold />
              <Row l="手数料差引後" vs={g((yr) => yr ? yr.annualNetBenefit : "-")} bold bg="bg-green-100" />

              {results.some(r => r.hasFuru) && (
                <>
                  <Sec c="bg-amber-50" colSpan={colSpan}>■ ふるさと納税</Sec>
                  <Row l="上限" vs={g((yr) => yr ? yr.furusatoLimit : "-")} />
                  <Row l="寄付額" vs={g((yr) => yr ? yr.furusatoDonation : "-")} />
                </>
              )}

              <Sec c="bg-red-50" colSpan={colSpan}>■ 厚生年金</Sec>
              <Row l="年額減少" vs={g((yr) => yr ? yr.pensionLossAnnual : "-")} neg />

              <Sec c="bg-teal-100" colSpan={colSpan}>■ 累積資産</Sec>
              <Row l="DC資産" vs={g((yr) => yr ? Math.round(yr.cumulativeDCAsset) : "-")} />
              <Row l="再投資" vs={g((yr) => yr ? Math.round(yr.cumulativeReinvest) : "-")} />
              <Row l="貯蓄" vs={g((yr) => yr ? Math.round(Math.max(yr.cumulativeSavings, 0)) : "-")} />
              <Row l="総資産" vs={g((yr) => yr ? Math.round(yr.totalWealth) : "-")} bold bg="bg-teal-50" />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
