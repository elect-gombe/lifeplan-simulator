import type { PropertyParams, PrepaymentEntry } from "./types";

// ===== Mortgage helpers =====
// 元利均等 (equal payment)
export function calcMonthlyPaymentEqual(principal: number, annualRate: number, years: number): number {
  if (annualRate <= 0 || years <= 0) return years > 0 ? Math.round(principal / (years * 12)) : 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

// 元金均等 annual payment for a given year
export function calcAnnualPaymentPrincipalEqual(principal: number, annualRate: number, totalYears: number, elapsedYears: number): number {
  const monthlyPrincipal = principal / (totalYears * 12);
  let total = 0;
  for (let m = 0; m < 12; m++) {
    const month = elapsedYears * 12 + m;
    const remaining = principal - monthlyPrincipal * month;
    const interest = remaining * (annualRate / 100 / 12);
    total += monthlyPrincipal + interest;
  }
  return Math.round(total);
}

// 元金均等 monthly payment for first month of a given year (for display)
export function calcMonthlyPaymentPrincipalEqual(principal: number, annualRate: number, totalYears: number, elapsedYears: number): number {
  const monthlyPrincipal = principal / (totalYears * 12);
  const month = elapsedYears * 12;
  const remaining = principal - monthlyPrincipal * month;
  return Math.round(monthlyPrincipal + remaining * (annualRate / 100 / 12));
}

function calcMonthlyPayment(principal: number, annualRate: number, years: number, repaymentType?: string): number {
  if (repaymentType === "equal_principal") {
    return calcMonthlyPaymentPrincipalEqual(principal, annualRate, years, 0);
  }
  return calcMonthlyPaymentEqual(principal, annualRate, years);
}

export function loanBalanceAfterYears(principal: number, annualRate: number, totalYears: number, elapsedYears: number, repaymentType?: string): number {
  if (repaymentType === "equal_principal") {
    const monthlyPrincipal = principal / (totalYears * 12);
    return Math.max(Math.round(principal - monthlyPrincipal * elapsedYears * 12), 0);
  }
  if (annualRate <= 0) return Math.max(principal - (principal / totalYears) * elapsedYears, 0);
  const r = annualRate / 100 / 12;
  const n = totalYears * 12;
  const m = elapsedYears * 12;
  const monthly = principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  return Math.max(Math.round(principal * Math.pow(1 + r, m) - monthly * (Math.pow(1 + r, m) - 1) / r), 0);
}

// ===== Phase 1: ローンスケジュール =====
// 繰上返済・借換を反映した年ごとのローン残高・返済額を計算
export interface LoanScheduleEntry {
  balance: number;        // 残高合計（繰上後）
  annualPayment: number;  // 年間返済額合計
  rate: number;           // 適用金利（%）
  monthlyPayment: number; // 月額返済額合計（表示用）
  remainingYears: number; // 残返済年数（最大値）
  prepaymentAmount: number; // 繰上返済額合計（この年に実施した場合）
  isRefinanced: boolean;  // この年に借換を実施したか
  isSold: boolean;        // この年に売却したか
  // ペアローン個別残高
  selfBalance?: number;      // 本人残高
  spouseBalance?: number;    // 配偶者残高
  selfRemainingYears?: number;
  spouseRemainingYears?: number;
  selfMonthlyPayment?: number;
  spouseMonthlyPayment?: number;
}

// Simulate monthly payments for 12 months and return remaining balance
function simulateOneYear(balance: number, monthlyPayment: number, annualRate: number, repType: string): number {
  if (balance <= 0) return 0;
  const r = annualRate / 100 / 12;
  let bal = balance;
  for (let m = 0; m < 12 && bal > 0; m++) {
    const interest = bal * r;
    if (repType === "equal_principal") {
      // 元金均等: 元金部分は月額固定（= 当初balance / 総月数 だが、ここでは monthlyPayment - interest で算出）
      const principalPart = monthlyPayment - interest; // monthlyPayment = 元金部分 + 初月利息 で渡される想定ではない
      // 元金均等の場合、元金返済額は balance / (remainingYears * 12) で固定なので別関数で処理
      bal -= (monthlyPayment > interest ? monthlyPayment - interest : monthlyPayment);
    } else {
      // 元利均等: 月額固定、元金部分 = 月額 - 利息
      const principalPart = monthlyPayment - interest;
      if (principalPart <= 0) { bal = 0; break; } // 金利0の場合
      bal -= principalPart;
    }
  }
  return Math.max(Math.round(bal), 0);
}

// Single sub-loan simulation state
interface SubLoanState {
  balance: number;
  remainingYears: number;
  monthlyPayment: number; // equal_payment only
}

function buildSingleLoanSchedule(
  initialBalance: number, loanYears: number, repType: string,
  pp: PropertyParams, startAge: number,
  prepayments: PrepaymentEntry[],
): { entries: { balance: number; annualPayment: number; monthlyPayment: number; remainingYears: number; prepaymentAmount: number; isRefinanced: boolean; rate: number }[]; } {
  const entries: { balance: number; annualPayment: number; monthlyPayment: number; remainingYears: number; prepaymentAmount: number; isRefinanced: boolean }[] = [];
  if (initialBalance <= 0) return { entries };

  let balance = initialBalance;
  let currentRate = pp.rateType === "fixed" ? pp.fixedRate : pp.variableInitRate;
  let remainingYears = loanYears;
  const refinance = pp.refinance;
  const maxYears = loanYears + 10;

  let monthlyPayment = repType === "equal_payment"
    ? calcMonthlyPaymentEqual(initialBalance, currentRate, remainingYears) : 0;
  let hasRefinanced = false; // 借換済みフラグ

  for (let y = 0; y < maxYears && balance > 0; y++) {
    const currentAge = startAge + y;
    let isRefinanced = false;
    let prepaymentAmount = 0;

    if (pp.saleAge != null && currentAge >= pp.saleAge) {
      entries.push({ balance, annualPayment: 0, monthlyPayment: 0, remainingYears: 0, prepaymentAmount: 0, isRefinanced: false, rate: currentRate });
      break;
    }

    // Rate change (借換後は変動金利ロジックをスキップ — 借換で固定金利に切り替わったため)
    if (pp.rateType === "variable" && !hasRefinanced) {
      const newRate = y >= pp.variableRiseAfter ? pp.variableRiskRate : pp.variableInitRate;
      if (newRate !== currentRate) {
        currentRate = newRate;
        if (repType === "equal_payment") monthlyPayment = calcMonthlyPaymentEqual(balance, currentRate, remainingYears);
      }
    }

    // Refinance
    if (refinance && currentAge === refinance.age && balance > 0) {
      currentRate = refinance.newRate;
      remainingYears = refinance.newLoanYears;
      isRefinanced = true;
      hasRefinanced = true;
      if (repType === "equal_payment") monthlyPayment = calcMonthlyPaymentEqual(balance, currentRate, remainingYears);
    }

    // Calc payment
    let annualPayment: number;
    let displayMonthly: number;
    if (repType === "equal_principal") {
      const mp = balance / (remainingYears * 12);
      displayMonthly = Math.round(mp + balance * (currentRate / 100 / 12));
      annualPayment = 0;
      let t = balance;
      for (let m = 0; m < 12 && t > 0; m++) { annualPayment += mp + t * (currentRate / 100 / 12); t -= mp; }
      annualPayment = Math.round(annualPayment);
    } else {
      displayMonthly = monthlyPayment;
      annualPayment = Math.round(Math.min(monthlyPayment * 12, balance * (1 + currentRate / 100)));
    }

    const balBefore = balance;

    // Prepayments
    for (const prep of prepayments) {
      if (prep.age === currentAge && balance > 0 && prep.amountMan > 0) {
        const amt = Math.min(prep.amountMan * 10000, balance);
        prepaymentAmount += amt;
        balance -= amt;
        if (balance <= 0) break;
        if (prep.type === "shorten") {
          if (repType === "equal_payment" && monthlyPayment > 0 && currentRate > 0) {
            const r = currentRate / 100 / 12;
            const ratio = balance * r / monthlyPayment;
            if (ratio < 1) remainingYears = Math.max(Math.ceil(Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r)) / 12), 1);
          } else if (repType === "equal_principal") {
            const origMP = balBefore / (remainingYears * 12);
            if (origMP > 0) remainingYears = Math.max(Math.ceil(balance / origMP / 12), 1);
          }
        } else {
          if (repType === "equal_payment") {
            monthlyPayment = calcMonthlyPaymentEqual(balance, currentRate, remainingYears);
            displayMonthly = monthlyPayment;
            annualPayment = Math.round(Math.min(monthlyPayment * 12, balance * (1 + currentRate / 100)));
          } else {
            displayMonthly = Math.round(balance / (remainingYears * 12) + balance * (currentRate / 100 / 12));
          }
        }
      }
    }

    entries.push({
      balance: prepaymentAmount > 0 ? balance : balBefore,
      annualPayment, monthlyPayment: displayMonthly, remainingYears,
      prepaymentAmount, isRefinanced, rate: currentRate,
    });

    // Advance
    if (repType === "equal_principal") {
      const mp = balance / (remainingYears * 12);
      balance = Math.max(Math.round(balance - mp * 12), 0);
    } else {
      const r = currentRate / 100 / 12;
      if (r > 0 && monthlyPayment > 0) {
        let b = balance;
        for (let m = 0; m < 12 && b > 0; m++) b -= (monthlyPayment - b * r);
        balance = Math.max(Math.round(b), 0);
      } else {
        balance = Math.max(Math.round(balance - monthlyPayment * 12), 0);
      }
    }
    remainingYears = Math.max(remainingYears - 1, 0);
    if (remainingYears <= 0 || balance <= 0) break;
  }
  return { entries };
}

