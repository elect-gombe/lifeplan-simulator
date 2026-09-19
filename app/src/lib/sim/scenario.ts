/**
 * Entry points of the simulation engine: computeBase() and computeScenario()
 * (the year loop that orchestrates all phases).
 */
import type { Scenario, YearResult, ScenarioResult, BaseResult, EventYearCost } from "../types";
import { resolveKF, isEventActive } from "../types";
import { txInc, mR, fLm, iTx, hlResidentCap, empDed, spouseDeduction, calcLifeInsuranceDeduction, publicPensionDeduction } from "../tax";
import type { CalcParams, SimConfig, AgeEventInfo, YearContext } from "./types";
import { initSimState } from "./state";
import type { SimState } from "./state";
import { resolveSimConfig } from "./config";
import { calcMemberTax } from "./memberTax";
import type { MemberTaxResult } from "./memberTax";
import { calcRetirementDeduction, applyWorkingPensionReduction, phasePension } from "./pension";
import { buildYearContext, phaseAgeEvents } from "./yearContext";
import { phaseMemberIncome } from "./phases/income";
import { phaseDeductions } from "./phases/deductions";
import { phaseEventCosts } from "./phases/eventCosts";
import { phaseCashFlow } from "./phases/cashFlow";
import { phaseDeathInheritance } from "./phases/deathInheritance";
import { phaseRebalance } from "./phases/rebalance";
import { phaseDCReception } from "./phases/dcReception";
import { phaseSurvivor } from "./phases/survivor";
import { phaseSpouseTax } from "./phases/spouseTax";
import { assembleYearResult, assembleFinalResult } from "./assemble";

export function computeBase(params: CalcParams): BaseResult {
  const { defaultGrossMan, taxOpts, housingLoanDed } = params;
  const grossYen = defaultGrossMan * 10000;
  const depDed = Math.max(taxOpts.dependentsCount, 0) * 380000;
  const spouseDed = 0; // Now dynamically calculated per-year via spouseDeduction()
  const lifeDed = Math.max(taxOpts.lifeInsuranceDeduction, 0);
  const hasDepSetting = depDed > 0, hasSpouseSetting = spouseDed > 0;
  const hasLifeSetting = lifeDed > 0, hasHousingSetting = housingLoanDed > 0;
  const bTI = txInc(grossYen, taxOpts);
  const bEstHLRT = housingLoanDed > 0 ? Math.min(Math.max(housingLoanDed - iTx(bTI), 0), hlResidentCap(bTI)) : 0;
  const bMR = mR(bTI), bFL = fLm(bTI, bMR, bEstHLRT);
  return {
    bTI, bMR, bFL, depDed, spouseDed, lifeDed, housingLoanDed,
    hasDepSetting, hasSpouseSetting, hasLifeSetting, hasHousingSetting,
    hasAnyTaxDetailSetting: hasDepSetting || hasSpouseSetting || hasLifeSetting || hasHousingSetting,
  };
}

/** Phase 4: 退職一時金（職歴の endAge に一致する期間があれば、課税後の手取りを返す）。 */
function retirementBonusNetIncome(age: number, config: SimConfig, isSelfDead: boolean): number {
  if (!config.careerHistory?.length || isSelfDead) return 0;
  let net = 0;
  for (const period of config.careerHistory) {
    if (period.endAge !== age || period.retirementBonusMan == null || period.retirementBonusMan <= 0) continue;
    const bonus = period.retirementBonusMan * 10000;
    const deduction = calcRetirementDeduction(period.endAge - period.startAge);
    const taxableRetirement = Math.max(0, (bonus - deduction) / 2);
    const tax = iTx(taxableRetirement) + Math.floor(taxableRetirement * 0.1);
    net += bonus - tax;
  }
  return net;
}

