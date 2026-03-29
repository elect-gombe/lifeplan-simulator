import React, { useState, useEffect } from "react";
import type { PrivatePensionParams, EventTarget } from "../lib/types";
import { Inp, Btns } from "./ui";
import { EventModal, type EventModalBaseProps, type EventModalDef } from "./EventModal";

type PensionType = PrivatePensionParams["pensionType"];

const PENSION_TEMPLATES: Record<PensionType, Partial<PrivatePensionParams>> = {
  individual_annuity: {
    payoutStartAge: 65, payoutEndAge: 85,
    contributionMonthlyMan: 1, contributionEndAge: 60,
    isPublicPensionTaxed: false,
  },
  corporate_db: {
    payoutStartAge: 60, payoutEndAge: 80,
    contributionMonthlyMan: undefined, contributionEndAge: undefined,
    isPublicPensionTaxed: true,
  },
  small_business_mutual: {
    payoutStartAge: 65, payoutEndAge: 66,
    contributionMonthlyMan: 0.7, contributionEndAge: 65,
    isPublicPensionTaxed: true,
  },
};

const TYPE_LABELS: Record<PensionType, string> = {
  individual_annuity: "個人年金保険",
  corporate_db: "企業年金DB",
  small_business_mutual: "小規模企業共済",
};

const defaults: PrivatePensionParams = {
  pensionType: "individual_annuity",
  payoutStartAge: 65,
  payoutEndAge: 85,
  payoutAnnualMan: 60,
  contributionMonthlyMan: 1,
  contributionEndAge: 60,
  isPublicPensionTaxed: false,
};

const def: EventModalDef<PrivatePensionParams> = {
  type: "pension_private",
  title: "🏦 私的年金",
  btnClass: "bg-teal-600 hover:bg-teal-700",
  paramsKey: "privatePensionParams",
  defaults,
  ageOffset: 0,
  buildLabel: (pp, age) => {
    const typeLabel = TYPE_LABELS[pp.pensionType];
    const endLabel = pp.payoutEndAge === 0 ? "終身" : `${pp.payoutEndAge}歳`;
    return `${typeLabel}(${pp.payoutStartAge}〜${endLabel} ${pp.payoutAnnualMan}万/年)`;
  },
  buildExtra: (pp) => ({
    durationYears: pp.payoutEndAge === 0 ? 999 : Math.max(pp.payoutEndAge - pp.payoutStartAge, 0),
  }),
};

export function PrivatePensionModal(props: EventModalBaseProps) {
  const { existingEvent } = props;
  const [target, setTarget] = useState<EventTarget>("self");

  useEffect(() => {
    if (existingEvent?.privatePensionParams) {
      setTarget(existingEvent.target || "self");
    }
  }, [existingEvent]);

  const defWithTarget: EventModalDef<PrivatePensionParams> = {
    ...def,
    buildExtra: (pp) => ({
      target,
      durationYears: pp.payoutEndAge === 0 ? 999 : Math.max(pp.payoutEndAge - pp.payoutStartAge, 0),
    }),
  };

  return (
    <EventModal def={defWithTarget} {...props}>
      {({ params: pp, u, age, setAge }) => {
        const applyTemplate = (type: PensionType) => {
          u({ pensionType: type, ...PENSION_TEMPLATES[type] });
        };

        return (
          <div className="space-y-3 text-xs">
            {/* 対象者 */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-16">対象者</span>
              <Btns options={[{value:"self" as const,label:"本人"},{value:"spouse" as const,label:"配偶者"}]}
                value={target} onChange={v => setTarget(v)} />
            </div>

            {/* 年金種類 */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-16">種類</span>
              <div className="flex gap-1 flex-wrap">
                {(["individual_annuity","corporate_db","small_business_mutual"] as PensionType[]).map(t => (
                  <button key={t}
                    className={`px-2 py-0.5 rounded border text-[10px] ${pp.pensionType === t ? "bg-teal-100 border-teal-400 text-teal-700" : "bg-white border-gray-200 hover:bg-teal-50"}`}
                    onClick={() => applyTemplate(t)}>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* 開始年齢 */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-16">開始年齢</span>
              <Inp label="" value={age} onChange={v => setAge(v)} unit="歳" w="w-14" step={1} min={50} max={80} />
            </div>

            {/* 受取設定 */}
            <div className="border-t pt-2">
              <div className="text-gray-400 mb-1">受取設定</div>
              <div className="flex flex-wrap gap-2">
                <Inp label="受取開始" value={pp.payoutStartAge} onChange={v => u({payoutStartAge: v})} unit="歳" w="w-14" step={1} min={55} max={80} />
                <Inp label="受取終了" value={pp.payoutEndAge} onChange={v => u({payoutEndAge: v})} unit="歳(0=終身)" w="w-16" step={1} min={0} max={100} />
                <Inp label="年額" value={pp.payoutAnnualMan} onChange={v => u({payoutAnnualMan: v})} unit="万円" w="w-16" step={10} min={0} />
              </div>
            </div>

            {/* 積立設定 */}
            <div className="border-t pt-2">
              <div className="text-gray-400 mb-1">積立設定（任意）</div>
              <div className="flex flex-wrap gap-2">
                <Inp label="月額掛金" value={pp.contributionMonthlyMan ?? 0} onChange={v => u({contributionMonthlyMan: v || undefined})} unit="万円/月" w="w-16" step={0.5} min={0} />
                <Inp label="払込終了" value={pp.contributionEndAge ?? 60} onChange={v => u({contributionEndAge: v || undefined})} unit="歳" w="w-14" step={1} min={50} max={80} />
              </div>
            </div>

            {/* 税制 */}
            <div className="border-t pt-2">
              <div className="text-gray-400 mb-1">税制</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={pp.isPublicPensionTaxed}
                  onChange={e => u({isPublicPensionTaxed: e.target.checked})} />
                <span className="text-[10px] text-gray-600">公的年金等控除の対象</span>
                <span className="text-[9px] text-gray-400">(企業年金DB/小規模共済=対象、個人年金保険=対象外)</span>
              </label>
            </div>

            {/* プレビュー */}
            <div className="border-t pt-2 text-[10px] text-gray-500">
              {pp.contributionMonthlyMan && pp.contributionEndAge && (
                <div>積立期間: {age}〜{pp.contributionEndAge}歳 ({Math.max(pp.contributionEndAge - age, 0)}年間、
                  月{pp.contributionMonthlyMan}万 = 総{Math.round(pp.contributionMonthlyMan * Math.max(pp.contributionEndAge - age, 0) * 12)}万)</div>
              )}
              <div>受取期間: {pp.payoutStartAge}〜{pp.payoutEndAge === 0 ? "終身" : `${pp.payoutEndAge}歳`}、
                年{pp.payoutAnnualMan}万 = 総{pp.payoutEndAge === 0 ? "終身" : `${Math.round(pp.payoutAnnualMan * Math.max(pp.payoutEndAge - pp.payoutStartAge, 0))}万`}</div>
              <div className="text-teal-600">{pp.isPublicPensionTaxed ? "公的年金等控除あり" : "必要経費控除（雑所得として計算）"}</div>
            </div>
          </div>
        );
      }}
    </EventModal>
  );
}
