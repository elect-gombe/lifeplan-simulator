import type { Scenario, YearResult, ScenarioResult, BaseResult, TaxOpts, Keyframe, LifeEvent, EventYearCost, PropertyParams, CarParams } from "./types";
import { resolveKF, isEventActive, resolveEventAge } from "./types";
import { txInc, mR, fLm, calcFurusatoDonation, iTx, rTx, apTxCr, rDed, rTxC } from "./tax";

// ===== Mortgage helpers =====
function calcMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (annualRate <= 0 || years <= 0) return years > 0 ? Math.round(principal / (years * 12)) : 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

function loanBalanceAfterYears(principal: number, annualRate: number, totalYears: number, elapsedYears: number): number {
  if (annualRate <= 0) return Math.max(principal - (principal / totalYears) * elapsedYears, 0);
  const r = annualRate / 100 / 12;
  const n = totalYears * 12;
  const m = elapsedYears * 12;
  const monthly = principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  return Math.max(Math.round(principal * Math.pow(1 + r, m) - monthly * (Math.pow(1 + r, m) - 1) / r), 0);
}

// Compute yearly costs from a property event
function computePropertyYearCost(pp: PropertyParams, yearsSincePurchase: number, inflationFactor: number = 1): EventYearCost[] {
  const costs: EventYearCost[] = [];
  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;

  // Down payment + closing costs (year 0 only)
  if (yearsSincePurchase === 0) {
    const closingCost = Math.round(pp.priceMan * 0.07);
    costs.push({ label: "頭金＋諸費用", icon: "🏠", color: "#3b82f6", amount: (pp.downPaymentMan + closingCost) * 10000 });
  }

  if (loanAmount <= 0) return costs;

  // Mortgage payment
  if (yearsSincePurchase < pp.loanYears) {
    let rate: number;
    let rateLabel: string;
    let isPhaseChange = false;
    let phaseLabel: string | undefined;

    if (pp.rateType === "fixed") {
      rate = pp.fixedRate;
      rateLabel = `固定${rate}%`;
    } else {
      const wasInit = yearsSincePurchase > 0 && (yearsSincePurchase - 1) < pp.variableRiseAfter;
      const isRisk = yearsSincePurchase >= pp.variableRiseAfter;
      rate = isRisk ? pp.variableRiskRate : pp.variableInitRate;
      rateLabel = isRisk ? `変動→${rate}%` : `変動${rate}%`;
      if (yearsSincePurchase === pp.variableRiseAfter) {
        isPhaseChange = true;
        phaseLabel = `金利上昇 ${pp.variableInitRate}%→${pp.variableRiskRate}%`;
      }
    }
    const monthly = calcMonthlyPayment(loanAmount, rate, pp.loanYears);
    const balance = loanBalanceAfterYears(loanAmount, rate, pp.loanYears, yearsSincePurchase);
    costs.push({
      label: `ローン返済(${rateLabel})`, icon: "🏦", color: "#3b82f6",
      amount: monthly * 12, detail: `残高${Math.round(balance / 10000)}万 月額${Math.round(monthly / 10000)}万`,
      isPhaseChange, phaseLabel,
    });

    // Loan deduction (13 years, 0.7% of balance, max 35万)
    if (pp.hasLoanDeduction && yearsSincePurchase < 13) {
      const deduction = Math.min(Math.round(balance * 0.007), 350000);
      const isLastYear = yearsSincePurchase === 12;
      costs.push({
        label: "住宅ローン控除", icon: "🏠", color: "#16a34a", amount: -deduction,
        detail: `残高${Math.round(balance / 10000)}万×0.7% (${yearsSincePurchase + 1}/13年目)`,
        isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined,
      });
    } else if (pp.hasLoanDeduction && yearsSincePurchase === 13) {
      // Mark the year after deduction ends
      costs.push({
        label: "住宅ローン控除終了", icon: "🏠", color: "#94a3b8", amount: 0,
        isPhaseChange: true, phaseLabel: "住宅ローン控除 終了",
      });
    }
  } else if (yearsSincePurchase === pp.loanYears) {
    costs.push({
      label: "ローン完済", icon: "🎉", color: "#16a34a", amount: 0,
      isPhaseChange: true, phaseLabel: "住宅ローン完済",
    });
  }

  // Maintenance (inflation applied)
  if (pp.maintenanceMonthlyMan > 0) {
    costs.push({ label: "管理費・修繕", icon: "🔧", color: "#64748b", amount: Math.round(pp.maintenanceMonthlyMan * 12 * 10000 * inflationFactor) });
  }

  // Property tax (inflation applied)
  if (pp.taxAnnualMan > 0) {
    costs.push({ label: "固定資産税", icon: "🏛️", color: "#64748b", amount: Math.round(pp.taxAnnualMan * 10000 * inflationFactor) });
  }

  return costs;
}

