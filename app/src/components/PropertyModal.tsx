import React, { useState, useEffect, useMemo } from "react";
import type { LifeEvent, PropertyParams, PrepaymentEntry } from "../lib/types";
import { calcMonthlyPaymentEqual, loanBalanceAfterYears, buildLoanSchedule } from "../lib/calc";
import type { LoanScheduleEntry } from "../lib/calc";
import { calcPropertyCapitalGainsTax } from "../lib/tax";
import { Modal, BarChart } from "./ui";

// ===== 返済プランプレビュー =====
function RepaymentPreview({ schedule, pp, purchaseAge, isPair }: {
  schedule: LoanScheduleEntry[];
  pp: PropertyParams;
  purchaseAge: number;
  isPair?: boolean;
}) {
  if (schedule.length === 0) return null;

  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;
  let totalPayment = 0;
  let totalPrepayment = 0;
  for (const e of schedule) {
    totalPayment += e.annualPayment;
    totalPrepayment += e.prepaymentAmount;
  }
  const totalInterest = Math.max(totalPayment - loanAmount + totalPrepayment, 0);
  const actualYears = schedule.filter(e => e.balance > 0 && !e.isSold).length;

  // Build detailed year data for stacked area chart
  const yearData = schedule.filter(e => !e.isSold).map((e, i) => {
    // Approximate principal and interest split for each year
    const interest = Math.round(e.balance * e.rate / 100);
    const principal = Math.max(e.annualPayment - interest, 0);
    return { year: i, age: purchaseAge + i, balance: e.balance, payment: e.annualPayment, principal, interest, prepayment: e.prepaymentAmount, rate: e.rate, monthly: e.monthlyPayment, isRefinanced: e.isRefinanced, remaining: e.remainingYears };
  });

  const maxBalance = Math.max(...yearData.map(d => d.balance), 1);
  const maxPayment = Math.max(...yearData.map(d => d.principal + d.interest + d.prepayment), 1);

  // Sale preview
  const hasSale = pp.saleAge != null;
  const saleYearsSince = hasSale ? (pp.saleAge! - purchaseAge) : 0;
  const salePrice = hasSale
    ? (pp.salePriceMan != null ? pp.salePriceMan * 10000 : Math.round(pp.priceMan * 10000 * Math.pow(1 + (pp.appreciationRate ?? 0) / 100, saleYearsSince)))
    : 0;
  const saleEntry = hasSale && saleYearsSince < schedule.length ? schedule[saleYearsSince] : null;
  const saleRemainingLoan = saleEntry ? saleEntry.balance : 0;
  const saleCGT = hasSale ? calcPropertyCapitalGainsTax(pp.priceMan * 10000, salePrice, saleYearsSince, true) : null;

  // Key milestones for table
  const milestones = new Set<number>([0, 4, 9, 12, 19, 24, 29, 34]);
  for (const prep of pp.prepayments || []) milestones.add(prep.age - purchaseAge);
  if (pp.refinance) milestones.add(pp.refinance.age - purchaseAge);
  if (hasSale) milestones.add(saleYearsSince);
  milestones.add(actualYears - 1);
  const showYears = [...milestones].filter(y => y >= 0 && y < schedule.length).sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-blue-100 p-1.5">
          <div className="text-[10px] text-blue-600">返済期間</div>
          <div className="font-bold text-blue-800">{actualYears}年</div>
          {actualYears !== pp.loanYears && <div className="text-[9px] text-blue-500">（元{pp.loanYears}年）</div>}
        </div>
        <div className="rounded bg-orange-100 p-1.5">
          <div className="text-[10px] text-orange-600">総利息</div>
          <div className="font-bold text-orange-800">約{Math.round(totalInterest / 10000)}万</div>
        </div>
        <div className="rounded bg-gray-100 p-1.5">
          <div className="text-[10px] text-gray-600">総支払額</div>
          <div className="font-bold text-gray-800">{Math.round(totalPayment / 10000).toLocaleString()}万</div>
          <div className="text-[9px] text-gray-500">(+頭金{pp.downPaymentMan}万)</div>
        </div>
      </div>

      {/* Balance bar chart */}
      <div>
        <div className="text-[10px] font-semibold text-gray-500 mb-1">残高推移</div>
        <BarChart height={64} maxValue={maxBalance / 10000}>
          {yearData.map((d, i) => {
            const hPx = Math.max(Math.round(d.balance / maxBalance * 64), 1);
            const isPrepay = d.prepayment > 0;
            const isRefi = d.isRefinanced;
            const bg = isRefi ? "bg-purple-400" : isPrepay ? "bg-green-400" : "bg-blue-300";
            return (
              <div key={i} className="flex-1 relative group" style={{ alignSelf: "flex-end" }}>
                <div className={`${bg} rounded-t-sm w-full`} style={{ height: hPx }} />
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 pointer-events-none mb-1">
                  {d.age}歳 残高{Math.round(d.balance / 10000)}万 月額{(d.monthly / 10000).toFixed(1)}万 {d.rate}%
                  {isPrepay ? ` 繰上${Math.round(d.prepayment / 10000)}万` : ""}
                  {isRefi ? " 借換" : ""}
                </div>
              </div>
            );
          })}
        </BarChart>
        <div className="flex justify-between text-[9px] text-gray-400 ml-8">
          <span>{purchaseAge}歳</span>
          <span className="flex gap-2">
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-blue-300" />通常</span>
            {(pp.prepayments?.length ?? 0) > 0 && <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-green-400" />繰上</span>}
            {pp.refinance && <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-purple-400" />借換</span>}
          </span>
          <span>{purchaseAge + actualYears}歳</span>
        </div>
      </div>

      {/* Stacked bar chart: principal vs interest breakdown */}
      <div>
        <div className="text-[10px] font-semibold text-gray-500 mb-1">年間返済額の内訳（元金 / 利息）</div>
        <BarChart height={56} maxValue={maxPayment / 10000}>
          {yearData.map((d, i) => {
            const total = d.principal + d.interest + d.prepayment;
            const hPx = Math.max(Math.round(total / maxPayment * 56), 1);
            const principalPct = total > 0 ? d.principal / total * 100 : 100;
            const interestPct = total > 0 ? d.interest / total * 100 : 0;
            const prepayPct = total > 0 ? d.prepayment / total * 100 : 0;
            return (
              <div key={i} className="flex-1 relative group flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: hPx, alignSelf: "flex-end" }}>
                {prepayPct > 0 && <div className="bg-green-400 w-full" style={{ height: `${prepayPct}%` }} />}
                <div className="bg-orange-300 w-full" style={{ height: `${interestPct}%` }} />
                <div className="bg-blue-400 w-full" style={{ height: `${principalPct}%` }} />
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 pointer-events-none mb-1">
                  {d.age}歳: 元金{Math.round(d.principal / 10000)}万 利息{Math.round(d.interest / 10000)}万
                  {d.prepayment > 0 ? ` 繰上${Math.round(d.prepayment / 10000)}万` : ""}
                </div>
              </div>
            );
          })}
        </BarChart>
        <div className="flex justify-between text-[9px] text-gray-400 ml-8">
          <span>{purchaseAge}歳</span>
          <span className="flex gap-2">
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-blue-400" />元金</span>
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-orange-300" />利息</span>
            {(pp.prepayments?.length ?? 0) > 0 && <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-green-400" />繰上</span>}
          </span>
          <span>{purchaseAge + actualYears}歳</span>
        </div>
      </div>

      {/* Schedule table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left px-1 py-0.5 font-semibold">年齢</th>
              {isPair
                ? <><th className="text-right px-1 py-0.5 font-semibold">本人</th><th className="text-right px-1 py-0.5 font-semibold">配偶者</th></>
                : <th className="text-right px-1 py-0.5 font-semibold">残高</th>}
              <th className="text-right px-1 py-0.5 font-semibold">月額</th>
              <th className="text-right px-1 py-0.5 font-semibold">金利</th>
              <th className="text-left px-1 py-0.5 font-semibold">備考</th>
            </tr>
          </thead>
          <tbody>
            {showYears.map(y => {
              const e = schedule[y];
              if (!e) return null;
              const age = purchaseAge + y;
              const notes: string[] = [];
              if (y === 0) notes.push("購入");
              if (e.prepaymentAmount > 0) {
                const prep = (pp.prepayments || []).find(p => p.age === age);
                const targetLabel = isPair && prep?.target === "spouse" ? "配偶者" : isPair ? "本人" : "";
                notes.push(`繰上${Math.round(e.prepaymentAmount / 10000)}万(${prep?.type === "reduce" ? "軽減" : "短縮"}${targetLabel ? " " + targetLabel : ""})`);
              }
              if (e.isRefinanced) notes.push(`借換→${e.rate}%/${pp.refinance?.newLoanYears}年`);
              if (e.isSold) notes.push("売却");
              if (pp.hasLoanDeduction && y === 12) notes.push("控除終了");
              const rowBg = e.isSold ? "bg-red-50" : e.isRefinanced ? "bg-purple-50" : e.prepaymentAmount > 0 ? "bg-green-50" : "";
              return (
                <tr key={y} className={`border-b border-gray-100 ${rowBg}`}>
                  <td className="px-1 py-0.5 font-mono">{age}歳<span className="text-gray-300 ml-0.5">({y + 1}年)</span></td>
                  {isPair ? (
                    <>
                      <td className="px-1 py-0.5 text-right font-mono text-indigo-600">{Math.round((e.selfBalance ?? 0) / 10000).toLocaleString()}万</td>
                      <td className="px-1 py-0.5 text-right font-mono text-pink-600">{Math.round((e.spouseBalance ?? 0) / 10000).toLocaleString()}万</td>
                    </>
                  ) : (
                    <td className="px-1 py-0.5 text-right font-mono">{Math.round(e.balance / 10000).toLocaleString()}万</td>
                  )}
                  <td className="px-1 py-0.5 text-right font-mono">{(e.monthlyPayment / 10000).toFixed(1)}万</td>
                  <td className="px-1 py-0.5 text-right">{e.rate}%</td>
                  <td className="px-1 py-0.5 text-gray-500">{notes.join(" / ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {schedule.length > showYears.length && (
          <div className="text-[9px] text-gray-400 text-center mt-0.5">主要年のみ表示（全{schedule.length}年）</div>
        )}
      </div>

      {/* Sale summary */}
      {hasSale && saleCGT && (
        <div className="rounded bg-red-50 border border-red-200 p-2 space-y-0.5 text-red-800">
          <div className="font-bold">売却シミュレーション（{pp.saleAge}歳）</div>
          <div className="grid grid-cols-2 gap-x-4 text-[10px]">
            <div>売却価格: <b>{Math.round(salePrice / 10000).toLocaleString()}万</b></div>
            <div>残ローン: <b>{Math.round(saleRemainingLoan / 10000).toLocaleString()}万</b></div>
            <div>譲渡益: {Math.round(saleCGT.gain / 10000).toLocaleString()}万{saleCGT.isLongTerm ? "(長期)" : "(短期)"}</div>
            <div>特別控除: {Math.round(saleCGT.specialDeduction / 10000).toLocaleString()}万</div>
            <div>譲渡所得税: <b>{Math.round(saleCGT.tax / 10000).toLocaleString()}万</b></div>
            <div className="font-bold col-span-2 border-t border-red-200 pt-1 mt-1">
              手取り: 約{Math.round((salePrice - saleRemainingLoan - saleCGT.tax) / 10000).toLocaleString()}万円
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PropertyModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number;
  retirementAge: number;
  existingEvent?: LifeEvent | null;
}) {
  const defaults: PropertyParams = {
    priceMan: 5000, downPaymentMan: 500, loanYears: 35,
    repaymentType: "equal_payment",
    rateType: "variable", fixedRate: 1.8,
    variableInitRate: 0.5, variableRiskRate: 1.5, variableRiseAfter: 10,
    maintenanceMonthlyMan: 2, taxAnnualMan: 15, hasLoanDeduction: true,
    loanStructure: "single", pairRatio: 50,
    deductionTarget: "self", danshinTarget: "self",
  };

  const [purchaseAge, setPurchaseAge] = useState(currentAge + 5);
  const [pp, setPP] = useState<PropertyParams>(defaults);

  useEffect(() => {
    if (existingEvent?.propertyParams) {
      setPP(existingEvent.propertyParams);
      setPurchaseAge(existingEvent.age);
    }
  }, [existingEvent]);

  const u = (patch: Partial<PropertyParams>) => setPP(prev => ({ ...prev, ...patch }));
  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;

  const isPrincipalEqual = pp.repaymentType === "equal_principal";
  const fixedMonthly = isPrincipalEqual
    ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (pp.fixedRate / 100 / 12))
    : calcMonthlyPaymentEqual(loanAmount, pp.fixedRate, pp.loanYears);
  const varInitMonthly = isPrincipalEqual
    ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (pp.variableInitRate / 100 / 12))
    : calcMonthlyPaymentEqual(loanAmount, pp.variableInitRate, pp.loanYears);
  const varRiskMonthly = isPrincipalEqual
    ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (pp.variableRiskRate / 100 / 12))
    : calcMonthlyPaymentEqual(loanAmount, pp.variableRiskRate, pp.loanYears);
  const displayMonthly = pp.rateType === "fixed" ? fixedMonthly : varInitMonthly;

  const rate0 = pp.rateType === "fixed" ? pp.fixedRate : pp.variableInitRate;
  const deductionYear1 = Math.min(Math.round(loanAmount * 0.007), 350000);
  const schedule = useMemo(() => loanAmount > 0 ? buildLoanSchedule(pp, purchaseAge) : [], [pp, purchaseAge, loanAmount]);

  const handleSave = () => {
    const event: LifeEvent = {
      id: existingEvent?.id || Date.now(),
      age: purchaseAge,
      type: "property",
      label: `住宅(${pp.priceMan}万)`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
      propertyParams: pp,
    };
    onSave(event);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`🏠 住宅購入${existingEvent ? "（編集）" : ""}`}
      onSave={handleSave} saveLabel={existingEvent ? "更新" : "追加"} wide>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Settings */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">購入時年齢</label>
              <input type="number" value={purchaseAge} min={currentAge} max={retirementAge - 1}
                onChange={e => setPurchaseAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">物件価格（万円）</label>
              <input type="number" value={pp.priceMan} step={100}
                onChange={e => u({ priceMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">頭金（万円）</label>
              <input type="number" value={pp.downPaymentMan} step={100}
                onChange={e => u({ downPaymentMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">ローン期間（年）</label>
              <input type="number" value={pp.loanYears} min={1} max={50}
                onChange={e => u({ loanYears: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
          </div>
          <div className="text-gray-500">借入: <b>{(pp.priceMan - pp.downPaymentMan).toLocaleString()}万</b>　諸費用: 約{Math.round(pp.priceMan * 0.07)}万（7%）</div>

          {/* Repayment + Rate in compact row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border p-2 space-y-1">
              <label className="block font-semibold text-gray-600 text-[11px]">返済方式</label>
              <div className="flex gap-1">
                <button onClick={() => u({ repaymentType: "equal_payment" })}
                  className={`rounded px-2 py-0.5 text-[10px] ${pp.repaymentType !== "equal_principal" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>元利均等</button>
                <button onClick={() => u({ repaymentType: "equal_principal" })}
                  className={`rounded px-2 py-0.5 text-[10px] ${pp.repaymentType === "equal_principal" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>元金均等</button>
              </div>
            </div>
            <div className="rounded border p-2 space-y-1">
              <label className="block font-semibold text-gray-600 text-[11px]">ローン構造</label>
              <div className="flex gap-1">
                <button onClick={() => u({ loanStructure: "single" })}
                  className={`rounded px-2 py-0.5 text-[10px] ${(pp.loanStructure || "single") === "single" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>単独</button>
                <button onClick={() => u({ loanStructure: "pair" })}
                  className={`rounded px-2 py-0.5 text-[10px] ${pp.loanStructure === "pair" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>ペア</button>
              </div>
              {pp.loanStructure === "pair" && (
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-gray-400">本人</span>
                  <input type="number" value={pp.pairRatio ?? 50} min={1} max={99} step={5}
                    onChange={e => u({ pairRatio: Number(e.target.value) })} className="w-12 rounded border px-1 py-0.5 text-[10px]" />
                  <span className="text-gray-400">%</span>
                </div>
              )}
            </div>
          </div>

          {/* Rate */}
          <div className="rounded border p-2 space-y-1">
            <div className="flex items-center gap-2">
              <label className="font-semibold text-gray-600 text-[11px]">金利</label>
              <button onClick={() => u({ rateType: "fixed" })}
                className={`rounded px-2 py-0.5 text-[10px] ${pp.rateType === "fixed" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>固定</button>
              <button onClick={() => u({ rateType: "variable" })}
                className={`rounded px-2 py-0.5 text-[10px] ${pp.rateType === "variable" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>変動</button>
            </div>
            {pp.rateType === "fixed" ? (
              <div className="flex items-center gap-1">
                <input type="number" value={pp.fixedRate} step={0.1} min={0}
                  onChange={e => u({ fixedRate: Number(e.target.value) })} className="w-20 rounded border px-2 py-1" />
                <span className="text-gray-400">%</span>
                <span className="text-gray-400 ml-1">月額{Math.round(fixedMonthly / 10000)}万</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                <div className="flex items-center gap-0.5">
                  <input type="number" value={pp.variableInitRate} step={0.1} min={0}
                    onChange={e => u({ variableInitRate: Number(e.target.value) })} className="w-full rounded border px-1 py-0.5" />
                  <span className="text-[10px] text-gray-400">%</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <input type="number" value={pp.variableRiskRate} step={0.1} min={0}
                    onChange={e => u({ variableRiskRate: Number(e.target.value) })} className="w-full rounded border px-1 py-0.5" />
                  <span className="text-[10px] text-gray-400">%</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <input type="number" value={pp.variableRiseAfter} min={1} max={pp.loanYears}
                    onChange={e => u({ variableRiseAfter: Number(e.target.value) })} className="w-full rounded border px-1 py-0.5" />
                  <span className="text-[10px] text-gray-400">年後</span>
                </div>
                <div className="col-span-3 text-[10px] text-amber-600">当初{Math.round(varInitMonthly/10000)}万/月 → {pp.variableRiseAfter}年後{Math.round(varRiskMonthly/10000)}万/月</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1">
              <label className="text-gray-500 text-[10px] whitespace-nowrap">管理費</label>
              <input type="number" value={pp.maintenanceMonthlyMan} step={0.5} min={0}
                onChange={e => u({ maintenanceMonthlyMan: Number(e.target.value) })} className="w-16 rounded border px-1.5 py-1" />
              <span className="text-[10px] text-gray-400">万/月</span>
            </div>
            <div className="flex items-center gap-1">
              <label className="text-gray-500 text-[10px] whitespace-nowrap">固定資産税</label>
              <input type="number" value={pp.taxAnnualMan} step={1} min={0}
                onChange={e => u({ taxAnnualMan: Number(e.target.value) })} className="w-16 rounded border px-1.5 py-1" />
              <span className="text-[10px] text-gray-400">万/年</span>
            </div>
          </div>

          {/* 団信 + 控除 in compact row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border p-2 space-y-1">
              <label className="font-semibold text-gray-600 text-[11px]">団信</label>
              <div className="flex gap-1">
                {(["self", "spouse", "both"] as const).map(v => (
                  <button key={v} onClick={() => u({ danshinTarget: v })}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${(pp.danshinTarget || "self") === v ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    {v === "self" ? "本人" : v === "spouse" ? "配偶者" : "両方"}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded border p-2 space-y-1">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={pp.hasLoanDeduction} onChange={e => u({ hasLoanDeduction: e.target.checked })} className="accent-green-600" />
                <span className="font-semibold text-gray-600 text-[11px]">ローン控除</span>
              </label>
              {pp.hasLoanDeduction && (
                <div className="flex gap-1">
                  {(["self", "spouse", "both"] as const).map(v => (
                    <button key={v} onClick={() => u({ deductionTarget: v })}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${(pp.deductionTarget || "self") === v ? "bg-green-600 text-white" : "bg-gray-100"}`}>
                      {v === "self" ? "本人" : v === "spouse" ? "配偶者" : "両方"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 繰上返済 */}
          <div className="rounded border p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-gray-600 text-[11px]">繰上返済</label>
              <button onClick={() => u({ prepayments: [...(pp.prepayments || []), { age: purchaseAge + 10, amountMan: 500, type: "shorten" }] })}
                className="text-[10px] text-blue-500 hover:underline">+ 追加</button>
            </div>
            {(pp.prepayments || []).map((prep, i) => {
              const setPrep = (patch: Partial<typeof prep>) => {
                const ps = [...(pp.prepayments || [])]; ps[i] = { ...prep, ...patch }; u({ prepayments: ps });
              };
              return (
                <div key={i} className="flex flex-wrap items-center gap-1 text-[10px] bg-gray-50 rounded p-1">
                  <input type="number" value={prep.age} min={purchaseAge + 1}
                    onChange={e => setPrep({ age: Number(e.target.value) })}
                    className="w-12 rounded border px-1 py-0.5" />
                  <span className="text-gray-400">歳</span>
                  <input type="number" value={prep.amountMan} step={100} min={1}
                    onChange={e => setPrep({ amountMan: Number(e.target.value) })}
                    className="w-16 rounded border px-1 py-0.5" />
                  <span className="text-gray-400">万</span>
                  <button onClick={() => setPrep({ type: "shorten" })}
                    className={`rounded px-1.5 py-0.5 ${prep.type === "shorten" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>期間短縮</button>
                  <button onClick={() => setPrep({ type: "reduce" })}
                    className={`rounded px-1.5 py-0.5 ${prep.type === "reduce" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>返済軽減</button>
                  {pp.loanStructure === "pair" && (
                    <>
                      <button onClick={() => setPrep({ target: "self" })}
                        className={`rounded px-1.5 py-0.5 ${(prep.target || "self") === "self" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-500"}`}>本人</button>
                      <button onClick={() => setPrep({ target: "spouse" })}
                        className={`rounded px-1.5 py-0.5 ${prep.target === "spouse" ? "bg-pink-600 text-white" : "bg-gray-200 text-gray-500"}`}>配偶者</button>
                    </>
                  )}
                  <button onClick={() => u({ prepayments: (pp.prepayments || []).filter((_, j) => j !== i) })}
                    className="text-gray-300 hover:text-red-500 ml-auto">×</button>
                </div>
              );
            })}
            {(pp.prepayments || []).length > 0 && schedule.length > 0 && (() => {
              const noPrePayPP: PropertyParams = { ...pp, prepayments: [], refinance: pp.refinance };
              const origSchedule = buildLoanSchedule(noPrePayPP, purchaseAge);
              const origYears = origSchedule.length;
              const newYears = schedule.length;
              const diffYears = origYears - newYears;
              // Find monthly after prepayment vs at same point without prepayment
              const prepIdx = schedule.findIndex(e => e.prepaymentAmount > 0);
              const afterIdx = prepIdx >= 0 ? Math.min(prepIdx + 1, schedule.length - 1) : -1;
              const newMonthly = afterIdx >= 0 ? schedule[afterIdx].monthlyPayment : 0;
              const origMonthlyAtSamePoint = afterIdx >= 0 && afterIdx < origSchedule.length ? origSchedule[afterIdx].monthlyPayment : 0;
              const diffMonthly = origMonthlyAtSamePoint - newMonthly;
              return (
                <div className="text-[10px] bg-blue-50 rounded p-1.5 space-y-0.5">
                  <div className="font-semibold text-blue-700">繰上返済の効果</div>
                  <div>期間: {origYears}年 → <b>{newYears}年</b>
                    {diffYears > 0
                      ? <span className="text-green-600 ml-1">({diffYears}年短縮)</span>
                      : <span className="text-gray-400 ml-1">(変化なし)</span>}
                  </div>
                  {diffMonthly !== 0 && (
                    <div>月額: {(origMonthlyAtSamePoint / 10000).toFixed(2)}万 → <b>{(newMonthly / 10000).toFixed(2)}万</b>
                      <span className="text-green-600 ml-1">(-{(diffMonthly / 10000).toFixed(2)}万)</span>
                    </div>
                  )}
                  {diffYears === 0 && diffMonthly === 0 && (
                    <div className="text-gray-400">金額が少なすぎて1年未満の効果です。金額を増やしてみてください。</div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 売却 + 借換 in compact row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border p-2 space-y-1">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={pp.saleAge != null}
                  onChange={e => u(e.target.checked ? { saleAge: purchaseAge + 20 } : { saleAge: undefined, salePriceMan: undefined, appreciationRate: undefined })}
                  className="accent-blue-600" />
                <span className="font-semibold text-gray-600 text-[11px]">売却予定</span>
              </label>
              {pp.saleAge != null && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px]">
                    <input type="number" value={pp.saleAge} min={purchaseAge + 1}
                      onChange={e => u({ saleAge: Number(e.target.value) })} className="w-12 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">歳</span>
                    <input type="number" value={pp.salePriceMan ?? ""} step={100} placeholder="自動"
                      onChange={e => u({ salePriceMan: e.target.value ? Number(e.target.value) : undefined })} className="w-16 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">万</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-gray-400">変動率</span>
                    <input type="number" value={pp.appreciationRate ?? 0} step={0.5}
                      onChange={e => u({ appreciationRate: Number(e.target.value) })} className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%/年</span>
                  </div>
                </div>
              )}
            </div>
            <div className="rounded border p-2 space-y-1">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={pp.refinance != null}
                  onChange={e => u(e.target.checked ? { refinance: { age: purchaseAge + 10, newRate: 1.2, newLoanYears: 25, costMan: 50 } } : { refinance: undefined })}
                  className="accent-blue-600" />
                <span className="font-semibold text-gray-600 text-[11px]">借換</span>
              </label>
              {pp.refinance && (
                <div className="space-y-1 text-[10px]">
                  <div className="flex items-center gap-1">
                    <input type="number" value={pp.refinance.age} min={purchaseAge + 1}
                      onChange={e => u({ refinance: { ...pp.refinance!, age: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">歳</span>
                    <input type="number" value={pp.refinance.newRate} step={0.1} min={0}
                      onChange={e => u({ refinance: { ...pp.refinance!, newRate: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="number" value={pp.refinance.newLoanYears} min={1} max={50}
                      onChange={e => u({ refinance: { ...pp.refinance!, newLoanYears: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">年</span>
                    <span className="text-gray-400">手数料</span>
                    <input type="number" value={pp.refinance.costMan} step={10} min={0}
                      onChange={e => u({ refinance: { ...pp.refinance!, costMan: Number(e.target.value) } })} className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">万</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Annual summary */}
          <div className="rounded bg-blue-50 p-2 text-gray-700">
            <div className="font-bold mb-0.5">初年度コスト</div>
            <div className="flex flex-wrap gap-x-3 text-[10px]">
              <span>ローン: {Math.round(displayMonthly * 12 / 10000)}万/年</span>
              <span>管理費: {pp.maintenanceMonthlyMan * 12}万/年</span>
              <span>固資税: {pp.taxAnnualMan}万/年</span>
              {pp.hasLoanDeduction && <span className="text-green-600">控除: -{Math.round(deductionYear1 / 10000)}万</span>}
            </div>
            <div className="font-bold mt-0.5">
              合計: 約{Math.round(displayMonthly * 12 / 10000) + pp.maintenanceMonthlyMan * 12 + pp.taxAnnualMan - (pp.hasLoanDeduction ? Math.round(deductionYear1 / 10000) : 0)}万円/年
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-3">
          {loanAmount > 0 && schedule.length > 0 ? (
            <>
              <div className="font-bold text-blue-800 text-sm">返済プラン</div>
              <RepaymentPreview schedule={schedule} pp={pp} purchaseAge={purchaseAge} isPair={pp.loanStructure === "pair"} />
            </>
          ) : (
            <div className="text-gray-400 text-center py-8">ローンなし（一括購入）</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
