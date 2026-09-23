/** Take-home pay, net cash flow, DC growth, property sale proceeds, cash interest. */
import { PENSION_RATE_PER_MILLE } from "../../survivor";
import type { SimConfig } from "../types";
import type { SimState } from "../state";
import type { MemberTaxResult } from "../memberTax";

// ===== phaseCashFlow: Compute take-home pay, net cash flow, DC growth, property sale, cash interest =====
export interface CashFlowResult {
  aT: number;                  // DC年間拠出額
  aBen: number;                // DC節税効果
  selfFuruDed: number;         // 本人ふるさと控除
  pensionTax: number;          // 年金課税合計
  takeHomePay: number;
  pensionLossAnnual: number;
  spousePensionLossAnnual: number;
  annualNetCashFlow: number;
  cumulativeDCAsset: number;
}

export function phaseCashFlow(
  state: SimState,
  config: SimConfig,
  selfTaxResult: MemberTaxResult,
  spouseTaxResult: MemberTaxResult,
  totalExpense: number,
  childAllowance: number,
  survivorIncome: number,
  insurancePayoutTotal: number,
  propertySaleProceeds: number,
  spouseDCTotal: number,
  yearDCRate?: number, // Phase 5: age-based DC rate override
  leaveBenefitTotal = 0, // 育児休業給付金（非課税、手取りに加算）
): CashFlowResult {
  const usedDCRate = yearDCRate ?? config.dcRate;
  const { cashRate } = config;
  const st = selfTaxResult;
  const aT = st.dcContribution;
  const aBen = st.incomeTaxSaving + st.residentTaxSaving + st.socialInsuranceSaving;
  const selfFuruDed = st.furusatoDonation > 0 ? Math.max(st.furusatoDonation - 2000, 0) : 0;

  const pensionTax = st.pensionIncomeTax + st.pensionResidentTax + spouseTaxResult.pensionIncomeTax + spouseTaxResult.pensionResidentTax;

  const takeHomePay = st.takeHome + childAllowance + survivorIncome + spouseTaxResult.takeHome + insurancePayoutTotal + leaveBenefitTotal;
  const pensionLossAnnual = (st.selfDCContribution / 12 * PENSION_RATE_PER_MILLE) / 1000 * 12;
  const spousePensionLossAnnual = config.spouse ? (spouseTaxResult.selfDCContribution / 12 * PENSION_RATE_PER_MILLE) / 1000 * 12 : 0;
  const annualNetCashFlow = takeHomePay - totalExpense;

  // Property sale proceeds
  if (propertySaleProceeds !== 0) state.cumulativeCash += propertySaleProceeds;

  // Cash interest
  if (cashRate > 0 && state.cumulativeCash > 0) state.cumulativeCash = Math.round(state.cumulativeCash * (1 + cashRate));

  // DC asset growth
  state.selfDCAsset = state.selfDCAsset * (1 + usedDCRate) + aT;
  state.spouseDCAsset = state.spouseDCAsset * (1 + usedDCRate) + spouseDCTotal;
  const cumulativeDCAsset = state.selfDCAsset + state.spouseDCAsset;
  // DC節税分は現金に加算（再投資は目安として複利計算のみ維持）
  state.cumulativeReinvest = state.cumulativeReinvest * (1 + usedDCRate) + aBen;

  return {
    aT, aBen, selfFuruDed, pensionTax,
    takeHomePay, pensionLossAnnual, spousePensionLossAnnual,
    annualNetCashFlow, cumulativeDCAsset,
  };
}