// Compute yearly costs from a car event
function computeCarYearCost(cp: CarParams, yearsSincePurchase: number, inflationFactor: number = 1): EventYearCost[] {
  const costs: EventYearCost[] = [];
  const isReplacementYear = cp.replaceEveryYears > 0 && yearsSincePurchase > 0 && yearsSincePurchase % cp.replaceEveryYears === 0;

  // Purchase (year 0 or replacement years) — car price inflates at replacement
  if (yearsSincePurchase === 0 || isReplacementYear) {
    costs.push({ label: "車両購入", icon: "🚗", color: "#10b981", amount: Math.round(cp.priceMan * 10000 * inflationFactor) });
  }

  // Loan payment (nominal fixed, no inflation)
  if (cp.loanYears > 0) {
    const yearInCycle = cp.replaceEveryYears > 0 ? yearsSincePurchase % cp.replaceEveryYears : yearsSincePurchase;
    if (yearInCycle < cp.loanYears) {
      const monthly = calcMonthlyPayment(cp.priceMan * 10000, cp.loanRate, cp.loanYears);
      costs.push({ label: "車ローン", icon: "🚗", color: "#10b981", amount: monthly * 12 });
    }
  }

  // Running costs (inflation applied)
  if (cp.maintenanceAnnualMan > 0) {
    costs.push({ label: "車維持費", icon: "🔧", color: "#10b981", amount: Math.round(cp.maintenanceAnnualMan * 10000 * inflationFactor) });
  }
  if (cp.insuranceAnnualMan > 0) {
    costs.push({ label: "車保険", icon: "🛡️", color: "#10b981", amount: Math.round(cp.insuranceAnnualMan * 10000 * inflationFactor) });
  }

  return costs;
}

export interface CalcParams {
  currentAge: number;
  retirementAge: number;
  defaultGrossMan: number;
  rr: number;
  sirPct: number;
  hasRet: boolean;
  retAmt: number;
  PY: number;
  taxOpts: TaxOpts;
  housingLoanDed: number;
  inflationRate: number; // % per year
}

// 扶養控除: child age determines deduction amount
// Under 16: 0 (no deduction, but child allowance)
// 16-18: 380,000 (一般扶養) — 2024改正で高校生も対象
// 19-22: 630,000 (特定扶養)
function dependentDeduction(childAge: number): number {
  if (childAge < 16) return 0;
  if (childAge < 19) return 380000;
  if (childAge < 23) return 630000;
  return 0;
}

// 児童手当 (2024改正後): 月額 → 年額
// 0-2歳: 15,000円/月
// 3-高校生(18歳): 10,000円/月
// 第3子以降: 30,000円/月 (0-18歳)
function childAllowanceMonthly(childAge: number, childIndex: number): number {
  if (childAge < 0 || childAge >= 18) return 0;
  if (childIndex >= 2) return 30000; // 第3子以降
  if (childAge < 3) return 15000;
  return 10000;
}

