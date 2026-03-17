import React from "react";
import { fmt } from "../lib/format";
import type { ScenarioResult, BaseResult, YearResult } from "../lib/types";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];
const BG = ["bg-blue-50/30", "bg-green-50/30", "bg-orange-50/30", "bg-purple-50/30"];

export function TaxDetailModal({ isOpen, onClose, age, results, base, sirPct }: {
  isOpen: boolean; onClose: () => void; age: number | null;
  results: ScenarioResult[]; base: BaseResult; sirPct: number;
}) {
  if (!isOpen || age == null) return null;

  const yrs = results.map(r => r.yearResults.find(yr => yr.age === age));
  const hasSpouse = yrs.some(yr => yr && yr.spouseGross > 0);
  const hasNISA = yrs.some(yr => yr && (yr.nisaAsset > 0 || yr.taxableAsset > 0));
  const hasInsurance = yrs.some(yr => yr && (yr.insurancePremiumTotal > 0 || yr.insurancePayoutTotal > 0));

  const subCols = hasSpouse ? ["本人", "配偶者", "世帯"] as const : ["本人"] as const;
  const subCount = subCols.length;
  const totalCols = 1 + results.length * subCount;

  type ValFn = (yr: YearResult, sub: "本人" | "配偶者" | "世帯") => any;

  // セル生成 + シナリオ境界の太線
  const makeCells = (fn: ValFn, bold?: boolean, neg?: boolean) => {
    const out: React.ReactNode[] = [];
    for (let si = 0; si < results.length; si++) {
      const yr = yrs[si];
      for (let ci = 0; ci < subCols.length; ci++) {
        const sub = subCols[ci];
        const v = yr ? fn(yr, sub) : "-";
        const isFirstOfScenario = ci === 0;
        const isLastOfScenario = ci === subCols.length - 1;
        const borderL = isFirstOfScenario ? "border-l-2 border-l-gray-500" : "border-l border-l-gray-200";
        const borderR = isLastOfScenario ? "border-r-2 border-r-gray-500" : "";
        const bgCol = sub === "世帯" ? "bg-amber-50/40" : "";
        out.push(
          <td key={`${si}-${ci}`}
            className={`${borderL} ${borderR} border-y border-gray-200 px-1.5 py-0.5 text-right text-[11px] tabular-nums ${bgCol} ${neg && typeof v === "number" && v > 0 ? "text-red-600" : ""} ${bold ? "font-bold" : ""}`}>
            {typeof v === "string" ? v : `¥${fmt(v)}`}
          </td>
        );
      }
    }
    return out;
  };

  const R = ({ l, fn, bold, bg, sub: isSub, neg, formula }: { l: string; fn: ValFn; bold?: boolean; bg?: string; sub?: boolean; neg?: boolean; formula?: string }) => (
    <tr className={bg || ""}>
      <td className={`border-y border-gray-200 border-r-2 border-r-gray-500 px-1.5 py-0.5 text-[11px] ${isSub ? "pl-3 text-gray-500" : ""} ${bold ? "font-bold" : ""}`}>
        {l}{formula && <div className="text-[9px] font-normal text-gray-400 whitespace-normal max-w-[160px]">{formula}</div>}
      </td>
      {makeCells(fn, bold, neg)}
    </tr>
  );

  const S = ({ children, bg }: { children: string; bg?: string }) => (
    <tr className={bg || "bg-gray-100"}>
      <td colSpan={totalCols} className="border-y-2 border-gray-400 px-2 py-1 text-[11px] font-bold tracking-wide">{children}</td>
    </tr>
  );

  // Cost labels
  const costLabels: string[] = [];
  const housingLabels: string[] = [];
  for (const yr of yrs) {
    if (!yr) continue;
    for (const c of yr.eventCostBreakdown) {
      if (!costLabels.includes(c.label)) costLabels.push(c.label);
      if (!housingLabels.includes(c.label) && (c.label.includes("ローン") || c.label.includes("住宅") || c.label.includes("管理費") || c.label.includes("固定資産税") || c.label.includes("頭金")))
        housingLabels.push(c.label);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-2 pt-4" onClick={onClose}>
      <div className="max-w-[98vw] rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-2">
          <p className="text-sm font-bold">{age}歳時点の詳細</p>
          <button onClick={onClose} className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100">閉じる</button>
        </div>
        <div className="max-h-[85vh] overflow-auto p-2">
          <table className="border-collapse text-[11px] leading-tight whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr>
                <th rowSpan={2} className="bg-gray-300 border-2 border-gray-500 px-2 py-1 text-left min-w-[140px]">項目</th>
                {results.map((r, si) => (
                  <th key={si} colSpan={subCount}
                    className="border-2 border-gray-500 px-2 py-1 text-center text-xs"
                    style={{ backgroundColor: `${COLORS[si]}15`, color: COLORS[si] }}>
                    {r.scenario.name}
                  </th>
                ))}
              </tr>
              <tr>
                {results.map((_, si) =>
                  subCols.map((sub, ci) => (
                    <th key={`${si}-${ci}`}
                      className={`bg-gray-100 px-1.5 py-0.5 text-center min-w-[80px] text-[10px] border-y-2 border-gray-500 ${ci === 0 ? "border-l-2 border-l-gray-500" : "border-l border-l-gray-200"} ${ci === subCols.length - 1 ? "border-r-2 border-r-gray-500" : ""} ${sub === "世帯" ? "bg-amber-50" : ""}`}>
                      {sub === "本人" ? <span className="text-gray-700">本人</span>
                       : sub === "配偶者" ? <span className="text-pink-600">配偶者</span>
                       : <span className="text-amber-700">世帯</span>}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              <S bg="bg-gray-100">■ 収入・税金</S>
              <R l="年収" bold fn={(yr, s) => s === "本人" ? `${Math.round(yr.grossMan)}万` : s === "配偶者" ? (yr.spouseGross > 0 ? `${Math.round(yr.spouseGross / 10000)}万` : "-") : `${Math.round(yr.grossMan + yr.spouseGross / 10000)}万`} />
              <R l="所得税" fn={(yr, s) => s === "本人" ? yr.incomeTax : s === "配偶者" ? yr.spouseIncomeTax : yr.incomeTax + yr.spouseIncomeTax} />
              <R l="住民税" fn={(yr, s) => s === "本人" ? yr.residentTax : s === "配偶者" ? yr.spouseResidentTax : yr.residentTax + yr.spouseResidentTax} />
              <R l="社会保険" fn={(yr, s) => s === "本人" ? yr.socialInsurance : s === "配偶者" ? yr.spouseSocialInsurance : yr.socialInsurance + yr.spouseSocialInsurance} />
              <R l="税・社保計" bold fn={(yr, s) => {
                const a = yr.incomeTax + yr.residentTax + yr.socialInsurance;
                const b = yr.spouseIncomeTax + yr.spouseResidentTax + yr.spouseSocialInsurance;
                return s === "本人" ? a : s === "配偶者" ? b : a + b;
              }} />

              <S bg="bg-gray-100">■ DC/iDeCo</S>
              <R l="DC月額" fn={(yr, s) => s === "本人" ? yr.dcMonthly : "-"} />
              <R l="会社DC" fn={(yr, s) => s === "本人" ? yr.companyDC : "-"} />
              <R l="iDeCo月額" fn={(yr, s) => s === "本人" ? yr.idecoMonthly : "-"} />
              <R l="年間拠出" bold fn={(yr, s) => s === "本人" ? yr.annualContribution : s === "配偶者" ? yr.spouseDCContribution : yr.annualContribution + yr.spouseDCContribution} />
              {hasSpouse && <R l="  配偶者iDeCo" sub fn={(yr, s) => s === "配偶者" ? yr.spouseIDeCoContribution : "-"} />}

              <S bg="bg-green-50">■ 節税</S>
              <R l="所得税" fn={(yr, s) => s === "本人" ? yr.incomeTaxSaving : s === "配偶者" ? yr.spouseIncomeTaxSaving : yr.incomeTaxSaving + yr.spouseIncomeTaxSaving} />
              <R l="住民税" fn={(yr, s) => s === "本人" ? yr.residentTaxSaving : s === "配偶者" ? yr.spouseResidentTaxSaving : yr.residentTaxSaving + yr.spouseResidentTaxSaving} />
              <R l="社保" fn={(yr, s) => s === "本人" ? yr.socialInsuranceSaving : "-"} />
              <R l="計" bold bg="bg-green-100" fn={(yr, s) => {
                const sp = yr.spouseIncomeTaxSaving + yr.spouseResidentTaxSaving;
                return s === "本人" ? yr.annualBenefit : s === "配偶者" ? sp : yr.annualBenefit + sp;
              }} />

              {results.some(r => r.hasFuru) && (<>
                <S bg="bg-amber-50">■ ふるさと納税</S>
                <R l="上限" fn={(yr, s) => s === "本人" ? yr.furusatoLimit : s === "配偶者" ? yr.spouseFurusatoLimit : yr.furusatoLimit + yr.spouseFurusatoLimit} />
                <R l="寄付額" fn={(yr, s) => s === "本人" ? yr.furusatoDonation : s === "配偶者" ? yr.spouseFurusatoDonation : yr.furusatoDonation + yr.spouseFurusatoDonation} />
              </>)}

              <S bg="bg-yellow-50">■ 手取り</S>
              <R l="手取り" bold bg="bg-yellow-50" fn={(yr, s) => {
                return s === "本人" ? Math.round(yr.takeHomePay - yr.spouseTakeHome) : s === "配偶者" ? Math.round(yr.spouseTakeHome) : Math.round(yr.takeHomePay);
              }} />

              <S bg="bg-purple-50">■ 扶養・手当</S>
              <R l="扶養人数" fn={(yr, s) => s === "世帯" || !hasSpouse ? `${yr.childCount}人` : "-"} />
              <R l="扶養控除" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.dependentDeduction : "-"} />
              <R l="児童手当" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.childAllowance : "-"} />
              <R l="年金減少" neg fn={(yr, s) => s === "本人" ? yr.pensionLossAnnual : "-"} />

              <S>■ 支出</S>
              <R l="基本生活費" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.baseLivingExpense : "-"} />
              {costLabels.map(label => (
                <R key={label} l={`  ${label}`} sub fn={(yr, s) => {
                  if (s === "配偶者") return "-";
                  const item = yr.eventCostBreakdown.find(c => c.label === label);
                  return item ? item.amount : 0;
                }} formula={(() => { for (const yr of yrs) { if (!yr) continue; const it = yr.eventCostBreakdown.find(c => c.label === label); if (it?.detail) return it.detail; } return undefined; })()} />
              ))}
              <R l="支出合計" bold fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.totalExpense : "-"} />
              <R l="年間CF" bold bg="bg-blue-50" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.annualNetCashFlow : "-"} />

              {housingLabels.length > 0 && (<>
                <S bg="bg-blue-50">■ 住宅ローン</S>
                {housingLabels.map(label => (
                  <R key={`h_${label}`} l={label} sub fn={(yr, s) => {
                    if (s === "配偶者") return "-";
                    const item = yr.eventCostBreakdown.find(c => c.label === label);
                    return item ? item.amount : 0;
                  }} formula={(() => { for (const yr of yrs) { if (!yr) continue; const it = yr.eventCostBreakdown.find(c => c.label === label); if (it?.detail) return it.detail; if (it?.phaseLabel) return it.phaseLabel; } return undefined; })()} />
                ))}
              </>)}

              {hasInsurance && (<>
                <S bg="bg-indigo-50">■ 保険</S>
                <R l="保険料" neg fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.insurancePremiumTotal : "-"} />
                <R l="保険金" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.insurancePayoutTotal : "-"} />
              </>)}

              <S bg="bg-teal-100">■ 累積資産</S>
              <R l="DC資産" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.cumulativeDCAsset) : "-"} />
              <R l="再投資" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.cumulativeReinvest) : "-"} />
              {hasNISA ? (<>
                <R l="NISA" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.nisaAsset) : "-"} />
                {yrs.some(yr => yr && yr.nisaContribution > 0) && <R l="  投入" sub fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.nisaContribution > 0 ? Math.round(yr.nisaContribution) : "-"} />}
                {yrs.some(yr => yr && yr.nisaWithdrawal > 0) && <R l="  取崩" sub fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.nisaWithdrawal > 0 ? `▲${Math.round(yr.nisaWithdrawal).toLocaleString()}` : "-"} />}
                <R l="特定口座" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableAsset) : "-"} />
                <R l="  含み益" sub fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableGain) : "-"} />
                <R l="  課税額" sub neg fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableGain * 0.20315) : "-"} />
                {yrs.some(yr => yr && yr.taxableWithdrawal > 0) && <R l="  取崩" sub fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.taxableWithdrawal > 0 ? `▲${Math.round(yr.taxableWithdrawal).toLocaleString()}` : "-"} />}
                <R l="現金" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.cashSavings) : "-"} />
              </>) : (
                <R l="貯蓄" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(Math.max(yr.cumulativeSavings, 0)) : "-"} />
              )}
              {yrs.some(yr => yr && yr.loanBalance > 0) && <R l="ローン残高" neg fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.loanBalance > 0 ? -yr.loanBalance : "-"} />}
              <R l="総資産" bold bg="bg-teal-50" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.totalWealth) : "-"} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
