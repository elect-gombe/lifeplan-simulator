/** Build YearResult / ScenarioResult from phase outputs and state. */
import type { Scenario, YearResult, ScenarioResult, DCReceiveDetail, DCReceiveMethod } from "../types";
import { DEFAULT_DC_RECEIVE_METHOD } from "../types";
import { rDed } from "../tax";
import { TAXABLE_ACCOUNT_TAX_RATE } from "./constants";
import type { SimConfig } from "./types";
import type { SimState } from "./state";
import type { MemberTaxResult } from "./memberTax";
import { calcDCReceiveTax } from "./dcReceive";
import type { DeductionInfo } from "./phases/deductions";
import type { EventCostOutput } from "./phases/eventCosts";
import type { SurvivorResult } from "./phases/survivor";
import type { CashFlowResult } from "./phases/cashFlow";
import type { DeathInheritanceResult } from "./phases/deathInheritance";
import type { RebalanceOutput } from "./phases/rebalance";
import type { DCReceptionOutput } from "./phases/dcReception";

// ===== assembleYearResult: Construct YearResult from all phase outputs =====
/** Everything a single simulated year produced, grouped by the phase that produced it. */
export interface YearAssemblyInput {
  age: number;
  state: SimState;
  // Income
  gross: number;
  grownGrossMan: number;
  selfPensionIncome: number;
  spousePensionIncome: number;
  pensionReduction: number;
  // Expenses (after education support adjustments)
  eventOngoing: number;
  totalExpense: number;
  // Tax
  selfTaxResult: MemberTaxResult;
  spouseTaxResult: MemberTaxResult;
  spouseDedAmount: number;
  hlDed: number;
  selfLifeInsDed: number;
  dcTotal: number;
  companyDC: number;
  idecoMonthly: number;
  // Phase outputs
  dedInfo: DeductionInfo;
  eventCosts: EventCostOutput;
  survivor: SurvivorResult;
  cashFlow: CashFlowResult;
  death: DeathInheritanceResult;
  rebalance: RebalanceOutput;
  dcReception: DCReceptionOutput;
}