export function computeBase(params: CalcParams): BaseResult {
  const { defaultGrossMan, taxOpts, housingLoanDed } = params;
  const grossYen = defaultGrossMan * 10000;
  const depDed = Math.max(taxOpts.dependentsCount, 0) * 380000;
  const spouseDed = taxOpts.hasSpouseDeduction ? 380000 : 0;
  const lifeDed = Math.max(taxOpts.lifeInsuranceDeduction, 0);
  const hasDepSetting = depDed > 0, hasSpouseSetting = spouseDed > 0;
  const hasLifeSetting = lifeDed > 0, hasHousingSetting = housingLoanDed > 0;
  const bTI = txInc(grossYen, taxOpts);
  const bMR = mR(bTI), bFL = fLm(bTI, bMR);
  return {
    bTI, bMR, bFL, depDed, spouseDed, lifeDed, housingLoanDed,
    hasDepSetting, hasSpouseSetting, hasLifeSetting, hasHousingSetting,
    hasAnyTaxDetailSetting: hasDepSetting || hasSpouseSetting || hasLifeSetting || hasHousingSetting,
  };
}

function getEffective(s: Scenario, key: string, baseScenario: Scenario | null | undefined): any {
  if (s.linkedToBase && baseScenario && !s.overrideTracks.includes(key as any)) {
    return (baseScenario as any)[key];
  }
  return (s as any)[key];
}

