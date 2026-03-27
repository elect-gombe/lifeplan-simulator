import type { Scenario, YearResult, ScenarioResult, BaseResult, TaxOpts, Keyframe, LifeEvent, EventYearCost, PropertyParams, CarParams, DeathParams, SpouseConfig, NISAConfig, BalancePolicy, SocialInsuranceParams, PrepaymentEntry, RelocationParams, GiftParams } from "./types";
import { resolveKF, isEventActive, resolveEventAge, DEFAULT_DC_RECEIVE_METHOD, DEFAULT_SI_PARAMS, PENSION_INSURANCE_RATE, PENSION_MONTHLY_CAP, EMPLOYMENT_INSURANCE_RATE, NURSING_INSURANCE_MIN_AGE, NURSING_INSURANCE_MAX_AGE } from "./types";
import { txInc, mR, fLm, calcFurusatoDonation, iTx, rTx, apTxCr, hlResidentCap, rDed, rTxC, annuityTax, estimatePublicPension, empDed, spouseDeduction, calcLifeInsuranceDeduction, calcPropertyCapitalGainsTax, calcGiftTax, publicPensionDeduction } from "./tax";
import { calcMonthlyPaymentEqual, calcAnnualPaymentPrincipalEqual, calcMonthlyPaymentPrincipalEqual, loanBalanceAfterYears, buildLoanSchedule } from "./mortgage";
import type { LoanScheduleEntry } from "./mortgage";
import { DEPENDENT_DEDUCTION_GENERAL, DEPENDENT_DEDUCTION_SPECIAL, DEPENDENT_MIN_AGE, DEPENDENT_SPECIAL_MIN_AGE, DEPENDENT_SPECIAL_MAX_AGE, CHILD_ALLOWANCE_MAX_AGE, dependentDeductionForChild, childAllowanceMonthly } from "./dependents";
export { DEPENDENT_DEDUCTION_GENERAL, DEPENDENT_DEDUCTION_SPECIAL, DEPENDENT_MIN_AGE, DEPENDENT_SPECIAL_MIN_AGE, DEPENDENT_SPECIAL_MAX_AGE, CHILD_ALLOWANCE_MAX_AGE, dependentDeductionForChild, childAllowanceMonthly } from "./dependents";
export { calcMonthlyPaymentEqual, loanBalanceAfterYears, buildLoanSchedule, calcAnnualPaymentPrincipalEqual, calcMonthlyPaymentPrincipalEqual } from "./mortgage";
export type { LoanScheduleEntry } from "./mortgage";
import { calcSurvivorPension, PENSION_RATE_PER_MILLE } from "./survivor";
export { calcSurvivorPension } from "./survivor";

/** 住宅ローン控除: 期間（年） */
const HOUSING_LOAN_DEDUCTION_YEARS = 13;
/** 住宅ローン控除: 控除率 */
const HOUSING_LOAN_DEDUCTION_RATE = 0.007;
/** 住宅ローン控除: 年間上限（円） */
const HOUSING_LOAN_DEDUCTION_MAX = 350000;
/** 特定口座の譲渡益税率 */
const TAXABLE_ACCOUNT_TAX_RATE = 0.20315;
/** 在職老齢年金: 支給停止基準額(円/月) */
const WORKING_PENSION_THRESHOLD = 500000;

// ローン金利選択
function loanRate(pp: PropertyParams, yearsSince: number): number {
  return pp.rateType === "fixed" ? pp.fixedRate : (yearsSince >= pp.variableRiseAfter ? pp.variableRiskRate : pp.variableInitRate);
}

/** Resolve loan balance from schedule with fallback to formula.
 *  Returns the total balance and the schedule entry (if available). */
