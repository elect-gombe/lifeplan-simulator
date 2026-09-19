/**
 * DC/iDeCo受取方法別の税計算
 * 一時金: 退職所得として課税（退職所得控除 → 1/2課税）
 * 年金: 雑所得として毎年課税（公的年金等控除適用）
 * 併用: 一部を一時金、残りを年金
 */
import type { DCReceiveMethod, DCReceiveDetail } from "../types";
import { rTxC, annuityTax } from "../tax";

// DC/iDeCo受取税計算
// 年金受取の場合: DC内で運用継続しつつ分割受取。受取期間中も残高に利回りが適用される。
// netAmount = 一時金手取り + 年金受取の税引後総額（運用益込み）
export function calcDCReceiveTax(
  dcAsset: number, otherRetirement: number, retirementDeduction: number,
  method: DCReceiveMethod, rr: number = 0
): DCReceiveDetail {
  const m = method.type || "lump_sum";
  const annuityYears = method.annuityYears || 20;
  const annuityStartAge = method.annuityStartAge || 65;
  const r = rr / 100; // 運用利回り

  if (m === "lump_sum") {
    const tax = rTxC(dcAsset + otherRetirement, retirementDeduction) - rTxC(otherRetirement, retirementDeduction);
    return {
      method: "一時金",
      lumpSumAmount: dcAsset, lumpSumTax: tax,
      annuityAnnual: 0, annuityTotalTax: 0, annuityYears: 0, annuityStartAge: 0,
      totalTax: tax, netAmount: dcAsset - tax,
    };
  }

  if (m === "annuity") {
    // 年金受取: annuityStartAgeから開始（その年齢でDC資産を受け取り始める）
    // 据置期間はシミュレーション内のDC運用で既に反映済み
    let remaining = dcAsset;
    let totalAnnuityTax = 0;
    let totalReceived = 0;
    for (let y = 0; y < annuityYears; y++) {
      const annual = Math.round(remaining / (annuityYears - y)); // 残高÷残年数
      const age = annuityStartAge + y;
      const tax = annuityTax(annual, age);
      totalAnnuityTax += tax;
      totalReceived += annual - tax;
      remaining = (remaining - annual) * (1 + r); // 残高を運用
    }
    return {
      method: `年金(${annuityYears}年)`,
      lumpSumAmount: 0, lumpSumTax: 0,
      annuityAnnual: Math.round(dcAsset / annuityYears),
      annuityTotalTax: totalAnnuityTax, annuityYears, annuityStartAge,
      totalTax: totalAnnuityTax, netAmount: totalReceived,
    };
  }

  // 併用: annuityStartAgeに一時金+年金を同時に開始
  // 据置期間の運用はシミュレーション内のDC運用で既に反映済み
  const ratio = (method.combinedLumpSumRatio || 50) / 100;
  const lumpSum = Math.round(dcAsset * ratio);
  const annuityPortion = dcAsset - lumpSum;
  const lumpSumTax = rTxC(lumpSum + otherRetirement, retirementDeduction) - rTxC(otherRetirement, retirementDeduction);

  let remaining = annuityPortion;
  let totalAnnuityTax = 0;
  let totalReceived = lumpSum - lumpSumTax;
  for (let y = 0; y < annuityYears; y++) {
    const annual = Math.round(remaining / (annuityYears - y));
    const tax = annuityTax(annual, annuityStartAge + y);
    totalAnnuityTax += tax;
    totalReceived += annual - tax;
    remaining = (remaining - annual) * (1 + r);
  }
  return {
    method: `併用(一時金${Math.round(ratio * 100)}%)`,
    lumpSumAmount: lumpSum, lumpSumTax,
    annuityAnnual: Math.round(annuityPortion / annuityYears),
    annuityTotalTax: totalAnnuityTax, annuityYears, annuityStartAge,
    totalTax: lumpSumTax + totalAnnuityTax, netAmount: totalReceived,
  };
}
