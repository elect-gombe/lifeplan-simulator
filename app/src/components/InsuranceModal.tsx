import React, { useState, useEffect } from "react";
import type { LifeEvent, InsuranceParams, EventTarget } from "../lib/types";
import { Modal, BarChart } from "./ui";

// ===== 保険コストプレビュー =====
interface InsYearData {
  age: number;
  premium: number;       // 保険料（万/年）
  payoutIfDeath: number; // この年に死亡した場合の受取総額（万）
  cumulativePremium: number; // 累積保険料（万）
  inCoverage: boolean;
}

function InsuranceCostPreview({ ip, startAge, target }: {
  ip: InsuranceParams;
  startAge: number;
  target: EventTarget;
}) {
  const coverageYears = Math.max(ip.coverageEndAge - startAge, 0);
  if (coverageYears <= 0) return null;

  const premiumAnnual = ip.premiumMonthlyMan * 12;
  const totalPremium = premiumAnnual * coverageYears;

  // Build year-by-year data
  const yearData: InsYearData[] = [];
  let cumPremium = 0;
  // Show until max of coverage end, payout end
  const maxAge = Math.max(ip.coverageEndAge, ip.insuranceType === "income_protection" ? ip.payoutUntilAge : ip.coverageEndAge);
  const totalYears = maxAge - startAge;

  for (let y = 0; y < totalYears; y++) {
    const age = startAge + y;
    const inCoverage = age < ip.coverageEndAge;
    if (inCoverage) cumPremium += premiumAnnual;

    let payoutIfDeath = 0;
    if (inCoverage || age < ip.coverageEndAge) {
      if (ip.insuranceType === "term_life") {
        payoutIfDeath = ip.lumpSumPayoutMan;
      } else {
        // 収入保障: 死亡時点から payoutUntilAge まで月額支給
        const remainMonths = Math.max((ip.payoutUntilAge - age) * 12, 0);
        payoutIfDeath = ip.monthlyPayoutMan * remainMonths;
      }
    }

    yearData.push({
      age, premium: inCoverage ? premiumAnnual : 0,
      payoutIfDeath, cumulativePremium: cumPremium, inCoverage,
    });
  }

  const maxPayout = Math.max(...yearData.map(d => d.payoutIfDeath), 1);
  const maxCumPremium = Math.max(cumPremium, 1);
  const chartHeight = 72;

  // Milestones for table
  const milestones = new Set<number>();
  milestones.add(0);
  milestones.add(Math.min(4, totalYears - 1));
  milestones.add(Math.min(9, totalYears - 1));
  milestones.add(Math.min(14, totalYears - 1));
  milestones.add(Math.min(19, totalYears - 1));
  milestones.add(coverageYears - 1);
  if (ip.insuranceType === "income_protection") {
    milestones.add(Math.max(ip.payoutUntilAge - startAge - 1, 0));
  }
  milestones.add(totalYears - 1);
  const showYears = [...milestones].filter(y => y >= 0 && y < totalYears).sort((a, b) => a - b);

  // Return ratio (受取倍率)
  const maxPayoutAtStart = yearData[0]?.payoutIfDeath || 0;
  const returnRatio = totalPremium > 0 ? (maxPayoutAtStart / totalPremium).toFixed(1) : "-";

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded bg-indigo-100 p-1.5">
          <div className="text-[10px] text-indigo-600">総保険料</div>
          <div className="font-bold text-indigo-800">{Math.round(totalPremium)}万</div>
          <div className="text-[9px] text-indigo-500">{coverageYears}年間</div>
        </div>
        <div className="rounded bg-green-100 p-1.5">
          <div className="text-[10px] text-green-600">最大保険金</div>
          <div className="font-bold text-green-800">{Math.round(maxPayoutAtStart).toLocaleString()}万</div>
          <div className="text-[9px] text-green-500">
            {ip.insuranceType === "term_life" ? "一時金" : `${ip.monthlyPayoutMan}万/月×${Math.max(ip.payoutUntilAge - startAge, 0)}年`}
          </div>
        </div>
        <div className="rounded bg-amber-100 p-1.5">
          <div className="text-[10px] text-amber-600">受取倍率</div>
          <div className="font-bold text-amber-800">{returnRatio}倍</div>
          <div className="text-[9px] text-amber-500">最大保険金÷総保険料</div>
        </div>
        <div className="rounded bg-gray-100 p-1.5">
          <div className="text-[10px] text-gray-600">年間保険料</div>
          <div className="font-bold text-gray-800">{premiumAnnual.toFixed(1)}万</div>
          <div className="text-[9px] text-gray-500">月額{ip.premiumMonthlyMan}万</div>
        </div>
      </div>

      {/* Chart 1: 累積保険料 */}
      <div>
        <div className="text-[10px] font-semibold text-gray-500 mb-1">累積保険料</div>
        <BarChart height={48} maxValue={Math.round(maxCumPremium)}>
          {yearData.map((d, i) => {
            const hPx = Math.max(Math.round(d.cumulativePremium / maxCumPremium * 48), d.premium > 0 ? 1 : 0);
            return (
              <div key={i} className="flex-1 relative group" style={{ alignSelf: "flex-end" }}>
                <div className={`w-full rounded-t-sm ${d.inCoverage ? "bg-indigo-400" : "bg-gray-300"}`} style={{ height: hPx }} />
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 pointer-events-none mb-1">
                  {d.age}歳: 年{d.premium.toFixed(1)}万 / 累積{Math.round(d.cumulativePremium)}万
                </div>
              </div>
            );
          })}
        </BarChart>
        <div className="flex justify-between text-[9px] text-gray-400 ml-8">
          <span>{startAge}歳</span>
          <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-indigo-400" />保険料</span>
          <span>累積{Math.round(totalPremium)}万</span>
        </div>
      </div>

      {/* Chart 2: 死亡時受取総額 */}
      <div>
        <div className="text-[10px] font-semibold text-gray-500 mb-1">
          {ip.insuranceType === "term_life" ? "死亡時保険金" : "死亡時の受取総額（死亡が遅いほど減少）"}
        </div>
        <BarChart height={56} maxValue={Math.round(maxPayout)}>
          {yearData.map((d, i) => {
            const hPx = Math.max(Math.round(d.payoutIfDeath / maxPayout * 56), d.payoutIfDeath > 0 ? 1 : 0);
            return (
              <div key={i} className="flex-1 relative group" style={{ alignSelf: "flex-end" }}>
                <div className={`w-full rounded-t-sm ${d.payoutIfDeath > 0 ? "bg-green-400" : "bg-gray-200"}`} style={{ height: hPx }} />
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 pointer-events-none mb-1">
                  {d.age}歳に死亡 → 受取{Math.round(d.payoutIfDeath).toLocaleString()}万
                  {ip.insuranceType === "income_protection" ? `（${ip.monthlyPayoutMan}万/月×${Math.max(ip.payoutUntilAge - d.age, 0)}年）` : ""}
                </div>
              </div>
            );
          })}
        </BarChart>
        <div className="flex justify-between text-[9px] text-gray-400 ml-8">
          <span>{startAge}歳</span>
          <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-green-400" />{ip.insuranceType === "term_life" ? "保険金" : "受取総額"}</span>
          <span>{maxAge}歳</span>
        </div>
      </div>

      {/* Schedule table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left px-1 py-0.5 font-semibold">年齢</th>
              <th className="text-right px-1 py-0.5 font-semibold">保険料</th>
              <th className="text-right px-1 py-0.5 font-semibold">累積保険料</th>
              <th className="text-right px-1 py-0.5 font-semibold">死亡時受取</th>
              <th className="text-left px-1 py-0.5 font-semibold">備考</th>
            </tr>
          </thead>
          <tbody>
            {showYears.map(y => {
              const d = yearData[y];
              if (!d) return null;
              const notes: string[] = [];
              if (y === 0) notes.push("加入");
              if (d.age === ip.coverageEndAge - 1) notes.push("保険期間終了");
              if (ip.insuranceType === "income_protection" && d.age === ip.payoutUntilAge - 1) notes.push("保障期間終了");
              const rowBg = y === 0 ? "bg-indigo-50" : !d.inCoverage ? "bg-gray-50" : "";
              return (
                <tr key={y} className={`border-b border-gray-100 ${rowBg}`}>
                  <td className="px-1 py-0.5 font-mono">{d.age}歳<span className="text-gray-300 ml-0.5">({y + 1}年)</span></td>
                  <td className="px-1 py-0.5 text-right font-mono">{d.premium > 0 ? `${d.premium.toFixed(1)}万` : "-"}</td>
                  <td className="px-1 py-0.5 text-right font-mono">{Math.round(d.cumulativePremium)}万</td>
                  <td className="px-1 py-0.5 text-right font-mono text-green-700">{d.payoutIfDeath > 0 ? `${Math.round(d.payoutIfDeath).toLocaleString()}万` : "-"}</td>
                  <td className="px-1 py-0.5 text-gray-500">{notes.join(" / ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totalYears > showYears.length && (
          <div className="text-[9px] text-gray-400 text-center mt-0.5">主要年のみ表示（全{totalYears}年）</div>
        )}
      </div>

      {/* Explanation */}
      <div className="text-[9px] text-gray-400 leading-relaxed">
        {ip.insuranceType === "term_life"
          ? "定期保険: 保険期間中に死亡した場合、保険金が一括で支払われます。満期到来時に保険金は支払われません。"
          : "収入保障保険: 死亡時点から保障期間終了まで毎月一定額が支払われます。死亡が遅いほど受取総額は減少します。"}
      </div>
    </div>
  );
}

