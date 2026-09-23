import { useMemo } from "react";
import type { BaseResult, Scenario } from "../../lib/types";
import { computeScenario } from "../../lib/calc";
import type { CalcParams } from "../../lib/calc";
import type { WizardData } from "./types";
import { wizardToScenario, calcPensionEstimate } from "./convert";

export function StepPreview({
  data,
  calcParams,
  base,
}: {
  data: WizardData;
  calcParams: CalcParams;
  base: BaseResult;
}) {
  const scenario = useMemo(() => wizardToScenario(data), [data]);
  const result = useMemo(() => computeScenario(scenario, base, calcParams, null), [scenario, base, calcParams]);

  const retireIdx = result.yearResults.findIndex(yr => yr.age >= data.retirementAge);
  const endIdx = result.yearResults.length - 1;
  const retireAssets = retireIdx >= 0
    ? Math.round((result.yearResults[retireIdx].cumulativeSavings + result.yearResults[retireIdx].cumulativeDCAsset + result.yearResults[retireIdx].nisaAsset) / 10000)
    : null;
  const endAssets = endIdx >= 0
    ? Math.round((result.yearResults[endIdx].cumulativeSavings + result.yearResults[endIdx].cumulativeDCAsset + result.yearResults[endIdx].nisaAsset) / 10000)
    : null;
  const currentIncomeMan = data.incomeKF[0]?.value ?? 500;
  const pensionAnnualMan = data.incomeType === "employee"
    ? calcPensionEstimate(currentIncomeMan, data.retirementAge, data.pensionWorkStartAge, data.pensionStartAge)
    : 81;

  const childParentsSummary = data.childEvents.filter(e => e.type === "child" && !e.parentId);
  const childSummary = childParentsSummary.map((p, i) => {
    const offset = p.age - data.currentAge;
    const desc = offset < 0 ? `現在${-offset}歳` : offset === 0 ? "今年生まれ予定" : `${offset}年後生まれ予定`;
    return `${i + 1}人目: ${desc}`;
  });

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">シミュレーションの準備ができました</h2>

      {/* サマリー */}
      <div className="rounded-lg border bg-gray-50 p-3 space-y-1.5 text-xs">
        <div className="font-semibold text-gray-700 mb-1">設定サマリー</div>
        <div className="text-gray-600">本人: {data.currentAge}歳、退職{data.retirementAge}歳（{data.gender === "male" ? "男性" : "女性"}）</div>
        {data.hasSpouse && (
          <div className="text-gray-600">
            配偶者: {data.spouseAge}歳、収入{data.spouseIncomeMan}万円/年
          </div>
        )}
        {childParentsSummary.length > 0 && (
          <div className="text-gray-600">子: {childParentsSummary.length}人（{childSummary.join("、")}）</div>
        )}
        <div className="text-gray-600">収入: {currentIncomeMan}万円/年（{data.incomeType === "employee" ? "会社員" : "自営業"}）</div>
        <div className="text-gray-600">資産: {data.currentAssetsMan}万円、生活費: {data.expenseKF[0]?.value ?? 15}万円/月</div>
        <div className="text-gray-600">
          住居: {data.housingTimeline.map((p, i) => {
            const next = data.housingTimeline[i + 1];
            const end = next ? next.startAge : data.simEndAge;
            return p.type === "rent"
              ? `賃貸${p.startAge}〜${end}歳(${p.rentMonthlyMan}万/月)`
              : `持ち家${p.startAge}〜${end}歳`;
          }).join("→")}
        </div>
        <div className="text-gray-600">年金: {data.pensionStartAge}歳〜 約{pensionAnnualMan}万円/年{data.hasSpouse ? `、配偶者${data.spousePensionStartAge}歳〜` : ""}</div>
        {(data.dcTotalKF[0]?.value > 0 || data.idecoKF[0]?.value > 0) && (
          <div className="text-gray-600">
            DC/iDeCo: {[
              data.dcTotalKF[0]?.value > 0 && `企業DC ${data.dcTotalKF[0].value.toLocaleString()}円/月`,
              data.idecoKF[0]?.value > 0 && `iDeCo ${data.idecoKF[0].value.toLocaleString()}円/月`,
            ].filter(Boolean).join("、")}（{data.dcReceiveMethod.type === "lump_sum" ? "一括" : data.dcReceiveMethod.type === "annuity" ? "年金" : "併用"}受取）
          </div>
        )}
        {data.nisaEnabled && (
          <div className="text-gray-600">NISA: 年間{data.nisaAnnualLimitMan}万円×{data.nisaAccounts}口座</div>
        )}
        {(data.insuranceEvents.length > 0 || data.carEvents.length > 0) && (
          <div className="text-gray-600">
            {[
              data.insuranceEvents.length > 0 && `保険${data.insuranceEvents.length}件`,
              data.carEvents.length > 0 && `車${data.carEvents.length}台`,
            ].filter(Boolean).join("、")}
          </div>
        )}
        {(data.hasFurusato || data.spouseHasFurusato) && (
          <div className="text-gray-600">ふるさと納税: {[data.hasFurusato && "本人", data.hasSpouse && data.spouseHasFurusato && "配偶者"].filter(Boolean).join("・")}</div>
        )}
      </div>

      {/* プレビュー */}
      <div className="rounded-lg border bg-white p-3 space-y-2">
        <div className="font-semibold text-gray-700 text-xs">簡易プレビュー</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-blue-50 p-2">
            <div className="text-[10px] text-blue-600">退職時({data.retirementAge}歳)資産</div>
            <div className={`font-bold text-sm ${retireAssets !== null && retireAssets < 0 ? "text-red-600" : "text-blue-800"}`}>
              {retireAssets !== null ? `約${retireAssets.toLocaleString()}万円` : "計算中..."}
            </div>
          </div>
          <div className="rounded bg-green-50 p-2">
            <div className="text-[10px] text-green-600">{data.simEndAge}歳時資産</div>
            <div className={`font-bold text-sm ${endAssets !== null && endAssets < 0 ? "text-red-600" : "text-green-800"}`}>
              {endAssets !== null ? `約${endAssets.toLocaleString()}万円` : "計算中..."}
            </div>
          </div>
          <div className="rounded bg-amber-50 p-2">
            <div className="text-[10px] text-amber-600">年金収入({data.pensionStartAge}歳〜)</div>
            <div className="font-bold text-sm text-amber-800">約{pensionAnnualMan}万円/年</div>
          </div>
        </div>
        {endAssets !== null && endAssets < 0 && (
          <div className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1">
            ⚠️ 試算では{data.simEndAge}歳時点で資産が枯渇する可能性があります。収入・支出の見直しを検討してください。
          </div>
        )}
        <div className="text-[10px] text-gray-400">※ 詳細な分析はメイン画面でご確認ください</div>
      </div>

    </div>
  );
}

export function CompleteButton({ data, onComplete }: { data: WizardData; onComplete: (s: Scenario) => void }) {
  const scenario = useMemo(() => wizardToScenario(data), [data]);
  return (
    <button
      onClick={() => onComplete(scenario)}
      className="rounded-lg bg-green-600 px-8 py-2 text-sm font-bold text-white hover:bg-green-700"
    >
      完了してはじめる →
    </button>
  );
}