export function assembleYearResult(input: YearAssemblyInput): YearResult {
  const {
    age, state, gross, grownGrossMan, selfPensionIncome, spousePensionIncome, pensionReduction,
    eventOngoing, totalExpense, selfTaxResult, spouseTaxResult, spouseDedAmount, hlDed, selfLifeInsDed,
    dcTotal, companyDC, idecoMonthly, dedInfo, eventCosts, survivor, cashFlow, death: deathResult, rebalance, dcReception,
  } = input;
  const {
    baseLivingExpense, eventOnetime, eventCostBreakdown, activeEvts, propertyFixedCostEvts,
    loanBalance, selfLoanBalance, spouseLoanBalance,
    insurancePremiumTotal, insurancePayoutTotal, propertySaleProceeds, propertyCapitalGainsTax, giftTax,
  } = eventCosts;
  const { survivorIncome, survivorBasicPension, survivorEmployeePension, survivorWidowSupplement, survivorIncomeProtection } = survivor;
  const preSpouseLifeInsDed = dedInfo.preSpouseLifeInsDed;
  const TAXABLE_TAX_RATE = TAXABLE_ACCOUNT_TAX_RATE;
  const st = selfTaxResult;
  const sp = spouseTaxResult;
  const { aT, aBen, selfFuruDed, pensionTax, takeHomePay, pensionLossAnnual, annualNetCashFlow } = cashFlow;
  const { inheritanceTax, inheritanceEstate, crashLoss, crashDetail } = deathResult;
  const { nisaContribution, selfNISAContribution, spouseNISAContribution, taxableContribution, nisaWithdrawal, taxableWithdrawal } = rebalance;
  const { dcReceiveTax, selfDCReceiveTax, spouseDCReceiveTax, selfDCReceiveLumpSum, spouseDCReceiveLumpSum, selfDCReceiveAnnuityAnnual, spouseDCReceiveAnnuityAnnual, selfDCRetirementDeduction, spouseDCRetirementDeduction } = dcReception;
  const { childEvents, dependentDeductionTotal, childAllowance, tashiWaiver, hsSupport, selfDepDed, spouseDepDed } = dedInfo;

  const taxableGain = Math.max(state.cumulativeTaxable - state.cumulativeTaxableCost, 0);
  const totalNISA = state.selfNISAAsset + state.spouseNISAAsset;
  const postTaxableGain = Math.max(state.cumulativeTaxable - state.cumulativeTaxableCost, 0);
  const postTaxableAfterTax = state.cumulativeTaxable - Math.round(postTaxableGain * TAXABLE_TAX_RATE);
  const postTotalNISA = state.selfNISAAsset + state.spouseNISAAsset;
  const postCumulativeSavings = state.cumulativeCash + postTotalNISA + postTaxableAfterTax;

  const spouseFuruDed = sp.furusatoDonation > 0 ? Math.max(sp.furusatoDonation - 2000, 0) : 0;

  return {
    age, grossMan: grownGrossMan,
    baseLivingExpense, eventOnetime, eventOngoing, totalExpense,
    takeHomePay,
    basicDeduction: 480000, spouseDeductionAmount: spouseDedAmount,
    dcMonthly: dcTotal, companyDC, idecoMonthly, annualContribution: aT,
    annualBenefit: aBen, annualNetBenefit: aBen,
    cumulativeDCAsset: dcReception.cumulativeDCAsset, cumulativeReinvest: state.cumulativeReinvest, annualNetCashFlow,
    cumulativeSavings: postCumulativeSavings, totalWealth: postCumulativeSavings + dcReception.cumulativeDCAsset,
    pensionLossAnnual, pensionTax, pensionReduction, survivorIncome,
    survivorBasicPension, survivorEmployeePension, survivorWidowSupplement, survivorIncomeProtection,
    loanBalance,
    childCount: childEvents.length, dependentDeduction: dependentDeductionTotal, childAllowance, tashiWaiver, hsSupport,
    nisaContribution, nisaWithdrawal, nisaAsset: totalNISA,
    nisaGain: totalNISA - state.selfNISACostBasis - state.spouseNISACostBasis,
    taxableContribution, taxableWithdrawal, taxableAsset: state.cumulativeTaxable, taxableGain,
    cashSavings: state.cumulativeCash,
    insurancePremiumTotal, insurancePayoutTotal,
    inheritanceTax, inheritanceEstate,
    dcReceiveTax,
    propertySaleProceeds, propertyCapitalGainsTax, giftTax,
    crashLoss, crashDetail,
    activeEvents: [...activeEvts, ...propertyFixedCostEvts], eventCostBreakdown,
    self: {
      gross, employeeDeduction: st.employeeDeduction,
      taxableIncome: st.taxableIncome, marginalRate: st.marginalRate,
      incomeTax: st.incomeTax, residentTax: st.residentTax, socialInsurance: st.socialInsurance,
      siPension: st.siPension, siHealth: st.siHealth, siNursing: st.siNursing, siEmployment: st.siEmployment, siChildSupport: st.siChildSupport,
      socialInsuranceDeduction: st.socialInsuranceDeduction,
      dcIdecoDeduction: st.selfDCContribution + st.idecoContribution, lifeInsuranceDeductionAmount: selfLifeInsDed,
      furusatoDeduction: selfFuruDed, dependentDeduction: selfDepDed,
      housingLoanDeduction: st.hlIT + st.hlRT, housingLoanDeductionAvail: hlDed,
      housingLoanDeductionIT: st.hlIT, housingLoanDeductionRT: st.hlRT,
      dcContribution: aT, idecoContribution: st.idecoContribution, selfDCContribution: st.selfDCContribution,
      incomeTaxSaving: st.incomeTaxSaving, residentTaxSaving: st.residentTaxSaving, socialInsuranceSaving: st.socialInsuranceSaving,
      furusatoLimit: st.furusatoLimit, furusatoDonation: st.furusatoDonation,
      takeHome: st.takeHome,
      pensionIncome: selfPensionIncome,
      pensionDeduction: st.pensionDeduction, pensionTaxableIncome: st.pensionTaxableIncome,
      pensionIncomeTax: st.pensionIncomeTax, pensionResidentTax: st.pensionResidentTax,
      dcAsset: state.selfDCAsset, loanBalance: selfLoanBalance,
      dcReceiveLumpSum: selfDCReceiveLumpSum, dcReceiveAnnuityAnnual: selfDCReceiveAnnuityAnnual,
      dcRetirementDeduction: selfDCRetirementDeduction, dcReceiveTax: selfDCReceiveTax,
      nisaAsset: state.selfNISAAsset, nisaCostBasis: state.selfNISACostBasis, nisaContribution: selfNISAContribution,
    },
    spouse: {
      gross: sp.gross, employeeDeduction: sp.employeeDeduction,
      taxableIncome: sp.taxableIncome, marginalRate: sp.marginalRate,
      incomeTax: sp.incomeTax, residentTax: sp.residentTax, socialInsurance: sp.socialInsurance,
      siPension: sp.siPension, siHealth: sp.siHealth, siNursing: sp.siNursing, siEmployment: sp.siEmployment, siChildSupport: sp.siChildSupport,
      socialInsuranceDeduction: sp.socialInsuranceDeduction,
      dcIdecoDeduction: sp.dcContribution + sp.idecoContribution,
      lifeInsuranceDeductionAmount: preSpouseLifeInsDed,
      furusatoDeduction: spouseFuruDed, dependentDeduction: spouseDepDed,
      housingLoanDeduction: sp.hlDeduction, housingLoanDeductionAvail: sp.hlAvail,
      housingLoanDeductionIT: sp.hlIT, housingLoanDeductionRT: sp.hlRT,
      dcContribution: sp.dcContribution, idecoContribution: sp.idecoContribution,
      selfDCContribution: sp.selfDCContribution,
      incomeTaxSaving: sp.incomeTaxSaving, residentTaxSaving: sp.residentTaxSaving,
      socialInsuranceSaving: sp.socialInsuranceSaving,
      furusatoLimit: sp.furusatoLimit, furusatoDonation: sp.furusatoDonation,
      takeHome: sp.takeHome, pensionIncome: spousePensionIncome,
      pensionDeduction: sp.pensionDeduction, pensionTaxableIncome: sp.pensionTaxableIncome,
      pensionIncomeTax: sp.pensionIncomeTax, pensionResidentTax: sp.pensionResidentTax,
      dcAsset: state.spouseDCAsset, loanBalance: spouseLoanBalance,
      dcReceiveLumpSum: spouseDCReceiveLumpSum, dcReceiveAnnuityAnnual: spouseDCReceiveAnnuityAnnual,
      dcRetirementDeduction: spouseDCRetirementDeduction, dcReceiveTax: spouseDCReceiveTax,
      nisaAsset: state.spouseNISAAsset, nisaCostBasis: state.spouseNISACostBasis, nisaContribution: spouseNISAContribution,
    },
  };
}