/** Phase 2: 私的年金の受取額を公的年金収入に加算（税計算用）。 */
function privatePensionPayouts(ctx: YearContext, ageInfo: AgeEventInfo): { self: number; spouse: number } {
  const { age, events, isEffDisabled } = ctx;
  const out = { self: 0, spouse: 0 };
  for (const e of events) {
    const pp = e.privatePensionParams;
    if (!pp || isEffDisabled(e) || !isEventActive(e, age, events)) continue;
    const target = e.target || "self";
    if (target === "self" ? ageInfo.isSelfDead : ageInfo.isSpouseDead) continue;
    if (age >= pp.payoutStartAge && (pp.payoutEndAge === 0 || age < pp.payoutEndAge)) {
      out[target] += pp.payoutAnnualMan * 10000;
    }
  }
  return out;
}

/** 配偶者控除/配偶者特別控除。判定は合計所得（給与所得＋年金雑所得）ベース。 */
function spouseDeductionAmount(
  config: SimConfig, age: number, spouseAge: number,
  selfGross: number, selfPensionIncome: number, spouseTax: MemberTaxResult, spousePensionIncome: number,
): number {
  if (!config.spouse) return 0;
  const salaryIncome = (g: number) => g > 0 ? g - empDed(g) : 0;
  const pensionTaxable = (p: number, a: number) => p > 0 ? Math.max(p - publicPensionDeduction(p, a), 0) : 0;
  const selfIncome = salaryIncome(selfGross) + pensionTaxable(selfPensionIncome, age);
  const spouseIncome = salaryIncome(spouseTax.gross) + pensionTaxable(spousePensionIncome, spouseAge);
  return spouseDeduction(selfIncome, spouseIncome);
}

/** 教育費の公的支援（多子世帯授業料減免・高校就学支援金）を支出から差し引く。 */
function applyEducationSupport(
  breakdown: EventYearCost[], tashiWaiver: number, hsSupport: number,
): { eventOngoingDelta: number } {
  let delta = 0;
  if (tashiWaiver > 0) {
    breakdown.push({ label: "多子世帯授業料減免", icon: "🎓", color: "#10b981", amount: -tashiWaiver });
    delta -= tashiWaiver;
  }
  if (hsSupport > 0) {
    breakdown.push({ label: "高校就学支援金", icon: "🎓", color: "#10b981", amount: -hsSupport });
    delta -= hsSupport;
  }
  return { eventOngoingDelta: delta };
}

