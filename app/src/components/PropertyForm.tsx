import React, { useMemo } from "react";
import type { PropertyParams } from "../lib/types";
import { calcMonthlyPaymentEqual, buildLoanSchedule } from "../lib/calc";
import type { LoanScheduleEntry } from "../lib/calc";
import { calcPropertyCapitalGainsTax } from "../lib/tax";
import { BarChart } from "./ui";

const H = ({ t }: { t: string }) => <span className="ml-1 cursor-help text-gray-400" title={t}>ⓘ</span>;

// ===== 返済プランプレビュー =====
function RepaymentPreview({ schedule, pp, purchaseAge }: {
  schedule: LoanScheduleEntry[]; pp: PropertyParams; purchaseAge: number;
}) {
  if (schedule.length === 0) return null;
  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;
  const isPair = pp.loanStructure === "pair";
  let totalPayment = 0, totalPrepayment = 0;
  const activeEntries = schedule.filter(e => !e.isSold);
  for (const e of activeEntries) { totalPayment += e.annualPayment; totalPrepayment += e.prepaymentAmount; }
  // 売却時は残債が残るため、返済した元本 = 借入額 − 最終残高
  const lastBalance = activeEntries.length > 0 ? activeEntries[activeEntries.length - 1].balance : 0;
  const principalPaid = loanAmount - lastBalance;
  const totalInterest = Math.max(totalPayment + totalPrepayment - principalPaid, 0);
  const actualYears = activeEntries.length;

  const yearData = schedule.filter(e => !e.isSold).map((e, i) => {
    const interest = Math.round(e.balance * e.rate / 100);
    const principal = Math.max(e.annualPayment - interest, 0);
    return { year: i, age: purchaseAge + i, balance: e.balance, payment: e.annualPayment, principal, interest, prepayment: e.prepaymentAmount, rate: e.rate, monthly: e.monthlyPayment, isRefinanced: e.isRefinanced, remaining: e.remainingYears, selfBal: e.selfBalance, spouseBal: e.spouseBalance };
  });
  const maxBalance = Math.max(...yearData.map(d => d.balance), 1);
  const maxPayment = Math.max(...yearData.map(d => d.principal + d.interest + d.prepayment), 1);

  const hasSale = pp.saleAge != null;
  const saleYS = hasSale ? (pp.saleAge! - purchaseAge) : 0;
  const salePrice = hasSale ? (pp.salePriceMan != null ? pp.salePriceMan * 10000 : Math.round(pp.priceMan * 10000 * Math.pow(1 + (pp.appreciationRate ?? 0) / 100, saleYS))) : 0;
  const saleBal = hasSale && saleYS < schedule.length ? schedule[saleYS].balance : 0;
  const saleCGT = hasSale ? calcPropertyCapitalGainsTax(pp.priceMan * 10000, salePrice, saleYS, true) : null;

  const milestones = new Set<number>([0, 4, 9, 12, 19, 24, 29, 34]);
  for (const p of pp.prepayments || []) milestones.add(p.age - purchaseAge);
  if (pp.refinance) milestones.add(pp.refinance.age - purchaseAge);
  if (hasSale) milestones.add(saleYS);
  milestones.add(actualYears - 1);
  const showYears = [...milestones].filter(y => y >= 0 && y < schedule.length).sort((a, b) => a - b);

  return (
    <div className="space-y-3">
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

      <div>
        <div className="text-[10px] font-semibold text-gray-500 mb-1">残高推移</div>
        <BarChart height={64} maxValue={maxBalance / 10000}>
          {yearData.map((d, i) => (
            <div key={i} className="flex-1 relative group" style={{ alignSelf: "flex-end" }}>
              <div className={`${d.isRefinanced ? "bg-purple-400" : d.prepayment > 0 ? "bg-green-400" : "bg-blue-300"} rounded-t-sm w-full`}
                style={{ height: Math.max(Math.round(d.balance / maxBalance * 64), 1) }} />
              <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 pointer-events-none mb-1">
                {d.age}歳 残高{Math.round(d.balance / 10000)}万 月額{(d.monthly / 10000).toFixed(1)}万 {d.rate}%
              </div>
            </div>
          ))}
        </BarChart>
        <div className="flex justify-between text-[9px] text-gray-400 ml-8"><span>{purchaseAge}歳</span><span>{purchaseAge + actualYears}歳</span></div>
      </div>

      <div>
        <div className="text-[10px] font-semibold text-gray-500 mb-1">年間返済額（元金 / 利息）</div>
        <BarChart height={48} maxValue={maxPayment / 10000}>
          {yearData.map((d, i) => {
            const t = d.principal + d.interest + d.prepayment;
            const h = Math.max(Math.round(t / maxPayment * 48), 1);
            const pP = t > 0 ? d.principal / t * 100 : 100, iP = t > 0 ? d.interest / t * 100 : 0;
            return (
              <div key={i} className="flex-1 relative group flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: h, alignSelf: "flex-end" }}>
                {d.prepayment > 0 && <div className="bg-green-400 w-full" style={{ height: `${d.prepayment / t * 100}%` }} />}
                <div className="bg-orange-300 w-full" style={{ height: `${iP}%` }} />
                <div className="bg-blue-400 w-full" style={{ height: `${pP}%` }} />
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 pointer-events-none mb-1">
                  {d.age}歳: 元金{Math.round(d.principal / 10000)}万 利息{Math.round(d.interest / 10000)}万
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
          </span>
          <span>{purchaseAge + actualYears}歳</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead><tr className="text-gray-500 border-b">
            <th className="text-left px-1 py-0.5 font-semibold">年齢</th>
            {isPair ? <><th className="text-right px-1 py-0.5 font-semibold">本人</th><th className="text-right px-1 py-0.5 font-semibold">配偶者</th></> : <th className="text-right px-1 py-0.5 font-semibold">残高</th>}
            <th className="text-right px-1 py-0.5 font-semibold">月額</th><th className="text-right px-1 py-0.5 font-semibold">金利</th><th className="text-left px-1 py-0.5 font-semibold">備考</th>
          </tr></thead>
          <tbody>{showYears.map(y => {
            const e = schedule[y]; if (!e) return null;
            const age = purchaseAge + y, notes: string[] = [];
            if (y === 0) notes.push("購入");
            if (e.prepaymentAmount > 0) { const p = (pp.prepayments || []).find(p => p.age === age); notes.push(`繰上${Math.round(e.prepaymentAmount / 10000)}万(${p?.type === "reduce" ? "軽減" : "短縮"})`); }
            if (e.isRefinanced) notes.push(`借換→${e.rate}%`);
            if (e.isSold) notes.push("売却");
            const bg = e.isSold ? "bg-red-50" : e.isRefinanced ? "bg-purple-50" : e.prepaymentAmount > 0 ? "bg-green-50" : "";
            return (<tr key={y} className={`border-b border-gray-100 ${bg}`}>
              <td className="px-1 py-0.5 font-mono">{age}歳</td>
              {isPair ? <><td className="px-1 py-0.5 text-right font-mono text-indigo-600">{Math.round((e.selfBalance ?? 0) / 10000).toLocaleString()}万</td><td className="px-1 py-0.5 text-right font-mono text-pink-600">{Math.round((e.spouseBalance ?? 0) / 10000).toLocaleString()}万</td></>
                : <td className="px-1 py-0.5 text-right font-mono">{Math.round(e.balance / 10000).toLocaleString()}万</td>}
              <td className="px-1 py-0.5 text-right font-mono">{(e.monthlyPayment / 10000).toFixed(1)}万</td>
              <td className="px-1 py-0.5 text-right">{e.rate}%</td>
              <td className="px-1 py-0.5 text-gray-500">{notes.join(" / ")}</td>
            </tr>);
          })}</tbody>
        </table>
      </div>

      {hasSale && saleCGT && (
        <div className="rounded bg-red-50 border border-red-200 p-2 text-red-800 text-[10px]">
          <div className="font-bold">売却（{pp.saleAge}歳）</div>
          <div>売却{Math.round(salePrice / 10000).toLocaleString()}万 − 残債{Math.round(saleBal / 10000).toLocaleString()}万 − 譲渡税{Math.round(saleCGT.tax / 10000).toLocaleString()}万 = <b>手取{Math.round((salePrice - saleBal - saleCGT.tax) / 10000).toLocaleString()}万</b></div>
        </div>
      )}
    </div>
  );
}

// ===== 設定フォーム =====
function PropertyFormInputs({ pp, u, purchaseAge, onPurchaseAgeChange }: {
  pp: PropertyParams; u: (patch: Partial<PropertyParams>) => void;
  purchaseAge: number; onPurchaseAgeChange?: (age: number) => void;
}) {
  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;
  const isPE = pp.repaymentType === "equal_principal";
  const fixedM = isPE ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (pp.fixedRate / 100 / 12)) : calcMonthlyPaymentEqual(loanAmount, pp.fixedRate, pp.loanYears);
  const varInitM = isPE ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (pp.variableInitRate / 100 / 12)) : calcMonthlyPaymentEqual(loanAmount, pp.variableInitRate, pp.loanYears);
  const varRiskM = isPE ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (pp.variableRiskRate / 100 / 12)) : calcMonthlyPaymentEqual(loanAmount, pp.variableRiskRate, pp.loanYears);
  const displayM = pp.rateType === "fixed" ? fixedM : varInitM;
  const dedY1 = Math.min(Math.round(loanAmount * 0.007), 350000);
  const schedule = useMemo(() => loanAmount > 0 ? buildLoanSchedule(pp, purchaseAge) : [], [pp, purchaseAge, loanAmount]);

  return { inputs: (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {onPurchaseAgeChange && <div>
          <label className="block font-semibold text-gray-600 mb-1">購入時年齢</label>
          <input type="number" value={purchaseAge} onChange={e => onPurchaseAgeChange(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
        </div>}
        <div><label className="block font-semibold text-gray-600 mb-1">物件価格（万円）</label><input type="number" value={pp.priceMan} step={100} onChange={e => u({ priceMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
        <div><label className="block font-semibold text-gray-600 mb-1">頭金（万円）</label><input type="number" value={pp.downPaymentMan} step={100} onChange={e => u({ downPaymentMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
        <div><label className="block font-semibold text-gray-600 mb-1">ローン期間（年）<H t="最長50年。定年後も返済が続く場合は退職金・年金で返済計画を" /></label><input type="number" value={pp.loanYears} min={1} max={50} onChange={e => u({ loanYears: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
      </div>
      <div className="text-gray-500">借入: <b>{(pp.priceMan - pp.downPaymentMan).toLocaleString()}万</b>　諸費用: 約{Math.round(pp.priceMan * 0.07)}万（7%）</div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border p-2 space-y-1"><label className="block font-semibold text-gray-600 text-[11px]">返済方式<H t="元利均等=毎月一定で計画しやすい。元金均等=総利息が少ないが初期負担大" /></label><div className="flex gap-1">
          <button onClick={() => u({ repaymentType: "equal_payment" })} className={`rounded px-2 py-0.5 text-[10px] ${pp.repaymentType !== "equal_principal" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>元利均等</button>
          <button onClick={() => u({ repaymentType: "equal_principal" })} className={`rounded px-2 py-0.5 text-[10px] ${pp.repaymentType === "equal_principal" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>元金均等</button>
        </div></div>
        <div className="rounded border p-2 space-y-1"><label className="block font-semibold text-gray-600 text-[11px]">ローン構造<H t="ペアローン=夫婦それぞれが借入。控除2人分使えるが諸費用も2倍" /></label><div className="flex gap-1">
          <button onClick={() => u({ loanStructure: "single", danshinTarget: "self", deductionTarget: "self" })} className={`rounded px-2 py-0.5 text-[10px] ${(pp.loanStructure || "single") === "single" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>単独</button>
          <button onClick={() => u({ loanStructure: "pair", danshinTarget: "both", deductionTarget: "both" })} className={`rounded px-2 py-0.5 text-[10px] ${pp.loanStructure === "pair" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>ペア</button>
        </div>{pp.loanStructure === "pair" && <div className="flex items-center gap-1 text-[10px]"><span className="text-gray-400">本人</span><input type="number" value={pp.pairRatio ?? 50} min={1} max={99} step={5} onChange={e => u({ pairRatio: Number(e.target.value) })} className="w-12 rounded border px-1 py-0.5 text-[10px]" /><span className="text-gray-400">%</span></div>}</div>
      </div>

      <div className="rounded border p-2 space-y-1">
        <div className="flex items-center gap-2"><label className="font-semibold text-gray-600 text-[11px]">金利</label>
          <button onClick={() => u({ rateType: "fixed" })} className={`rounded px-2 py-0.5 text-[10px] ${pp.rateType === "fixed" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>固定</button>
          <button onClick={() => u({ rateType: "variable" })} className={`rounded px-2 py-0.5 text-[10px] ${pp.rateType === "variable" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>変動</button>
        </div>
        {pp.rateType === "fixed" ? <div className="flex items-center gap-1"><input type="number" value={pp.fixedRate} step={0.1} min={0} onChange={e => u({ fixedRate: Number(e.target.value) })} className="w-20 rounded border px-2 py-1" /><span className="text-gray-400">%　月額{Math.round(fixedM / 10000)}万</span></div>
        : <div className="grid grid-cols-3 gap-1">
          <div><div className="text-[9px] text-gray-400 mb-0.5">初期金利<H t="優遇適用後の金利" /></div><div className="flex items-center gap-0.5"><input type="number" value={pp.variableInitRate} step={0.1} min={0} onChange={e => u({ variableInitRate: Number(e.target.value) })} className="w-full rounded border px-1 py-0.5" /><span className="text-[10px] text-gray-400">%</span></div></div>
          <div><div className="text-[9px] text-gray-400 mb-0.5">上昇後<H t="優遇終了or金利上昇時のリスク想定値" /></div><div className="flex items-center gap-0.5"><input type="number" value={pp.variableRiskRate} step={0.1} min={0} onChange={e => u({ variableRiskRate: Number(e.target.value) })} className="w-full rounded border px-1 py-0.5" /><span className="text-[10px] text-gray-400">%</span></div></div>
          <div><div className="text-[9px] text-gray-400 mb-0.5">上昇時期<H t="通常5〜10年後に金利見直し" /></div><div className="flex items-center gap-0.5"><input type="number" value={pp.variableRiseAfter} min={1} max={pp.loanYears} onChange={e => u({ variableRiseAfter: Number(e.target.value) })} className="w-full rounded border px-1 py-0.5" /><span className="text-[10px] text-gray-400">年後</span></div></div>
          <div className="col-span-3 text-[10px] text-amber-600">当初{Math.round(varInitM/10000)}万/月 → {pp.variableRiseAfter}年後{Math.round(varRiskM/10000)}万/月</div>
        </div>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1"><label className="text-gray-500 text-[10px] whitespace-nowrap">管理費<H t="管理費+修繕積立金の合計。築年数とともに上昇傾向" /></label><input type="number" value={pp.maintenanceMonthlyMan} step={0.5} min={0} onChange={e => u({ maintenanceMonthlyMan: Number(e.target.value) })} className="w-16 rounded border px-1.5 py-1" /><span className="text-[10px] text-gray-400">万/月</span></div>
        <div className="flex items-center gap-1"><label className="text-gray-500 text-[10px] whitespace-nowrap">固定資産税<H t="新築5年は軽減あり。目安: 物件価格の0.3-0.5%/年" /></label><input type="number" value={pp.taxAnnualMan} step={1} min={0} onChange={e => u({ taxAnnualMan: Number(e.target.value) })} className="w-16 rounded border px-1.5 py-1" /><span className="text-[10px] text-gray-400">万/年</span></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(() => {
          const isPair = pp.loanStructure === "pair";
          const danshinOpts: ("self" | "spouse" | "both")[] = isPair ? ["self", "spouse", "both"] : ["self"];
          const dedOpts: ("self" | "spouse" | "both")[] = isPair ? ["self", "spouse", "both"] : ["self"];
          return <>
            <div className="rounded border p-2 space-y-1">
              <label className="font-semibold text-gray-600 text-[11px]">団信</label>
              <div className="flex gap-1">
                {danshinOpts.map(v => <button key={v} onClick={() => u({ danshinTarget: v })}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${(pp.danshinTarget || "self") === v ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                  {v === "self" ? "本人" : v === "spouse" ? "配偶者" : "両方"}</button>)}
              </div>
              {!isPair && <div className="text-[9px] text-gray-400">単独ローンは本人のみ</div>}
            </div>
            <div className="rounded border p-2 space-y-1">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={pp.hasLoanDeduction} onChange={e => u({ hasLoanDeduction: e.target.checked })} className="accent-green-600" />
                <span className="font-semibold text-gray-600 text-[11px]">ローン控除</span>
              </label>
              {pp.hasLoanDeduction && <div className="flex gap-1">
                {dedOpts.map(v => <button key={v} onClick={() => u({ deductionTarget: v })}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${(pp.deductionTarget || "self") === v ? "bg-green-600 text-white" : "bg-gray-100"}`}>
                  {v === "self" ? "本人" : v === "spouse" ? "配偶者" : "両方"}</button>)}
              </div>}
              {!isPair && pp.hasLoanDeduction && <div className="text-[9px] text-gray-400">単独ローンは名義人のみ</div>}
            </div>
          </>;
        })()}
      </div>

      <div className="rounded border p-2 space-y-1.5">
        <div className="flex items-center justify-between"><label className="font-semibold text-gray-600 text-[11px]">繰上返済<H t="期間短縮=総利息削減効果大。返済額軽減=月々の負担を減らす" /></label>
          <button onClick={()=>u({prepayments:[...(pp.prepayments||[]),{age:purchaseAge+10,amountMan:500,type:"shorten"}]})} className="text-[10px] text-blue-500 hover:underline">+ 追加</button>
        </div>
        {(pp.prepayments||[]).map((prep,i)=>{const sp=(patch:Partial<typeof prep>)=>{const ps=[...(pp.prepayments||[])];ps[i]={...prep,...patch};u({prepayments:ps})};return(
          <div key={i} className="flex flex-wrap items-center gap-1 text-[10px] bg-gray-50 rounded p-1">
            <input type="number" value={prep.age} min={purchaseAge+1} onChange={e=>sp({age:Number(e.target.value)})} className="w-12 rounded border px-1 py-0.5" /><span className="text-gray-400">歳</span>
            <input type="number" value={prep.amountMan} step={100} min={1} onChange={e=>sp({amountMan:Number(e.target.value)})} className="w-16 rounded border px-1 py-0.5" /><span className="text-gray-400">万</span>
            <button onClick={()=>sp({type:"shorten"})} className={`rounded px-1.5 py-0.5 ${prep.type==="shorten"?"bg-blue-600 text-white":"bg-gray-200 text-gray-500"}`}>期間短縮</button>
            <button onClick={()=>sp({type:"reduce"})} className={`rounded px-1.5 py-0.5 ${prep.type==="reduce"?"bg-blue-600 text-white":"bg-gray-200 text-gray-500"}`}>返済軽減</button>
            {pp.loanStructure==="pair"&&<><button onClick={()=>sp({target:"self"})} className={`rounded px-1.5 py-0.5 ${(prep.target||"self")==="self"?"bg-indigo-600 text-white":"bg-gray-200 text-gray-500"}`}>本人</button><button onClick={()=>sp({target:"spouse"})} className={`rounded px-1.5 py-0.5 ${prep.target==="spouse"?"bg-pink-600 text-white":"bg-gray-200 text-gray-500"}`}>配偶者</button></>}
            <button onClick={()=>u({prepayments:(pp.prepayments||[]).filter((_,j)=>j!==i)})} className="text-gray-300 hover:text-red-500 ml-auto">×</button>
          </div>);})}
      </div>

      {/* 売却 */}
      <div className="rounded border p-2 space-y-1.5">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={pp.saleAge != null}
            onChange={e => u(e.target.checked ? { saleAge: purchaseAge + 20, saleIsResidence: true, saleCostRate: 4 } : { saleAge: undefined, salePriceMan: undefined, appreciationRate: undefined, saleIsResidence: undefined, saleCostRate: undefined })}
            className="accent-blue-600" />
          <span className="font-semibold text-gray-600 text-[11px]">売却予定</span>
        </label>
        {pp.saleAge != null && (() => {
          const yearsSince = pp.saleAge - purchaseAge;
          const purchasePriceYen = pp.priceMan * 10000;
          const appRate = (pp.appreciationRate ?? 0) / 100;
          const autoSalePrice = Math.round(purchasePriceYen * Math.pow(1 + appRate, yearsSince));
          const salePriceYen = pp.salePriceMan != null ? pp.salePriceMan * 10000 : autoSalePrice;
          const remainLoan = yearsSince < schedule.length ? schedule[yearsSince]?.balance ?? 0 : 0;
          const cgt = calcPropertyCapitalGainsTax(purchasePriceYen, salePriceYen, yearsSince, pp.saleIsResidence ?? true, pp.saleCostRate ?? 4);
          const transferCost = Math.round(salePriceYen * (pp.saleCostRate ?? 4) / 100);
          const net = salePriceYen - remainLoan - transferCost - cgt.tax;
          return (<div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="flex items-center gap-1"><span className="text-gray-500">売却年齢</span><input type="number" value={pp.saleAge} min={purchaseAge + 1} onChange={e => u({ saleAge: Number(e.target.value) })} className="w-12 rounded border px-1 py-0.5" /><span className="text-gray-400">歳</span></div>
              <div className="flex items-center gap-1"><span className="text-gray-500">売却価格</span><input type="number" value={pp.salePriceMan ?? ""} step={100} placeholder={`${Math.round(autoSalePrice / 10000)}`} onChange={e => u({ salePriceMan: e.target.value ? Number(e.target.value) : undefined })} className="w-16 rounded border px-1 py-0.5" /><span className="text-gray-400">万</span></div>
              <div className="flex items-center gap-1"><span className="text-gray-500">変動率<H t="年間の資産価値変動。都心マンション+1〜2%、郊外戸建-1〜-2%が目安" /></span><input type="number" value={pp.appreciationRate ?? 0} step={0.5} onChange={e => u({ appreciationRate: Number(e.target.value) })} className="w-14 rounded border px-1 py-0.5" /><span className="text-gray-400">%/年</span></div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
              <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={pp.saleIsResidence ?? true} onChange={e => u({ saleIsResidence: e.target.checked })} className="accent-blue-600" /><span className="text-gray-600">居住用（3000万特別控除）<H t="自宅売却益から最大3,000万円控除。賃貸に出した場合は適用不可" /></span></label>
              <div className="flex items-center gap-1"><span className="text-gray-500">売却費用</span><input type="number" value={pp.saleCostRate ?? 4} step={0.5} min={0} max={10} onChange={e => u({ saleCostRate: Number(e.target.value) })} className="w-10 rounded border px-1 py-0.5" /><span className="text-gray-400">%</span></div>
            </div>
            {/* 売却試算 */}
            <div className="rounded bg-red-50 p-2 text-[10px] space-y-1">
              <div className="font-bold text-red-800">売却試算（{pp.saleAge}歳 / {yearsSince}年後）</div>
              <div className="grid grid-cols-2 gap-x-3">
                <div>売却価格: <b>{Math.round(salePriceYen / 10000).toLocaleString()}万</b>{pp.salePriceMan == null && <span className="text-gray-400"> (自動)</span>}</div>
                <div>残ローン: <b className="text-red-600">{Math.round(remainLoan / 10000).toLocaleString()}万</b></div>
                <div>売却費用({pp.saleCostRate ?? 4}%): {Math.round(transferCost / 10000).toLocaleString()}万</div>
                <div>譲渡益: {Math.round(cgt.gain / 10000).toLocaleString()}万 ({cgt.isLongTerm ? "長期" : "短期"})</div>
                {(pp.saleIsResidence ?? true) && cgt.specialDeduction > 0 && <div className="text-green-700">特別控除: -{Math.round(cgt.specialDeduction / 10000).toLocaleString()}万</div>}
                <div>譲渡所得税: <b>{Math.round(cgt.tax / 10000).toLocaleString()}万</b>{cgt.isLongTerm ? <span className="text-gray-400"> (20.315%)</span> : <span className="text-gray-400"> (39.63%)</span>}</div>
              </div>
              <div className="border-t border-red-200 pt-1 font-bold text-red-800">
                手取り: {Math.round(net / 10000).toLocaleString()}万円
                {net < 0 && <span className="text-red-600 ml-1">（残債超過）</span>}
              </div>
            </div>
          </div>);
        })()}
      </div>

      {/* 借換 */}
      <div className="rounded border p-2 space-y-1">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={pp.refinance != null}
            onChange={e => u(e.target.checked ? { refinance: { age: purchaseAge + 10, newRate: 1.2, newLoanYears: 25, costMan: 50 } } : { refinance: undefined })}
            className="accent-blue-600" />
          <span className="font-semibold text-gray-600 text-[11px]">借換</span>
        </label>
        {pp.refinance && <div className="space-y-1 text-[10px]">
          <div className="flex items-center gap-1">
            <input type="number" value={pp.refinance.age} min={purchaseAge + 1} onChange={e => u({ refinance: { ...pp.refinance!, age: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5" /><span className="text-gray-400">歳</span>
            <input type="number" value={pp.refinance.newRate} step={0.1} min={0} onChange={e => u({ refinance: { ...pp.refinance!, newRate: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5" /><span className="text-gray-400">%</span>
            <input type="number" value={pp.refinance.newLoanYears} min={1} max={50} onChange={e => u({ refinance: { ...pp.refinance!, newLoanYears: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5" /><span className="text-gray-400">年</span>
            <span className="text-gray-400">手数料</span>
            <input type="number" value={pp.refinance.costMan} step={10} min={0} onChange={e => u({ refinance: { ...pp.refinance!, costMan: Number(e.target.value) } })} className="w-14 rounded border px-1 py-0.5" /><span className="text-gray-400">万</span>
          </div>
        </div>}
      </div>

      <div className="rounded bg-blue-50 p-2 text-gray-700">
        <div className="font-bold mb-0.5">初年度コスト</div>
        <div className="flex flex-wrap gap-x-3 text-[10px]">
          <span>ローン: {Math.round(displayM * 12 / 10000)}万/年</span><span>管理費: {pp.maintenanceMonthlyMan * 12}万/年</span><span>固資税: {pp.taxAnnualMan}万/年</span>
          {pp.hasLoanDeduction && <span className="text-green-600">控除: -{Math.round(dedY1 / 10000)}万</span>}
        </div>
        <div className="font-bold mt-0.5">合計: 約{Math.round(displayM * 12 / 10000) + pp.maintenanceMonthlyMan * 12 + pp.taxAnnualMan - (pp.hasLoanDeduction ? Math.round(dedY1 / 10000) : 0)}万円/年</div>
      </div>
    </div>
  ), schedule, loanAmount };
}

/** フォーム+プレビューの2カラムレイアウト */
export function PropertyFormWithPreview({ pp, onChange, purchaseAge, onPurchaseAgeChange }: {
  pp: PropertyParams; onChange: (pp: PropertyParams) => void;
  purchaseAge: number; onPurchaseAgeChange?: (age: number) => void;
}) {
  const u = (patch: Partial<PropertyParams>) => onChange({ ...pp, ...patch });
  const { inputs, schedule, loanAmount } = PropertyFormInputs({ pp, u, purchaseAge, onPurchaseAgeChange });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {inputs}
      <div className="space-y-3">
        {loanAmount > 0 && schedule.length > 0 ? (
          <><div className="font-bold text-blue-800 text-sm">返済プラン</div>
            <RepaymentPreview schedule={schedule} pp={pp} purchaseAge={purchaseAge} /></>
        ) : (
          <div className="text-gray-400 text-center py-8">ローンなし（一括購入）</div>
        )}
      </div>
    </div>
  );
}

// 後方互換: PropertyForm（旧API）
export function PropertyForm({ pp, onChange, purchaseAge, onPurchaseAgeChange }: {
  pp: PropertyParams; onChange: (pp: PropertyParams) => void;
  purchaseAge: number; onPurchaseAgeChange?: (age: number) => void;
}) {
  const u = (patch: Partial<PropertyParams>) => onChange({ ...pp, ...patch });
  return PropertyFormInputs({ pp, u, purchaseAge, onPurchaseAgeChange });
}