export function computeScenario(s: Scenario, base: BaseResult, params: CalcParams, baseScenario?: Scenario | null): ScenarioResult {
  const { currentAge, retirementAge, defaultGrossMan, rr, sirPct, hasRet, retAmt, PY, taxOpts, housingLoanDed } = params;
  const r = rr / 100;
  const sir = sirPct / 100;
  const otherRet = hasRet ? retAmt : 0;
  const hasFuru = !!s.hasFurusato;

  const incomeKF: Keyframe[] = getEffective(s, "incomeKF", baseScenario) || [];
  const expenseKF: Keyframe[] = getEffective(s, "expenseKF", baseScenario) || [];
  const dcTotalKF: Keyframe[] = getEffective(s, "dcTotalKF", baseScenario) || [];
  const companyDCKF: Keyframe[] = getEffective(s, "companyDCKF", baseScenario) || [];
  const idecoKF: Keyframe[] = getEffective(s, "idecoKF", baseScenario) || [];
  // Events: merge base events (minus excluded) + own events
  const baseEvents = (s.linkedToBase && baseScenario) ? (baseScenario.events || []).filter(e => !(s.excludedBaseEventIds || []).includes(e.id)) : [];
  const ownEvents = s.events || [];
  const events = [...baseEvents, ...ownEvents].sort((a, b) => a.age - b.age);
  const growthRate = s.linkedToBase && baseScenario && !s.overrideTracks.includes("incomeKF" as any)
    ? baseScenario.salaryGrowthRate : s.salaryGrowthRate;

  const yearResults: YearResult[] = [];
  let cumulativeDCAsset = 0;
  let cumulativeReinvest = 0;
  let cumulativeSavings = s.currentAssetsMan * 10000;
  let totalC = 0;
  let totalPensionLoss = 0;

  const inflation = params.inflationRate / 100;

  for (let age = currentAge; age < retirementAge; age++) {
    const yearsFromStart = age - currentAge;
    const inflationFactor = Math.pow(1 + inflation, yearsFromStart);

    // Check for death event
    const deathEvent = events.find(e => e.type === "death" && e.deathParams && age >= resolveEventAge(e, events));
    const isDead = !!deathEvent;
    const dp = deathEvent?.deathParams;

    // Income
    let gross: number;
    let grownGrossMan: number;
    if (isDead) {
      // After death: no salary, replaced by survivor pension + insurance
      gross = 0;
      grownGrossMan = 0;
    } else {
      const grossManBase = resolveKF(incomeKF, age, defaultGrossMan);
      let growthYears = 0;
      for (let ki = incomeKF.length - 1; ki >= 0; ki--) {
        if (incomeKF[ki].age <= age) { growthYears = age - incomeKF[ki].age; break; }
      }
      grownGrossMan = grossManBase * Math.pow(1 + (growthRate || 0) / 100, growthYears);
      gross = grownGrossMan * 10000;
    }

    // Base living expense (万円/月 → 年額, with inflation)
    const baseLivingMonthlyMan = resolveKF(expenseKF, age, 15);
    let baseLivingExpense = baseLivingMonthlyMan * 12 * 10000 * inflationFactor;
    if (isDead && dp) {
      baseLivingExpense = baseLivingExpense * dp.expenseReductionPct / 100;
    }

    // Event costs: structured params (property/car) + simple events
    const activeEvts = events.filter(e => isEventActive(e, age, events));
    const onetimeEvts = events.filter(e => resolveEventAge(e, events) === age);
    let eventOngoing = 0;
    let eventOnetime = 0;
    const eventCostBreakdown: EventYearCost[] = [];

    for (const e of activeEvts) {
      const eAge = resolveEventAge(e, events);
      const yearsSince = age - eAge;

      if (e.propertyParams) {
        // Property: if dead with 団信, skip loan payments but keep maintenance/tax
        if (isDead && dp?.hasDanshin) {
          // 団信: loan payments and deduction skipped, only maintenance/tax
          const pp = e.propertyParams;
          if (pp.maintenanceMonthlyMan > 0) {
            const amt = Math.round(pp.maintenanceMonthlyMan * 12 * 10000 * inflationFactor);
            eventCostBreakdown.push({ label: "管理費・修繕", icon: "🔧", color: "#64748b", amount: amt });
            eventOngoing += amt;
          }
          if (pp.taxAnnualMan > 0) {
            const amt = Math.round(pp.taxAnnualMan * 10000 * inflationFactor);
            eventCostBreakdown.push({ label: "固定資産税", icon: "🏛️", color: "#64748b", amount: amt });
            eventOngoing += amt;
          }
          if (yearsSince === (age - resolveEventAge(deathEvent!, events))) {
            eventCostBreakdown.push({ label: "団信によるローン免除", icon: "🛡️", color: "#16a34a", amount: 0, isPhaseChange: true, phaseLabel: "団信発動" });
          }
        } else {
          const costs = computePropertyYearCost(e.propertyParams, yearsSince, inflationFactor);
          for (const c of costs) {
            eventCostBreakdown.push(c);
            eventOngoing += c.amount;
          }
        }
      } else if (e.carParams) {
        // Car: dynamic computation from params
        const costs = computeCarYearCost(e.carParams, yearsSince, inflationFactor);
        for (const c of costs) {
          eventCostBreakdown.push(c);
          eventOngoing += c.amount;
        }
      } else if (!e.parentId) {
        // Simple event (non-child sub-events only)
        const ongoing = e.annualCostMan * 10000 * inflationFactor;
        if (ongoing !== 0) {
          const et = { label: e.label, icon: "", color: "#64748b", amount: ongoing };
          eventCostBreakdown.push(et);
          eventOngoing += ongoing;
        }
      }
    }

    // One-time costs for simple events (non-structured)
    for (const e of onetimeEvts) {
      if (!e.propertyParams && !e.carParams) {
        const onetime = e.oneTimeCostMan * 10000 * inflationFactor;
        if (onetime !== 0) {
          eventCostBreakdown.push({ label: `${e.label}（一時）`, icon: "", color: "#64748b", amount: onetime });
          eventOnetime += onetime;
        }
      }
    }

    // Sub-events (parentId set, no own params) — these are legacy child events
    for (const e of activeEvts) {
      if (e.parentId && !e.propertyParams && !e.carParams) {
        const ongoing = e.annualCostMan * 10000 * inflationFactor;
        if (ongoing !== 0) {
          eventCostBreakdown.push({ label: e.label, icon: "", color: "#8b5cf6", amount: ongoing });
          eventOngoing += ongoing;
        }
        if (resolveEventAge(e, events) === age && e.oneTimeCostMan !== 0) {
          const onetime = e.oneTimeCostMan * 10000 * inflationFactor;
          eventCostBreakdown.push({ label: `${e.label}（一時）`, icon: "", color: "#8b5cf6", amount: onetime });
          eventOnetime += onetime;
        }
      }
    }

    // Track loan balance (0 if dead with 団信)
    let loanBalance = 0;
    if (!(isDead && dp?.hasDanshin)) {
      for (const e of activeEvts) {
        if (e.propertyParams) {
          const eAge = resolveEventAge(e, events);
          const ys = age - eAge;
          const pp = e.propertyParams;
          const loanAmt = (pp.priceMan - pp.downPaymentMan) * 10000;
          if (ys < pp.loanYears && loanAmt > 0) {
            const rate = pp.rateType === "fixed" ? pp.fixedRate : (ys < pp.variableRiseAfter ? pp.variableInitRate : pp.variableRiskRate);
            loanBalance += loanBalanceAfterYears(loanAmt, rate, pp.loanYears, ys);
          }
        }
      }
    }

    // Survivor income (after death)
    let survivorIncome = 0;
    if (isDead && dp) {
      survivorIncome += dp.survivorPensionManPerYear * 10000;
      eventCostBreakdown.push({ label: "遺族年金", icon: "🏛️", color: "#16a34a", amount: -dp.survivorPensionManPerYear * 10000 });
      if (dp.incomeProtectionManPerMonth > 0 && age < dp.incomeProtectionUntilAge) {
        const protAnnual = dp.incomeProtectionManPerMonth * 12 * 10000;
        survivorIncome += protAnnual;
        eventCostBreakdown.push({ label: "収入保障保険", icon: "🛡️", color: "#16a34a", amount: -protAnnual });
      }
    }

    const totalExpense = baseLivingExpense + eventOngoing + eventOnetime;

    // DC/iDeCo (stop after death)
    const dcTotal = isDead ? 0 : resolveKF(dcTotalKF, age, 0);
    const companyDC = isDead ? 0 : resolveKF(companyDCKF, age, 0);
    const idecoMonthly = isDead ? 0 : resolveKF(idecoKF, age, 0);
    const ds = Math.max(dcTotal - companyDC, 0);
    const aDS = ds * 12;
    const aI = idecoMonthly * 12;
    const aT = (dcTotal + idecoMonthly) * 12;
    const selfDC = ds * 12;

    // Dependent deduction: compute per-child based on child's age
    const childEvents = events.filter(e => e.type === "child" && isEventActive(e, age, events));
    let dependentDeductionTotal = 0;
    for (const ce of childEvents) {
      const childBirthAge = resolveEventAge(ce, events);
      const childAge = age - childBirthAge;
      dependentDeductionTotal += dependentDeduction(childAge);
    }
    dependentDeductionTotal += Math.max(taxOpts.dependentsCount, 0) * 380000;

    // 児童手当
    let childAllowance = 0;
    childEvents.forEach((ce, ci) => {
      const childBirthAge = resolveEventAge(ce, events);
      const childAge = age - childBirthAge;
      childAllowance += childAllowanceMonthly(childAge, ci) * 12;
    });

    const effectiveTaxOpts = { ...taxOpts, dependentDeductionTotal };

    // *** Base tax: "no DC/iDeCo" scenario using THIS YEAR's gross ***
    const baseTI = txInc(gross, effectiveTaxOpts);
    const baseMR = mR(baseTI);
    const baseFL = fLm(baseTI, baseMR);
    const baseFuruDon = hasFuru ? calcFurusatoDonation(baseFL) : 0;
    const baseFDed = hasFuru ? Math.max(baseFuruDon - 2000, 0) : 0;
    const baseTIaF = Math.max(baseTI - baseFDed, 0);
    const baseITraw = iTx(baseTIaF), baseRTraw = rTx(baseTIaF);
    const baseTaxAdj = apTxCr(baseITraw, baseRTraw, housingLoanDed, baseTIaF);

    // Tax with DC/iDeCo
    const adjG = gross - aDS;
    const adjTI = Math.max(txInc(adjG, effectiveTaxOpts) - aI, 0);
    const nMR = mR(adjTI);
    const nFL = fLm(adjTI, nMR);
    const furuDonNew = hasFuru ? calcFurusatoDonation(nFL) : 0;
    const nFDed = hasFuru ? Math.max(furuDonNew - 2000, 0) : 0;
    const adjTIaF = Math.max(adjTI - nFDed, 0);

    const nITraw = iTx(adjTIaF), nRTraw = rTx(adjTIaF);
    const nTaxAdj = apTxCr(nITraw, nRTraw, housingLoanDed, adjTIaF);
    const incomeTax = nTaxAdj.it;
    const residentTax = nTaxAdj.rt;
    const socialInsurance = Math.round(gross * sir);

    // Tax savings = base tax - actual tax (always >= 0 when DC reduces taxable income)
    const itSv = baseTaxAdj.it - nTaxAdj.it;
    const rtSv = baseTaxAdj.rt - nTaxAdj.rt;
    const siSv = aDS * sir;
    const aBen = itSv + rtSv + siSv;
    const aNet = aBen;

    const takeHomePay = gross - incomeTax - residentTax - socialInsurance - selfDC - aI + childAllowance + survivorIncome;
    const pensionLossAnnual = (ds * 5.481) / 1000 * 12;
    const annualNetCashFlow = takeHomePay - totalExpense;

    cumulativeDCAsset = cumulativeDCAsset * (1 + r) + aT;
    cumulativeReinvest = cumulativeReinvest * (1 + r) + aNet;
    cumulativeSavings = cumulativeSavings * (1 + r) + annualNetCashFlow;
    totalC += aT;
    totalPensionLoss += pensionLossAnnual;

    yearResults.push({
      age, gross, grossMan: grownGrossMan,
      baseLivingExpense, eventOnetime, eventOngoing, totalExpense,
      incomeTax, residentTax, socialInsurance, takeHomePay,
      dcMonthly: dcTotal, companyDC, idecoMonthly, annualContribution: aT, selfDCContribution: selfDC,
      incomeTaxSaving: itSv, residentTaxSaving: rtSv, socialInsuranceSaving: siSv,
      annualBenefit: aBen, annualNetBenefit: aNet,
      cumulativeDCAsset, cumulativeReinvest, annualNetCashFlow,
      cumulativeSavings, totalWealth: cumulativeSavings + cumulativeDCAsset + cumulativeReinvest,
      furusatoLimit: nFL, furusatoDonation: furuDonNew,
      pensionLossAnnual, loanBalance,
      childCount: childEvents.length, dependentDeduction: dependentDeductionTotal, childAllowance,
      activeEvents: activeEvts, eventCostBreakdown,
    });
  }

  const assetFV = cumulativeDCAsset;
  const fvB = cumulativeReinvest;
  const lPL = totalPensionLoss * PY;
  const dcRetDed = rDed(s.years);
  const exitDelta = rTxC(assetFV + otherRet, dcRetDed) - rTxC(otherRet, dcRetDed);
  const finalAssetNet = Math.max(assetFV - exitDelta, 0);
  const ly = yearResults[yearResults.length - 1];
  const finalSavings = ly ? ly.cumulativeSavings : s.currentAssetsMan * 10000;
  const finalWealth = finalAssetNet + fvB + finalSavings;
  const finalScore = fvB - lPL - exitDelta;

  return {
    scenario: s, yearResults,
    totalC, assetFV, fvB, lPL, pvPL: lPL,
    dcRetDed, exitDelta, finalAssetNet, finalWealth, finalScore,
    multiPhase: dcTotalKF.length > 1 || idecoKF.length > 1 || incomeKF.length > 1,
    hasFuru,
  };
}