export function InsuranceModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number;
  retirementAge: number;
  existingEvent?: LifeEvent | null;
}) {
  const defaults: InsuranceParams = {
    insuranceType: "income_protection",
    premiumMonthlyMan: 0.5,
    lumpSumPayoutMan: 3000,
    monthlyPayoutMan: 15,
    payoutUntilAge: 65,
    coverageEndAge: 65,
  };

  const [startAge, setStartAge] = useState(currentAge);
  const [ip, setIP] = useState<InsuranceParams>(defaults);
  const [target, setTarget] = useState<EventTarget>("self");

  useEffect(() => {
    if (existingEvent?.insuranceParams) {
      setIP(existingEvent.insuranceParams);
      setStartAge(existingEvent.age);
      setTarget(existingEvent.target || "self");
    }
  }, [existingEvent]);

  const u = (patch: Partial<InsuranceParams>) => setIP(prev => ({ ...prev, ...patch }));

  const coverageYears = Math.max(ip.coverageEndAge - startAge, 0);
  const targetLabel = target === "spouse" ? "配偶者" : "本人";

  const handleSave = () => {
    const typeLabel = ip.insuranceType === "term_life"
      ? `定期保険(${ip.lumpSumPayoutMan}万)`
      : `収入保障(${ip.monthlyPayoutMan}万/月)`;
    onSave({
      id: existingEvent?.id || Date.now(),
      age: startAge,
      type: "insurance",
      label: `${targetLabel}${typeLabel}`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: coverageYears,
      target,
      insuranceParams: ip,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`🛡️ 保険${existingEvent ? "（編集）" : ""}`}
      btnClass="bg-indigo-600 hover:bg-indigo-700" onSave={handleSave} saveLabel={existingEvent ? "更新" : "追加"} wide>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Settings */}
        <div className="space-y-3">
          <div className="rounded bg-gray-50 p-2 text-[10px] text-gray-500">
            対象者の死亡イベントと連動。死亡時に保険料停止→保険金支払い。
          </div>

          {/* 被保険者 + 保険タイプ */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border p-2 space-y-1">
              <label className="block font-semibold text-gray-600 text-[11px]">被保険者</label>
              <div className="flex gap-1">
                <button onClick={() => setTarget("self")}
                  className={`rounded px-2 py-0.5 text-[10px] ${target === "self" ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>本人</button>
                <button onClick={() => setTarget("spouse")}
                  className={`rounded px-2 py-0.5 text-[10px] ${target === "spouse" ? "bg-pink-600 text-white" : "bg-gray-100"}`}>配偶者</button>
              </div>
            </div>
            <div className="rounded border p-2 space-y-1">
              <label className="block font-semibold text-gray-600 text-[11px]">保険タイプ<span className="ml-1 cursor-help text-gray-400" title="定期保険=死亡時に一括支給。収入保障=死亡後に毎月支給(掛金が安い)">ⓘ</span></label>
              <div className="flex gap-1">
                <button onClick={() => u({ insuranceType: "term_life" })}
                  className={`rounded px-2 py-0.5 text-[10px] ${ip.insuranceType === "term_life" ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>定期(一時金)</button>
                <button onClick={() => u({ insuranceType: "income_protection" })}
                  className={`rounded px-2 py-0.5 text-[10px] ${ip.insuranceType === "income_protection" ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>収入保障(月額)</button>
              </div>
            </div>
          </div>

          {/* Age + coverage period */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-gray-600 mb-1 text-[11px]">加入時年齢</label>
              <input type="number" value={startAge} min={currentAge} max={retirementAge - 1}
                onChange={e => setStartAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1 text-[11px]">保険期間（歳まで）</label>
              <input type="number" value={ip.coverageEndAge} min={startAge + 1} max={80}
                onChange={e => u({ coverageEndAge: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
          </div>

          {/* Premium */}
          <div className="rounded border p-2 space-y-1">
            <label className="block font-semibold text-gray-600 text-[11px]">保険料</label>
            <div className="flex items-center gap-1">
              <input type="number" value={ip.premiumMonthlyMan} step={0.1} min={0}
                onChange={e => u({ premiumMonthlyMan: Number(e.target.value) })} className="w-20 rounded border px-2 py-1" />
              <span className="text-[10px] text-gray-400">万円/月</span>
              <span className="text-[10px] text-gray-400 ml-2">= 年{(ip.premiumMonthlyMan * 12).toFixed(1)}万</span>
            </div>
          </div>

          {/* Payout */}
          {ip.insuranceType === "term_life" ? (
            <div className="rounded border p-2 space-y-1">
              <label className="block font-semibold text-gray-600 text-[11px]">死亡保険金<span className="ml-1 cursor-help text-gray-400" title="目安: 年間生活費×必要年数−遺族年金−貯蓄。子供が小さいほど多めに">ⓘ</span></label>
              <div className="flex items-center gap-1">
                <input type="number" value={ip.lumpSumPayoutMan} step={100} min={0}
                  onChange={e => u({ lumpSumPayoutMan: Number(e.target.value) })} className="w-24 rounded border px-2 py-1" />
                <span className="text-[10px] text-gray-400">万円（一括）</span>
              </div>
            </div>
          ) : (
            <div className="rounded border p-2 space-y-1">
              <label className="block font-semibold text-gray-600 text-[11px]">月額保障<span className="ml-1 cursor-help text-gray-400" title="目安: 現在の手取月額の6〜7割。遺族年金と合わせて生活費をカバー">ⓘ</span></label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1">
                  <input type="number" value={ip.monthlyPayoutMan} step={1} min={0}
                    onChange={e => u({ monthlyPayoutMan: Number(e.target.value) })} className="w-16 rounded border px-2 py-1" />
                  <span className="text-[10px] text-gray-400">万/月</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">〜</span>
                  <input type="number" value={ip.payoutUntilAge} min={startAge} max={80}
                    onChange={e => u({ payoutUntilAge: Number(e.target.value) })} className="w-14 rounded border px-2 py-1" />
                  <span className="text-[10px] text-gray-400">歳まで</span>
                </div>
              </div>
              <div className="text-[10px] text-gray-400">
                年額{(ip.monthlyPayoutMan * 12).toFixed(0)}万 × 最大{Math.max(ip.payoutUntilAge - startAge, 0)}年 = 最大{(ip.monthlyPayoutMan * 12 * Math.max(ip.payoutUntilAge - startAge, 0)).toLocaleString()}万
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="space-y-3">
          <div className="font-bold text-indigo-800 text-sm">保険プラン</div>
          <InsuranceCostPreview ip={ip} startAge={startAge} target={target} />
        </div>
      </div>
    </Modal>
  );
}
