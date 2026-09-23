/**
 * Yearly cost breakdown for property (housing) events: loan payments, housing
 * loan deduction, maintenance/tax, plus helpers to pre-scan insurance premiums
 * and housing loan deductions per household member.
 */
import type { LifeEvent, EventYearCost, PropertyParams } from "../types";
import { isEventActive, resolveEventAge } from "../types";
import { calcMonthlyPaymentEqual, calcAnnualPaymentPrincipalEqual, calcMonthlyPaymentPrincipalEqual, loanBalanceAfterYears, buildLoanSchedule } from "../mortgage";
import type { LoanScheduleEntry } from "../mortgage";
import { HOUSING_LOAN_DEDUCTION_YEARS, HOUSING_LOAN_DEDUCTION_RATE, HOUSING_LOAN_DEDUCTION_MAX } from "./constants";

// ローン金利選択
function loanRate(pp: PropertyParams, yearsSince: number): number {
  return pp.rateType === "fixed" ? pp.fixedRate : (yearsSince >= pp.variableRiseAfter ? pp.variableRiskRate : pp.variableInitRate);
}

/** Resolve loan balance from schedule with fallback to formula.
 *  Returns the total balance and the schedule entry (if available). */
export function getLoanBalance(pp: PropertyParams, eAge: number, yearsSince: number): { balance: number; entry: LoanScheduleEntry | null } {
  const loanAmt = (pp.priceMan - pp.downPaymentMan) * 10000;
  if (loanAmt <= 0) return { balance: 0, entry: null };
  const schedule = buildLoanSchedule(pp, eAge);
  const entry = yearsSince < schedule.length ? schedule[yearsSince] : null;
  if (entry) return { balance: entry.balance, entry };
  if (schedule.length > 0) return { balance: 0, entry: null };
  if (yearsSince >= pp.loanYears) return { balance: 0, entry: null };
  const bal = loanBalanceAfterYears(loanAmt, loanRate(pp, yearsSince), pp.loanYears, yearsSince, pp.repaymentType || "equal_payment");
  return { balance: bal, entry: null };
}

/** Pre-scan insurance premiums for a given target ("self"|"spouse") */
export function prescanInsurancePremium(
  target: "self" | "spouse", events: LifeEvent[], age: number, isDead: boolean,
  isEffDisabled: (e: LifeEvent) => boolean
): number {
  let total = 0;
  for (const e of events) {
    if (isEffDisabled(e) || !isEventActive(e, age, events) || !e.insuranceParams) continue;
    const insTarget = e.target || "self";
    if (insTarget !== target) continue;
    if (!isDead && age < e.insuranceParams.coverageEndAge) {
      total += e.insuranceParams.premiumMonthlyMan * 12 * 10000;
    }
  }
  return total;
}

/** Pre-scan housing loan deduction for a given target ("self"|"spouse") */
export function prescanHousingLoanDeduction(
  targetFilter: "self" | "spouse",
  events: LifeEvent[], age: number,
  isEffDisabled: (e: LifeEvent) => boolean
): number {
  let total = 0;
  for (const e of events) {
    if (isEffDisabled(e) || !isEventActive(e, age, events) || !e.propertyParams) continue;
    const pp = e.propertyParams;
    if (!pp.hasLoanDeduction) continue;
    if (pp.saleAge != null && age >= pp.saleAge) continue;
    const eAge = resolveEventAge(e, events);
    const yearsSince = age - eAge;
    if (yearsSince >= HOUSING_LOAN_DEDUCTION_YEARS) continue;
    const loanAmt = (pp.priceMan - pp.downPaymentMan) * 10000;
    if (loanAmt <= 0) continue;
    const { balance: bal, entry } = getLoanBalance(pp, eAge, yearsSince);
    const dedTarget = pp.deductionTarget || "self";
    if (pp.loanStructure === "pair" && entry && dedTarget === "both") {
      // ペアローン: 個別残高で控除を計算
      const targetBal = targetFilter === "spouse" ? (entry.spouseBalance ?? 0) : (entry.selfBalance ?? 0);
      total += Math.min(Math.round(targetBal * HOUSING_LOAN_DEDUCTION_RATE), HOUSING_LOAN_DEDUCTION_MAX);
    } else {
      const ded = Math.min(Math.round(bal * HOUSING_LOAN_DEDUCTION_RATE), HOUSING_LOAN_DEDUCTION_MAX);
      if (dedTarget === targetFilter) {
        total += ded;
      } else if (dedTarget === "both") {
        const selfRatio = (pp.pairRatio ?? 50) / 100;
        if (targetFilter === "self") {
          total += Math.round(ded * selfRatio);
        } else {
          total += ded - Math.round(ded * selfRatio);
        }
      }
    }
  }
  return total;
}

