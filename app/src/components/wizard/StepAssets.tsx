import { useState, useMemo } from "react";
import { Inp } from "../ui";
import { TrackRow } from "../KeyframeEditor";
import { HousingSection } from "../HousingSection";
import { mkScenario } from "../../lib/scenarioFactory";
import type { WizardData, StepProps } from "./types";
import { calcTakeHome } from "./convert";

export function StepAssets({ data, onChange }: StepProps) {
  const u = (patch: Partial<WizardData>) => onChange({ ...data, ...patch });
  const [housingOpen, setHousingOpen] = useState(true);

  const monthlyExpenseMan = data.expenseKF[0]?.value ?? 15;
  const reserveTarget = Math.round(monthlyExpenseMan * 6);
  const monthlyTakeHome = Math.round(calcTakeHome(data.incomeKF[0]?.value ?? 500) / 12 * 10) / 10;
  const monthlySavings = Math.round((monthlyTakeHome - monthlyExpenseMan) * 10) / 10;
  const lowAssets = data.currentAssetsMan < reserveTarget && data.currentAssetsMan >= 0;

  const housingScenario = useMemo(() => ({
    ...mkScenario(0),
    currentAge: data.currentAge,
    retirementAge: data.retirementAge,
    simEndAge: data.simEndAge,
    housingTimeline: data.housingTimeline,
  }), [data.currentAge, data.retirementAge, data.simEndAge, data.housingTimeline]);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">資産・住居</h2>

      {/* 資産 */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600 w-28">現在の資産</span>
          <Inp label="" value={data.currentAssetsMan} onChange={v => u({ currentAssetsMan: v })} unit="万円" w="w-20" step={50} min={0} />
          <span className="text-[10px] text-gray-400">預貯金・投資口座・DC残高の合計</span>
        </div>
        {lowAssets && data.currentAssetsMan > 0 && (
          <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
            まずは生活防衛資金として生活費×6ヶ月 = {reserveTarget}万円を目標に
          </div>
        )}
        <div className="rounded-lg border bg-gray-50 p-2 text-xs flex gap-4">
          <span className="text-gray-500">手取り収入</span>
          <span className="text-green-700">+{monthlyTakeHome}万/月</span>
          <span className="text-gray-500">生活費</span>
          <span className="text-red-500">−{monthlyExpenseMan}万/月</span>
          <span className={`font-semibold ${monthlySavings >= 0 ? "text-blue-700" : "text-red-600"}`}>
            貯蓄{monthlySavings >= 0 ? "+" : ""}{monthlySavings}万/月
          </span>
        </div>
      </div>

      {/* 生活費 TrackRow */}
      <TrackRow
        track={{ key: "expenseKF", label: "基本生活費(世帯)", unit: "万円/月", defaultValue: 15, step: 1 }}
        keyframes={data.expenseKF}
        onChange={kfs => u({ expenseKF: kfs })}
        currentAge={data.currentAge}
        retirementAge={data.simEndAge}
        linked={false}
      />

      {/* 住居 */}
      <HousingSection
        s={housingScenario}
        onChange={s => u({ housingTimeline: s.housingTimeline })}
        currentAge={data.currentAge}
        retirementAge={data.simEndAge}
        open={housingOpen}
        onToggle={() => setHousingOpen(o => !o)}
        allEvents={[...data.childEvents, ...data.insuranceEvents, ...data.carEvents]}
      />
    </div>
  );
}