/** Simulate one year and return the YearResult. Mutates `state`. */
function simulateYear(age: number, config: SimConfig, state: SimState, yearResults: YearResult[]): YearResult {
  const ctx = buildYearContext(age, config, config.events);
  const ageInfo = phaseAgeEvents(ctx, config);
  const { isSelfDead, isDead, selfRetired, spouseAge } = ageInfo;

  // --- 本人の給与 ---
  const { gross, grownGrossMan } = phaseMemberIncome(isSelfDead, selfRetired, age, config.incomeKF, config.growthRate, config.defaultGrossMan);
  if (gross > 0) { state.cumulativeSalary += gross; state.salaryYears++; }
  const retirementBonusNet = retirementBonusNetIncome(age, config, isSelfDead);

  // --- 公的年金 + 私的年金 ---
  const pen = phasePension(age, gross, state, config, ageInfo);
  const privatePen = privatePensionPayouts(ctx, ageInfo);
  let selfPensionIncome = pen.selfPensionIncome + privatePen.self;
  let spousePensionIncome = pen.spousePensionIncome + privatePen.spouse;
  let pensionReduction = pen.selfPensionReduction;

  // --- 控除・手当 ---
  const dedInfo = phaseDeductions(ctx, config, ageInfo);

  // --- 配偶者の税 ---
  const spouseTaxResult = phaseSpouseTax(config, ageInfo, dedInfo, spousePensionIncome);
  if (spouseTaxResult.gross > 0) { state.spouseCumulativeSalary += spouseTaxResult.gross; state.spouseSalaryYears++; }
  {
    // 在職老齢年金: 配偶者分
    const red = applyWorkingPensionReduction(pen.spousePensionEmployeeAnnual, spouseTaxResult.gross, spouseAge);
    pensionReduction += red;
    spousePensionIncome -= red;
  }

  // --- イベント支出 ---
  const ec = phaseEventCosts(ctx, config, ageInfo);
  const { eventCostBreakdown } = ec;
  let { eventOngoing, totalExpense } = ec;
  {
    const { eventOngoingDelta } = applyEducationSupport(eventCostBreakdown, dedInfo.tashiWaiver, dedInfo.hsSupport);
    eventOngoing += eventOngoingDelta;
    totalExpense += eventOngoingDelta;
  }

  // --- 遺族年金・収入保障 ---
  const survivor = phaseSurvivor(ctx, config, ageInfo, state, pen.selfPensionEmployeeAnnual, pen.spousePensionEmployeeAnnual);

  // --- 本人の DC/iDeCo・控除・税 ---
  const dcStopped = isDead || selfRetired;
  const dcTotal = dcStopped ? 0 : resolveKF(config.dcTotalKF, age, 0);
  const companyDC = dcStopped ? 0 : resolveKF(config.companyDCKF, age, 0);
  const idecoMonthly = dcStopped ? 0 : resolveKF(config.idecoKF, age, 0);
  // 生命保険料控除: 保険イベントの保険料から自動計算（手動設定がある場合はそちらを優先）
  const selfLifeInsDed = Math.max(calcLifeInsuranceDeduction(ec.insurancePremiumSelf), config.taxOpts.lifeInsuranceDeduction || 0);
  const spouseDedAmount = spouseDeductionAmount(config, age, spouseAge, gross, selfPensionIncome, spouseTaxResult, spousePensionIncome);
  const hlDed = ec.yearHousingLoanDed;
  const selfTaxResult = calcMemberTax(
    grownGrossMan, dcTotal, companyDC, idecoMonthly,
    config.hasFuru, hlDed, dedInfo.selfDepDed, selfLifeInsDed,
    spouseDedAmount, true, age, config.selfSIParams,
    selfPensionIncome, config.nhsSettings,
  );

  // --- キャッシュフロー・資産 ---
  // Phase 5: 年齢別利回り - DCレートをKFから解決
  const yearDCRate = (config.returnRateKF?.length && !config.dcRateExplicit)
    ? resolveKF(config.returnRateKF, age, config.rr) / 100
    : undefined;
  const cashFlow = phaseCashFlow(
    state, config, selfTaxResult, spouseTaxResult,
    totalExpense, dedInfo.childAllowance, survivor.survivorIncome, ec.insurancePayoutTotal,
    ec.propertySaleProceeds, spouseTaxResult.dcContribution, yearDCRate,
  );
  // Phase 4: 退職一時金（課税後）をキャッシュに加算
  if (retirementBonusNet > 0) state.cumulativeCash += retirementBonusNet;

  const death = phaseDeathInheritance(
    state, config, ageInfo, ctx, dedInfo.childEvents, ec.insurancePayoutTotal, ec.activeEvts, cashFlow.cumulativeDCAsset, eventCostBreakdown,
  );
  const rebalance = phaseRebalance(state, config, ageInfo, age, cashFlow.annualNetCashFlow, totalExpense);

  state.totalC += cashFlow.aT;
  state.totalPensionLoss += cashFlow.pensionLossAnnual + cashFlow.spousePensionLossAnnual;

  const dcReception = phaseDCReception(state, config, age, spouseAge, yearResults, eventCostBreakdown);

  return assembleYearResult({
    age, state, gross, grownGrossMan, selfPensionIncome, spousePensionIncome, pensionReduction,
    eventOngoing, totalExpense, selfTaxResult, spouseTaxResult, spouseDedAmount, hlDed, selfLifeInsDed,
    dcTotal, companyDC, idecoMonthly, dedInfo, eventCosts: ec, survivor, cashFlow, death, rebalance, dcReception,
  });
}

export function computeScenario(s: Scenario, base: BaseResult, params: CalcParams, baseScenario?: Scenario | null): ScenarioResult {
  void base; // BaseResult is part of the public API but the per-year engine derives everything from the scenario
  const config = resolveSimConfig(s, params, baseScenario);
  const state = initSimState(config.effectiveCurrentAssets);
  const yearResults: YearResult[] = [];
  for (let age = config.currentAge; age < config.retirementAge; age++) {
    yearResults.push(simulateYear(age, config, state, yearResults));
  }
  const last = yearResults[yearResults.length - 1];
  return assembleFinalResult(s, state, yearResults, config, last ? last.cumulativeDCAsset : 0);
}