// Compute yearly costs from a property event
// loanScheduleCache: optional pre-built schedule to avoid recomputation
export function computePropertyYearCost(pp: PropertyParams, yearsSincePurchase: number, inflationFactor: number = 1, startAge?: number, loanScheduleCache?: LoanScheduleEntry[]): EventYearCost[] {
  const costs: EventYearCost[] = [];
  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;
  const repType = pp.repaymentType || "equal_payment";

  // Check if property has been sold
  if (pp.saleAge != null && startAge != null && (startAge + yearsSincePurchase) >= pp.saleAge) {
    return costs; // Post-sale: no costs
  }

  // Down payment + closing costs (year 0 only)
  if (yearsSincePurchase === 0) {
    const closingCost = Math.round(pp.priceMan * 0.07);
    costs.push({ label: "頭金＋諸費用", icon: "🏠", color: "#3b82f6", amount: (pp.downPaymentMan + closingCost) * 10000 });
  }

  // Use loan schedule if available for accurate prepayment/refinance tracking
  const schedule = loanScheduleCache || (startAge != null ? buildLoanSchedule(pp, startAge) : null);
  const scheduleEntry = schedule && yearsSincePurchase < schedule.length ? schedule[yearsSincePurchase] : null;

  // Mortgage payment (ローンがある場合のみ)
  // If schedule exists, loan is done when yearsSincePurchase >= schedule.length (schedule covers all active loan years)
  const loanDoneBySchedule = schedule != null && yearsSincePurchase >= schedule.length;
  const hasRemainingLoan = loanDoneBySchedule ? false
    : scheduleEntry ? scheduleEntry.balance > 0 && !scheduleEntry.isSold
    : (loanAmount > 0 && yearsSincePurchase < pp.loanYears);

  if (hasRemainingLoan) {
    let rate: number;
    let rateLabel: string;
    let isPhaseChange = false;
    let phaseLabel: string | undefined;
    let annualPayment: number;
    let monthlyDisplay: number;
    let balance: number;

    if (scheduleEntry) {
      // Use schedule data
      rate = scheduleEntry.rate;
      annualPayment = scheduleEntry.annualPayment;
      monthlyDisplay = scheduleEntry.monthlyPayment;
      balance = scheduleEntry.balance;

      if (scheduleEntry.isRefinanced) {
        isPhaseChange = true;
        phaseLabel = `借換 → ${rate}%/${pp.refinance?.newLoanYears}年`;
        rateLabel = `借換${rate}%`;
      } else if (pp.rateType === "fixed") {
        rateLabel = `固定${rate}%`;
      } else {
        const isRisk = yearsSincePurchase >= pp.variableRiseAfter;
        rateLabel = isRisk ? `変動→${rate}%` : `変動${rate}%`;
        if (yearsSincePurchase === pp.variableRiseAfter) {
          isPhaseChange = true;
          phaseLabel = `金利上昇 ${pp.variableInitRate}%→${pp.variableRiskRate}%`;
        }
      }

      // Show prepayment info
      if (scheduleEntry.prepaymentAmount > 0) {
        const prepAtAge = pp.prepayments?.find(p => startAge != null && p.age === startAge + yearsSincePurchase);
        costs.push({
          label: `繰上返済(${prepAtAge?.type === "reduce" ? "返済額軽減" : "期間短縮"})`,
          icon: "💴", color: "#16a34a", amount: scheduleEntry.prepaymentAmount,
          isPhaseChange: true, phaseLabel: `繰上返済 ${Math.round(scheduleEntry.prepaymentAmount / 10000)}万円`,
          detail: `残高${Math.round(balance / 10000)}万 残${scheduleEntry.remainingYears}年`,
        });
      }

      // Refinance cost
      if (scheduleEntry.isRefinanced && pp.refinance) {
        costs.push({
          label: "借換手数料", icon: "🏦", color: "#ea580c", amount: pp.refinance.costMan * 10000,
        });
      }
    } else {
      // Fallback: original calculation
      if (pp.rateType === "fixed") {
        rate = pp.fixedRate;
        rateLabel = `固定${rate}%`;
      } else {
        const isRisk = yearsSincePurchase >= pp.variableRiseAfter;
        rate = isRisk ? pp.variableRiskRate : pp.variableInitRate;
        rateLabel = isRisk ? `変動→${rate}%` : `変動${rate}%`;
        if (yearsSincePurchase === pp.variableRiseAfter) {
          isPhaseChange = true;
          phaseLabel = `金利上昇 ${pp.variableInitRate}%→${pp.variableRiskRate}%`;
        }
      }

      if (repType === "equal_principal") {
        annualPayment = calcAnnualPaymentPrincipalEqual(loanAmount, rate, pp.loanYears, yearsSincePurchase);
        monthlyDisplay = calcMonthlyPaymentPrincipalEqual(loanAmount, rate, pp.loanYears, yearsSincePurchase);
      } else {
        const monthly = calcMonthlyPaymentEqual(loanAmount, rate, pp.loanYears);
        annualPayment = monthly * 12;
        monthlyDisplay = monthly;
      }
      balance = loanBalanceAfterYears(loanAmount, rate, pp.loanYears, yearsSincePurchase, repType);
    }

    const repLabel = repType === "equal_principal" ? "元金均等" : "元利均等";
    const isPairLoan = pp.loanStructure === "pair" && scheduleEntry?.selfBalance != null;
    const selfAnnual = isPairLoan && balance > 0 ? Math.round(annualPayment * ((scheduleEntry!.selfBalance ?? 0) / balance)) : annualPayment;
    const spouseAnnual = isPairLoan ? annualPayment - selfAnnual : 0;
    costs.push({
      label: `ローン返済(${repLabel}/${rateLabel})`, icon: "🏦", color: "#3b82f6",
      amount: annualPayment,
      detail: isPairLoan
        ? `本人${Math.round((scheduleEntry!.selfBalance ?? 0) / 10000)}万(月${Math.round((scheduleEntry!.selfMonthlyPayment ?? 0) / 10000)}万) 配偶者${Math.round((scheduleEntry!.spouseBalance ?? 0) / 10000)}万(月${Math.round((scheduleEntry!.spouseMonthlyPayment ?? 0) / 10000)}万)`
        : `残高${Math.round(balance / 10000)}万 月額${Math.round(monthlyDisplay / 10000)}万`,
      isPhaseChange, phaseLabel,
      // ペアローン按分情報を埋め込み（TaxDetailModalで使用）
      selfAmount: isPairLoan ? selfAnnual : undefined,
      spouseAmount: isPairLoan ? spouseAnnual : undefined,
    });

    // Loan deduction: years and limit depend on certifiedType (Phase 13)
    const dedYears = pp.certifiedType === "standard" ? 10 : HOUSING_LOAN_DEDUCTION_YEARS;
    const dedBalanceLimit = pp.certifiedType === "standard" ? 30_000_000
      : pp.certifiedType === "certified" ? 50_000_000
      : pp.certifiedType === "zeh" ? 45_000_000
      : pp.certifiedType === "advanced" ? 35_000_000
      : 50_000_000; // default (legacy): 5000万
    const dedMax = Math.round(dedBalanceLimit * HOUSING_LOAN_DEDUCTION_RATE);
    const certLabel = pp.certifiedType === "standard" ? "一般" : pp.certifiedType === "certified" ? "認定" : pp.certifiedType === "zeh" ? "ZEH" : pp.certifiedType === "advanced" ? "省エネ" : "認定";
    if (pp.hasLoanDeduction && yearsSincePurchase < dedYears) {
      const isLastYear = yearsSincePurchase === dedYears - 1;
      const dedTarget = pp.deductionTarget || "self";
      if (dedTarget === "both" && pp.loanStructure === "pair" && scheduleEntry) {
        // ペアローン: 個別残高で控除を計算
        const selfBal = Math.min(scheduleEntry.selfBalance ?? 0, dedBalanceLimit);
        const spouseBal = Math.min(scheduleEntry.spouseBalance ?? 0, dedBalanceLimit);
        const selfDed = Math.min(Math.round(selfBal * HOUSING_LOAN_DEDUCTION_RATE), dedMax);
        const spouseDed = Math.min(Math.round(spouseBal * HOUSING_LOAN_DEDUCTION_RATE), dedMax);
        if (selfDed > 0) {
          costs.push({
            label: "住宅ローン控除(本人)", icon: "🏠", color: "#16a34a", amount: -selfDed,
            detail: `本人残高${Math.round(selfBal / 10000)}万×0.7%(${certLabel}) (${yearsSincePurchase + 1}/${dedYears}年目)`,
            isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined,
          });
        }
        if (spouseDed > 0) {
          costs.push({
            label: "住宅ローン控除(配偶者)", icon: "🏠", color: "#16a34a", amount: -spouseDed,
            detail: `配偶者残高${Math.round(spouseBal / 10000)}万×0.7%(${certLabel}) (${yearsSincePurchase + 1}/${dedYears}年目)`,
            isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined,
          });
        }
      } else {
        const effectiveBal = Math.min(balance, dedBalanceLimit);
        const deduction = Math.min(Math.round(effectiveBal * HOUSING_LOAN_DEDUCTION_RATE), dedMax);
        const detailBase = `残高${Math.round(effectiveBal / 10000)}万×0.7%(${certLabel}) (${yearsSincePurchase + 1}/${dedYears}年目)`;
        if (dedTarget === "both") {
          // 単独ローンだが両方指定の場合 (fallback: 按分)
          const selfRatio = (pp.pairRatio ?? 50) / 100;
          const selfDed = Math.round(deduction * selfRatio);
          const spouseDed = deduction - selfDed;
          if (selfDed > 0) costs.push({ label: "住宅ローン控除(本人)", icon: "🏠", color: "#16a34a", amount: -selfDed, detail: `${detailBase} 本人${Math.round(selfRatio * 100)}%`, isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined });
          if (spouseDed > 0) costs.push({ label: "住宅ローン控除(配偶者)", icon: "🏠", color: "#16a34a", amount: -spouseDed, detail: `${detailBase} 配偶者${Math.round((1 - selfRatio) * 100)}%`, isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined });
        } else {
          const dedLabel2 = dedTarget === "spouse" ? "住宅ローン控除(配偶者)" : "住宅ローン控除(本人)";
          costs.push({ label: dedLabel2, icon: "🏠", color: "#16a34a", amount: -deduction, detail: detailBase, isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined });
        }
      }
    } else if (pp.hasLoanDeduction && yearsSincePurchase === dedYears) {
      costs.push({
        label: "住宅ローン控除終了", icon: "🏠", color: "#94a3b8", amount: 0,
        isPhaseChange: true, phaseLabel: "住宅ローン控除 終了",
      });
    }
  } else if (loanAmount > 0 && !scheduleEntry?.isSold) {
    // Check if this is the year of loan completion
    const isCompletionYear = loanDoneBySchedule && yearsSincePurchase === (schedule?.length ?? pp.loanYears)
      || (!schedule && yearsSincePurchase === pp.loanYears);
    if (isCompletionYear) {
      costs.push({
        label: "ローン完済", icon: "🎉", color: "#16a34a", amount: 0,
        isPhaseChange: true, phaseLabel: "住宅ローン完済",
      });
    }
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
