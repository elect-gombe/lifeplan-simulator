import React from "react";
import type { CarParams } from "../lib/types";
import { calcMonthlyPaymentEqual } from "../lib/calc";
import { BarChart, Btns, Inp } from "./ui";
import { EventModal, type EventModalBaseProps, type EventModalDef } from "./EventModal";

// ===== 車コストプレビュー =====
interface CarYearData {
  age: number;
  purchase: number;
  loan: number;
  maintenance: number;
  insurance: number;
  total: number;
  isReplace: boolean;
}

function CarCostPreview({ cp, purchaseAge, simEndAge }: {
  cp: CarParams;
  purchaseAge: number;
  simEndAge: number;
}) {
  const effectiveEnd = Math.min(cp.endAge ?? simEndAge, simEndAge);
  const totalYears = Math.min(effectiveEnd - purchaseAge, 60);
  if (totalYears <= 0) return null;

  const loanMonthly = cp.loanYears > 0 ? calcMonthlyPaymentEqual(cp.priceMan * 10000, cp.loanRate, cp.loanYears) : 0;
  const loanAnnualMan = Math.round(loanMonthly * 12 / 10000);

  const yearData: CarYearData[] = [];
  let totalPurchase = 0;
  let totalLoan = 0;
  let totalMaintenance = 0;
  let totalInsurance = 0;

  for (let y = 0; y < totalYears; y++) {
    const age = purchaseAge + y;
    const isReplace = cp.replaceEveryYears > 0 && y > 0 && y % cp.replaceEveryYears === 0;
    const isFirstYear = y === 0;

    let purchase = 0;
    if (isFirstYear || isReplace) {
      purchase = cp.loanYears > 0 ? 0 : cp.priceMan;
    }

    let loan = 0;
    if (cp.loanYears > 0) {
      const yearInCycle = cp.replaceEveryYears > 0 ? y % cp.replaceEveryYears : y;
      if (yearInCycle < cp.loanYears) {
        loan = loanAnnualMan;
      }
      if (isReplace) loan = loanAnnualMan;
    }

    const maintenance = cp.maintenanceAnnualMan;
    const insurance = cp.insuranceAnnualMan;
    const total = purchase + loan + maintenance + insurance;

    totalPurchase += purchase;
    totalLoan += loan;
    totalMaintenance += maintenance;
    totalInsurance += insurance;

    yearData.push({ age, purchase, loan, maintenance, insurance, total, isReplace });
  }

  const grandTotal = totalPurchase + totalLoan + totalMaintenance + totalInsurance;
  const loanInterestTotal = cp.loanYears > 0 ? Math.round((loanMonthly * cp.loanYears * 12 - cp.priceMan * 10000) / 10000) : 0;
  const replacements = cp.replaceEveryYears > 0 ? Math.floor((totalYears - 1) / cp.replaceEveryYears) : 0;
  const totalCarPurchases = cp.priceMan * (1 + replacements);

  const milestones = new Set<number>();
  milestones.add(0);
  if (cp.loanYears > 0) milestones.add(cp.loanYears);
  if (cp.replaceEveryYears > 0) {
    for (let r = cp.replaceEveryYears; r < totalYears; r += cp.replaceEveryYears) milestones.add(r);
  }
  milestones.add(Math.min(9, totalYears - 1));
  milestones.add(Math.min(19, totalYears - 1));
  milestones.add(totalYears - 1);
  const showYears = [...milestones].filter(y => y >= 0 && y < totalYears).sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded bg-green-100 p-1.5">
          <div className="text-[10px] text-green-600">車両購入費</div>
          <div className="font-bold text-green-800">{totalCarPurchases}万</div>
          <div className="text-[9px] text-green-500">{1 + replacements}台（{cp.replaceEveryYears > 0 ? `${cp.replaceEveryYears}年毎` : "1回"}）</div>
        </div>
        <div className="rounded bg-orange-100 p-1.5">
          <div className="text-[10px] text-orange-600">維持費合計</div>
          <div className="font-bold text-orange-800">{totalMaintenance + totalInsurance}万</div>
          <div className="text-[9px] text-orange-500">{totalYears}年間</div>
        </div>
        {cp.loanYears > 0 && (
          <div className="rounded bg-blue-100 p-1.5">
            <div className="text-[10px] text-blue-600">ローン利息</div>
            <div className="font-bold text-blue-800">{loanInterestTotal * (1 + replacements)}万</div>
            <div className="text-[9px] text-blue-500">{cp.loanYears}年×{1 + replacements}回</div>
          </div>
        )}
        <div className="rounded bg-red-100 p-1.5">
          <div className="text-[10px] text-red-600">総コスト</div>
          <div className="font-bold text-red-800">{grandTotal.toLocaleString()}万</div>
          <div className="text-[9px] text-red-500">{totalYears}年間</div>
        </div>
      </div>

      {/* Chart 1: 購入費・ローン返済 */}
      {(() => {
        const maxPurchaseLoan = Math.max(...yearData.map(d => d.purchase + d.loan), 1);
        return (
          <div>
            <div className="text-[10px] font-semibold text-gray-500 mb-1">車両購入・ローン返済</div>
            <BarChart height={48} maxValue={maxPurchaseLoan}>
              {yearData.map((d, i) => {
                const val = d.purchase + d.loan;
                const hPx = Math.max(Math.round(val / maxPurchaseLoan * 48), val > 0 ? 1 : 0);
                const pRatio = val > 0 ? d.purchase / val : 0;
                const lRatio = val > 0 ? d.loan / val : 0;
                return (
                  <div key={i} className="flex-1 relative group flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: hPx, alignSelf: "flex-end" }}>
                    {lRatio > 0 && <div className="bg-blue-400 w-full" style={{ height: `${lRatio * 100}%` }} />}
                    {pRatio > 0 && <div className="bg-green-500 w-full" style={{ height: `${pRatio * 100}%` }} />}
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 pointer-events-none mb-1">
                      {d.age}歳{d.purchase > 0 ? ` 購入${d.purchase}万` : ""}{d.loan > 0 ? ` ローン${d.loan}万` : ""}{d.isReplace ? " (買替)" : ""}
                    </div>
                  </div>
                );
              })}
            </BarChart>
            <div className="flex justify-between text-[9px] text-gray-400 ml-8">
              <span>{purchaseAge}歳</span>
              <span className="flex gap-2">
                <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-green-500" />購入</span>
                {cp.loanYears > 0 && <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-blue-400" />ローン</span>}
              </span>
              <span>{purchaseAge + totalYears}歳</span>
            </div>
          </div>
        );
      })()}

      {/* Chart 2: 年間維持費 */}
      {(() => {
        const maxRunning = Math.max(...yearData.map(d => d.maintenance + d.insurance), 1);
        return (
          <div>
            <div className="text-[10px] font-semibold text-gray-500 mb-1">年間維持費</div>
            <BarChart height={40} maxValue={maxRunning}>
              {yearData.map((d, i) => {
                const val = d.maintenance + d.insurance;
                const hPx = Math.max(Math.round(val / maxRunning * 40), val > 0 ? 1 : 0);
                const mRatio = val > 0 ? d.maintenance / val : 0;
                const iRatio = val > 0 ? d.insurance / val : 0;
                return (
                  <div key={i} className="flex-1 relative group flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: hPx, alignSelf: "flex-end" }}>
                    {iRatio > 0 && <div className="bg-purple-300 w-full" style={{ height: `${iRatio * 100}%` }} />}
                    {mRatio > 0 && <div className="bg-orange-300 w-full" style={{ height: `${mRatio * 100}%` }} />}
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 pointer-events-none mb-1">
                      {d.age}歳: 維持{d.maintenance}万 保険{d.insurance}万
                    </div>
                  </div>
                );
              })}
            </BarChart>
            <div className="flex justify-between text-[9px] text-gray-400 ml-8">
              <span>{purchaseAge}歳</span>
              <span className="flex gap-2">
                <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-orange-300" />車検等</span>
                <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-purple-300" />保険</span>
              </span>
              <span>年{cp.maintenanceAnnualMan + cp.insuranceAnnualMan}万</span>
            </div>
          </div>
        );
      })()}

      {/* Schedule table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left px-1 py-0.5 font-semibold">年齢</th>
              <th className="text-right px-1 py-0.5 font-semibold">購入</th>
              <th className="text-right px-1 py-0.5 font-semibold">ローン</th>
              <th className="text-right px-1 py-0.5 font-semibold">維持費</th>
              <th className="text-right px-1 py-0.5 font-semibold">合計</th>
              <th className="text-left px-1 py-0.5 font-semibold">備考</th>
            </tr>
          </thead>
          <tbody>
            {showYears.map(y => {
              const d = yearData[y];
              if (!d) return null;
              const notes: string[] = [];
              if (y === 0) notes.push("初回購入");
              if (d.isReplace) notes.push("買い替え");
              if (cp.loanYears > 0) {
                const yearInCycle = cp.replaceEveryYears > 0 ? y % cp.replaceEveryYears : y;
                if (yearInCycle === cp.loanYears) notes.push("ローン完済");
              }
              const rowBg = d.isReplace ? "bg-green-50" : y === 0 ? "bg-blue-50" : "";
              return (
                <tr key={y} className={`border-b border-gray-100 ${rowBg}`}>
                  <td className="px-1 py-0.5 font-mono">{d.age}歳<span className="text-gray-300 ml-0.5">({y + 1}年)</span></td>
                  <td className="px-1 py-0.5 text-right font-mono">{d.purchase > 0 ? `${d.purchase}万` : "-"}</td>
                  <td className="px-1 py-0.5 text-right font-mono">{d.loan > 0 ? `${d.loan}万` : "-"}</td>
                  <td className="px-1 py-0.5 text-right font-mono">{d.maintenance + d.insurance}万</td>
                  <td className="px-1 py-0.5 text-right font-mono font-bold">{d.total}万</td>
                  <td className="px-1 py-0.5 text-gray-500">{notes.join(" / ")}</td>
                </tr>
              );
            })}
            <tr className="font-bold bg-gray-50">
              <td className="px-1 py-0.5">{totalYears}年合計</td>
              <td className="px-1 py-0.5 text-right font-mono">{totalPurchase > 0 ? `${totalPurchase}万` : "-"}</td>
              <td className="px-1 py-0.5 text-right font-mono">{totalLoan > 0 ? `${totalLoan}万` : "-"}</td>
              <td className="px-1 py-0.5 text-right font-mono">{totalMaintenance + totalInsurance}万</td>
              <td className="px-1 py-0.5 text-right font-mono">{grandTotal.toLocaleString()}万</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        {totalYears > showYears.length && (
          <div className="text-[9px] text-gray-400 text-center mt-0.5">主要年のみ表示（全{totalYears}年）</div>
        )}
      </div>
    </div>
  );
}

const carDef: EventModalDef<CarParams> = {
  type: "car",
  title: "🚗 車の購入・買い替え",
  btnClass: "bg-green-600 hover:bg-green-700",
  wide: true,
  defaults: { priceMan: 300, loanYears: 5, loanRate: 3.0, maintenanceAnnualMan: 15, insuranceAnnualMan: 8, replaceEveryYears: 7, endAge: 80 },
  paramsKey: "carParams",
  ageOffset: 3,
  buildLabel: (cp, age) => `車(${cp.priceMan}万/${cp.replaceEveryYears > 0 ? cp.replaceEveryYears + "年毎" : "一度"}〜${cp.endAge ?? 80}歳)`,
  buildExtra: (cp, age) => ({ durationYears: Math.max((cp.endAge ?? 80) - age, 0) }),
};

export function CarModal(props: EventModalBaseProps) {
  return (
    <EventModal def={carDef} {...props}>
      {({ params: cp, u, age, setAge, currentAge, retirementAge }) => {
        const loanMonthly = cp.loanYears > 0 ? calcMonthlyPaymentEqual(cp.priceMan * 10000, cp.loanRate, cp.loanYears) : 0;
        const annualRunningCost = cp.maintenanceAnnualMan + cp.insuranceAnnualMan;
        const simEndAge = retirementAge;

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Settings */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-gray-600 mb-1">購入時年齢</label>
                  <input type="number" value={age} min={currentAge} max={retirementAge - 1}
                    onChange={e => setAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-600 mb-1">車両価格（万円）</label>
                  <input type="number" value={cp.priceMan} step={50}
                    onChange={e => u({ priceMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-600 mb-1">所有終了年齢</label>
                  <input type="number" value={cp.endAge ?? 80} min={age + 1} max={100} step={1}
                    onChange={e => u({ endAge: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
                </div>
              </div>

              {/* Replacement cycle */}
              <div className="rounded border p-2 space-y-1.5">
                <label className="block font-semibold text-gray-600 text-[11px]">買い替えサイクル</label>
                <Btns options={[{value:0,label:"一度のみ"},{value:3,label:"3年毎"},{value:5,label:"5年毎"},{value:7,label:"7年毎"},{value:10,label:"10年毎"}]}
                  value={cp.replaceEveryYears} onChange={v => u({ replaceEveryYears: v })} color="green" />
                {cp.replaceEveryYears > 0 && (
                  <div className="text-[10px] text-gray-400">
                    {age}歳から{cp.replaceEveryYears}年ごとに買い替え。同額の車を想定。
                  </div>
                )}
              </div>

              {/* Loan */}
              <div className="rounded border p-2 space-y-1.5">
                <label className="block font-semibold text-gray-600 text-[11px]">ローン</label>
                <Btns options={[{value:0,label:"一括"},{value:3,label:"3年"},{value:5,label:"5年"},{value:7,label:"7年"}]}
                  value={cp.loanYears} onChange={v => u({ loanYears: v })} color="green" />
                {cp.loanYears > 0 && (
                  <div className="flex items-center gap-2">
                    <Inp label="金利" value={cp.loanRate} onChange={v => u({ loanRate: v })} unit="%" w="w-14" step={0.1} min={0} />
                    <span className="text-[10px] text-gray-400">月額{(loanMonthly / 10000).toFixed(1)}万</span>
                  </div>
                )}
              </div>

              {/* Running costs */}
              <div className="rounded border p-2 space-y-1.5">
                <label className="block font-semibold text-gray-600 text-[11px]">維持費（年額）</label>
                <div className="grid grid-cols-2 gap-2">
                  <Inp label="車検・整備・税" value={cp.maintenanceAnnualMan} onChange={v => u({ maintenanceAnnualMan: v })} unit="万" w="w-14" step={1} min={0} />
                  <Inp label="保険料" value={cp.insuranceAnnualMan} onChange={v => u({ insuranceAnnualMan: v })} unit="万" w="w-14" step={1} min={0} />
                </div>
                <div className="text-[10px] text-gray-400">維持費合計: <b>{annualRunningCost}万円/年</b></div>
              </div>
            </div>

            {/* Right: Preview */}
            <div className="space-y-3">
              <div className="font-bold text-green-800 text-sm">コストプラン</div>
              <CarCostPreview cp={cp} purchaseAge={age} simEndAge={simEndAge} />
            </div>
          </div>
        );
      }}
    </EventModal>
  );
}
