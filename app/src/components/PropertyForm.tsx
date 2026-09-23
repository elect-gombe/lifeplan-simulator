import React, { useMemo } from "react";
import type { PropertyParams, PrepaymentEntry } from "../lib/types";
import { calcMonthlyPaymentEqual, buildLoanSchedule } from "../lib/calc";
import type { LoanScheduleEntry } from "../lib/calc";
import { calcPropertyCapitalGainsTax } from "../lib/tax";
import { BarChart, NumIn, NumField, Btns, Check, FieldRow, SubGroup, MiniBtn } from "./ui";

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
// 上から: 物件・借入 / 金利 / 維持費・控除 / 返済方式・構造 / 団信・控除対象 / 繰上返済 / 売却 / 借換。
function PropertyFormInputs({ pp, u, purchaseAge, onPurchaseAgeChange }: {
  pp: PropertyParams; u: (patch: Partial<PropertyParams>) => void;
  purchaseAge: number; onPurchaseAgeChange?: (age: number) => void;
}) {
  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;
  const isPE = pp.repaymentType === "equal_principal";
  const monthly = (rate: number) => isPE
    ? Math.round((loanAmount / (pp.loanYears * 12)) + loanAmount * (rate / 100 / 12))
    : calcMonthlyPaymentEqual(loanAmount, rate, pp.loanYears);
  const fixedM = monthly(pp.fixedRate), varInitM = monthly(pp.variableInitRate), varRiskM = monthly(pp.variableRiskRate);
  const displayM = pp.rateType === "fixed" ? fixedM : varInitM;
  const dedY1 = Math.min(Math.round(loanAmount * 0.007), 350000);
  const schedule = useMemo(() => loanAmount > 0 ? buildLoanSchedule(pp, purchaseAge) : [], [pp, purchaseAge, loanAmount]);
  const isPair = pp.loanStructure === "pair";
  const targetOpts = (isPair ? ["self", "spouse", "both"] : ["self"]).map(v => ({ value: v as "self" | "spouse" | "both", label: v === "self" ? "本人" : v === "spouse" ? "配偶者" : "両方" }));
  const CERT_TYPES = [["certified", "認定", "5000万/13年"], ["zeh", "ZEH", "4500万/13年"], ["advanced", "省エネ", "3500万/13年"], ["standard", "一般", "3000万/10年"]] as const;
  const prepayments = pp.prepayments || [];
  const setPrepay = (i: number, patch: Partial<PrepaymentEntry>) => { const ps = [...prepayments]; ps[i] = { ...ps[i], ...patch }; u({ prepayments: ps }); };

  const inputs = (
    <div className="space-y-3">
      {/* 物件・借入 */}
      <div className="grid grid-cols-2 gap-2">
        {onPurchaseAgeChange && <NumIn label="購入時年齢" value={purchaseAge} onChange={onPurchaseAgeChange} min={18} max={100} unit="歳" fill />}
        <NumIn label="物件価格" value={pp.priceMan} onChange={v => u({ priceMan: v })} step={100} min={0} unit="万円" fill presets={[3000, 4000, 5000, 6000, 8000]} />
        <NumIn label="頭金" value={pp.downPaymentMan} onChange={v => u({ downPaymentMan: v })} step={100} min={0} max={pp.priceMan} unit="万円" fill />
        <NumIn label="ローン期間" help="最長50年。定年後も返済が続く場合は退職金・年金で返済計画を" value={pp.loanYears} onChange={v => u({ loanYears: v })} min={1} max={50} unit="年" fill presets={[20, 25, 30, 35]} />
      </div>
      <div className="text-gray-500">借入 <b>{(pp.priceMan - pp.downPaymentMan).toLocaleString()}万</b>　諸費用 約{Math.round(pp.priceMan * 0.07)}万（7%）</div>

      {/* 金利 */}
      <SubGroup title={<>金利<span className="ml-2 font-normal text-gray-400">月額 {Math.round(displayM / 10000)}万</span></>}
        right={<Btns options={[{ value: "fixed" as const, label: "固定" }, { value: "variable" as const, label: "変動" }]} value={pp.rateType} onChange={v => u({ rateType: v })} />}>
        {pp.rateType === "fixed" ? (
          <FieldRow><NumField value={pp.fixedRate} onChange={v => u({ fixedRate: v })} step={0.1} min={0} max={10} unit="%" w="w-16" /></FieldRow>
        ) : (
          <FieldRow>
            <NumIn label={<>初期金利<H t="優遇適用後の金利" /></>} value={pp.variableInitRate} onChange={v => u({ variableInitRate: v })} step={0.1} min={0} max={10} unit="%" small />
            <NumIn label={<>上昇後<H t="優遇終了or金利上昇時のリスク想定値" /></>} value={pp.variableRiskRate} onChange={v => u({ variableRiskRate: v })} step={0.1} min={0} max={10} unit="%" small />
            <NumIn label={<>上昇時期<H t="通常5〜10年後に金利見直し" /></>} value={pp.variableRiseAfter} onChange={v => u({ variableRiseAfter: v })} min={1} max={pp.loanYears} unit="年後" small />
            <span className="w-full text-[10px] text-amber-600">当初{Math.round(varInitM / 10000)}万/月 → {pp.variableRiseAfter}年後 {Math.round(varRiskM / 10000)}万/月</span>
          </FieldRow>
        )}
      </SubGroup>

      {/* 維持費・控除 */}
      <SubGroup title="維持費・ローン控除">
        <FieldRow>
          <NumIn label={<>管理費・修繕<H t="管理費+修繕積立金の合計。築年数とともに上昇傾向" /></>} value={pp.maintenanceMonthlyMan} onChange={v => u({ maintenanceMonthlyMan: v })} step={0.5} min={0} unit="万/月" small />
          <NumIn label={<>固定資産税<H t="新築5年は軽減あり。目安: 物件価格の0.3-0.5%/年" /></>} value={pp.taxAnnualMan} onChange={v => u({ taxAnnualMan: v })} step={1} min={0} unit="万/年" small />
          <span className="self-end pb-1">
            <Check label="住宅ローン控除を使う" checked={pp.hasLoanDeduction} onChange={v => u({ hasLoanDeduction: v })} accent="accent-green-600" help="年末ローン残高×0.7%を所得税・住民税から控除（期間・上限は認定種別による）" />
          </span>
        </FieldRow>
      </SubGroup>

      <>
        <SubGroup title="返済方式・ローン構造">
          <FieldRow>
            <Btns label="返済" options={[{ value: "equal_payment" as const, label: "元利均等" }, { value: "equal_principal" as const, label: "元金均等" }]}
              value={pp.repaymentType === "equal_principal" ? "equal_principal" : "equal_payment"} onChange={v => u({ repaymentType: v })} />
            <Btns label="構造" options={[{ value: "single" as const, label: "単独" }, { value: "pair" as const, label: "ペア" }]}
              value={pp.loanStructure || "single"}
              onChange={v => u(v === "pair" ? { loanStructure: "pair", danshinTarget: "both", deductionTarget: "both" } : { loanStructure: "single", danshinTarget: "self", deductionTarget: "self" })} />
            {isPair && <NumField value={pp.pairRatio ?? 50} onChange={v => u({ pairRatio: v })} step={5} min={1} max={99} unit="% 本人" w="w-12" />}
          </FieldRow>
          <div className="mt-1 text-[10px] text-gray-400">元利均等＝毎月一定。元金均等＝総利息が少ないが初期負担大。ペアローン＝控除2人分・諸費用2倍</div>
        </SubGroup>
      </>

      <>
        <SubGroup title="団信・控除の対象">
          <FieldRow>
            <Btns label="団信" options={targetOpts} value={pp.danshinTarget || "self"} onChange={v => u({ danshinTarget: v })} />
            {pp.hasLoanDeduction && <Btns label="控除" options={targetOpts} value={pp.deductionTarget || "self"} onChange={v => u({ deductionTarget: v })} color="green" />}
          </FieldRow>
          {pp.hasLoanDeduction && (
            <FieldRow className="mt-1">
              <span className="text-[10px] text-gray-500">認定種別</span>
              {CERT_TYPES.map(([val, label, cap]) => (
                <button key={val} type="button" onClick={() => u({ certifiedType: pp.certifiedType === val ? undefined : val })} title={`借入限度 ${cap}`}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${pp.certifiedType === val ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-green-50"}`}>
                  {label}<span className="ml-0.5 opacity-70">{cap}</span>
                </button>
              ))}
              {!pp.certifiedType && <span className="text-[9px] text-gray-400">未選択＝認定長期優良住宅扱い</span>}
            </FieldRow>
          )}
        </SubGroup>
      </>

      
      <>
        <SubGroup title={<>繰上返済<H t="期間短縮=総利息削減効果大。返済額軽減=月々の負担を減らす" /></>}
          right={<MiniBtn onClick={() => u({ prepayments: [...prepayments, { age: purchaseAge + 10, amountMan: 500, type: "shorten" }] })}>＋ 追加</MiniBtn>}>
          {prepayments.length === 0 && <div className="text-[10px] text-gray-400">なし</div>}
          {prepayments.map((prep, i) => (
            <div key={i} className="mb-1 flex flex-wrap items-center gap-1 rounded bg-gray-50 p-1 text-[10px]">
              <NumField value={prep.age} onChange={v => setPrepay(i, { age: v })} min={purchaseAge + 1} max={purchaseAge + pp.loanYears} unit="歳" w="w-12" />
              <NumField value={prep.amountMan} onChange={v => setPrepay(i, { amountMan: v })} step={100} min={1} unit="万" w="w-16" />
              <Btns options={[{ value: "shorten" as const, label: "期間短縮" }, { value: "reduce" as const, label: "返済軽減" }]} value={prep.type} onChange={v => setPrepay(i, { type: v })} />
              {isPair && <Btns options={[{ value: "self" as const, label: "本人" }, { value: "spouse" as const, label: "配偶者" }]} value={prep.target || "self"} onChange={v => setPrepay(i, { target: v })} color="pink" />}
              <button type="button" onClick={() => u({ prepayments: prepayments.filter((_, j) => j !== i) })} className="ml-auto text-gray-300 hover:text-red-500">×</button>
            </div>
          ))}
        </SubGroup>
      </>

      <>
        <SubGroup title={<Check label="売却予定" checked={pp.saleAge != null}
          onChange={on => u(on ? { saleAge: purchaseAge + 20, saleIsResidence: true, saleCostRate: 4 } : { saleAge: undefined, salePriceMan: undefined, appreciationRate: undefined, saleIsResidence: undefined, saleCostRate: undefined })} />}>
          {pp.saleAge != null && (() => {
            const yearsSince = pp.saleAge - purchaseAge;
            const purchasePriceYen = pp.priceMan * 10000;
            const autoSalePrice = Math.round(purchasePriceYen * Math.pow(1 + (pp.appreciationRate ?? 0) / 100, yearsSince));
            const salePriceYen = pp.salePriceMan != null ? pp.salePriceMan * 10000 : autoSalePrice;
            const remainLoan = yearsSince < schedule.length ? schedule[yearsSince]?.balance ?? 0 : 0;
            const cgt = calcPropertyCapitalGainsTax(purchasePriceYen, salePriceYen, yearsSince, pp.saleIsResidence ?? true, pp.saleCostRate ?? 4);
            const transferCost = Math.round(salePriceYen * (pp.saleCostRate ?? 4) / 100);
            const net = salePriceYen - remainLoan - transferCost - cgt.tax;
            return (
              <div className="space-y-2">
                <FieldRow>
                  <NumIn label="売却年齢" value={pp.saleAge} onChange={v => u({ saleAge: v })} min={purchaseAge + 1} max={110} unit="歳" small />
                  <NumIn label="売却価格" value={pp.salePriceMan ?? null} onChange={v => u({ salePriceMan: v })} onClear={() => u({ salePriceMan: undefined })} step={100} min={0} unit="万" small placeholder={`${Math.round(autoSalePrice / 10000)}`} help="空欄＝購入価格×変動率で自動" />
                  <NumIn label={<>変動率<H t="年間の資産価値変動。都心マンション+1〜2%、郊外戸建-1〜-2%が目安" /></>} value={pp.appreciationRate ?? 0} onChange={v => u({ appreciationRate: v })} step={0.5} min={-10} max={10} unit="%/年" small />
                  <NumIn label="売却費用" value={pp.saleCostRate ?? 4} onChange={v => u({ saleCostRate: v })} step={0.5} min={0} max={10} unit="%" small />
                  <span className="self-end pb-1"><Check label="居住用（3000万特別控除）" checked={pp.saleIsResidence ?? true} onChange={v => u({ saleIsResidence: v })} help="自宅売却益から最大3,000万円控除。賃貸に出した場合は適用不可" /></span>
                </FieldRow>
                <div className="rounded bg-red-50 p-2 text-[10px] space-y-1">
                  <div className="font-bold text-red-800">売却試算（{pp.saleAge}歳 / {yearsSince}年後）</div>
                  <div className="grid grid-cols-2 gap-x-3">
                    <div>売却価格: <b>{Math.round(salePriceYen / 10000).toLocaleString()}万</b>{pp.salePriceMan == null && <span className="text-gray-400"> (自動)</span>}</div>
                    <div>残ローン: <b className="text-red-600">{Math.round(remainLoan / 10000).toLocaleString()}万</b></div>
                    <div>売却費用({pp.saleCostRate ?? 4}%): {Math.round(transferCost / 10000).toLocaleString()}万</div>
                    <div>譲渡益: {Math.round(cgt.gain / 10000).toLocaleString()}万 ({cgt.isLongTerm ? "長期" : "短期"})</div>
                    {(pp.saleIsResidence ?? true) && cgt.specialDeduction > 0 && <div className="text-green-700">特別控除: -{Math.round(cgt.specialDeduction / 10000).toLocaleString()}万</div>}
                    <div>譲渡所得税: <b>{Math.round(cgt.tax / 10000).toLocaleString()}万</b><span className="text-gray-400"> ({cgt.isLongTerm ? "20.315%" : "39.63%"})</span></div>
                  </div>
                  <div className="border-t border-red-200 pt-1 font-bold text-red-800">
                    手取り: {Math.round(net / 10000).toLocaleString()}万円{net < 0 && <span className="ml-1 text-red-600">（残債超過）</span>}
                  </div>
                </div>
              </div>
            );
          })()}
        </SubGroup>
      </>

      <>
        <SubGroup title={<Check label="借換" checked={pp.refinance != null}
          onChange={on => u(on ? { refinance: { age: purchaseAge + 10, newRate: 1.2, newLoanYears: 25, costMan: 50 } } : { refinance: undefined })} />}>
          {pp.refinance && (
            <FieldRow>
              <NumIn label="借換年齢" value={pp.refinance.age} onChange={v => u({ refinance: { ...pp.refinance!, age: v } })} min={purchaseAge + 1} max={purchaseAge + pp.loanYears} unit="歳" small />
              <NumIn label="新金利" value={pp.refinance.newRate} onChange={v => u({ refinance: { ...pp.refinance!, newRate: v } })} step={0.1} min={0} max={10} unit="%" small />
              <NumIn label="新期間" value={pp.refinance.newLoanYears} onChange={v => u({ refinance: { ...pp.refinance!, newLoanYears: v } })} min={1} max={50} unit="年" small />
              <NumIn label="手数料" value={pp.refinance.costMan} onChange={v => u({ refinance: { ...pp.refinance!, costMan: v } })} step={10} min={0} unit="万" small />
            </FieldRow>
          )}
        </SubGroup>
      </>

      {/* 初年度コスト */}
      <div className="rounded bg-blue-50 p-2 text-gray-700">
        <div className="mb-0.5 font-bold">初年度コスト</div>
        <div className="flex flex-wrap gap-x-3 text-[10px]">
          <span>ローン {Math.round(displayM * 12 / 10000)}万/年</span><span>管理費 {pp.maintenanceMonthlyMan * 12}万/年</span><span>固資税 {pp.taxAnnualMan}万/年</span>
          {pp.hasLoanDeduction && <span className="text-green-600">控除 -{Math.round(dedY1 / 10000)}万</span>}
        </div>
        <div className="mt-0.5 font-bold">合計 約{Math.round(displayM * 12 / 10000) + pp.maintenanceMonthlyMan * 12 + pp.taxAnnualMan - (pp.hasLoanDeduction ? Math.round(dedY1 / 10000) : 0)}万円/年</div>
      </div>
    </div>
  );
  return { inputs, schedule, loanAmount };
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
