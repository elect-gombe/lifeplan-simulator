/** DC/iDeCo reception (lump sum / annuity / combined) at the start age. */
import type { YearResult, EventYearCost, DCReceiveMethod } from "../../types";
import { DEFAULT_DC_RECEIVE_METHOD } from "../../types";
import { rTxC, rDed } from "../../tax";
import type { SimConfig } from "../types";
import type { SimState } from "../state";

// ===== phaseDCReception: DC/iDeCo reception at start age =====
export interface DCReceptionOutput {
  dcReceiveTax: number;
  dcReceiveLumpSum: number;
  dcReceiveAnnuityAnnual: number;
  selfDCReceiveTax: number;
  spouseDCReceiveTax: number;
  selfDCReceiveLumpSum: number;
  spouseDCReceiveLumpSum: number;
  selfDCReceiveAnnuityAnnual: number;
  spouseDCReceiveAnnuityAnnual: number;
  selfDCRetirementDeduction: number;
  spouseDCRetirementDeduction: number;
  cumulativeDCAsset: number;
}

export function phaseDCReception(
  state: SimState,
  config: SimConfig,
  age: number,
  spouseAge: number,
  yearResults: YearResult[],
  eventCostBreakdown: EventYearCost[],
): DCReceptionOutput {
  const { effectiveDCReceiveMethod, effectiveYears, otherRet, spouse } = config;

  let dcReceiveTax = 0;
  let dcReceiveLumpSum = 0;
  let dcReceiveAnnuityAnnual = 0;
  let selfDCReceiveTax = 0, spouseDCReceiveTax = 0;
  let selfDCReceiveLumpSum = 0, spouseDCReceiveLumpSum = 0;
  let selfDCReceiveAnnuityAnnual = 0, spouseDCReceiveAnnuityAnnual = 0;
  let selfDCRetirementDeduction = 0, spouseDCRetirementDeduction = 0;

  const processDCReceive = (label: string, asset: number, rm: DCReceiveMethod, retDed: number, otherRetAmt: number, memberAge: number): number => {
    if (asset <= 0) return asset;
    const startAge = rm.annuityStartAge || 65;
    if (memberAge !== startAge) return asset;
    if (rm.type === "lump_sum") {
      const tax = rTxC(asset + otherRetAmt, retDed) - rTxC(otherRetAmt, retDed);
      dcReceiveTax += tax;
      dcReceiveLumpSum += asset;
      eventCostBreakdown.push({ label: `DC一時金受取(${label})`, icon: "💰", color: "#16a34a", amount: 0,
        detail: `DC${Math.round(asset/10000)}万→現金化 控除${Math.round(retDed/10000)}万 税${Math.round(tax/10000)}万`,
        isPhaseChange: true, phaseLabel: `DC一時金受取(${label})` });
      state.cumulativeCash += asset - tax;
      return 0;
    }
    if (rm.type === "combined") {
      const ratio = (rm.combinedLumpSumRatio || 50) / 100;
      const lumpPart = Math.round(asset * ratio);
      const annuityPart = asset - lumpPart;
      const annuityAnnual = Math.round(annuityPart / (rm.annuityYears || 20));
      const tax = rTxC(lumpPart + otherRetAmt, retDed) - rTxC(otherRetAmt, retDed);
      dcReceiveTax += tax;
      dcReceiveLumpSum += lumpPart;
      dcReceiveAnnuityAnnual += annuityAnnual;
      eventCostBreakdown.push({ label: `DC併用受取(${label})`, icon: "💰", color: "#16a34a", amount: 0,
        detail: `一時金${Math.round(lumpPart/10000)}万 年金${Math.round(annuityAnnual/10000)}万/年×${rm.annuityYears||20}年`,
        isPhaseChange: true, phaseLabel: `DC併用受取(${label})` });
      state.cumulativeCash += lumpPart - tax;
      return annuityPart;
    }
    // Annuity only
    const annuityAnnual = Math.round(asset / (rm.annuityYears || 20));
    dcReceiveAnnuityAnnual += annuityAnnual;
    eventCostBreakdown.push({ label: `DC年金受取開始(${label})`, icon: "📋", color: "#16a34a", amount: 0,
      detail: `DC${Math.round(asset/10000)}万→年金${Math.round(annuityAnnual/10000)}万/年×${rm.annuityYears||20}年`,
      isPhaseChange: true, phaseLabel: `DC年金受取開始(${label})` });
    return asset;
  };

  const rm = effectiveDCReceiveMethod || DEFAULT_DC_RECEIVE_METHOD;
  const selfRetDed = rDed(effectiveYears);
  const preSelfTax = dcReceiveTax, preSelfLump = dcReceiveLumpSum, preSelfAnn = dcReceiveAnnuityAnnual;
  state.selfDCAsset = processDCReceive("本人", state.selfDCAsset, rm, selfRetDed, otherRet, age);
  selfDCReceiveTax = dcReceiveTax - preSelfTax;
  selfDCReceiveLumpSum = dcReceiveLumpSum - preSelfLump;
  selfDCReceiveAnnuityAnnual = dcReceiveAnnuityAnnual - preSelfAnn;
  if (selfDCReceiveLumpSum > 0 || selfDCReceiveAnnuityAnnual > 0) selfDCRetirementDeduction = selfRetDed;
  // 累積記録（総括表示用）
  state.selfDCReceivedLumpSum += selfDCReceiveLumpSum;
  state.selfDCReceivedTax += selfDCReceiveTax;

  if (state.spouseDCAsset > 0 && spouse) {
    const preSpTax = dcReceiveTax, preSpLump = dcReceiveLumpSum, preSpAnn = dcReceiveAnnuityAnnual;
    const spRM = spouse.dcReceiveMethod || DEFAULT_DC_RECEIVE_METHOD;
    const spContribYears = yearResults.filter(yr => yr.spouse.dcContribution > 0).length + 1;
    const spRetDed = rDed(Math.max(spContribYears, 1));
    state.spouseDCAsset = processDCReceive("配偶者", state.spouseDCAsset, spRM, spRetDed, 0, spouseAge);
    spouseDCReceiveTax = dcReceiveTax - preSpTax;
    spouseDCReceiveLumpSum = dcReceiveLumpSum - preSpLump;
    spouseDCReceiveAnnuityAnnual = dcReceiveAnnuityAnnual - preSpAnn;
    if (spouseDCReceiveLumpSum > 0 || spouseDCReceiveAnnuityAnnual > 0) spouseDCRetirementDeduction = spRetDed;
    // 累積記録（総括表示用）
    state.spouseDCReceivedLumpSum += spouseDCReceiveLumpSum;
    state.spouseDCReceivedTax += spouseDCReceiveTax;
  }
  const cumulativeDCAsset = state.selfDCAsset + state.spouseDCAsset;

  return {
    dcReceiveTax, dcReceiveLumpSum, dcReceiveAnnuityAnnual,
    selfDCReceiveTax, spouseDCReceiveTax,
    selfDCReceiveLumpSum, spouseDCReceiveLumpSum,
    selfDCReceiveAnnuityAnnual, spouseDCReceiveAnnuityAnnual,
    selfDCRetirementDeduction, spouseDCRetirementDeduction,
    cumulativeDCAsset,
  };
}
