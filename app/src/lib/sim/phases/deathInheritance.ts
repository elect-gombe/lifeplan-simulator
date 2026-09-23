/** Death-year inheritance, NISA liquidation, asset returns and market crashes. */
import type { LifeEvent, EventYearCost } from "../../types";
import { resolveKF, resolveEventAge } from "../../types";
import type { SimConfig, AgeEventInfo, YearContext } from "../types";
import type { SimState } from "../state";
import { calcInheritanceTax } from "../inheritance";

// ===== phaseDeathInheritance: Handle death inheritance, NISA liquidation, asset returns, and crash =====
export interface DeathInheritanceResult {
  inheritanceTax: number;
  inheritanceEstate: number;
  crashLoss: number;
  crashDetail: string;
  cumulativeDCAsset: number;
}

export function phaseDeathInheritance(
  state: SimState,
  config: SimConfig,
  ageInfo: AgeEventInfo,
  ctx: YearContext,
  childEvents: LifeEvent[],
  insurancePayoutTotal: number,
  activeEvts: LifeEvent[],
  cumulativeDCAsset: number,
  eventCostBreakdown: EventYearCost[],
): DeathInheritanceResult {
  const { age, events } = ctx;
  const { isDeathYear, isSpouseDeathYear, isSelfDead, isSpouseDead } = ageInfo;
  const { nisaReturnRate, taxableReturnRate, spouse } = config;

  let inheritanceTax = 0;
  let inheritanceEstate = 0;

  // Inner inheritance processor
  const processDeathInheritance = (label: string, dcAsset: number, nisaAssetForEstate: number, hasSpouseSurvivor: boolean) => {
    const legalHeirs = Math.max(1 + childEvents.length, 1);
    const shareRatio = hasSpouseSurvivor ? 0.5 : 1;
    const estateOther = Math.round((state.cumulativeCash + nisaAssetForEstate + state.cumulativeTaxable) * shareRatio);
    const result = calcInheritanceTax(estateOther, dcAsset, insurancePayoutTotal, legalHeirs, hasSpouseSurvivor);
    inheritanceTax = result.tax;
    inheritanceEstate = result.taxableEstate;
    if (dcAsset > 0) {
      eventCostBreakdown.push({ label: `DC/iDeCo死亡一時金(${label})`, icon: "💰", color: "#16a34a", amount: -dcAsset,
        detail: `${label === "本人" ? "DC" : "配偶者DC"}資産${Math.round(dcAsset / 10000)}万→遺族へ` });
      state.cumulativeCash += dcAsset;
    }
    if (result.tax > 0) {
      eventCostBreakdown.push({ label: `相続税(${label}死亡)`, icon: "🏛️", color: "#dc2626", amount: result.tax, detail: result.detail });
      state.cumulativeCash -= result.tax;
    } else {
      eventCostBreakdown.push({ label: `相続税(${label}死亡)`, icon: "🏛️", color: "#16a34a", amount: 0, detail: result.detail, isPhaseChange: true, phaseLabel: "相続税なし" });
    }
  };

  if (isDeathYear) {
    state.selfDCReceivedLumpSum += state.selfDCAsset; // 死亡一時金として累積記録
    processDeathInheritance("本人", state.selfDCAsset, state.selfNISAAsset, !!spouse && !isSpouseDead);
    state.selfDCAsset = 0;
    cumulativeDCAsset = state.selfDCAsset + state.spouseDCAsset;
  }
  if (isSpouseDeathYear) {
    state.spouseDCReceivedLumpSum += state.spouseDCAsset; // 死亡一時金として累積記録
    processDeathInheritance("配偶者", state.spouseDCAsset, state.spouseNISAAsset, true);
    state.spouseDCAsset = 0;
    cumulativeDCAsset = state.selfDCAsset + state.spouseDCAsset;
  }

  // NISA liquidation on death
  const liquidateNISA = (label: string, asset: number, cost: number, isDeathYr: boolean): { asset: number; cost: number } => {
    if (asset <= 0) return { asset, cost };
    if (isDeathYr) {
      eventCostBreakdown.push({ label: `NISA相続(${label})`, icon: "📊", color: "#22c55e", amount: -asset,
        detail: `${label}NISA時価${Math.round(asset / 10000)}万(元本${Math.round(cost / 10000)}万) → 現金化(非課税)` });
    }
    state.cumulativeCash += asset;
    return { asset: 0, cost: 0 };
  };
  if (isDeathYear || isSelfDead) {
    const r = liquidateNISA("本人", state.selfNISAAsset, state.selfNISACostBasis, !!isDeathYear);
    state.selfNISAAsset = r.asset; state.selfNISACostBasis = r.cost;
  }
  if (isSpouseDeathYear || isSpouseDead) {
    const r = liquidateNISA("配偶者", state.spouseNISAAsset, state.spouseNISACostBasis, !!isSpouseDeathYear);
    state.spouseNISAAsset = r.asset; state.spouseNISACostBasis = r.cost;
  }

  // Phase 5: 年齢別運用利回りKF
  let yearBaseRR = config.rr;
  if (config.returnRateKF?.length) {
    yearBaseRR = resolveKF(config.returnRateKF, age, config.rr);
  }
  // Recovery rate overrides from crash events
  let yearNisaRate = config.nisaRateExplicit ? nisaReturnRate : yearBaseRR / 100;
  let yearTaxRate = config.taxableRateExplicit ? taxableReturnRate : yearBaseRR / 100;
  for (const evt of events) {
    if (evt.type === "crash" && evt.marketCrashParams?.recoveryRates && !evt.disabled) {
      const crashAge = resolveEventAge(evt, events);
      const yearsSinceCrash = age - crashAge;
      const rates = evt.marketCrashParams.recoveryRates;
      if (yearsSinceCrash >= 1 && yearsSinceCrash <= rates.length) {
        const overrideRate = rates[yearsSinceCrash - 1] / 100;
        yearNisaRate = overrideRate;
        yearTaxRate = overrideRate;
      }
    }
  }

  // Asset returns
  state.selfNISAAsset = state.selfNISAAsset * (1 + yearNisaRate);
  state.spouseNISAAsset = state.spouseNISAAsset * (1 + yearNisaRate);
  state.cumulativeTaxable = state.cumulativeTaxable * (1 + yearTaxRate);

  // Crash events
  let crashLoss = 0;
  let crashDetail = "";
  for (const evt of activeEvts) {
    if (evt.type === "crash" && evt.marketCrashParams && !evt.disabled && resolveEventAge(evt, events) === age) {
      const cp = evt.marketCrashParams;
      const drop = cp.dropRate / 100;
      const preNisa = state.selfNISAAsset + state.spouseNISAAsset;
      const preTax = state.cumulativeTaxable;
      if (cp.target === "nisa" || cp.target === "all") {
        state.selfNISAAsset *= (1 - drop);
        state.spouseNISAAsset *= (1 - drop);
      }
      if (cp.target === "taxable" || cp.target === "all") {
        state.cumulativeTaxable *= (1 - drop);
      }
      const lostNisa = (cp.target === "nisa" || cp.target === "all") ? Math.round(preNisa * drop) : 0;
      const lostTax = (cp.target === "taxable" || cp.target === "all") ? Math.round(preTax * drop) : 0;
      crashLoss += lostNisa + lostTax;
      const targetLabel = cp.target === "all" ? "全口座" : cp.target === "nisa" ? "NISA" : "特定口座";
      crashDetail += `📉${targetLabel} -${cp.dropRate}% (評価損${Math.round((lostNisa + lostTax) / 10000)}万) `;
    }
  }

  return { inheritanceTax, inheritanceEstate, crashLoss, crashDetail, cumulativeDCAsset };
}
