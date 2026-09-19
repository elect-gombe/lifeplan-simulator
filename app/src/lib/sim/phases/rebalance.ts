/** NISA / taxable account contribution & withdrawal and cash reserve management. */
import type { SimConfig, AgeEventInfo } from "../types";
import type { SimState } from "../state";
import { TAXABLE_ACCOUNT_TAX_RATE } from "../constants";

// ===== phaseRebalance: NISA/taxable contribution/withdrawal and cash reserve management =====
export interface RebalanceOutput {
  nisaContribution: number;
  selfNISAContribution: number;
  spouseNISAContribution: number;
  taxableContribution: number;
  nisaWithdrawal: number;
  taxableWithdrawal: number;
}

export function phaseRebalance(
  state: SimState,
  config: SimConfig,
  ageInfo: AgeEventInfo,
  age: number,
  annualNetCashFlow: number,
  totalExpense: number,
): RebalanceOutput {
  const {
    nisaConfig: nisa, nisaPriority, cashReserveMinMonths, cashReserveMaxMonths, cashAnchors,
    selfNISAAnnualLimit, selfNISALifetimeLimit, spouseNISAAnnualLimit, spouseNISALifetimeLimit,
  } = config;
  const { isSelfDead, isSpouseDead } = ageInfo;
  const TAXABLE_TAX_RATE = TAXABLE_ACCOUNT_TAX_RATE;

  let nisaContribution = 0;
  let selfNISAContribution = 0;
  let spouseNISAContribution = 0;
  let taxableContribution = 0;
  let nisaWithdrawal = 0;
  let taxableWithdrawal = 0;

  state.cumulativeCash += annualNetCashFlow;

  const monthlyExpense = totalExpense / 12;
  const cashReserveMin = monthlyExpense * cashReserveMinMonths;
  let cashReserveMax = monthlyExpense * cashReserveMaxMonths;
  for (const anchor of cashAnchors) {
    if (age <= anchor.age) {
      cashReserveMax = Math.max(cashReserveMax, anchor.amountMan * 10000);
      break;
    }
  }

  // NISA sell helper
  const sellNISA = (asset: { v: number; c: number }, amount: number) => {
    const sell = Math.min(amount, asset.v);
    if (sell <= 0 || asset.v <= 0) return 0;
    const costRatio = asset.c / asset.v;
    asset.c -= sell * costRatio;
    asset.v -= sell;
    return sell;
  };

  // Withdrawal helper: taxable first, then NISA (cost-basis proportional)
  const withdrawToTarget = (targetCash: number) => {
    let deficit = targetCash - state.cumulativeCash;
    if (deficit <= 0) return;

    if (state.cumulativeTaxable > 0 && deficit > 0) {
      const gainRatio = state.cumulativeTaxableCost > 0
        ? Math.max(state.cumulativeTaxable - state.cumulativeTaxableCost, 0) / state.cumulativeTaxable : 0;
      const netRatio = 1 - gainRatio * TAXABLE_TAX_RATE;
      const sellNeeded = Math.min(Math.ceil(deficit / netRatio), state.cumulativeTaxable);
      const tax = Math.round(sellNeeded * gainRatio * TAXABLE_TAX_RATE);
      taxableWithdrawal += sellNeeded;
      state.cumulativeTaxable -= sellNeeded;
      state.cumulativeTaxableCost = Math.max(state.cumulativeTaxableCost * (state.cumulativeTaxable / (state.cumulativeTaxable + sellNeeded) || 0), 0);
      state.cumulativeCash += sellNeeded - tax;
      deficit = Math.max(targetCash - state.cumulativeCash, 0);
    }

    if (deficit > 0 && (state.selfNISAAsset > 0 || state.spouseNISAAsset > 0)) {
      const totalNISA = state.selfNISAAsset + state.spouseNISAAsset;
      if (totalNISA > 0) {
        const selfCostShare = state.selfNISACostBasis / (state.selfNISACostBasis + state.spouseNISACostBasis || 1);
        const spouseCostShare = 1 - selfCostShare;
        const selfTarget = Math.min(deficit * selfCostShare, state.selfNISAAsset);
        const spouseTarget = Math.min(deficit * spouseCostShare, state.spouseNISAAsset);

        if (selfTarget > 0) {
          const selfRef = { v: state.selfNISAAsset, c: state.selfNISACostBasis };
          const sold = sellNISA(selfRef, selfTarget);
          state.selfNISAAsset = selfRef.v; state.selfNISACostBasis = selfRef.c;
          nisaWithdrawal += sold; state.cumulativeCash += sold;
        }
        if (spouseTarget > 0) {
          const spRef = { v: state.spouseNISAAsset, c: state.spouseNISACostBasis };
          const sold = sellNISA(spRef, spouseTarget);
          state.spouseNISAAsset = spRef.v; state.spouseNISACostBasis = spRef.c;
          nisaWithdrawal += sold; state.cumulativeCash += sold;
        }
        deficit = Math.max(targetCash - state.cumulativeCash, 0);

        if (deficit > 0 && state.selfNISAAsset > 0) {
          const selfRef = { v: state.selfNISAAsset, c: state.selfNISACostBasis };
          const sold = sellNISA(selfRef, deficit);
          state.selfNISAAsset = selfRef.v; state.selfNISACostBasis = selfRef.c;
          nisaWithdrawal += sold; state.cumulativeCash += sold;
          deficit = Math.max(targetCash - state.cumulativeCash, 0);
        }
        if (deficit > 0 && state.spouseNISAAsset > 0) {
          const spRef = { v: state.spouseNISAAsset, c: state.spouseNISACostBasis };
          const sold = sellNISA(spRef, deficit);
          state.spouseNISAAsset = spRef.v; state.spouseNISACostBasis = spRef.c;
          nisaWithdrawal += sold; state.cumulativeCash += sold;
        }
      }
    }
  };

  if (nisa && nisaPriority) {
    if (state.cumulativeCash > cashReserveMax) {
      const excess = state.cumulativeCash - cashReserveMax;
      const selfRoom = isSelfDead ? 0 : Math.max(Math.min(selfNISAAnnualLimit, selfNISALifetimeLimit - state.selfNISACostBasis), 0);
      const spouseRoom = isSpouseDead ? 0 : Math.max(Math.min(spouseNISAAnnualLimit, spouseNISALifetimeLimit - state.spouseNISACostBasis), 0);
      const totalNISARoom = selfRoom + spouseRoom;
      const nisaAlloc = Math.min(excess, totalNISARoom);
      let selfContrib: number, spouseContrib: number;
      if (selfRoom <= spouseRoom) {
        selfContrib = Math.min(nisaAlloc / 2, selfRoom);
        spouseContrib = Math.min(nisaAlloc - selfContrib, spouseRoom);
      } else {
        spouseContrib = Math.min(nisaAlloc / 2, spouseRoom);
        selfContrib = Math.min(nisaAlloc - spouseContrib, selfRoom);
      }
      selfNISAContribution = selfContrib;
      spouseNISAContribution = spouseContrib;
      nisaContribution = selfContrib + spouseContrib;
      const selfLifetimeFull = (state.selfNISACostBasis + selfContrib) >= selfNISALifetimeLimit || isSelfDead;
      const spouseLifetimeFull = (state.spouseNISACostBasis + spouseContrib) >= spouseNISALifetimeLimit || isSpouseDead;
      const remaining = excess - nisaContribution;
      if (remaining > 0 && selfLifetimeFull && spouseLifetimeFull) taxableContribution = remaining;
      state.selfNISAAsset += selfContrib; state.selfNISACostBasis += selfContrib;
      state.spouseNISAAsset += spouseContrib; state.spouseNISACostBasis += spouseContrib;
      state.cumulativeCash -= nisaContribution + taxableContribution;
    } else if (state.cumulativeCash < cashReserveMin) {
      withdrawToTarget(cashReserveMin);
    }
  } else {
    if (state.cumulativeCash < cashReserveMin) withdrawToTarget(cashReserveMin);
  }

  state.cumulativeTaxable += taxableContribution;
  state.cumulativeTaxableCost += taxableContribution;

  return { nisaContribution, selfNISAContribution, spouseNISAContribution, taxableContribution, nisaWithdrawal, taxableWithdrawal };
}