function getLoanBalance(pp: PropertyParams, eAge: number, yearsSince: number): { balance: number; entry: LoanScheduleEntry | null } {
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
function prescanInsurancePremium(
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
function prescanHousingLoanDeduction(
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
function computePropertyYearCost(pp: PropertyParams, yearsSincePurchase: number, inflationFactor: number = 1, startAge?: number, loanScheduleCache?: LoanScheduleEntry[]): EventYearCost[] {
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

    // Loan deduction (13 years, 0.7% of balance, max 35万)
    if (pp.hasLoanDeduction && yearsSincePurchase < HOUSING_LOAN_DEDUCTION_YEARS) {
      const isLastYear = yearsSincePurchase === HOUSING_LOAN_DEDUCTION_YEARS - 1;
      const dedTarget = pp.deductionTarget || "self";
      if (dedTarget === "both" && pp.loanStructure === "pair" && scheduleEntry) {
        // ペアローン: 個別残高で控除を計算
        const selfBal = scheduleEntry.selfBalance ?? 0;
        const spouseBal = scheduleEntry.spouseBalance ?? 0;
        const selfDed = Math.min(Math.round(selfBal * HOUSING_LOAN_DEDUCTION_RATE), HOUSING_LOAN_DEDUCTION_MAX);
        const spouseDed = Math.min(Math.round(spouseBal * HOUSING_LOAN_DEDUCTION_RATE), HOUSING_LOAN_DEDUCTION_MAX);
        if (selfDed > 0) {
          costs.push({
            label: "住宅ローン控除(本人)", icon: "🏠", color: "#16a34a", amount: -selfDed,
            detail: `本人残高${Math.round(selfBal / 10000)}万×0.7% (${yearsSincePurchase + 1}/13年目)`,
            isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined,
          });
        }
        if (spouseDed > 0) {
          costs.push({
            label: "住宅ローン控除(配偶者)", icon: "🏠", color: "#16a34a", amount: -spouseDed,
            detail: `配偶者残高${Math.round(spouseBal / 10000)}万×0.7% (${yearsSincePurchase + 1}/13年目)`,
            isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined,
          });
        }
      } else {
        const deduction = Math.min(Math.round(balance * HOUSING_LOAN_DEDUCTION_RATE), HOUSING_LOAN_DEDUCTION_MAX);
        const detailBase = `残高${Math.round(balance / 10000)}万×0.7% (${yearsSincePurchase + 1}/13年目)`;
        if (dedTarget === "both") {
          // 単独ローンだが両方指定の場合 (fallback: 按分)
          const selfRatio = (pp.pairRatio ?? 50) / 100;
          const selfDed = Math.round(deduction * selfRatio);
          const spouseDed = deduction - selfDed;
          if (selfDed > 0) costs.push({ label: "住宅ローン控除(本人)", icon: "🏠", color: "#16a34a", amount: -selfDed, detail: `${detailBase} 本人${Math.round(selfRatio * 100)}%`, isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined });
          if (spouseDed > 0) costs.push({ label: "住宅ローン控除(配偶者)", icon: "🏠", color: "#16a34a", amount: -spouseDed, detail: `${detailBase} 配偶者${Math.round((1 - selfRatio) * 100)}%`, isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined });
        } else {
          const dedLabel = dedTarget === "spouse" ? "住宅ローン控除(配偶者)" : "住宅ローン控除(本人)";
          costs.push({ label: dedLabel, icon: "🏠", color: "#16a34a", amount: -deduction, detail: detailBase, isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined });
        }
      }
    } else if (pp.hasLoanDeduction && yearsSincePurchase === HOUSING_LOAN_DEDUCTION_YEARS) {
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

// Compute yearly costs from a car event
function computeCarYearCost(cp: CarParams, yearsSincePurchase: number, inflationFactor: number = 1): EventYearCost[] {
  const costs: EventYearCost[] = [];
  const isReplacementYear = cp.replaceEveryYears > 0 && yearsSincePurchase > 0 && yearsSincePurchase % cp.replaceEveryYears === 0;

  // Purchase or Loan
  if (cp.loanYears > 0) {
    // ローンあり: 購入費は計上せず、ローン返済のみ
    const yearInCycle = cp.replaceEveryYears > 0 ? yearsSincePurchase % cp.replaceEveryYears : yearsSincePurchase;
    if (yearInCycle < cp.loanYears) {
      const monthly = calcMonthlyPaymentEqual(cp.priceMan * 10000, cp.loanRate, cp.loanYears);
      costs.push({ label: "車ローン", icon: "🚗", color: "#10b981", amount: monthly * 12 });
    }
  } else {
    // 一括購入: 購入年と買い替え年に全額計上
    if (yearsSincePurchase === 0 || isReplacementYear) {
      costs.push({ label: "車両購入", icon: "🚗", color: "#10b981", amount: Math.round(cp.priceMan * 10000 * inflationFactor) });
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

// ===== 相続税の計算（法定相続分課税方式・簡易版） =====
// 参考: 国税庁 No.4155
// 基礎控除: 3,000万 + 600万 × 法定相続人数
// みなし相続財産の非課税: 死亡保険金・死亡退職金それぞれ 500万 × 法定相続人数
// 税率: 累進課税（法定相続分で按分→各人の税額を合計）
// 簡易化: 配偶者+子の標準家族構成を前提、配偶者の税額軽減（1.6億 or 法定相続分）は適用
function calcInheritanceTax(
  estate: number,              // 正味の遺産額（円）
  deemedDC: number,            // みなし相続: DC死亡一時金（円）
  deemedInsurance: number,     // みなし相続: 死亡保険金（円）
  legalHeirs: number,          // 法定相続人数
  hasSpouseSurvivor: boolean,  // 配偶者が遺族にいるか
): { tax: number; taxableEstate: number; detail: string } {
  // みなし相続財産の非課税枠
  const dcExempt = Math.min(deemedDC, 5000000 * legalHeirs);
  const insExempt = Math.min(deemedInsurance, 5000000 * legalHeirs);
  // 課税価格
  const taxablePrice = estate + (deemedDC - dcExempt) + (deemedInsurance - insExempt);
  // 基礎控除
  const basicDeduction = 30000000 + 6000000 * legalHeirs;
  const taxableEstate = Math.max(taxablePrice - basicDeduction, 0);
  if (taxableEstate <= 0) {
    return { tax: 0, taxableEstate: 0, detail: `遺産${Math.round(taxablePrice / 10000)}万≦基礎控除${Math.round(basicDeduction / 10000)}万 → 非課税` };
  }
  // 法定相続分で按分して各人の税額を計算
  // 配偶者: 1/2、子: 残り1/2を均等分割
  const childCount = Math.max(legalHeirs - (hasSpouseSurvivor ? 1 : 0), 1);
  const spouseShare = hasSpouseSurvivor ? taxableEstate / 2 : 0;
  const childShare = hasSpouseSurvivor ? taxableEstate / 2 / childCount : taxableEstate / childCount;

  // 税率テーブル（法定相続分に応ずる取得金額）
  const calcTaxForShare = (share: number) => {
    if (share <= 10000000) return share * 0.10;
    if (share <= 30000000) return share * 0.15 - 500000;
    if (share <= 50000000) return share * 0.20 - 2000000;
    if (share <= 100000000) return share * 0.30 - 7000000;
    if (share <= 200000000) return share * 0.40 - 17000000;
    if (share <= 300000000) return share * 0.45 - 27000000;
    if (share <= 600000000) return share * 0.50 - 42000000;
    return share * 0.55 - 72000000;
  };

  let totalTax = 0;
  if (hasSpouseSurvivor) totalTax += calcTaxForShare(spouseShare);
  totalTax += calcTaxForShare(childShare) * childCount;
  totalTax = Math.round(totalTax);

  // 配偶者の税額軽減（法定相続分 or 1.6億円のいずれか大きい方まで非課税）
  if (hasSpouseSurvivor) {
    const spouseActualShare = taxablePrice / 2; // 法定相続分
    const spouseExemptLimit = Math.max(spouseActualShare, 160000000);
    if (spouseActualShare <= spouseExemptLimit) {
      // 配偶者分の税額を全額控除
      totalTax -= Math.round(calcTaxForShare(spouseShare));
      totalTax = Math.max(totalTax, 0);
    }
  }

  const parts: string[] = [];
  parts.push(`課税遺産${Math.round(taxableEstate / 10000)}万`);
  if (dcExempt > 0) parts.push(`DC非課税${Math.round(dcExempt / 10000)}万`);
  if (insExempt > 0) parts.push(`保険非課税${Math.round(insExempt / 10000)}万`);
  if (hasSpouseSurvivor) parts.push(`配偶者軽減あり`);

  return { tax: totalTax, taxableEstate, detail: parts.join(" ") };
}


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

function getEffective(s: Scenario, key: string, baseScenario: Scenario | null | undefined): any {
  if (s.linkedToBase && baseScenario && !s.overrideTracks.includes(key as any)) {
    return (baseScenario as any)[key];
  }
  return (s as any)[key];
}

// Member tax calculation — unified for both self and spouse
interface MemberTaxResult {
  gross: number;
  adjGross: number;             // DC自己負担控除後の収入(税計算ベース)
  sir: number;                  // 社保料率(小数)
  employeeDeduction: number;    // 給与所得控除
  incomeTax: number;
  residentTax: number;
  socialInsurance: number;
  socialInsuranceDeduction: number; // 社会保険料控除（adjGベース）
  // 社保内訳
  siPension: number;
  siHealth: number;
  siNursing: number;
  siEmployment: number;
  siChildSupport: number;
  dcContribution: number;       // DC合計年額
  idecoContribution: number;    // iDeCo年額
  selfDCContribution: number;   // 自己負担DC年額
  incomeTaxSaving: number;
  residentTaxSaving: number;
  socialInsuranceSaving: number; // 社保料節約（本人のみ非0）
  furusatoLimit: number;
  furusatoDonation: number;
  takeHome: number;
  taxableIncome: number;        // 課税所得(ふるさと控除後=税計算ベース)
  marginalRate: number;
  hlDeduction: number;          // 住宅ローン控除 適用額
  hlAvail: number;              // 住宅ローン控除 可能額
  hlIT: number;                 // 住宅ローン控除 所得税から
  hlRT: number;                 // 住宅ローン控除 住民税から
  // 年金統合課税の内訳
  pensionIncomeTax: number;     // 年金にかかる所得税
  pensionResidentTax: number;   // 年金にかかる住民税
  pensionDeduction: number;     // 公的年金等控除額
  pensionTaxableIncome: number; // 年金の雑所得（控除後）
}
// ===== 社会保険料の詳細計算 =====
interface SIBreakdown {
  total: number;       // 社保料合計
  pension: number;     // 厚生年金
  health: number;      // 健康保険
  nursing: number;     // 介護保険
  employment: number;  // 雇用保険
  childSupport: number; // 子ども・子育て支援金
  ratePct: number;     // 実効社保料率(%)（税計算用、DC控除前grossベース）
}

// ===== 退職後の社会保険料（国民健康保険・介護保険・後期高齢者医療）=====
// 退職後は厚生年金・雇用保険・子育て支援金はなし
// 国民健康保険: 所得割（前年所得ベース）+ 均等割。自治体差が大きいが概算で所得の約8-10%
// 75歳〜: 後期高齢者医療制度（所得割約8%+均等割）
// 介護保険（65歳〜）: 第1号被保険者。所得段階別だが概算で年金の約2%
const NHI_RATE = 0.10;              // 国民健康保険 概算所得割率（均等割込み）
const LATE_ELDERLY_RATE = 0.09;     // 後期高齢者医療 概算率
const NURSING_1ST_RATE = 0.02;      // 介護保険 第1号被保険者 概算率
const LATE_ELDERLY_AGE = 75;        // 後期高齢者医療 開始年齢

function calcSocialInsurance(gross: number, age: number, siParams?: SocialInsuranceParams, _fallbackSirPct?: number, pensionIncome: number = 0): SIBreakdown {
  // 在職中: 給与ベースで社保計算（常にsiParamsベース、未設定はデフォルト値）
  if (gross > 0) {
    const sp = siParams || DEFAULT_SI_PARAMS;
    const monthlyGross = gross / 12;
    const pensionBase = Math.min(monthlyGross, PENSION_MONTHLY_CAP);
    const pension = Math.round(pensionBase * (PENSION_INSURANCE_RATE / 100) * 12);
    const health = Math.round(gross * sp.healthInsuranceRate / 100);
    const nursing = (age >= NURSING_INSURANCE_MIN_AGE && age < NURSING_INSURANCE_MAX_AGE)
      ? Math.round(gross * sp.nursingInsuranceRate / 100) : 0;
    const childSupport = Math.round(gross * sp.childSupportRate / 100);
    const employment = Math.round(gross * EMPLOYMENT_INSURANCE_RATE / 100);
    const total = pension + health + nursing + employment + childSupport;
    const ratePct = gross > 0 ? total / gross * 100 : 0;
    return { total, pension, health, nursing, employment, childSupport, ratePct };
  }

  // 退職後: 年金収入ベースで国保/後期高齢者+介護
  if (pensionIncome <= 0) return { total: 0, pension: 0, health: 0, nursing: 0, employment: 0, childSupport: 0, ratePct: 0 };

  // 年金の雑所得をベースに算出
  const pensionDed = publicPensionDeduction(pensionIncome, age);
  const pensionTaxable = Math.max(pensionIncome - pensionDed, 0);
  // 基礎控除43万（住民税ベース）を差し引いた課税標準
  const taxBase = Math.max(pensionTaxable - 430000, 0);

  // 健康保険: 国保 or 後期高齢者
  const healthRate = age >= LATE_ELDERLY_AGE ? LATE_ELDERLY_RATE : NHI_RATE;
  const health = Math.round(taxBase * healthRate);

  // 介護保険: 65歳以上は第1号（年金天引き）、40-64は国保に含む
  const nursing = age >= 65 ? Math.round(taxBase * NURSING_1ST_RATE)
    : age >= NURSING_INSURANCE_MIN_AGE ? Math.round(taxBase * 0.02) : 0;

  const total = health + nursing;
  const ratePct = pensionIncome > 0 ? total / pensionIncome * 100 : 0;

  return { total, pension: 0, health, nursing, employment: 0, childSupport: 0, ratePct };
}

const ZERO_MEMBER_TAX: MemberTaxResult = {
  gross: 0, adjGross: 0, sir: 0, employeeDeduction: 0, incomeTax: 0, residentTax: 0, socialInsurance: 0,
  socialInsuranceDeduction: 0, siPension: 0, siHealth: 0, siNursing: 0, siEmployment: 0, siChildSupport: 0,
  dcContribution: 0, idecoContribution: 0, selfDCContribution: 0,
  incomeTaxSaving: 0, residentTaxSaving: 0, socialInsuranceSaving: 0,
  furusatoLimit: 0, furusatoDonation: 0, takeHome: 0,
  taxableIncome: 0, marginalRate: 0, hlDeduction: 0, hlAvail: 0, hlIT: 0, hlRT: 0,
  pensionIncomeTax: 0, pensionResidentTax: 0, pensionDeduction: 0, pensionTaxableIncome: 0,
};

function calcMemberTax(
  grossMan: number, sirPct: number,
  dcTotal: number, companyDC: number, idecoMonthly: number,
  hasFurusato: boolean, housingLoanDed: number,
  dependentDeductionTotal: number = 0,
  lifeInsuranceDed: number = 0,
  spouseDeductionAmount: number = 0,
  includeSISaving: boolean = false,
  age: number = 30,
  siParams?: SocialInsuranceParams,
  pensionIncome: number = 0,    // 公的年金収入（円/年）
): MemberTaxResult {
  const gross = grossMan * 10000;
  if (gross <= 0 && pensionIncome <= 0) return ZERO_MEMBER_TAX;

  const ds = Math.max(dcTotal - companyDC, 0);
  const aDS = ds * 12;
  const aI = idecoMonthly * 12;
  const aT = (dcTotal + idecoMonthly) * 12;
  const selfDC = ds * 12;
  // 社保計算: DC自己負担控除後のgrossで計算（DC選択制は社保の対象外）
  // 在職中: 給与ベースで社保計算。退職後: 年金ベースで国保+介護
  const adjGForSI = gross - aDS;
  const sib = calcSocialInsurance(adjGForSI, age, siParams, undefined, pensionIncome);
  const sir = sib.ratePct / 100;

  // 年金の雑所得 = 年金収入 - 公的年金等控除
  const pensionDed = pensionIncome > 0 ? publicPensionDeduction(pensionIncome, age) : 0;
  const pensionTaxable = Math.max(pensionIncome - pensionDed, 0);

  // 給与所得 + 雑所得(年金) を合算して総合課税
  // 給与所得控除・社保控除は給与のみに適用、公的年金等控除は年金のみに適用
  // 基礎控除48万・扶養控除・配偶者控除・生命保険料控除は合算所得に1回だけ適用
  const calcTaxBlockWithPension = (g: number, extraDeduction: number) => {
    // 給与所得 = 給与 − 給与所得控除 − 社保控除（在職中のみ）
    const siDeduction = g > 0 ? g * (sib.ratePct / 100) : 0;
    const salaryIncome = g > 0 ? Math.max(g - empDed(g) - siDeduction, 0) : 0;
    // 合算所得 = 給与所得 + 年金雑所得
    const totalIncome = salaryIncome + pensionTaxable;
    // 所得控除: 退職後の国保保険料も社会保険料控除の対象
    const retiredSIDeduction = g <= 0 ? sib.total : 0;
    const ti = Math.max(totalIncome - 480000 - retiredSIDeduction - dependentDeductionTotal - lifeInsuranceDed - extraDeduction - spouseDeductionAmount, 0);
    const fl = fLm(ti, mR(ti), housingLoanDed > 0 ? Math.min(Math.max(housingLoanDed - iTx(ti), 0), hlResidentCap(ti)) : 0);
    const furuDon = hasFurusato ? calcFurusatoDonation(fl) : 0;
    const fDed = hasFurusato ? Math.max(furuDon - 2000, 0) : 0;
    const tiaF = Math.max(ti - fDed, 0);
    const adj = apTxCr(iTx(tiaF), rTx(tiaF), housingLoanDed, tiaF);
    return { ti, fl, furuDon, fDed, tiaF, adj, salaryIncome, pensionTaxable };
  };

  const base = calcTaxBlockWithPension(gross, 0);
  const adjG = gross - aDS;
  const dc = calcTaxBlockWithPension(adjG, aI);

  const incomeTax = dc.adj.it;
  const residentTax = dc.adj.rt;
  const socialInsurance = sib.total;

  // 社保節約: DC自己負担分の社保料差額
  const sibBase = calcSocialInsurance(gross, age, siParams, undefined, pensionIncome);
  const siSv = includeSISaving ? sibBase.total - sib.total : 0;

  const itSv = base.adj.it - dc.adj.it;
  const rtSv = base.adj.rt - dc.adj.rt;

  // 手取り = 給与 + 年金 - 税 - 社保 - DC拠出
  const takeHome = gross + pensionIncome - incomeTax - residentTax - socialInsurance - selfDC - aI;

  // 年金による税の増加分 = 「給与+年金の合算税」−「給与のみの税」
  // 累進課税なので按分ではなく差額で正確に算出
  let pensionIT = 0, pensionRT = 0;
  if (pensionTaxable > 0) {
    // 年金なしの場合の税を計算
    const salaryOnly = (() => {
      const siDed2 = adjG > 0 ? adjG * (sib.ratePct / 100) : 0;
      const salaryIncome = adjG > 0 ? Math.max(adjG - empDed(adjG) - siDed2, 0) : 0;
      const ti = Math.max(salaryIncome - 480000 - dependentDeductionTotal - lifeInsuranceDed - aI - spouseDeductionAmount, 0);
      const fl = fLm(ti, mR(ti), housingLoanDed > 0 ? Math.min(Math.max(housingLoanDed - iTx(ti), 0), hlResidentCap(ti)) : 0);
      const fDed = hasFurusato ? Math.max((hasFurusato ? calcFurusatoDonation(fl) : 0) - 2000, 0) : 0;
      const tiaF = Math.max(ti - fDed, 0);
      return apTxCr(iTx(tiaF), rTx(tiaF), housingLoanDed, tiaF);
    })();
    pensionIT = Math.max(incomeTax - salaryOnly.it, 0);
    pensionRT = Math.max(residentTax - salaryOnly.rt, 0);
  }

  return {
    gross, adjGross: adjG, sir,
    employeeDeduction: Math.round(gross > 0 ? empDed(adjG) : 0),
    incomeTax, residentTax, socialInsurance,
    socialInsuranceDeduction: sib.total,
    siPension: sib.pension, siHealth: sib.health, siNursing: sib.nursing,
    siEmployment: sib.employment, siChildSupport: sib.childSupport,
    dcContribution: aT, idecoContribution: aI, selfDCContribution: selfDC,
    incomeTaxSaving: itSv, residentTaxSaving: rtSv, socialInsuranceSaving: siSv,
    furusatoLimit: dc.fl, furusatoDonation: dc.furuDon,
    takeHome, taxableIncome: Math.round(dc.tiaF), marginalRate: mR(dc.tiaF),
    hlDeduction: dc.adj.itUsed + dc.adj.rtUsed, hlAvail: housingLoanDed,
    hlIT: dc.adj.itUsed, hlRT: dc.adj.rtUsed,
    pensionIncomeTax: pensionIT, pensionResidentTax: pensionRT,
    pensionDeduction: pensionDed, pensionTaxableIncome: pensionTaxable,
  };
}

// ===== DC/iDeCo受取方法別の税計算 =====
// 一時金: 退職所得として課税（退職所得控除 → 1/2課税）
// 年金: 雑所得として毎年課税（公的年金等控除適用）
// 併用: 一部を一時金、残りを年金
import type { DCReceiveMethod, DCReceiveDetail } from "./types";

// DC/iDeCo受取税計算
// 年金受取の場合: DC内で運用継続しつつ分割受取。受取期間中も残高に利回りが適用される。
// netAmount = 一時金手取り + 年金受取の税引後総額（運用益込み）
function calcDCReceiveTax(
  dcAsset: number, otherRetirement: number, retirementDeduction: number,
  method: DCReceiveMethod, retirementAge: number, rr: number = 0
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

// ===== SimConfig: All resolved configuration for a scenario simulation =====
interface SimConfig {
  // Linked settings
  linked: boolean;
  base_: Scenario;
  currentAge: number;
  baseCalendarYear: number;
  selfRetirementAge: number;
  retirementAge: number;
  rr: number;
  r: number;
  sir: number;
  otherRet: number;
  selfGender: string;
  hasFuru: boolean;
  selfSIParams: SocialInsuranceParams | undefined;
  effectiveCurrentAssets: number;
  growthRate: number | undefined;
  effectiveDCReceiveMethod: DCReceiveMethod | undefined;
  effectiveYears: number;
  effectivePensionStartAge: number | undefined;
  effectivePensionWorkStartAge: number | undefined;
  effectiveDepHolder: "self" | "spouse" | undefined;
  // Keyframes
  incomeKF: Keyframe[];
  expenseKF: Keyframe[];
  dcTotalKF: Keyframe[];
  companyDCKF: Keyframe[];
  idecoKF: Keyframe[];
  // Events
  events: LifeEvent[];
  // Spouse / NISA / Balance policy
  spouse: SpouseConfig | undefined;
  nisaConfig: NISAConfig | undefined;
  bpConfig: BalancePolicy | undefined;
  // NISA limits
  selfNISAAnnualLimit: number;
  selfNISALifetimeLimit: number;
  spouseNISAAnnualLimit: number;
  spouseNISALifetimeLimit: number;
  // Rates
  dcRate: number;
  nisaReturnRate: number;
  taxableReturnRate: number;
  cashRate: number;
  // Balance policy resolved
  cashReserveMinMonths: number;
  cashReserveMaxMonths: number;
  nisaPriority: boolean;
  cashAnchors: { age: number; amountMan: number }[];
  // Spouse DC receive method
  spouseRM: DCReceiveMethod;
  // Inflation & macro slide
  effectiveInflation: number;
  inflation: number;
  macroSlideRate: number; // % per year (default -0.8)
  // Params pass-through
  defaultGrossMan: number;
  taxOpts: TaxOpts;
  housingLoanDed: number;
  PY: number;
  hasRet: boolean;
  retAmt: number;
}

// ===== SimState: Mutable accumulators for the year loop =====
interface SimState {
  cumulativeCash: number;
  selfDCAsset: number;
  spouseDCAsset: number;
  cumulativeReinvest: number;
  selfNISAAsset: number;
  spouseNISAAsset: number;
  selfNISACostBasis: number;
  spouseNISACostBasis: number;
  cumulativeTaxable: number;
  cumulativeTaxableCost: number;
  cumulativeSalary: number;
  salaryYears: number;
  spouseCumulativeSalary: number;
  spouseSalaryYears: number;
  totalC: number;
  totalPensionLoss: number;
  // DC受取実績の累積（総括表示用）
  selfDCReceivedLumpSum: number;
  selfDCReceivedAnnuityTotal: number;
  selfDCReceivedTax: number;
  spouseDCReceivedLumpSum: number;
  spouseDCReceivedAnnuityTotal: number;
  spouseDCReceivedTax: number;
}

function initSimState(effectiveCurrentAssets: number): SimState {
  return {
    cumulativeCash: effectiveCurrentAssets * 10000,
    selfDCAsset: 0,
    spouseDCAsset: 0,
    cumulativeReinvest: 0,
    selfNISAAsset: 0,
    spouseNISAAsset: 0,
    selfNISACostBasis: 0,
    spouseNISACostBasis: 0,
    cumulativeTaxable: 0,
    cumulativeTaxableCost: 0,
    cumulativeSalary: 0,
    salaryYears: 0,
    spouseCumulativeSalary: 0,
    spouseSalaryYears: 0,
    totalC: 0,
    totalPensionLoss: 0,
    selfDCReceivedLumpSum: 0,
    selfDCReceivedAnnuityTotal: 0,
    selfDCReceivedTax: 0,
    spouseDCReceivedLumpSum: 0,
    spouseDCReceivedAnnuityTotal: 0,
    spouseDCReceivedTax: 0,
  };
}

// ===== resolveEvents: Merge base/own events + housing timeline synthesis =====
function resolveEvents(
  s: Scenario, linked: boolean, base_: Scenario, baseScenario: Scenario | null | undefined,
  settingLinked: (key: string) => boolean,
): LifeEvent[] {
  const disabledBaseIds = s.disabledBaseEventIds || [];
  const baseEvents = (linked) ? (baseScenario!.events || []).filter(e => !(s.excludedBaseEventIds || []).includes(e.id))
    .map(e => disabledBaseIds.includes(e.id) ? { ...e, disabled: true } : e) : [];
  const ownEvents = s.events || [];
  let events = [...baseEvents, ...ownEvents].sort((a, b) => a.age - b.age);

  // 住居タイムライン: housingTimelineが有効なら既存の住居系イベントを除外し、合成イベントに置換
  const housingTimeline = s.housingTimeline || (linked ? base_.housingTimeline : undefined);
  if (housingTimeline && housingTimeline.length > 0) {
    // 既存の rent/property/relocation イベントを除外
    events = events.filter(e => e.type !== "rent" && e.type !== "property" && e.type !== "relocation");
    // フェーズから合成イベントを生成
    const simEnd = (settingLinked("simEndAge") ? base_.simEndAge : s.simEndAge) ?? 85;
    for (let pi = 0; pi < housingTimeline.length; pi++) {
      const phase = housingTimeline[pi];
      const nextPhase = pi < housingTimeline.length - 1 ? housingTimeline[pi + 1] : null;
      const endAge = nextPhase ? nextPhase.startAge : simEnd;
      const syntheticId = -(pi + 1) * 1000; // 負のIDで合成イベントを識別

      if (phase.type === "rent") {
        events.push({
          id: syntheticId, age: phase.startAge, type: "rent",
          label: `家賃(${phase.rentMonthlyMan ?? 0}万/月)`,
          oneTimeCostMan: 0, annualCostMan: (phase.rentMonthlyMan ?? 0) * 12,
          durationYears: endAge - phase.startAge,
        });
      } else if (phase.type === "own" && phase.propertyParams) {
        const pp = { ...phase.propertyParams };
        // 次フェーズがあれば売却年齢を設定
        if (nextPhase) pp.saleAge = endAge;
        events.push({
          id: syntheticId, age: phase.startAge, type: "property",
          label: `住宅(${pp.priceMan}万)`,
          oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
          propertyParams: pp,
        });
      }
      // フェーズ遷移時の引越費用（2フェーズ目以降）
      if (pi > 0) {
        events.push({
          id: syntheticId - 500, age: phase.startAge, type: "custom",
          label: "引越費用", oneTimeCostMan: 50, annualCostMan: 0, durationYears: 0,
        });
      }
    }
    events.sort((a, b) => a.age - b.age);
  }

  return events;
}

// ===== resolveSimConfig: Resolve all configuration for a scenario simulation =====
function resolveSimConfig(s: Scenario, base: BaseResult, params: CalcParams, baseScenario?: Scenario | null): SimConfig {
  const { defaultGrossMan, rr: globalRR, sirPct, hasRet, retAmt, PY, taxOpts, housingLoanDed } = params;

  // Linked settings resolution (must be before age resolution)
  const linked = !!(s.linkedToBase && baseScenario);
  const base_ = linked ? baseScenario! : s;
  const overSet = s.overrideSettings || [];
  const settingLinked = (key: string) => linked && !overSet.includes(key as any);

  // 年齢はシナリオから取得（retirementAgeはsimEndAgeの意味で使う）
  const currentAge = (settingLinked("currentAge") ? base_.currentAge : s.currentAge) ?? params.currentAge;
  const baseCalendarYear = new Date().getFullYear(); // 暦年基準（年齢→暦年変換用）
  const selfRetirementAge = (settingLinked("retirementAge") ? base_.retirementAge : s.retirementAge) ?? 65;
  const retirementAge = (settingLinked("simEndAge") ? base_.simEndAge : s.simEndAge) ?? params.retirementAge;
  // 利回り・インフレ: シナリオ値 → リンク時はA値 → 共通設定
  const rr = (settingLinked("rr") ? (base_.rr ?? globalRR) : (s.rr ?? globalRR));
  const r = rr / 100;
  const sir = sirPct / 100;
  const otherRet = hasRet ? retAmt : 0;

  const selfGender = (settingLinked("selfGender") ? base_.selfGender : s.selfGender) || "male";
  const hasFuru = !!(linked ? base_.hasFurusato : s.hasFurusato);
  const selfSIParams: SocialInsuranceParams | undefined = s.siParams || (linked ? base_.siParams : undefined);
  const effectiveCurrentAssets = settingLinked("currentAssetsMan") ? base_.currentAssetsMan : s.currentAssetsMan;
  const growthRate = linked && !s.overrideTracks.includes("incomeKF" as any)
    ? base_.salaryGrowthRate : s.salaryGrowthRate;
  const effectiveDCReceiveMethod = s.dcReceiveMethod || (linked ? base_.dcReceiveMethod : undefined);
  const effectiveYears = settingLinked("years") ? base_.years : s.years;
  const effectivePensionStartAge = settingLinked("pensionStartAge") ? (base_.pensionStartAge ?? s.pensionStartAge) : s.pensionStartAge;
  const effectivePensionWorkStartAge = settingLinked("pensionWorkStartAge") ? (base_.pensionWorkStartAge ?? s.pensionWorkStartAge) : s.pensionWorkStartAge;
  const effectiveDepHolder = settingLinked("dependentDeductionHolder") ? (base_.dependentDeductionHolder || s.dependentDeductionHolder) : s.dependentDeductionHolder;

  const incomeKF: Keyframe[] = getEffective(s, "incomeKF", baseScenario) || [];
  const expenseKF: Keyframe[] = getEffective(s, "expenseKF", baseScenario) || [];
  const dcTotalKF: Keyframe[] = getEffective(s, "dcTotalKF", baseScenario) || [];
  const companyDCKF: Keyframe[] = getEffective(s, "companyDCKF", baseScenario) || [];
  const idecoKF: Keyframe[] = getEffective(s, "idecoKF", baseScenario) || [];

  const events = resolveEvents(s, linked, base_, baseScenario, settingLinked);

  // Spouse: use own if enabled, else inherit from base (with per-track overrides)
  const rawSpouse: SpouseConfig | undefined =
    s.spouse?.enabled ? s.spouse
    : linked && base_.spouse?.enabled ? base_.spouse
    : undefined;
  // Apply per-track overrides: if spouseOverrideTracks has a track, use s.spouse's data for it
  const spouseOT = s.spouseOverrideTracks || [];
  const spouse: SpouseConfig | undefined = rawSpouse && linked && !s.spouse?.enabled && s.spouse && spouseOT.length > 0
    ? { ...rawSpouse, ...Object.fromEntries(spouseOT.map(k => [k, (s.spouse as any)?.[k] || []])),
        ...(s.spouse.dcReceiveMethod ? { dcReceiveMethod: s.spouse.dcReceiveMethod } : {}) }
    : rawSpouse;

  // NISA: use own if enabled, else inherit from base
  const nisaConfig: NISAConfig | undefined =
    s.nisa?.enabled ? s.nisa
    : linked && base_.nisa?.enabled ? base_.nisa
    : undefined;

  // Balance policy: merge own with base (own overrides, but inherit missing fields like cashAnchors)
  const baseBP = linked ? base_.balancePolicy : undefined;
  const bpConfig = s.balancePolicy
    ? { ...baseBP, ...s.balancePolicy, cashAnchors: s.balancePolicy.cashAnchors ?? baseBP?.cashAnchors, cashReserveMaxMonths: s.balancePolicy.cashReserveMaxMonths ?? baseBP?.cashReserveMaxMonths, withdrawalOrder: s.balancePolicy.withdrawalOrder ?? baseBP?.withdrawalOrder }
    : baseBP;

  // NISA config — 個人別に枠を管理
  const nisa: NISAConfig | undefined = nisaConfig;
  const nisaAccounts = nisa ? (nisa.accounts || 1) : 1;
  // Phase 3: 個別資産クラス利回り（リンク時はベースの値を参照）
  const dcRate = (s.dcReturnRate ?? (linked ? base_.dcReturnRate : undefined) ?? rr) / 100;
  const nisaReturnRate = (s.nisaReturnRate ?? (linked ? base_.nisaReturnRate : undefined) ?? rr) / 100;
  const taxableReturnRate = (s.taxableReturnRate ?? (linked ? base_.taxableReturnRate : undefined) ?? rr) / 100;
  const cashRate = (s.cashInterestRate ?? (linked ? base_.cashInterestRate : undefined) ?? 0) / 100;
  // 本人NISA枠
  const selfNISAAnnualLimit = nisa ? nisa.annualLimitMan * 10000 : 0;
  const selfNISALifetimeLimit = nisa ? nisa.lifetimeLimitMan * 10000 : 0;
  // 配偶者NISA枠（2口座の場合）
  const spouseNISAAnnualLimit = nisa && nisaAccounts === 2 ? (nisa.spouseAnnualLimitMan ?? nisa.annualLimitMan) * 10000 : 0;
  const spouseNISALifetimeLimit = nisa && nisaAccounts === 2 ? (nisa.spouseLifetimeLimitMan ?? nisa.lifetimeLimitMan) * 10000 : 0;

  // Balance policy
  const bp: BalancePolicy | undefined = bpConfig;
  const cashReserveMinMonths = bp ? bp.cashReserveMonths : 6;
  const cashReserveMaxMonths = bp?.cashReserveMaxMonths ?? cashReserveMinMonths;
  const nisaPriority = bp ? bp.nisaPriority : (nisa ? true : false);
  const cashAnchors = bp?.cashAnchors?.filter(a => a.amountMan > 0).sort((a, b) => a.age - b.age) || [];

  // 配偶者DC受取方法
  const spouseRM = spouse?.dcReceiveMethod || DEFAULT_DC_RECEIVE_METHOD;

  const effectiveInflation = settingLinked("inflationRate") ? (base_.inflationRate ?? params.inflationRate) : (s.inflationRate ?? params.inflationRate);
  const inflation = effectiveInflation / 100;
  const macroSlideRate = settingLinked("macroSlideRate") ? (base_.macroSlideRate ?? -0.8) : (s.macroSlideRate ?? -0.8);

  return {
    linked, base_, currentAge, baseCalendarYear, selfRetirementAge, retirementAge,
    rr, r, sir, otherRet, selfGender, hasFuru, selfSIParams,
    effectiveCurrentAssets, growthRate, effectiveDCReceiveMethod, effectiveYears,
    effectivePensionStartAge, effectivePensionWorkStartAge, effectiveDepHolder,
    incomeKF, expenseKF, dcTotalKF, companyDCKF, idecoKF,
    events, spouse, nisaConfig, bpConfig,
    selfNISAAnnualLimit, selfNISALifetimeLimit, spouseNISAAnnualLimit, spouseNISALifetimeLimit,
    dcRate, nisaReturnRate, taxableReturnRate, cashRate,
    cashReserveMinMonths, cashReserveMaxMonths, nisaPriority, cashAnchors,
    spouseRM, effectiveInflation, inflation, macroSlideRate,
    defaultGrossMan, taxOpts, housingLoanDed, PY, hasRet, retAmt,
  };
}

// ===== phaseDeductions: Dependent deduction, child allowance, insurance/housing prescan =====
interface DeductionInfo {
  childEvents: LifeEvent[];
  dependentDeductionTotal: number;
  childAllowance: number;
  selfDepDed: number;
  spouseDepDed: number;
  preSpouseInsPremium: number;
  preSpouseLifeInsDed: number;
  preSpouseHLDed: number;
}

function phaseDeductions(ctx: YearContext, config: SimConfig, ageInfo: AgeEventInfo): DeductionInfo {
  const { age, isEffDisabled, events } = ctx;
  const { taxOpts, effectiveDepHolder } = config;
  const { isSelfDead, isSpouseDead } = ageInfo;

  const childEvents = events.filter(e => !isEffDisabled(e) && e.type === "child" && isEventActive(e, age, events));
  let dependentDeductionTotal = 0;
  for (const ce of childEvents) {
    const childBirthAge = resolveEventAge(ce, events);
    const childAge = age - childBirthAge;
    dependentDeductionTotal += dependentDeductionForChild(childAge);
  }
  dependentDeductionTotal += Math.max(taxOpts.dependentsCount, 0) * DEPENDENT_DEDUCTION_GENERAL;

  let childAllowance = 0;
  childEvents.forEach((ce, ci) => {
    const childBirthAge = resolveEventAge(ce, events);
    const childAge = age - childBirthAge;
    childAllowance += childAllowanceMonthly(childAge, ci) * 12;
  });

  let depHolder: "self" | "spouse" = effectiveDepHolder || "self";
  if (depHolder === "self" && isSelfDead && !isSpouseDead) depHolder = "spouse";
  if (depHolder === "spouse" && isSpouseDead && !isSelfDead) depHolder = "self";
  const selfDepDed = depHolder === "self" ? dependentDeductionTotal : 0;
  const spouseDepDed = depHolder === "spouse" ? dependentDeductionTotal : 0;

  const preSpouseInsPremium = prescanInsurancePremium("spouse", events, age, isSpouseDead, isEffDisabled);
  const preSpouseLifeInsDed = calcLifeInsuranceDeduction(preSpouseInsPremium);
  const preSpouseHLDed = prescanHousingLoanDeduction("spouse", events, age, isEffDisabled);

  return {
    childEvents, dependentDeductionTotal, childAllowance,
    selfDepDed, spouseDepDed,
    preSpouseInsPremium, preSpouseLifeInsDed, preSpouseHLDed,
  };
}

// ===== phaseCashFlow: Compute take-home pay, net cash flow, DC growth, property sale, cash interest =====
interface CashFlowResult {
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

function phaseCashFlow(
  state: SimState,
  config: SimConfig,
  selfTaxResult: MemberTaxResult,
  spouseTaxResult: MemberTaxResult,
  selfPensionIncome: number,
  spousePensionIncome: number,
  totalExpense: number,
  childAllowance: number,
  survivorIncome: number,
  insurancePayoutTotal: number,
  propertySaleProceeds: number,
  spouseDCTotal: number,
): CashFlowResult {
  const { dcRate, cashRate } = config;
  const st = selfTaxResult;
  const aT = st.dcContribution;
  const aBen = st.incomeTaxSaving + st.residentTaxSaving + st.socialInsuranceSaving;
  const selfFuruDed = st.furusatoDonation > 0 ? Math.max(st.furusatoDonation - 2000, 0) : 0;

  const pensionTax = st.pensionIncomeTax + st.pensionResidentTax + spouseTaxResult.pensionIncomeTax + spouseTaxResult.pensionResidentTax;

  const takeHomePay = st.takeHome + childAllowance + survivorIncome + spouseTaxResult.takeHome + insurancePayoutTotal;
  const pensionLossAnnual = (st.selfDCContribution / 12 * PENSION_RATE_PER_MILLE) / 1000 * 12;
  const spousePensionLossAnnual = config.spouse ? (spouseTaxResult.selfDCContribution / 12 * PENSION_RATE_PER_MILLE) / 1000 * 12 : 0;
  const annualNetCashFlow = takeHomePay - totalExpense;

  // Property sale proceeds
  if (propertySaleProceeds !== 0) state.cumulativeCash += propertySaleProceeds;

  // Cash interest
  if (cashRate > 0 && state.cumulativeCash > 0) state.cumulativeCash = Math.round(state.cumulativeCash * (1 + cashRate));

  // DC asset growth
  state.selfDCAsset = state.selfDCAsset * (1 + dcRate) + aT;
  state.spouseDCAsset = state.spouseDCAsset * (1 + dcRate) + spouseDCTotal;
  const cumulativeDCAsset = state.selfDCAsset + state.spouseDCAsset;
  // DC節税分は現金に加算（再投資は目安として複利計算のみ維持）
  state.cumulativeReinvest = state.cumulativeReinvest * (1 + dcRate) + aBen;

  return {
    aT, aBen, selfFuruDed, pensionTax,
    takeHomePay, pensionLossAnnual, spousePensionLossAnnual,
    annualNetCashFlow, cumulativeDCAsset,
  };
}

// ===== phaseDeathInheritance: Handle death inheritance, NISA liquidation, asset returns, and crash =====
interface DeathInheritanceResult {
  inheritanceTax: number;
  inheritanceEstate: number;
  crashLoss: number;
  crashDetail: string;
  cumulativeDCAsset: number;
}

function phaseDeathInheritance(
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
  const { age, events, isEffDisabled } = ctx;
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

  // Recovery rate overrides from crash events
  let yearNisaRate = nisaReturnRate;
  let yearTaxRate = taxableReturnRate;
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

// ===== phaseRebalance: NISA/taxable contribution/withdrawal and cash reserve management =====
interface RebalanceOutput {
  nisaContribution: number;
  selfNISAContribution: number;
  spouseNISAContribution: number;
  taxableContribution: number;
  nisaWithdrawal: number;
  taxableWithdrawal: number;
}

function phaseRebalance(
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

// ===== phaseDCReception: DC/iDeCo reception at start age =====
interface DCReceptionOutput {
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

function phaseDCReception(
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

// ===== assembleYearResult: Construct YearResult from all phase outputs =====
function assembleYearResult(
  age: number, state: SimState, config: SimConfig,
  grownGrossMan: number, gross: number,
  baseLivingExpense: number, eventOnetime: number, eventOngoing: number, totalExpense: number,
  selfTaxResult: MemberTaxResult, spouseTaxResult: MemberTaxResult,
  cashFlow: CashFlowResult, deathResult: DeathInheritanceResult,
  rebalance: RebalanceOutput, dcReception: DCReceptionOutput,
  selfPensionIncome: number, spousePensionIncome: number,
  dedInfo: DeductionInfo,
  spouseDedAmount: number, hlDed: number, pensionReduction: number,
  selfLifeInsDed: number, preSpouseLifeInsDed: number,
  dcTotal: number, companyDC: number, idecoMonthly: number,
  loanBalance: number, selfLoanBalance: number, spouseLoanBalance: number,
  insurancePremiumTotal: number, insurancePayoutTotal: number,
  propertySaleProceeds: number, propertyCapitalGainsTax: number, giftTax: number,
  survivorIncome: number, survivorBasicPension: number, survivorEmployeePension: number,
  survivorWidowSupplement: number, survivorIncomeProtection: number,
  activeEvts: LifeEvent[], propertyFixedCostEvts: LifeEvent[],
  eventCostBreakdown: EventYearCost[],
  spouseAge: number,
): YearResult {
  const TAXABLE_TAX_RATE = TAXABLE_ACCOUNT_TAX_RATE;
  const st = selfTaxResult;
  const sp = spouseTaxResult;
  const { aT, aBen, selfFuruDed, pensionTax, takeHomePay, pensionLossAnnual, spousePensionLossAnnual, annualNetCashFlow, cumulativeDCAsset } = cashFlow;
  const { inheritanceTax, inheritanceEstate, crashLoss, crashDetail } = deathResult;
  const { nisaContribution, selfNISAContribution, spouseNISAContribution, taxableContribution, nisaWithdrawal, taxableWithdrawal } = rebalance;
  const { dcReceiveTax, selfDCReceiveTax, spouseDCReceiveTax, selfDCReceiveLumpSum, spouseDCReceiveLumpSum, selfDCReceiveAnnuityAnnual, spouseDCReceiveAnnuityAnnual, selfDCRetirementDeduction, spouseDCRetirementDeduction } = dcReception;
  const { childEvents, dependentDeductionTotal, childAllowance, selfDepDed, spouseDepDed } = dedInfo;

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
    childCount: childEvents.length, dependentDeduction: dependentDeductionTotal, childAllowance,
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

// ===== assembleFinalResult: Construct ScenarioResult from year results and state =====
function assembleFinalResult(
  s: Scenario, state: SimState, yearResults: YearResult[], config: SimConfig,
  cumulativeDCAsset: number,
): ScenarioResult {
  const { effectiveDCReceiveMethod, effectiveYears, effectiveCurrentAssets, otherRet, rr, retirementAge, spouse, spouseRM, hasFuru, dcTotalKF, idecoKF, incomeKF } = config;

  const assetFV = cumulativeDCAsset;
  const fvB = state.cumulativeReinvest;
  const lPL = state.totalPensionLoss * config.PY;
  const dcRetDed = rDed(effectiveYears);

  // DC受取の総括: シミュレーション中の実績 + 残存DC資産の理論受取を合算
  const rmFinal = effectiveDCReceiveMethod || DEFAULT_DC_RECEIVE_METHOD;

  // 残存DC（年金部分の未受取分 or 退職後の再積立分）は一時金として受け取ると仮定
  const selfRemainingDCDetail = state.selfDCAsset > 0
    ? calcDCReceiveTax(state.selfDCAsset, otherRet, dcRetDed, { type: "lump_sum", annuityYears: 20, annuityStartAge: 65 }, retirementAge, rr)
    : { totalTax: 0, netAmount: 0, lumpSumAmount: 0, lumpSumTax: 0, annuityAnnual: 0, annuityTotalTax: 0, annuityYears: 0, annuityStartAge: 0, method: "一時金" as const };

  const dcReceiveDetail: import("./types").DCReceiveDetail = {
    method: rmFinal.type === "lump_sum" ? "一時金" : rmFinal.type === "annuity" ? `年金(${rmFinal.annuityYears || 20}年)` : `併用(一時金${rmFinal.combinedLumpSumRatio || 50}%)`,
    lumpSumAmount: state.selfDCReceivedLumpSum + selfRemainingDCDetail.lumpSumAmount,
    lumpSumTax: state.selfDCReceivedTax + selfRemainingDCDetail.lumpSumTax,
    annuityAnnual: 0, annuityTotalTax: 0, annuityYears: 0, annuityStartAge: 0,
    totalTax: state.selfDCReceivedTax + selfRemainingDCDetail.totalTax,
    netAmount: (state.selfDCReceivedLumpSum - state.selfDCReceivedTax) + state.selfDCReceivedAnnuityTotal + selfRemainingDCDetail.netAmount,
  };

  let spouseDCReceiveDetail: import("./types").DCReceiveDetail | undefined;
  if ((state.spouseDCAsset > 0 || state.spouseDCReceivedLumpSum > 0) && spouse) {
    const spContribYears = yearResults.filter(yr => yr.spouse.dcContribution > 0).length;
    const spYears = spContribYears > 0 ? spContribYears : effectiveYears;
    const spRetDed = rDed(spYears);
    const spRemainingDCDetail = state.spouseDCAsset > 0
      ? calcDCReceiveTax(state.spouseDCAsset, 0, spRetDed, { type: "lump_sum", annuityYears: 20, annuityStartAge: 65 }, retirementAge, rr)
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

// ===== phasePension: Compute public pension income and self working pension reduction =====
interface PensionResult {
  selfPensionIncome: number;
  selfPensionEmployeeAnnual: number;
  spousePensionIncome: number;
  spousePensionEmployeeAnnual: number;
  selfPensionReduction: number;
}

function calcPublicPensionForMember(
  isDead: boolean, currentAge: number, startAge: number, workStartAge: number,
  retAge: number, cumSalary: number, years: number,
  pensionSlideFactor: number,
): { income: number; employeeAnnual: number; detail: string } {
  if (isDead || currentAge < startAge) return { income: 0, employeeAnnual: 0, detail: "" };
  const avg = years > 0 ? cumSalary / years : 0;
  const empMonths = Math.max(Math.min(retAge, 65) - workStartAge, 0) * 12;
  const natMonths = Math.min((65 - 20) * 12, 480);
  const pe = estimatePublicPension(avg, empMonths, natMonths, startAge);
  // マクロ経済スライド適用: 受給開始からの累積調整
  const adjusted = Math.round(pe.totalAnnual * pensionSlideFactor);
  const adjEmployee = Math.round(pe.employeeAnnual * pe.adjustmentFactor * pensionSlideFactor);
  return { income: adjusted, employeeAnnual: adjEmployee, detail: pe.detail };
}

function applyWorkingPensionReduction(pensionEmployeeAnnual: number, grossIncome: number): number {
  if (pensionEmployeeAnnual <= 0 || grossIncome <= 0) return 0;
  const basicMonthly = pensionEmployeeAnnual / 12;
  const salaryMonthly = grossIncome / 12;
  if (basicMonthly + salaryMonthly > WORKING_PENSION_THRESHOLD) {
    const monthlyReduction = (basicMonthly + salaryMonthly - WORKING_PENSION_THRESHOLD) / 2;
    return Math.min(monthlyReduction * 12, pensionEmployeeAnnual);
  }
  return 0;
}

/** マクロ経済スライド累積係数を計算
 *  毎年の改定率 = max(0, 物価上昇率 + マクロスライド調整率) — 名目下限ルール
 *  インフレ率が一定の場合、yearsReceiving年後の累積係数 = (1 + adjRate)^yearsReceiving */
function pensionMacroSlideFactor(yearsReceiving: number, inflationPct: number, macroSlidePct: number): number {
  if (yearsReceiving <= 0) return 1;
  const annualAdj = Math.max(0, inflationPct / 100 + macroSlidePct / 100);
  return Math.pow(1 + annualAdj, yearsReceiving);
}

function phasePension(
  age: number, selfGross: number, state: SimState, config: SimConfig, ageInfo: AgeEventInfo,
): PensionResult {
  const { isSelfDead, isSpouseDead, spouseAge } = ageInfo;
  const { spouse, selfRetirementAge, effectivePensionStartAge, effectivePensionWorkStartAge, effectiveInflation, macroSlideRate } = config;

  const selfStartAge = effectivePensionStartAge ?? 65;
  const selfSlideFactor = pensionMacroSlideFactor(age - selfStartAge, effectiveInflation, macroSlideRate);
  const selfPen = calcPublicPensionForMember(
    isSelfDead, age, selfStartAge, effectivePensionWorkStartAge ?? 22,
    selfRetirementAge, state.cumulativeSalary, state.salaryYears, selfSlideFactor,
  );

  const spStartAge = spouse?.pensionStartAge ?? 65;
  const spSlideFactor = pensionMacroSlideFactor(spouseAge - spStartAge, effectiveInflation, macroSlideRate);
  const spPen = spouse
    ? calcPublicPensionForMember(
        isSpouseDead, spouseAge, spStartAge, spouse.pensionWorkStartAge ?? 22,
        spouse.retirementAge ?? 65, state.spouseCumulativeSalary, state.spouseSalaryYears, spSlideFactor,
      )
    : { income: 0, employeeAnnual: 0, detail: "" };

  // Self working pension reduction
  const selfReduction = applyWorkingPensionReduction(selfPen.employeeAnnual, selfGross);

  return {
    selfPensionIncome: selfPen.income - selfReduction,
    selfPensionEmployeeAnnual: selfPen.employeeAnnual,
    spousePensionIncome: spPen.income,
    spousePensionEmployeeAnnual: spPen.employeeAnnual,
    selfPensionReduction: selfReduction,
  };
}

// ===== phaseMemberIncome: Symmetric self/spouse salary computation =====
function phaseMemberIncome(
  isDead: boolean, retired: boolean, age: number,
  incomeKF: Keyframe[], growthRate: number | undefined, defaultGrossMan: number,
): { gross: number; grownGrossMan: number } {
  if (isDead || retired) return { gross: 0, grownGrossMan: 0 };
  const grossManBase = resolveKF(incomeKF, age, defaultGrossMan);
  let growthYears = 0;
  for (let ki = incomeKF.length - 1; ki >= 0; ki--) {
    if (incomeKF[ki].age <= age) { growthYears = age - incomeKF[ki].age; break; }
  }
  const grownGrossMan = grossManBase * Math.pow(1 + (growthRate || 0) / 100, growthYears);
  return { gross: grownGrossMan * 10000, grownGrossMan };
}

// ===== AgeEventInfo: Death/retirement detection for a given year =====
interface AgeEventInfo {
  isSelfDead: boolean;
  isSpouseDead: boolean;
  isDeathYear: boolean;
  isSpouseDeathYear: boolean;
  selfDeathEvent?: LifeEvent;
  spouseDeathEvent?: LifeEvent;
  deathEvent?: LifeEvent;
  dp?: DeathParams;
  deathAge: number;
  isDead: boolean;
  selfRetired: boolean;
  spouseAge: number;
  spouseRetired: boolean;
}

function phaseAgeEvents(ctx: YearContext, config: SimConfig): AgeEventInfo {
  const { age, yearsFromStart, isEffDisabled, events } = ctx;
  const selfDeathEvent = events.find(e => !isEffDisabled(e) && e.type === "death" && e.deathParams && (e.target || "self") === "self" && age >= resolveEventAge(e, events));
  const spouseDeathEvent = events.find(e => !isEffDisabled(e) && e.type === "death" && e.deathParams && e.target === "spouse" && age >= resolveEventAge(e, events));
  const isSelfDead = !!selfDeathEvent;
  const isSpouseDead = !!spouseDeathEvent;
  const deathEvent = selfDeathEvent;
  const isDead = isSelfDead;
  const dp = deathEvent?.deathParams;
  const deathAge = deathEvent ? resolveEventAge(deathEvent, events) : 0;
  const isDeathYear = !!(deathEvent && age === deathAge);
  const isSpouseDeathYear = !!(spouseDeathEvent && age === resolveEventAge(spouseDeathEvent, events));
  const selfRetired = age >= config.selfRetirementAge;
  const spouseAge = config.spouse ? config.spouse.currentAge + yearsFromStart : 0;
  const spouseRetired = config.spouse ? spouseAge >= (config.spouse.retirementAge ?? 65) : false;
  return {
    isSelfDead, isSpouseDead, isDeathYear, isSpouseDeathYear,
    selfDeathEvent, spouseDeathEvent, deathEvent, dp, deathAge, isDead,
    selfRetired, spouseAge, spouseRetired,
  };
}

// ===== YearContext: Per-year computed values that don't depend on previous phases =====
interface YearContext {
  age: number;
  yearsFromStart: number;
  inflationFactor: number;
  baseCalendarYear: number;
  isEffDisabled: (e: LifeEvent) => boolean;
  events: LifeEvent[];
  config: SimConfig;
}

function buildYearContext(age: number, config: SimConfig, events: LifeEvent[]): YearContext {
  const yearsFromStart = age - config.currentAge;
  const inflationFactor = Math.pow(1 + config.inflation, yearsFromStart);
  const isEffDisabled = (e: LifeEvent) => !!e.disabled || (e.parentId != null && !!events.find(p => p.id === e.parentId)?.disabled);
  return {
    age, yearsFromStart, inflationFactor,
    baseCalendarYear: config.baseCalendarYear,
    isEffDisabled, events, config,
  };
}

// ===== phaseEventCosts: Single-pass event cost dispatcher =====
interface EventCostOutput {
  eventOngoing: number;
  eventOnetime: number;
  eventCostBreakdown: EventYearCost[];
  baseLivingExpense: number;
  totalExpense: number;
  insurancePremiumTotal: number;
  insurancePremiumSelf: number;
  insurancePremiumSpouse: number;
  insurancePayoutTotal: number;
  propertySaleProceeds: number;
  propertyCapitalGainsTax: number;
  giftTax: number;
  loanBalance: number;
  selfLoanBalance: number;
  spouseLoanBalance: number;
  yearHousingLoanDed: number;
  yearHousingLoanDedSpouse: number;
  activeEvts: LifeEvent[];
  propertyFixedCostEvts: LifeEvent[];
}

function phaseEventCosts(
  ctx: YearContext, config: SimConfig, ageInfo: AgeEventInfo
): EventCostOutput {
  const { age, inflationFactor, isEffDisabled, events } = ctx;
  const { isSelfDead, isSpouseDead, isDeathYear, isSpouseDeathYear, selfDeathEvent, spouseDeathEvent, dp, isDead } = ageInfo;

  // Accumulators
  let eventOngoing = 0;
  let eventOnetime = 0;
  const eventCostBreakdown: EventYearCost[] = [];
  let propertySaleProceeds = 0;
  let propertyCapitalGainsTax = 0;
  let giftTax = 0;
  let insurancePremiumTotal = 0;
  let insurancePremiumSelf = 0;
  let insurancePremiumSpouse = 0;
  let insurancePayoutTotal = 0;
  let loanBalance = 0;
  let selfLoanBalance = 0;
  let spouseLoanBalance = 0;

  // 団信カバー率の計算（プロパティイベント共通）
  const calcDanshinCover = (pp: PropertyParams) => {
    const dTarget = pp.danshinTarget || "self";
    const selfDP = selfDeathEvent?.deathParams;
    const spouseDP = spouseDeathEvent?.deathParams;
    const isPair = pp.loanStructure === "pair";
    const sRatio = isPair ? (pp.pairRatio ?? 50) / 100 : 1;
    let cover = 0;
    if (isSelfDead && selfDP?.hasDanshin && (dTarget === "self" || dTarget === "both")) cover += sRatio;
    if (isSpouseDead && (spouseDP?.hasDanshin || selfDP?.hasDanshin) && (dTarget === "spouse" || dTarget === "both")) cover += isPair ? 1 - sRatio : 0;
    return Math.min(cover, 1);
  };

  // 管理費・固定資産税の計上ヘルパー
  const addPropertyFixedCosts = (ppx: PropertyParams) => {
    if (ppx.maintenanceMonthlyMan > 0) {
      const amt = Math.round(ppx.maintenanceMonthlyMan * 12 * 10000 * inflationFactor);
      eventCostBreakdown.push({ label: "管理費・修繕", icon: "🔧", color: "#64748b", amount: amt });
      eventOngoing += amt;
    }
    if (ppx.taxAnnualMan > 0) {
      const amt = Math.round(ppx.taxAnnualMan * 10000 * inflationFactor);
      eventCostBreakdown.push({ label: "固定資産税", icon: "🏛️", color: "#64748b", amount: amt });
      eventOngoing += amt;
    }
  };

  // Classify events
  const activeEvts = events.filter(e => !isEffDisabled(e) && isEventActive(e, age, events));
  const propertyFixedCostEvts = events.filter(e => !isEffDisabled(e) && e.propertyParams && !isEventActive(e, age, events) && age >= resolveEventAge(e, events));
  const onetimeEvts = events.filter(e => !isEffDisabled(e) && resolveEventAge(e, events) === age);

  // --- Main loop over active events: type-based dispatch ---
  for (const e of activeEvts) {
    const eAge = resolveEventAge(e, events);
    const yearsSince = age - eAge;

    if (e.propertyParams) {
      // === Property event ===
      const pp = e.propertyParams;

      // Check property sale
      if (pp.saleAge != null && age === pp.saleAge) {
        const purchasePrice = pp.priceMan * 10000;
        const appreciationRate = (pp.appreciationRate ?? 0) / 100;
        const salePrice = pp.salePriceMan != null ? pp.salePriceMan * 10000 : Math.round(purchasePrice * Math.pow(1 + appreciationRate, yearsSince));
        const schedule = buildLoanSchedule(pp, eAge);
        const schedEntry = yearsSince < schedule.length ? schedule[yearsSince] : null;
        const remainingLoan = schedEntry ? schedEntry.balance : 0;
        const cgtResult = calcPropertyCapitalGainsTax(purchasePrice, salePrice, yearsSince, pp.saleIsResidence ?? true, pp.saleCostRate ?? 4);
        propertyCapitalGainsTax += cgtResult.tax;
        const netProceeds = salePrice - remainingLoan - cgtResult.tax;
        propertySaleProceeds += netProceeds;

        eventCostBreakdown.push({
          label: "物件売却", icon: "🏠", color: "#16a34a", amount: -netProceeds,
          detail: `売却${Math.round(salePrice / 10000)}万 - 残債${Math.round(remainingLoan / 10000)}万 - 譲渡税${Math.round(cgtResult.tax / 10000)}万${cgtResult.isLongTerm ? "(長期)" : "(短期)"}`,
          isPhaseChange: true, phaseLabel: `物件売却 ${Math.round(salePrice / 10000)}万`,
        });
        if (cgtResult.tax > 0) {
          eventCostBreakdown.push({
            label: "不動産譲渡所得税", icon: "🏛️", color: "#dc2626", amount: cgtResult.tax,
            detail: `譲渡益${Math.round(cgtResult.gain / 10000)}万 - 特別控除${Math.round(cgtResult.specialDeduction / 10000)}万 = 課税${Math.round(cgtResult.taxableGain / 10000)}万`,
          });
        }
        continue;
      }

      // Skip if already sold
      if (pp.saleAge != null && age > pp.saleAge) continue;

      const danshinCoverRatio = calcDanshinCover(pp);

      if (danshinCoverRatio >= 1) {
        addPropertyFixedCosts(pp);
        const deathEvt = isSelfDead ? selfDeathEvent! : spouseDeathEvent!;
        if (age === resolveEventAge(deathEvt, events)) {
          eventCostBreakdown.push({ label: "団信によるローン免除(全額)", icon: "🛡️", color: "#16a34a", amount: 0, isPhaseChange: true, phaseLabel: "団信発動" });
        }
      } else {
        const costs = computePropertyYearCost(pp, yearsSince, inflationFactor, eAge);
        for (const c of costs) {
          if (danshinCoverRatio > 0 && c.label.includes("ローン返済")) {
            const reduced = Math.round(c.amount * (1 - danshinCoverRatio));
            eventCostBreakdown.push({ ...c, amount: reduced, detail: `${c.detail} (団信${Math.round(danshinCoverRatio * 100)}%免除)` });
            eventOngoing += reduced;
          } else {
            eventCostBreakdown.push(c);
            eventOngoing += c.amount;
          }
        }
      }

      // Loan balance tracking for this property
      if (pp.saleAge == null || age < pp.saleAge) {
        const { balance: bal, entry } = getLoanBalance(pp, eAge, yearsSince);
        if (bal > 0 || entry) {
          const danshinAdj = 1 - calcDanshinCover(pp);
          loanBalance += Math.round(bal * danshinAdj);
          if (entry && pp.loanStructure === "pair") {
            selfLoanBalance += Math.round((entry.selfBalance ?? 0) * danshinAdj);
            spouseLoanBalance += Math.round((entry.spouseBalance ?? 0) * danshinAdj);
          } else {
            selfLoanBalance += Math.round(bal * danshinAdj);
          }
        }
      }

      // Relocation new property loan balance (handled below in relocation section)

    } else if (e.carParams) {
      // === Car event ===
      const costs = computeCarYearCost(e.carParams, yearsSince, inflationFactor);
      for (const c of costs) {
        eventCostBreakdown.push(c);
        eventOngoing += c.amount;
      }

    } else if (e.insuranceParams) {
      // === Insurance event ===
      const ip = e.insuranceParams;
      const insTarget = e.target || "self";
      const insuredDead = insTarget === "self" ? isSelfDead : isSpouseDead;
      const insuredDeathYear = insTarget === "self" ? isDeathYear : isSpouseDeathYear;

      if (!insuredDead && age < ip.coverageEndAge) {
        const premium = ip.premiumMonthlyMan * 12 * 10000;
        insurancePremiumTotal += premium;
        if (insTarget === "spouse") { insurancePremiumSpouse += premium; } else { insurancePremiumSelf += premium; }
        eventCostBreakdown.push({ label: `保険料(${e.label})`, icon: "🛡️", color: "#6366f1", amount: premium });
        eventOngoing += premium;
      }
      if (insuredDead) {
        if (ip.insuranceType === "term_life" && insuredDeathYear) {
          insurancePayoutTotal += ip.lumpSumPayoutMan * 10000;
        } else if (ip.insuranceType === "income_protection" && age < ip.payoutUntilAge) {
          insurancePayoutTotal += ip.monthlyPayoutMan * 12 * 10000;
        }
      }

    } else if (e.giftParams && eAge === age) {
      // === Gift event ===
      const gp = e.giftParams;
      const amountYen = gp.amountMan * 10000;
      const giftResult = calcGiftTax(amountYen, gp.giftType, gp.recipientRelation);
      giftTax += giftResult.tax;
      const totalCost = amountYen + giftResult.tax;
      eventCostBreakdown.push({
        label: `贈与(${gp.giftType === "calendar" ? "暦年" : "精算"})`, icon: "🎁", color: "#a855f7",
        amount: totalCost,
        detail: giftResult.detail,
        isPhaseChange: true, phaseLabel: `贈与 ${gp.amountMan}万円`,
      });
      eventOnetime += totalCost;

    } else if (e.relocationParams && eAge === age) {
      // === Relocation event (one-time moving cost) ===
      const rp = e.relocationParams;
      const movingCost = rp.movingCostMan * 10000;
      eventCostBreakdown.push({ label: "引越費用", icon: "🏡", color: "#0891b2", amount: movingCost });
      eventOnetime += movingCost;

    } else if (e.parentId && !e.propertyParams && !e.carParams && !e.insuranceParams) {
      // === Sub-event (parentId set, no own params) ===
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

    } else if (!e.parentId && !e.giftParams && !e.relocationParams) {
      // === Simple event ===
      const ongoing = e.annualCostMan * 10000 * inflationFactor;
      if (ongoing !== 0) {
        const et = { label: e.label, icon: "", color: "#64748b", amount: ongoing };
        eventCostBreakdown.push(et);
        eventOngoing += ongoing;
      }
    }

    // --- Relocation ongoing costs (rent + new property) for active relocation events ---
    if (e.relocationParams) {
      const rp = e.relocationParams;
      if (rp.newHousingType === "rent" && rp.newRentAnnualMan) {
        const duration = rp.newRentDurationYears ?? 999;
        if (yearsSince < duration) {
          const rent = rp.newRentAnnualMan * 10000 * inflationFactor;
          eventCostBreakdown.push({ label: "家賃(住み替え後)", icon: "🏢", color: "#0891b2", amount: rent });
          eventOngoing += rent;
        }
      }
      if (rp.newHousingType === "purchase" && rp.newPropertyParams) {
        if (yearsSince >= 0) {
          const newPP = rp.newPropertyParams;
          const costs = computePropertyYearCost(newPP, yearsSince, inflationFactor, eAge);
          for (const c of costs) {
            eventCostBreakdown.push({ ...c, label: `新居:${c.label}` });
            eventOngoing += c.amount;
          }
          // Relocation new property loan balance
          const { balance: relBal } = getLoanBalance(newPP, eAge, yearsSince);
          loanBalance += relBal;
        }
      }
    }
  }

  // --- Property fixed costs that continue after durationYears (管理費・固定資産税) ---
  for (const e of propertyFixedCostEvts) {
    const pp = e.propertyParams!;
    if (pp.saleAge != null && age >= pp.saleAge) continue; // sold
    addPropertyFixedCosts(pp);
  }

  // --- One-time costs for simple events (non-structured) ---
  for (const e of onetimeEvts) {
    if (!e.propertyParams && !e.carParams && !e.insuranceParams && !e.giftParams && !e.relocationParams) {
      const onetime = e.oneTimeCostMan * 10000 * inflationFactor;
      if (onetime !== 0) {
        eventCostBreakdown.push({ label: `${e.label}（一時）`, icon: "", color: "#64748b", amount: onetime });
        eventOnetime += onetime;
      }
    }
  }

  // --- Post-processing: extract housing loan deductions from eventCostBreakdown ---
  let yearHousingLoanDed = 0;
  let yearHousingLoanDedSpouse = 0;
  const hlIdxs: number[] = [];
  for (let i = 0; i < eventCostBreakdown.length; i++) {
    const ec = eventCostBreakdown[i];
    if (ec.label === "住宅ローン控除(本人)" && ec.amount < 0) {
      yearHousingLoanDed += -ec.amount;
      eventOngoing -= ec.amount;
      hlIdxs.push(i);
    } else if (ec.label === "住宅ローン控除(配偶者)" && ec.amount < 0) {
      yearHousingLoanDedSpouse += -ec.amount;
      eventOngoing -= ec.amount;
      hlIdxs.push(i);
    }
  }
  for (let i = hlIdxs.length - 1; i >= 0; i--) eventCostBreakdown.splice(hlIdxs[i], 1);

  // --- Base living expense with death reduction ---
  const baseLivingMonthlyMan = resolveKF(config.expenseKF, age, 15);
  let baseLivingExpense = baseLivingMonthlyMan * 12 * 10000 * inflationFactor;

  if (isDead && dp && isSpouseDead && spouseDeathEvent?.deathParams) {
    baseLivingExpense = 0;
  } else if (isDead && dp) {
    baseLivingExpense = baseLivingExpense * dp.expenseReductionPct / 100;
  } else if (isSpouseDead && spouseDeathEvent?.deathParams) {
    baseLivingExpense = baseLivingExpense * spouseDeathEvent.deathParams.expenseReductionPct / 100;
  }

  const totalExpense = baseLivingExpense + eventOngoing + eventOnetime;

  return {
    eventOngoing, eventOnetime, eventCostBreakdown,
    baseLivingExpense, totalExpense,
    insurancePremiumTotal, insurancePremiumSelf, insurancePremiumSpouse, insurancePayoutTotal,
    propertySaleProceeds, propertyCapitalGainsTax, giftTax,
    loanBalance, selfLoanBalance, spouseLoanBalance,
    yearHousingLoanDed, yearHousingLoanDedSpouse,
    activeEvts, propertyFixedCostEvts,
  };
}

export function computeScenario(s: Scenario, base: BaseResult, params: CalcParams, baseScenario?: Scenario | null): ScenarioResult {
  const config = resolveSimConfig(s, base, params, baseScenario);
  const {
    linked, base_, currentAge, baseCalendarYear, selfRetirementAge, retirementAge,
    rr, r, sir, otherRet, selfGender, hasFuru, selfSIParams,
    effectiveCurrentAssets, growthRate, effectiveDCReceiveMethod, effectiveYears,
    effectivePensionStartAge, effectivePensionWorkStartAge, effectiveDepHolder,
    incomeKF, expenseKF, dcTotalKF, companyDCKF, idecoKF,
    events, spouse, nisaConfig, bpConfig,
    selfNISAAnnualLimit, selfNISALifetimeLimit, spouseNISAAnnualLimit, spouseNISALifetimeLimit,
    dcRate, nisaReturnRate, taxableReturnRate, cashRate,
    cashReserveMinMonths, cashReserveMaxMonths, nisaPriority, cashAnchors,
    spouseRM, effectiveInflation, inflation, macroSlideRate,
    defaultGrossMan, taxOpts, housingLoanDed, PY, hasRet, retAmt,
  } = config;

  const state = initSimState(effectiveCurrentAssets);
  const yearResults: YearResult[] = [];
  let cumulativeDCAsset = 0;

  for (let age = currentAge; age < retirementAge; age++) {
    const ctx = buildYearContext(age, config, events);
    const { yearsFromStart, inflationFactor, isEffDisabled } = ctx;

    const ageInfo = phaseAgeEvents(ctx, config);
    const { isSelfDead, isSpouseDead, isDeathYear, isSpouseDeathYear, selfDeathEvent, spouseDeathEvent, deathEvent, dp, deathAge, isDead, selfRetired, spouseAge } = ageInfo;

    const selfInc = phaseMemberIncome(isSelfDead, selfRetired, age, incomeKF, growthRate, defaultGrossMan);
    let { gross } = selfInc;
    const { grownGrossMan } = selfInc;
    if (gross > 0) {
      state.cumulativeSalary += gross;
      state.salaryYears++;
    }

    const penResult = phasePension(age, gross, state, config, ageInfo);
    let selfPensionIncome = penResult.selfPensionIncome;
    const selfPensionEmployeeAnnual = penResult.selfPensionEmployeeAnnual;
    let spousePensionIncome = penResult.spousePensionIncome;
    const spousePensionEmployeeAnnual = penResult.spousePensionEmployeeAnnual;
    let pensionReduction = penResult.selfPensionReduction;

    const dedInfo = phaseDeductions(ctx, config, ageInfo);
    const { childEvents, dependentDeductionTotal, childAllowance, selfDepDed, spouseDepDed, preSpouseLifeInsDed, preSpouseHLDed } = dedInfo;

    // Spouse income (same framework as main person)
    let spouseTaxResult: MemberTaxResult = ZERO_MEMBER_TAX;

    if (spouse) {
      const spouseRetired = ageInfo.spouseRetired;
      if (isSpouseDead) {
        spouseTaxResult = ZERO_MEMBER_TAX;
      } else {
        // 退職後でも年金収入があれば税計算が必要
        const spInc = phaseMemberIncome(isSpouseDead, spouseRetired, spouseAge, spouse.incomeKF, spouse.salaryGrowthRate, 0);
        const spGrossMan = spInc.grownGrossMan;
        const spDCTotal = spouseRetired ? 0 : resolveKF(spouse.dcTotalKF || [], spouseAge, 0);
        const spCompanyDC = spouseRetired ? 0 : resolveKF(spouse.companyDCKF || [], spouseAge, 0);
        const spIdeco = spouseRetired ? 0 : resolveKF(spouse.idecoKF || [], spouseAge, 0);
        if (spGrossMan > 0 || spousePensionIncome > 0) {
          spouseTaxResult = calcMemberTax(spGrossMan, 0, spDCTotal, spCompanyDC, spIdeco, spouse.hasFurusato, preSpouseHLDed, spouseDepDed, preSpouseLifeInsDed, 0, false, spouseAge, spouse.siParams, spousePensionIncome);
        } else {
          spouseTaxResult = ZERO_MEMBER_TAX;
        }
      }
    }
    if (spouseTaxResult.gross > 0) {
      state.spouseCumulativeSalary += spouseTaxResult.gross;
      state.spouseSalaryYears++;
    }

    // 在職老齢年金: 配偶者分
    {
      const red = applyWorkingPensionReduction(spousePensionEmployeeAnnual, spouseTaxResult.gross);
      pensionReduction += red;
      spousePensionIncome -= red;
    }

    const ecResult = phaseEventCosts(ctx, config, ageInfo);
    const {
      eventOngoing, eventOnetime, eventCostBreakdown,
      baseLivingExpense, totalExpense,
      insurancePremiumTotal, insurancePremiumSelf, insurancePremiumSpouse, insurancePayoutTotal,
      propertySaleProceeds, propertyCapitalGainsTax, giftTax,
      loanBalance, selfLoanBalance, spouseLoanBalance,
      yearHousingLoanDed, yearHousingLoanDedSpouse,
      activeEvts, propertyFixedCostEvts,
    } = ecResult;

    // Survivor income (after death) — auto-calculate survivor pension
    let survivorIncome = 0;
    let survivorBasicPension = 0;
    let survivorEmployeePension = 0;
    let survivorWidowSupplement = 0;
    let survivorIncomeProtection = 0;

    // 遺族年金の共通計算: 死亡者の給与履歴から遺族年金を計算し、併給調整を適用
    const calcSurvivorForDeath = (
      deceasedAvgSalary: number, deceasedContribYears: number,
      survivorCurrentAge: number, survivorIsFemale: boolean,
      survivorOwnEmployeePension: number,
      deathEvt: LifeEvent, deathP: DeathParams,
    ) => {
      if (deceasedAvgSalary <= 0 && deceasedContribYears <= 0) return;
      const childEvtsForPension = events.filter(e => e.type === "child" && isEventActive(e, age, events));
      const childAgesForPension = childEvtsForPension.map(ce => age - resolveEventAge(ce, events));
      const deathCalYear = baseCalendarYear + (resolveEventAge(deathEvt, events) - currentAge);
      const pc = calcSurvivorPension(deceasedAvgSalary, deceasedContribYears, childAgesForPension, survivorCurrentAge, survivorIsFemale, deathCalYear);

      // マクロ経済スライド: 遺族年金にも死亡時からの累積調整を適用
      const deathAge = resolveEventAge(deathEvt, events);
      const yearsSinceDeath = age - deathAge;
      const svSlideFactor = pensionMacroSlideFactor(yearsSinceDeath, effectiveInflation, macroSlideRate);

      // 65歳以降の併給調整: 遺族厚生年金は遺族自身の老齢厚生年金との差額のみ
      let adjEmployee = Math.round(pc.employee * svSlideFactor);
      if (survivorOwnEmployeePension > 0) {
        const optionB = Math.round(adjEmployee / 3 * 4 / 2) + Math.round(survivorOwnEmployeePension / 2);
        adjEmployee = Math.max(Math.max(adjEmployee, optionB) - survivorOwnEmployeePension, 0);
      }

      const adjBasic = Math.round(pc.basic * svSlideFactor);
      const adjWidow = Math.round(pc.widowSupplement * svSlideFactor);
      survivorBasicPension += adjBasic;
      survivorEmployeePension += adjEmployee;
      survivorWidowSupplement += adjWidow;
      survivorIncome += adjBasic + adjEmployee + adjWidow;
      // 収入保障: deathParams経由の給付。ただし同一target向けのincome_protection
      // 保険イベントが存在する場合は二重計上を防止するためスキップ
      if (deathP.incomeProtectionManPerMonth > 0 && age < deathP.incomeProtectionUntilAge) {
        const deathTarget = deathEvt.target || "self";
        const hasInsEvt = events.some(e =>
          e.insuranceParams?.insuranceType === "income_protection" &&
          (e.target || "self") === deathTarget &&
          !isEffDisabled(e)
        );
        if (!hasInsEvt) {
          const amt = deathP.incomeProtectionManPerMonth * 12 * 10000;
          survivorIncome += amt;
          survivorIncomeProtection += amt;
        }
      }
    };

    if (isDead && dp) {
      const avgSalary = state.salaryYears > 0 ? state.cumulativeSalary / state.salaryYears : defaultGrossMan * 10000;
      const survivorAge = spouse ? spouse.currentAge + (age - currentAge) : age;
      calcSurvivorForDeath(avgSalary, state.salaryYears, survivorAge, selfGender === "male", spousePensionEmployeeAnnual, selfDeathEvent!, dp);
    }
    if (isSpouseDead && spouseDeathEvent?.deathParams) {
      const avgSpSalary = state.spouseSalaryYears > 0 ? state.spouseCumulativeSalary / state.spouseSalaryYears : 0;
      calcSurvivorForDeath(avgSpSalary, state.spouseSalaryYears, age, selfGender === "female", selfPensionEmployeeAnnual, spouseDeathEvent!, spouseDeathEvent.deathParams);
    }
    // survivorIncomeはtakeHomePayに加算済み。eventCostBreakdownには入れない（収入セクションで表示）

    // DC/iDeCo (stop after death or retirement)
    const dcStopped = isDead || selfRetired;
    const dcTotal = dcStopped ? 0 : resolveKF(dcTotalKF, age, 0);
    const companyDC = dcStopped ? 0 : resolveKF(companyDCKF, age, 0);
    const idecoMonthly = dcStopped ? 0 : resolveKF(idecoKF, age, 0);
    // (扶養控除・児童手当は上で計算済み)
    // 生命保険料控除: 保険イベントの保険料から自動計算（手動設定がある場合はそちらを優先）
    const selfLifeInsDed = Math.max(calcLifeInsuranceDeduction(insurancePremiumSelf), taxOpts.lifeInsuranceDeduction || 0);
    const spouseLifeInsDed = calcLifeInsuranceDeduction(insurancePremiumSpouse);

    // 配偶者控除/配偶者特別控除の計算
    // 合計所得 = 給与所得 + 年金雑所得（配偶者控除の判定は合計所得ベース）
    const selfSalaryIncome = gross > 0 ? gross - empDed(gross) : 0;
    const selfPensionTaxable = selfPensionIncome > 0 ? Math.max(selfPensionIncome - publicPensionDeduction(selfPensionIncome, age), 0) : 0;
    const selfIncomeForSpouseDed = selfSalaryIncome + selfPensionTaxable;
    const spGrossForDed = spouseTaxResult.gross;
    const spSalaryIncome = spGrossForDed > 0 ? spGrossForDed - empDed(spGrossForDed) : 0;
    const spPensionTaxable = spousePensionIncome > 0 ? Math.max(spousePensionIncome - publicPensionDeduction(spousePensionIncome, spouseAge), 0) : 0;
    const spouseIncomeForDed = spSalaryIncome + spPensionTaxable;
    const spouseDedAmount = spouse ? spouseDeduction(selfIncomeForSpouseDed, spouseIncomeForDed) : 0;

    const hlDed = yearHousingLoanDed;

    // *** Self tax via unified calcMemberTax (年金収入を統合) ***
    const selfTaxResult = calcMemberTax(
      grownGrossMan, 0, dcTotal, companyDC, idecoMonthly,
      hasFuru, hlDed, selfDepDed, selfLifeInsDed,
      spouseDedAmount, true, age, selfSIParams,
      selfPensionIncome,
    );

    const spouseDCTotal = spouseTaxResult.dcContribution;

    const cashFlowResult = phaseCashFlow(
      state, config, selfTaxResult, spouseTaxResult,
      selfPensionIncome, spousePensionIncome,
      totalExpense, childAllowance, survivorIncome, insurancePayoutTotal,
      propertySaleProceeds, spouseDCTotal,
    );
    const { aT, aBen, selfFuruDed, pensionTax, takeHomePay, pensionLossAnnual, spousePensionLossAnnual, annualNetCashFlow } = cashFlowResult;
    cumulativeDCAsset = cashFlowResult.cumulativeDCAsset;

    const deathResult = phaseDeathInheritance(
      state, config, ageInfo, ctx, childEvents, insurancePayoutTotal, activeEvts, cumulativeDCAsset, eventCostBreakdown,
    );
    let { inheritanceTax, inheritanceEstate, crashLoss, crashDetail } = deathResult;
    cumulativeDCAsset = deathResult.cumulativeDCAsset;

    const rebalanceResult = phaseRebalance(state, config, ageInfo, age, annualNetCashFlow, totalExpense);
    const { nisaContribution, selfNISAContribution, spouseNISAContribution, taxableContribution, nisaWithdrawal, taxableWithdrawal } = rebalanceResult;

    state.totalC += aT;
    state.totalPensionLoss += pensionLossAnnual + spousePensionLossAnnual;

    const dcReception = phaseDCReception(state, config, age, spouseAge, yearResults, eventCostBreakdown);
    cumulativeDCAsset = dcReception.cumulativeDCAsset;

    yearResults.push(assembleYearResult(
      age, state, config,
      grownGrossMan, gross,
      baseLivingExpense, eventOnetime, eventOngoing, totalExpense,
      selfTaxResult, spouseTaxResult,
      cashFlowResult, deathResult, rebalanceResult, dcReception,
      selfPensionIncome, spousePensionIncome, dedInfo,
      spouseDedAmount, hlDed, pensionReduction,
      selfLifeInsDed, preSpouseLifeInsDed,
      dcTotal, companyDC, idecoMonthly,
      loanBalance, selfLoanBalance, spouseLoanBalance,
      insurancePremiumTotal, insurancePayoutTotal,
      propertySaleProceeds, propertyCapitalGainsTax, giftTax,
      survivorIncome, survivorBasicPension, survivorEmployeePension,
      survivorWidowSupplement, survivorIncomeProtection,
      activeEvts, propertyFixedCostEvts, eventCostBreakdown,
      spouseAge,
    ));
  }

  return assembleFinalResult(s, state, yearResults, config, cumulativeDCAsset);
}

// ===== Phase 7: 必要保障額の自動算出 =====
// 死亡年齢ごとの遺族必要保障額を計算
export interface ProtectionNeedEntry {
  deathAge: number;
  totalExpense: number;       // 遺族の総支出（死亡年〜simEnd）
  totalIncome: number;        // 遺族の総収入（配偶者給与+遺族年金+老齢年金）
  gap: number;                // 不足額 = 必要保障額
  currentCoverage: number;    // 現在の保険カバー（定期保険一時金+収入保障保険総額）
  shortage: number;           // カバー不足 = gap - currentCoverage - 既存資産
}

export function calcNecessaryProtection(
  yearResults: YearResult[],
  scenario: Scenario,
): ProtectionNeedEntry[] {
  if (yearResults.length === 0) return [];

  const results: ProtectionNeedEntry[] = [];
  const currentAge = scenario.currentAge;
  const simEndAge = scenario.simEndAge;

  // Calculate insurance coverage from events
  const events = scenario.events || [];
  const insuranceEvents = events.filter(e => e.insuranceParams && !e.disabled);

  for (let deathAge = currentAge; deathAge < simEndAge; deathAge++) {
    const deathIdx = deathAge - currentAge;
    if (deathIdx < 0 || deathIdx >= yearResults.length) continue;

    // Total remaining expenses after death (with reduction)
    let totalExpense = 0;
    for (let a = deathAge; a < simEndAge && (a - currentAge) < yearResults.length; a++) {
      const yr = yearResults[a - currentAge];
      // Use 70% of base living expense as default death reduction estimate
      totalExpense += yr.baseLivingExpense * 0.7 + yr.eventOngoing;
    }

    // Total remaining income (spouse income + survivor pension estimate)
    let totalIncome = 0;
    for (let a = deathAge; a < simEndAge && (a - currentAge) < yearResults.length; a++) {
      const yr = yearResults[a - currentAge];
      totalIncome += yr.spouse.takeHome + yr.survivorIncome;
    }

    // Insurance coverage
    let currentCoverage = 0;
    for (const e of insuranceEvents) {
      const ip = e.insuranceParams!;
      if (ip.insuranceType === "term_life") {
        currentCoverage += ip.lumpSumPayoutMan * 10000;
      } else if (ip.insuranceType === "income_protection" && ip.payoutUntilAge > deathAge) {
        currentCoverage += ip.monthlyPayoutMan * 12 * (ip.payoutUntilAge - deathAge) * 10000;
      }
    }

    // Existing assets at death time
    const yrAtDeath = yearResults[deathIdx];
    const existingAssets = yrAtDeath ? yrAtDeath.cumulativeSavings + yrAtDeath.cumulativeDCAsset : 0;

    const gap = Math.max(totalExpense - totalIncome, 0);
    const shortage = Math.max(gap - currentCoverage - existingAssets, 0);

    results.push({ deathAge, totalExpense, totalIncome, gap, currentCoverage, shortage });
  }

  return results;
}