export function buildLoanSchedule(pp: PropertyParams, startAge: number): LoanScheduleEntry[] {
  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;
  if (loanAmount <= 0) return [];

  const isPair = pp.loanStructure === "pair";
  const selfRatio = isPair ? (pp.pairRatio ?? 50) / 100 : 1;
  const spouseRatio = isPair ? 1 - selfRatio : 0;
  const repType = pp.repaymentType || "equal_payment";
  const prepayments = pp.prepayments || [];

  if (!isPair) {
    // Single loan: simple path
    const { entries } = buildSingleLoanSchedule(loanAmount, pp.loanYears, repType, pp, startAge, prepayments);
    return entries.map((e, i) => ({
      ...e,
      isSold: pp.saleAge != null && (startAge + i) >= pp.saleAge,
    }));
  }

  // Pair loan: simulate two sub-loans independently
  const selfPreps = prepayments.filter(p => (p.target || "self") === "self");
  const spousePreps = prepayments.filter(p => p.target === "spouse");
  const selfAmount = Math.round(loanAmount * selfRatio);
  const spouseAmount = loanAmount - selfAmount;

  const selfResult = buildSingleLoanSchedule(selfAmount, pp.loanYears, repType, pp, startAge, selfPreps);
  const spouseResult = buildSingleLoanSchedule(spouseAmount, pp.loanYears, repType, pp, startAge, spousePreps);

  const maxLen = Math.max(selfResult.entries.length, spouseResult.entries.length);
  const schedule: LoanScheduleEntry[] = [];

  for (let y = 0; y < maxLen; y++) {
    const se = y < selfResult.entries.length ? selfResult.entries[y] : null;
    const sp = y < spouseResult.entries.length ? spouseResult.entries[y] : null;
    const currentAge = startAge + y;
    const isSold = pp.saleAge != null && currentAge >= pp.saleAge;

    const rate = se?.rate ?? sp?.rate ?? (pp.rateType === "fixed" ? pp.fixedRate : pp.variableInitRate);

    schedule.push({
      balance: (se?.balance ?? 0) + (sp?.balance ?? 0),
      annualPayment: (se?.annualPayment ?? 0) + (sp?.annualPayment ?? 0),
      rate,
      monthlyPayment: (se?.monthlyPayment ?? 0) + (sp?.monthlyPayment ?? 0),
      remainingYears: Math.max(se?.remainingYears ?? 0, sp?.remainingYears ?? 0),
      prepaymentAmount: (se?.prepaymentAmount ?? 0) + (sp?.prepaymentAmount ?? 0),
      isRefinanced: !!(se?.isRefinanced || sp?.isRefinanced),
      isSold,
      selfBalance: se?.balance,
      spouseBalance: sp?.balance,
      selfRemainingYears: se?.remainingYears,
      spouseRemainingYears: sp?.remainingYears,
      selfMonthlyPayment: se?.monthlyPayment,
      spouseMonthlyPayment: sp?.monthlyPayment,
    });
  }

  return schedule;
}