/** 残存DC資産は一時金受取と仮定するときの受取方法 */
const LUMP_SUM_FALLBACK: DCReceiveMethod = { type: "lump_sum", annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 };

// ===== assembleFinalResult: Construct ScenarioResult from year results and state =====
export function assembleFinalResult(
  s: Scenario, state: SimState, yearResults: YearResult[], config: SimConfig,
  cumulativeDCAsset: number,
): ScenarioResult {
  const { effectiveDCReceiveMethod, effectiveYears, effectiveCurrentAssets, otherRet, rr, spouse, spouseRM, hasFuru, dcTotalKF, idecoKF, incomeKF } = config;

  const assetFV = cumulativeDCAsset;
  const fvB = state.cumulativeReinvest;
  const lPL = state.totalPensionLoss * config.PY;
  const dcRetDed = rDed(effectiveYears);

  // DC受取の総括: シミュレーション中の実績 + 残存DC資産の理論受取を合算
  const rmFinal = effectiveDCReceiveMethod || DEFAULT_DC_RECEIVE_METHOD;

  // 残存DC（年金部分の未受取分 or 退職後の再積立分）は一時金として受け取ると仮定
  const selfRemainingDCDetail = state.selfDCAsset > 0
    ? calcDCReceiveTax(state.selfDCAsset, otherRet, dcRetDed, LUMP_SUM_FALLBACK, rr)
    : { totalTax: 0, netAmount: 0, lumpSumAmount: 0, lumpSumTax: 0, annuityAnnual: 0, annuityTotalTax: 0, annuityYears: 0, annuityStartAge: 0, method: "一時金" as const };

  const dcReceiveDetail: DCReceiveDetail = {
    method: rmFinal.type === "lump_sum" ? "一時金" : rmFinal.type === "annuity" ? `年金(${rmFinal.annuityYears || 20}年)` : `併用(一時金${rmFinal.combinedLumpSumRatio || 50}%)`,
    lumpSumAmount: state.selfDCReceivedLumpSum + selfRemainingDCDetail.lumpSumAmount,
    lumpSumTax: state.selfDCReceivedTax + selfRemainingDCDetail.lumpSumTax,
    annuityAnnual: 0, annuityTotalTax: 0, annuityYears: 0, annuityStartAge: 0,
    totalTax: state.selfDCReceivedTax + selfRemainingDCDetail.totalTax,
    netAmount: (state.selfDCReceivedLumpSum - state.selfDCReceivedTax) + state.selfDCReceivedAnnuityTotal + selfRemainingDCDetail.netAmount,
  };

  let spouseDCReceiveDetail: DCReceiveDetail | undefined;
  if ((state.spouseDCAsset > 0 || state.spouseDCReceivedLumpSum > 0) && spouse) {
    const spContribYears = yearResults.filter(yr => yr.spouse.dcContribution > 0).length;
    const spYears = spContribYears > 0 ? spContribYears : effectiveYears;
    const spRetDed = rDed(spYears);
    const spRemainingDCDetail = state.spouseDCAsset > 0
      ? calcDCReceiveTax(state.spouseDCAsset, 0, spRetDed, LUMP_SUM_FALLBACK, rr)
      : { totalTax: 0, netAmount: 0, lumpSumAmount: 0, lumpSumTax: 0, annuityAnnual: 0, annuityTotalTax: 0, annuityYears: 0, annuityStartAge: 0, method: "一時金" as const };
    spouseDCReceiveDetail = {
      method: spouseRM.type === "lump_sum" ? "一時金" : `併用(一時金${spouseRM.combinedLumpSumRatio || 50}%)`,
      lumpSumAmount: state.spouseDCReceivedLumpSum + spRemainingDCDetail.lumpSumAmount,
      lumpSumTax: state.spouseDCReceivedTax + spRemainingDCDetail.lumpSumTax,
      annuityAnnual: 0, annuityTotalTax: 0, annuityYears: 0, annuityStartAge: 0,
      totalTax: state.spouseDCReceivedTax + spRemainingDCDetail.totalTax,
      netAmount: (state.spouseDCReceivedLumpSum - state.spouseDCReceivedTax) + state.spouseDCReceivedAnnuityTotal + spRemainingDCDetail.netAmount,
    };
  }

  const exitDelta = dcReceiveDetail.totalTax + (spouseDCReceiveDetail?.totalTax || 0);
  const dcNetTotal = dcReceiveDetail.netAmount + (spouseDCReceiveDetail?.netAmount || 0);
  const finalAssetNet = dcNetTotal;
  const ly = yearResults[yearResults.length - 1];
  const finalSavings = ly ? ly.cumulativeSavings : effectiveCurrentAssets * 10000;
  const finalWealth = finalAssetNet + finalSavings;
  const finalScore = fvB - lPL - exitDelta;

  return {
    scenario: s, yearResults,
    totalC: state.totalC, assetFV, fvB, lPL, pvPL: lPL,
    dcRetDed, exitDelta, finalAssetNet, finalWealth, finalScore,
    multiPhase: dcTotalKF.length > 1 || idecoKF.length > 1 || incomeKF.length > 1,
    hasFuru, dcReceiveDetail, spouseDCReceiveDetail,
  };
}
