import React from "react";
import type { GiftParams } from "../lib/types";
import { calcGiftTax } from "../lib/tax";
import { Btns } from "./ui";
import { EventModal, type EventModalBaseProps, type EventModalDef } from "./EventModal";

const giftDef: EventModalDef<GiftParams> = {
  type: "gift",
  title: "🎁 贈与",
  defaults: { giftType: "calendar", amountMan: 500, recipientRelation: "lineal" },
  paramsKey: "giftParams",
  ageOffset: 10,
  buildLabel: (gp) => `贈与(${gp.amountMan}万)`,
};

export function GiftModal(props: EventModalBaseProps) {
  return (
    <EventModal def={giftDef} {...props}>
      {({ params: gp, u, age, setAge, currentAge, retirementAge }) => {
        const amountYen = gp.amountMan * 10000;
        const taxResult = calcGiftTax(amountYen, gp.giftType, gp.recipientRelation);
        const totalCostMan = gp.amountMan + Math.round(taxResult.tax / 10000);

        return (<>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">贈与年齢</label>
              <input type="number" value={age} min={currentAge} max={retirementAge - 1}
                onChange={e => setAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5" />
            </div>
            <div>
              <label className="block font-semibold text-gray-600 mb-1">贈与額（万円）<span className="ml-1 cursor-help text-gray-400" title="暦年課税: 年110万以下は非課税。住宅資金贈与は最大1,000万非課税枠あり">ⓘ</span></label>
              <input type="number" value={gp.amountMan} step={100}
                onChange={e => u({ amountMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" />
            </div>
          </div>

          {/* 課税方式 */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">課税方式</label>
            <Btns options={[{value:"calendar" as const,label:"暦年課税"},{value:"settlement" as const,label:"相続時精算課税"}]}
              value={gp.giftType} onChange={v => u({ giftType: v })} />
            <div className="text-gray-400 text-[10px]">
              {gp.giftType === "calendar"
                ? "暦年課税: 年110万円の基礎控除。超過分に累進税率を適用。"
                : "相続時精算課税: 累積2,500万円の特別控除。超過分に一律20%課税。相続時に精算。"}
            </div>
          </div>

          {/* 贈受者関係 */}
          <div className="rounded border p-3 space-y-2">
            <label className="block font-semibold text-gray-600">贈受者の関係</label>
            <Btns options={[{value:"lineal" as const,label:"直系尊属"},{value:"other" as const,label:"その他"}]}
              value={gp.recipientRelation} onChange={v => u({ recipientRelation: v })} />
            <div className="text-gray-400 text-[10px]">
              {gp.recipientRelation === "lineal"
                ? "直系尊属（父母・祖父母）からの贈与は特例税率が適用され、税負担が軽減されます。"
                : "直系尊属以外（配偶者・兄弟など）からの贈与には一般税率が適用されます。"}
            </div>
          </div>

          {/* 贈与税プレビュー */}
          <div className="rounded bg-amber-50 p-2 text-amber-800 space-y-0.5">
            <div className="font-bold">贈与税の試算</div>
            <div>贈与額: {gp.amountMan.toLocaleString()}万円</div>
            <div>控除額: {Math.round(taxResult.deduction / 10000).toLocaleString()}万円</div>
            <div>課税価格: {Math.round(taxResult.taxableAmount / 10000).toLocaleString()}万円</div>
            <div>贈与税: <b>{Math.round(taxResult.tax / 10000).toLocaleString()}万円</b>（¥{taxResult.tax.toLocaleString()}）</div>
            <div className="text-gray-500 text-[10px]">{taxResult.detail}</div>
          </div>

          {/* 合計コスト */}
          <div className="rounded bg-blue-50 p-2 text-gray-700">
            <div className="font-bold mb-1">合計コスト</div>
            <div>贈与額: {gp.amountMan.toLocaleString()}万円</div>
            <div>贈与税: {Math.round(taxResult.tax / 10000).toLocaleString()}万円</div>
            <div className="font-bold mt-1">
              合計: {totalCostMan.toLocaleString()}万円
            </div>
          </div>
        </>);
      }}
    </EventModal>
  );
}
