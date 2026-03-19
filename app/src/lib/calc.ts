import type { Scenario, YearResult, ScenarioResult, BaseResult, TaxOpts, Keyframe, LifeEvent, EventYearCost, PropertyParams, CarParams, DeathParams, SpouseConfig, NISAConfig, BalancePolicy, SocialInsuranceParams, PrepaymentEntry, RelocationParams, GiftParams } from "./types";
import { resolveKF, isEventActive, resolveEventAge, DEFAULT_DC_RECEIVE_METHOD, DEFAULT_SI_PARAMS, PENSION_INSURANCE_RATE, PENSION_MONTHLY_CAP, EMPLOYMENT_INSURANCE_RATE, NURSING_INSURANCE_MIN_AGE, NURSING_INSURANCE_MAX_AGE } from "./types";
import { txInc, mR, fLm, calcFurusatoDonation, iTx, rTx, apTxCr, hlResidentCap, rDed, rTxC, annuityTax, estimatePublicPension, empDed, spouseDeduction, calcLifeInsuranceDeduction, calcPropertyCapitalGainsTax, calcGiftTax, publicPensionDeduction } from "./tax";

// ===== Pension-related constants (令和6年度基準) =====
/** 遺族基礎年金 基本額（円/年） */
const SURVIVOR_BASIC_PENSION_BASE = 816000;
/** 遺族基礎年金 子の加算（第1子・第2子、円/年） */
const SURVIVOR_CHILD_ADDITION_1ST_2ND = 234800;
/** 遺族基礎年金 子の加算（第3子以降、円/年） */
const SURVIVOR_CHILD_ADDITION_3RD_PLUS = 78300;
/** 報酬比例部分の乗率 (5.481/1000) */
const PENSION_RATE_PER_MILLE = 5.481;
/** 標準報酬月額の上限（円/月） */
const STANDARD_MONTHLY_SALARY_CAP = 650000;
/** 短期要件のみなし月数 */
const MIN_CONTRIBUTION_MONTHS = 300;
/** 遺族厚生年金の給付乗率 (3/4) */
const SURVIVOR_EMPLOYEE_PENSION_RATIO = 3 / 4;
/** 中高齢寡婦加算 満額（円/年）— 令和6年度: 612,000→令和7年度: 623,800 */
const WIDOW_SUPPLEMENT_FULL = 623800;
/** 中高齢寡婦加算 段階的廃止: 施行年度（令和10年=2028） */
const WIDOW_SUPPLEMENT_REFORM_START_YEAR = 2028;
/** 中高齢寡婦加算 段階的廃止: 逓減期間（26段階で25年かけて0へ） */
const WIDOW_SUPPLEMENT_PHASE_OUT_STEPS = 26;
/** 住宅ローン控除: 期間（年） */
const HOUSING_LOAN_DEDUCTION_YEARS = 13;
/** 住宅ローン控除: 控除率 */
const HOUSING_LOAN_DEDUCTION_RATE = 0.007;
/** 住宅ローン控除: 年間上限（円） */
const HOUSING_LOAN_DEDUCTION_MAX = 350000;
/** 特定口座の譲渡益税率 */
const TAXABLE_ACCOUNT_TAX_RATE = 0.20315;
/** 扶養控除: 一般扶養親族(16-18歳) */
const DEPENDENT_DEDUCTION_GENERAL = 380000;
/** 扶養控除: 特定扶養親族(19-22歳) */
const DEPENDENT_DEDUCTION_SPECIAL = 630000;
/** 扶養控除: 対象開始年齢 */
const DEPENDENT_MIN_AGE = 16;
/** 扶養控除: 特定扶養親族 開始年齢 */
const DEPENDENT_SPECIAL_MIN_AGE = 19;
/** 扶養控除: 特定扶養親族 終了年齢 */
const DEPENDENT_SPECIAL_MAX_AGE = 23;
/** 児童手当: 対象終了年齢 */
const CHILD_ALLOWANCE_MAX_AGE = 18;
/** 在職老齢年金: 支給停止基準額(円/月) */
const WORKING_PENSION_THRESHOLD = 500000;

// ===== Mortgage helpers =====
// 元利均等 (equal payment)
export function calcMonthlyPaymentEqual(principal: number, annualRate: number, years: number): number {
  if (annualRate <= 0 || years <= 0) return years > 0 ? Math.round(principal / (years * 12)) : 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

// 元金均等 annual payment for a given year
function calcAnnualPaymentPrincipalEqual(principal: number, annualRate: number, totalYears: number, elapsedYears: number): number {
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
function calcMonthlyPaymentPrincipalEqual(principal: number, annualRate: number, totalYears: number, elapsedYears: number): number {
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
): { entries: { balance: number; annualPayment: number; monthlyPayment: number; remainingYears: number; prepaymentAmount: number; isRefinanced: boolean }[]; } {
  const entries: { balance: number; annualPayment: number; monthlyPayment: number; remainingYears: number; prepaymentAmount: number; isRefinanced: boolean }[] = [];
  if (initialBalance <= 0) return { entries };

  let balance = initialBalance;
  let currentRate = pp.rateType === "fixed" ? pp.fixedRate : pp.variableInitRate;
  let remainingYears = loanYears;
  const refinance = pp.refinance;
  const maxYears = loanYears + 10;

  let monthlyPayment = repType === "equal_payment"
    ? calcMonthlyPaymentEqual(initialBalance, currentRate, remainingYears) : 0;

  for (let y = 0; y < maxYears && balance > 0; y++) {
    const currentAge = startAge + y;
    let isRefinanced = false;
    let prepaymentAmount = 0;

    if (pp.saleAge != null && currentAge >= pp.saleAge) {
      entries.push({ balance, annualPayment: 0, monthlyPayment: 0, remainingYears: 0, prepaymentAmount: 0, isRefinanced: false });
      break;
    }

    // Rate change
    if (pp.rateType === "variable") {
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
      prepaymentAmount, isRefinanced,
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
    return entries.map(e => ({
      ...e, rate: e.isRefinanced ? (pp.refinance?.newRate ?? 0) : (entries.indexOf(e) >= pp.variableRiseAfter && pp.rateType === "variable" ? pp.variableRiskRate : (pp.rateType === "fixed" ? pp.fixedRate : pp.variableInitRate)),
      isSold: pp.saleAge != null && (startAge + entries.indexOf(e)) >= pp.saleAge,
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

    const rate = se?.isRefinanced || sp?.isRefinanced
      ? (pp.refinance?.newRate ?? 0)
      : (y >= pp.variableRiseAfter && pp.rateType === "variable" ? pp.variableRiskRate : (pp.rateType === "fixed" ? pp.fixedRate : pp.variableInitRate));

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

// ===== 遺族年金の自動計算（令和7年度基準） =====
// 参考: 日本年金機構
// https://www.nenkin.go.jp/service/jukyu/izokunenkin/jukyu-yoken/20150424.html
//
// ■ 遺族基礎年金（国民年金法第37条〜）
//   受給要件: 子（18歳到達年度末まで、または20歳未満で障害1-2級）のある配偶者
//   年額: 816,000円（令和6年度）+ 子の加算
//     第1子・第2子: 各234,800円
//     第3子以降:    各 78,300円
//   子が全員18歳超になると支給終了
//
// ■ 遺族厚生年金（厚生年金保険法第58条〜）
//   報酬比例部分 = 平均標準報酬額 × 5.481/1000 × 被保険者期間月数
//   ※短期要件: 被保険者期間300月未満 → 300月みなし
//   遺族厚生年金 = 報酬比例部分 × 3/4
//   ※平均標準報酬額の上限: 等級50（650,000円/月）
//
// ■ 中高齢寡婦加算（厚生年金保険法第62条、改正法附則第15条）
//   要件: 夫死亡時に40歳以上65歳未満の妻で、遺族基礎年金を受給できない
//        （子がいないor子が全員18歳超）
//   満額: 623,800円/年（令和7年度）
//   65歳になると終了（老齢基礎年金に切り替え）
//
//   【令和7年改正 — 段階的廃止（令和10年4月施行）】
//   ・2028年4月以降に新たに受給権が発生する場合、逓減率を適用
//   ・逓減率 = (26 - 経過年数) / 26  （経過年数 = 死亡年度 - 2027）
//     2028年度(経過1年): 25/26 ≒ 0.962
//     2029年度(経過2年): 24/26 ≒ 0.923
//     ...
//     2052年度(経過25年): 1/26 ≒ 0.038
//     2053年度以降: 0（完全廃止）
//   ・既受給者（2028年3月以前に受給権発生）は満額のまま
//   ・逓減率は「死亡日が属する年度」で確定し、受給中は変わらない
//
export function calcSurvivorPension(
  avgAnnualSalary: number,
  contributionYears: number,
  childAges: number[],
  survivorAge?: number,      // 遺族（配偶者）の現在年齢
  survivorIsFemale: boolean = true, // 遺族が女性か（中高齢寡婦加算は妻のみ）
  deathCalendarYear?: number, // 死亡した暦年（段階的廃止の逓減率算定用）
): { basic: number; employee: number; widowSupplement: number; total: number; detail: string } {
  // 18歳以下の子の数
  const eligibleChildren = childAges.filter(a => a >= 0 && a < 18).length;

  // ■ 遺族基礎年金
  // 65歳以降は自分の老齢基礎年金に切り替わるため、遺族基礎年金は支給されない
  let basic = 0;
  if (eligibleChildren > 0 && (survivorAge == null || survivorAge < 65)) {
    basic = SURVIVOR_BASIC_PENSION_BASE;
    for (let i = 0; i < eligibleChildren; i++) {
      basic += i < 2 ? SURVIVOR_CHILD_ADDITION_1ST_2ND : SURVIVOR_CHILD_ADDITION_3RD_PLUS;
    }
  }

  // ■ 遺族厚生年金
  const avgMonthly = Math.min(avgAnnualSalary / 12, STANDARD_MONTHLY_SALARY_CAP);
  const months = Math.max(contributionYears * 12, MIN_CONTRIBUTION_MONTHS);
  const reportProportion = avgMonthly * PENSION_RATE_PER_MILLE / 1000 * months;
  const employee = Math.round(reportProportion * SURVIVOR_EMPLOYEE_PENSION_RATIO);

  // ■ 中高齢寡婦加算（妻のみ対象）
  // 令和7年改正: 2028年度以降の新規受給は26分の1ずつ逓減、2053年度に完全廃止
  let widowSupplement = 0;
  let widowTaperRate = 1; // 逓減率（1=満額, 0=廃止）
  if (survivorIsFemale && survivorAge != null && eligibleChildren === 0 && survivorAge >= 40 && survivorAge < 65) {
    if (deathCalendarYear != null && deathCalendarYear >= WIDOW_SUPPLEMENT_REFORM_START_YEAR) {
      // 2028年度以降: 段階的逓減
      const elapsedYears = deathCalendarYear - WIDOW_SUPPLEMENT_REFORM_START_YEAR + 1; // 2028→1, 2029→2, ...
      const remaining = WIDOW_SUPPLEMENT_PHASE_OUT_STEPS - elapsedYears; // 26-1=25, 26-2=24, ...
      widowTaperRate = Math.max(remaining, 0) / WIDOW_SUPPLEMENT_PHASE_OUT_STEPS;
    }
    // widowTaperRate: 2027以前→1.0, 2028→25/26, ..., 2052→1/26, 2053以降→0
    widowSupplement = Math.round(WIDOW_SUPPLEMENT_FULL * widowTaperRate);
  }

  const total = basic + employee + widowSupplement;

  // 詳細テキスト
  const parts: string[] = [];
  if (basic > 0) parts.push(`基礎${Math.round(basic / 10000)}万(子${eligibleChildren}人)`);
  parts.push(`厚生${Math.round(employee / 10000)}万`);
  if (widowSupplement > 0) {
    const taperPct = Math.round(widowTaperRate * 100);
    parts.push(`寡婦加算${Math.round(widowSupplement / 10000)}万${taperPct < 100 ? `(${taperPct}%)` : ""}`);
  }

  return { basic, employee, widowSupplement, total, detail: parts.join("+") };
}

// ローン金利選択
function loanRate(pp: PropertyParams, yearsSince: number): number {
  return pp.rateType === "fixed" ? pp.fixedRate : (yearsSince >= pp.variableRiseAfter ? pp.variableRiskRate : pp.variableInitRate);
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

  // Purchase (year 0 or replacement years) — car price inflates at replacement
  if (yearsSincePurchase === 0 || isReplacementYear) {
    costs.push({ label: "車両購入", icon: "🚗", color: "#10b981", amount: Math.round(cp.priceMan * 10000 * inflationFactor) });
  }

  // Loan payment (nominal fixed, no inflation)
  if (cp.loanYears > 0) {
    const yearInCycle = cp.replaceEveryYears > 0 ? yearsSincePurchase % cp.replaceEveryYears : yearsSincePurchase;
    if (yearInCycle < cp.loanYears) {
      const monthly = calcMonthlyPaymentEqual(cp.priceMan * 10000, cp.loanRate, cp.loanYears);
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

// 扶養控除: child age determines deduction amount
function dependentDeductionForChild(childAge: number): number {
  if (childAge < DEPENDENT_MIN_AGE) return 0;
  if (childAge < DEPENDENT_SPECIAL_MIN_AGE) return DEPENDENT_DEDUCTION_GENERAL;
  if (childAge < DEPENDENT_SPECIAL_MAX_AGE) return DEPENDENT_DEDUCTION_SPECIAL;
  return 0;
}

// 児童手当 (2024改正後): 月額
function childAllowanceMonthly(childAge: number, childIndex: number): number {
  if (childAge < 0 || childAge >= CHILD_ALLOWANCE_MAX_AGE) return 0;
  if (childIndex >= 2) return 30000;
  if (childAge < 3) return 15000;
  return 10000;
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

export function computeScenario(s: Scenario, base: BaseResult, params: CalcParams, baseScenario?: Scenario | null): ScenarioResult {
  const { defaultGrossMan, rr, sirPct, hasRet, retAmt, PY, taxOpts, housingLoanDed } = params;

  // Linked settings resolution (must be before age resolution)
  const linked = !!(s.linkedToBase && baseScenario);
  const base_ = linked ? baseScenario! : s;
  const overSet = s.overrideSettings || [];
  const settingLinked = (key: string) => linked && !overSet.includes(key as any);

  // 年齢はシナリオから取得（retirementAgeはsimEndAgeの意味で使う）
  const currentAge = (settingLinked("currentAge") ? base_.currentAge : s.currentAge) ?? params.currentAge;
  const baseCalendarYear = new Date().getFullYear(); // 暦年基準（年齢→暦年変換用）
  const selfRetirementAge = (settingLinked("retirementAge") ? base_.retirementAge : s.retirementAge) ?? 65;
  const retirementAge = (settingLinked("simEndAge") ? base_.simEndAge : s.simEndAge) ?? params.retirementAge; // シミュレーション終了年齢
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

  // Balance policy: use own if set, else inherit
  const bpConfig = s.balancePolicy || (linked ? base_.balancePolicy : undefined);

  // NISA config — 個人別に枠を管理
  const nisa: NISAConfig | undefined = nisaConfig;
  const nisaAccounts = nisa ? (nisa.accounts || 1) : 1;
  // Phase 3: 個別資産クラス利回り（リンク時はベースの値を参照）
  const dcRate = (s.dcReturnRate ?? (linked ? base_.dcReturnRate : undefined) ?? rr) / 100;
  const nisaReturnRate = (s.nisaReturnRate ?? (linked ? base_.nisaReturnRate : undefined) ?? rr) / 100;
  const taxableReturnRate_ = (s.taxableReturnRate ?? (linked ? base_.taxableReturnRate : undefined) ?? rr) / 100;
  const cashRate = (s.cashInterestRate ?? (linked ? base_.cashInterestRate : undefined) ?? 0) / 100;
  // 本人NISA枠
  const selfNISAAnnualLimit = nisa ? nisa.annualLimitMan * 10000 : 0;
  const selfNISALifetimeLimit = nisa ? nisa.lifetimeLimitMan * 10000 : 0;
  // 配偶者NISA枠（2口座の場合）
  const spouseNISAAnnualLimit = nisa && nisaAccounts === 2 ? (nisa.spouseAnnualLimitMan ?? nisa.annualLimitMan) * 10000 : 0;
  const spouseNISALifetimeLimit = nisa && nisaAccounts === 2 ? (nisa.spouseLifetimeLimitMan ?? nisa.lifetimeLimitMan) * 10000 : 0;
  // NISA簿価（取得原価）ベースで生涯枠を管理
  // 新NISA（2024～）: 売却すると翌年に簿価分の枠が復活
  let selfNISACostBasis = 0;   // 本人NISA内の元本
  let spouseNISACostBasis = 0; // 配偶者NISA内の元本
  // 特定口座 (taxable): gains taxed at 20.315%
  const TAXABLE_TAX_RATE = TAXABLE_ACCOUNT_TAX_RATE;
  const taxableReturnRate = taxableReturnRate_;

  // Balance policy
  const bp: BalancePolicy | undefined = bpConfig;
  const cashReserveMonths = bp ? bp.cashReserveMonths : 6;
  const nisaPriority = bp ? bp.nisaPriority : (nisa ? true : false);

  // 配偶者DC受取方法
  const spouseRM = spouse?.dcReceiveMethod || DEFAULT_DC_RECEIVE_METHOD;

  const yearResults: YearResult[] = [];
  let cumulativeDCAsset = 0;
  let selfDCAsset = 0;
  let spouseDCAsset = 0;
  let cumulativeReinvest = 0;
  let cumulativeCash = effectiveCurrentAssets * 10000;
  let selfNISAAsset = 0;
  let spouseNISAAsset = 0;
  let cumulativeTaxable = 0;
  let cumulativeTaxableCost = 0;    // 特定口座 取得原価（含み益計算用）
  let totalC = 0;
  let totalPensionLoss = 0;

  const inflation = params.inflationRate / 100;

  // Track cumulative salary for survivor pension calculation
  let cumulativeSalary = 0;
  let salaryYears = 0;
  let spouseCumulativeSalary = 0;
  let spouseSalaryYears = 0;

  for (let age = currentAge; age < retirementAge; age++) {
    const yearsFromStart = age - currentAge;
    const inflationFactor = Math.pow(1 + inflation, yearsFromStart);

    // Helper: event is disabled if itself or its parent is disabled
    const isEffDisabled = (e: LifeEvent) => !!e.disabled || (e.parentId != null && !!events.find(p => p.id === e.parentId)?.disabled);

    // Check for death events (self and/or spouse)
    const selfDeathEvent = events.find(e => !isEffDisabled(e) && e.type === "death" && e.deathParams && (e.target || "self") === "self" && age >= resolveEventAge(e, events));
    const spouseDeathEvent = events.find(e => !isEffDisabled(e) && e.type === "death" && e.deathParams && e.target === "spouse" && age >= resolveEventAge(e, events));
    const isSelfDead = !!selfDeathEvent;
    const isSpouseDead = !!spouseDeathEvent;
    // Backward compat: use selfDeathEvent for old code paths
    const deathEvent = selfDeathEvent;
    const isDead = isSelfDead;
    const dp = deathEvent?.deathParams;
    const deathAge = deathEvent ? resolveEventAge(deathEvent, events) : 0;
    const isDeathYear = deathEvent && age === deathAge;
    const isSpouseDeathYear = spouseDeathEvent && age === resolveEventAge(spouseDeathEvent, events);

    // Income (退職後は給与0、年金開始後は年金収入)
    const selfRetired = age >= selfRetirementAge;
    const spouseAge = spouse ? spouse.currentAge + yearsFromStart : 0;

    // 老齢年金の共通計算
    const calcPublicPension = (isDead: boolean, currentAge: number, startAge: number, workStartAge: number, retAge: number, cumSalary: number, years: number) => {
      if (isDead || currentAge < startAge) return { income: 0, employeeAnnual: 0, detail: "" };
      const avg = years > 0 ? cumSalary / years : 0;
      const empMonths = Math.max(Math.min(retAge, 65) - workStartAge, 0) * 12;
      const natMonths = Math.min((65 - 20) * 12, 480);
      const pe = estimatePublicPension(avg, empMonths, natMonths, startAge);
      return { income: pe.totalAnnual, employeeAnnual: Math.round(pe.employeeAnnual * pe.adjustmentFactor), detail: pe.detail };
    };

    const selfPen = calcPublicPension(isSelfDead, age, effectivePensionStartAge ?? 65, effectivePensionWorkStartAge ?? 22, selfRetirementAge, cumulativeSalary, salaryYears);
    let selfPensionIncome = selfPen.income;
    const selfPensionEmployeeAnnual = selfPen.employeeAnnual;

    const spPen = spouse
      ? calcPublicPension(isSpouseDead, spouseAge, spouse.pensionStartAge ?? 65, spouse.pensionWorkStartAge ?? 22, spouse.retirementAge ?? 65, spouseCumulativeSalary, spouseSalaryYears)
      : { income: 0, employeeAnnual: 0, detail: "" };
    let spousePensionIncome = spPen.income;
    const spousePensionEmployeeAnnual = spPen.employeeAnnual;

    let gross: number;
    let grownGrossMan: number;
    if (isSelfDead || selfRetired) {
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
      cumulativeSalary += gross;
      salaryYears++;
    }

    // 在職老齢年金（Working Elderly Pension Reduction）
    let pensionReduction = 0;
    const applyWorkingPensionReduction = (pensionEmployeeAnnual: number, grossIncome: number): number => {
      if (pensionEmployeeAnnual <= 0 || grossIncome <= 0) return 0;
      const basicMonthly = pensionEmployeeAnnual / 12;
      const salaryMonthly = grossIncome / 12;
      if (basicMonthly + salaryMonthly > WORKING_PENSION_THRESHOLD) {
        const monthlyReduction = (basicMonthly + salaryMonthly - WORKING_PENSION_THRESHOLD) / 2;
        return Math.min(monthlyReduction * 12, pensionEmployeeAnnual);
      }
      return 0;
    };
    {
      const red = applyWorkingPensionReduction(selfPensionEmployeeAnnual, gross);
      pensionReduction += red;
      selfPensionIncome -= red;
    }

    // Dependent deduction: compute first (needed for both self and spouse tax calc)
    const childEvents = events.filter(e => !isEffDisabled(e) && e.type === "child" && isEventActive(e, age, events));
    let dependentDeductionTotal = 0;
    for (const ce of childEvents) {
      const childBirthAge = resolveEventAge(ce, events);
      const childAge = age - childBirthAge;
      dependentDeductionTotal += dependentDeductionForChild(childAge);
    }
    dependentDeductionTotal += Math.max(taxOpts.dependentsCount, 0) * DEPENDENT_DEDUCTION_GENERAL;

    // 児童手当
    let childAllowance = 0;
    childEvents.forEach((ce, ci) => {
      const childBirthAge = resolveEventAge(ce, events);
      const childAge = age - childBirthAge;
      childAllowance += childAllowanceMonthly(childAge, ci) * 12;
    });

    // 扶養控除は世帯主設定に応じて本人 or 配偶者に適用（死亡時は生存者に自動切替）
    let depHolder: "self" | "spouse" = effectiveDepHolder || "self";
    if (depHolder === "self" && isSelfDead && !isSpouseDead) depHolder = "spouse";
    if (depHolder === "spouse" && isSpouseDead && !isSelfDead) depHolder = "self";
    const selfDepDed = depHolder === "self" ? dependentDeductionTotal : 0;
    const spouseDepDed = depHolder === "spouse" ? dependentDeductionTotal : 0;

    // Spouse income (same framework as main person)
    let spouseTaxResult: MemberTaxResult = ZERO_MEMBER_TAX;
    // Pre-scan: compute spouse insurance premiums for life insurance deduction
    let preSpouseInsPremium = 0;
    for (const e of events) {
      if (isEffDisabled(e) || !isEventActive(e, age, events) || !e.insuranceParams) continue;
      const insTarget = e.target || "self";
      if (insTarget !== "spouse") continue;
      const insuredDead = isSpouseDead;
      if (!insuredDead && age < e.insuranceParams.coverageEndAge) {
        preSpouseInsPremium += e.insuranceParams.premiumMonthlyMan * 12 * 10000;
      }
    }
    const preSpouseLifeInsDed = calcLifeInsuranceDeduction(preSpouseInsPremium);

    // Pre-scan: compute spouse housing loan deduction for spouse tax calc
    let preSpouseHLDed = 0;
    for (const e of events) {
      if (isEffDisabled(e) || !isEventActive(e, age, events) || !e.propertyParams) continue;
      const pp = e.propertyParams;
      if (!pp.hasLoanDeduction) continue;
      if (pp.saleAge != null && age >= pp.saleAge) continue; // sold
      const eAge = resolveEventAge(e, events);
      const yearsSince = age - eAge;
      if (yearsSince >= HOUSING_LOAN_DEDUCTION_YEARS) continue;
      const loanAmt = (pp.priceMan - pp.downPaymentMan) * 10000;
      if (loanAmt <= 0) continue;
      // Use schedule for accurate balance with prepayments (pair loan: individual balances)
      const schedule = buildLoanSchedule(pp, eAge);
      const entry = yearsSince < schedule.length ? schedule[yearsSince] : null;
      const dedTarget = pp.deductionTarget || "self";
      if (pp.loanStructure === "pair" && entry && dedTarget === "both") {
        // ペアローン: 個別残高で控除を計算
        const spouseBal = entry.spouseBalance ?? 0;
        const spouseDed = Math.min(Math.round(spouseBal * HOUSING_LOAN_DEDUCTION_RATE), HOUSING_LOAN_DEDUCTION_MAX);
        preSpouseHLDed += spouseDed;
      } else {
        const bal = entry ? entry.balance : (schedule.length > 0 ? 0 : loanBalanceAfterYears(loanAmt, loanRate(pp, yearsSince), pp.loanYears, yearsSince, pp.repaymentType || "equal_payment"));
        const ded = Math.min(Math.round(bal * HOUSING_LOAN_DEDUCTION_RATE), HOUSING_LOAN_DEDUCTION_MAX);
        if (dedTarget === "spouse") {
          preSpouseHLDed += ded;
        } else if (dedTarget === "both") {
          const selfRatio = (pp.pairRatio ?? 50) / 100;
          preSpouseHLDed += ded - Math.round(ded * selfRatio);
        }
      }
    }

    if (spouse) {
      const spouseAge = spouse.currentAge + yearsFromStart;
      const spouseRetired = spouseAge >= (spouse.retirementAge ?? 65);
      if (isSpouseDead) {
        spouseTaxResult = ZERO_MEMBER_TAX;
      } else {
        // 退職後でも年金収入があれば税計算が必要
        const spGrossMan = spouseRetired ? 0 : (() => {
          const base = resolveKF(spouse.incomeKF, spouseAge, 0);
          let gy = 0;
          for (let ki = spouse.incomeKF.length - 1; ki >= 0; ki--) {
            if (spouse.incomeKF[ki].age <= spouseAge) { gy = spouseAge - spouse.incomeKF[ki].age; break; }
          }
          return base * Math.pow(1 + (spouse.salaryGrowthRate || 0) / 100, gy);
        })();
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
      spouseCumulativeSalary += spouseTaxResult.gross;
      spouseSalaryYears++;
    }

    // 在職老齢年金: 配偶者分
    {
      const red = applyWorkingPensionReduction(spousePensionEmployeeAnnual, spouseTaxResult.gross);
      pensionReduction += red;
      spousePensionIncome -= red;
    }

    // Base living expense (万円/月 → 年額, with inflation)
    const baseLivingMonthlyMan = resolveKF(expenseKF, age, 15);
    let baseLivingExpense = baseLivingMonthlyMan * 12 * 10000 * inflationFactor;

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

    // Event costs: structured params (property/car/insurance) + simple events
    const activeEvts = events.filter(e => !isEffDisabled(e) && isEventActive(e, age, events));
    // Property events with propertyParams: fixed costs (管理費・固定資産税) continue forever even after durationYears
    const propertyFixedCostEvts = events.filter(e => !isEffDisabled(e) && e.propertyParams && !isEventActive(e, age, events) && age >= resolveEventAge(e, events));
    const onetimeEvts = events.filter(e => !isEffDisabled(e) && resolveEventAge(e, events) === age);
    let eventOngoing = 0;
    let eventOnetime = 0;
    const eventCostBreakdown: EventYearCost[] = [];
    let inheritanceTax = 0;
    let inheritanceEstate = 0;
    let dcReceiveTax = 0;
    let propertySaleProceeds = 0;
    let propertyCapitalGainsTax = 0;
    let giftTax = 0;

    // Insurance premiums and payouts
    let insurancePremiumTotal = 0;
    let insurancePremiumSelf = 0;
    let insurancePremiumSpouse = 0;
    let insurancePayoutTotal = 0;

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

    // Track property sale proceeds for later cash addition
    const propertySaleEntries: { pp: PropertyParams; eAge: number }[] = [];

    for (const e of activeEvts) {
      const eAge = resolveEventAge(e, events);
      const yearsSince = age - eAge;

      if (e.propertyParams) {
        const pp = e.propertyParams;

        // Phase 2: Check property sale
        if (pp.saleAge != null && age === pp.saleAge) {
          const purchasePrice = pp.priceMan * 10000;
          const appreciationRate = (pp.appreciationRate ?? 0) / 100;
          const salePrice = pp.salePriceMan != null ? pp.salePriceMan * 10000 : Math.round(purchasePrice * Math.pow(1 + appreciationRate, yearsSince));
          // Remaining loan balance
          const schedule = buildLoanSchedule(pp, eAge);
          const schedEntry = yearsSince < schedule.length ? schedule[yearsSince] : null;
          const remainingLoan = schedEntry ? schedEntry.balance : 0;
          // Capital gains tax
          const cgtResult = calcPropertyCapitalGainsTax(purchasePrice, salePrice, yearsSince, pp.saleIsResidence ?? true, pp.saleCostRate ?? 4);
          propertyCapitalGainsTax += cgtResult.tax;
          const netProceeds = salePrice - remainingLoan - cgtResult.tax;
          propertySaleProceeds += netProceeds;
          propertySaleEntries.push({ pp, eAge });

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
          // No further property costs this year (sale completes)
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
          // 通常計算（部分免除の場合は残りの分を計算）— pass startAge for schedule
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
      } else if (e.carParams) {
        const costs = computeCarYearCost(e.carParams, yearsSince, inflationFactor);
        for (const c of costs) {
          eventCostBreakdown.push(c);
          eventOngoing += c.amount;
        }
      } else if (e.insuranceParams) {
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
        // Phase 6: 贈与税
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
        // Phase 5: 住み替え
        const rp = e.relocationParams;
        // Moving cost
        const movingCost = rp.movingCostMan * 10000;
        eventCostBreakdown.push({ label: "引越費用", icon: "🏡", color: "#0891b2", amount: movingCost });
        eventOnetime += movingCost;
        // New housing: rent
        if (rp.newHousingType === "rent" && rp.newRentAnnualMan) {
          // Rent is handled as an ongoing cost for the duration
          // (The relocation event itself just triggers the one-time costs)
        }
      } else if (!e.parentId && !e.giftParams && !e.relocationParams) {
        // Simple event (non-child sub-events only)
        const ongoing = e.annualCostMan * 10000 * inflationFactor;
        if (ongoing !== 0) {
          const et = { label: e.label, icon: "", color: "#64748b", amount: ongoing };
          eventCostBreakdown.push(et);
          eventOngoing += ongoing;
        }
      }
    }

    // Phase 5: Relocation ongoing rent costs
    for (const e of activeEvts) {
      if (e.relocationParams && e.relocationParams.newHousingType === "rent" && e.relocationParams.newRentAnnualMan) {
        const rp = e.relocationParams;
        const eAge = resolveEventAge(e, events);
        const yearsSince = age - eAge;
        const duration = rp.newRentDurationYears ?? 999;
        if (yearsSince < duration) {
          const rent = rp.newRentAnnualMan * 10000 * inflationFactor;
          eventCostBreakdown.push({ label: "家賃(住み替え後)", icon: "🏢", color: "#0891b2", amount: rent });
          eventOngoing += rent;
        }
      }
      // Phase 5: New property purchase ongoing costs
      if (e.relocationParams && e.relocationParams.newHousingType === "purchase" && e.relocationParams.newPropertyParams) {
        const eAge = resolveEventAge(e, events);
        const yearsSince = age - eAge;
        if (yearsSince >= 0) {
          const newPP = e.relocationParams.newPropertyParams;
          const costs = computePropertyYearCost(newPP, yearsSince, inflationFactor, eAge);
          for (const c of costs) {
            eventCostBreakdown.push({ ...c, label: `新居:${c.label}` });
            eventOngoing += c.amount;
          }
        }
      }
    }

    // Property fixed costs that continue after durationYears (管理費・固定資産税)
    // But skip if property is sold
    for (const e of propertyFixedCostEvts) {
      const pp = e.propertyParams!;
      if (pp.saleAge != null && age >= pp.saleAge) continue; // sold
      addPropertyFixedCosts(pp);
    }

    // One-time costs for simple events (non-structured)
    for (const e of onetimeEvts) {
      if (!e.propertyParams && !e.carParams && !e.insuranceParams && !e.giftParams && !e.relocationParams) {
        const onetime = e.oneTimeCostMan * 10000 * inflationFactor;
        if (onetime !== 0) {
          eventCostBreakdown.push({ label: `${e.label}（一時）`, icon: "", color: "#64748b", amount: onetime });
          eventOnetime += onetime;
        }
      }
    }

    // Sub-events (parentId set, no own params)
    for (const e of activeEvts) {
      if (e.parentId && !e.propertyParams && !e.carParams && !e.insuranceParams) {
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

    // Track loan balance (consider 団信 coverage per property, sale, and prepayments)
    let loanBalance = 0;
    let selfLoanBalance = 0;
    let spouseLoanBalance = 0;
    for (const e of activeEvts) {
      if (e.propertyParams) {
        const pp = e.propertyParams;
        const eAge = resolveEventAge(e, events);
        if (pp.saleAge != null && age >= pp.saleAge) continue;
        const ys = age - eAge;
        const loanAmt = (pp.priceMan - pp.downPaymentMan) * 10000;
        if (loanAmt > 0) {
          const schedule = buildLoanSchedule(pp, eAge);
          const entry = ys < schedule.length ? schedule[ys] : null;
          const bal = entry ? entry.balance : (schedule.length > 0 ? 0 : (ys < pp.loanYears ? loanBalanceAfterYears(loanAmt, loanRate(pp, ys), pp.loanYears, ys, pp.repaymentType) : 0));
          const danshinAdj = 1 - calcDanshinCover(pp);
          loanBalance += Math.round(bal * danshinAdj);
          // ペアローン個別残高
          if (entry && pp.loanStructure === "pair") {
            selfLoanBalance += Math.round((entry.selfBalance ?? 0) * danshinAdj);
            spouseLoanBalance += Math.round((entry.spouseBalance ?? 0) * danshinAdj);
          } else {
            selfLoanBalance += Math.round(bal * danshinAdj);
          }
        }
      }
      // Also track relocation new property loan balance
      if (e.relocationParams?.newPropertyParams && e.relocationParams.newHousingType === "purchase") {
        const newPP = e.relocationParams.newPropertyParams;
        const eAge = resolveEventAge(e, events);
        const ys = age - eAge;
        if (ys >= 0) {
          const loanAmt = (newPP.priceMan - newPP.downPaymentMan) * 10000;
          if (loanAmt > 0) {
            const schedule = buildLoanSchedule(newPP, eAge);
            const entry = ys < schedule.length ? schedule[ys] : null;
            loanBalance += entry ? entry.balance : (ys < newPP.loanYears ? loanBalanceAfterYears(loanAmt, loanRate(newPP, ys), newPP.loanYears, ys, newPP.repaymentType) : 0);
          }
        }
      }
    }

    // Death expense reduction: apply once, handling both-dead case
    if (isDead && dp && isSpouseDead && spouseDeathEvent?.deathParams) {
      // Both dead: no living expenses
      baseLivingExpense = 0;
    } else if (isDead && dp) {
      baseLivingExpense = baseLivingExpense * dp.expenseReductionPct / 100;
    } else if (isSpouseDead && spouseDeathEvent?.deathParams) {
      baseLivingExpense = baseLivingExpense * spouseDeathEvent.deathParams.expenseReductionPct / 100;
    }

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

      // 65歳以降の併給調整: 遺族厚生年金は遺族自身の老齢厚生年金との差額のみ
      let adjEmployee = pc.employee;
      if (survivorOwnEmployeePension > 0) {
        const optionB = Math.round(pc.employee / 3 * 4 / 2) + Math.round(survivorOwnEmployeePension / 2);
        adjEmployee = Math.max(Math.max(pc.employee, optionB) - survivorOwnEmployeePension, 0);
      }

      survivorBasicPension += pc.basic;
      survivorEmployeePension += adjEmployee;
      survivorWidowSupplement += pc.widowSupplement;
      survivorIncome += pc.basic + adjEmployee + pc.widowSupplement;
      if (deathP.incomeProtectionManPerMonth > 0 && age < deathP.incomeProtectionUntilAge) {
        const amt = deathP.incomeProtectionManPerMonth * 12 * 10000;
        survivorIncome += amt;
        survivorIncomeProtection += amt;
      }
    };

    if (isDead && dp) {
      const avgSalary = salaryYears > 0 ? cumulativeSalary / salaryYears : defaultGrossMan * 10000;
      const survivorAge = spouse ? spouse.currentAge + (age - currentAge) : age;
      calcSurvivorForDeath(avgSalary, salaryYears, survivorAge, selfGender === "male", spousePensionEmployeeAnnual, selfDeathEvent!, dp);
    }
    if (isSpouseDead && spouseDeathEvent?.deathParams) {
      const avgSpSalary = spouseSalaryYears > 0 ? spouseCumulativeSalary / spouseSalaryYears : 0;
      calcSurvivorForDeath(avgSpSalary, spouseSalaryYears, age, selfGender === "female", selfPensionEmployeeAnnual, spouseDeathEvent!, spouseDeathEvent.deathParams);
    }
    // survivorIncomeはtakeHomePayに加算済み。eventCostBreakdownには入れない（収入セクションで表示）

    // 住宅ローン控除: eventCostBreakdownから抽出し、税額控除として適用
    // (支出としてのマイナス計上は除去 → 税額控除に一本化)
    // ペアローン対応: 本人分と配偶者分を別々に抽出
    let yearHousingLoanDed = 0;      // 本人分
    let yearHousingLoanDedSpouse = 0; // 配偶者分
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
    // 支出一覧から住宅ローン控除を除去（税額控除セクションで表示するため）
    for (let i = hlIdxs.length - 1; i >= 0; i--) eventCostBreakdown.splice(hlIdxs[i], 1);

    const totalExpense = baseLivingExpense + eventOngoing + eventOnetime;

    // DC/iDeCo (stop after death or retirement)
    const dcStopped = isDead || selfRetired;
    const dcTotal = dcStopped ? 0 : resolveKF(dcTotalKF, age, 0);
    const companyDC = dcStopped ? 0 : resolveKF(companyDCKF, age, 0);
    const idecoMonthly = dcStopped ? 0 : resolveKF(idecoKF, age, 0);
    // Spouse DC/iDeCo (added to household DC tracking)
    const spouseDCTotal = spouseTaxResult.dcContribution;

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

    const st = selfTaxResult; // alias
    const aT = st.dcContribution;
    const aBen = st.incomeTaxSaving + st.residentTaxSaving + st.socialInsuranceSaving;
    const selfFuruDed = st.furusatoDonation > 0 ? Math.max(st.furusatoDonation - 2000, 0) : 0;

    // 年金課税はcalcMemberTax内で統合済み（給与+年金の総合課税）
    const pensionTax = st.pensionIncomeTax + st.pensionResidentTax + spouseTaxResult.pensionIncomeTax + spouseTaxResult.pensionResidentTax;

    // takeHome = 給与+年金-税-社保-DC（calcMemberTax内で計算済み）+ 手当+遺族+保険
    const takeHomePay = st.takeHome + childAllowance + survivorIncome + spouseTaxResult.takeHome + insurancePayoutTotal;
    const pensionLossAnnual = (st.selfDCContribution / 12 * PENSION_RATE_PER_MILLE) / 1000 * 12;
    const spousePensionLossAnnual = spouse ? (spouseTaxResult.selfDCContribution / 12 * PENSION_RATE_PER_MILLE) / 1000 * 12 : 0;
    const annualNetCashFlow = takeHomePay - totalExpense;

    // Phase 2: Add property sale proceeds to cash
    if (propertySaleProceeds !== 0) cumulativeCash += propertySaleProceeds;

    // Phase 3: Cash interest
    if (cashRate > 0 && cumulativeCash > 0) cumulativeCash = Math.round(cumulativeCash * (1 + cashRate));

    selfDCAsset = selfDCAsset * (1 + dcRate) + aT;
    spouseDCAsset = spouseDCAsset * (1 + dcRate) + spouseDCTotal;
    cumulativeDCAsset = selfDCAsset + spouseDCAsset;
    // DC節税分は現金に加算（再投資は目安として複利計算のみ維持）
    cumulativeReinvest = cumulativeReinvest * (1 + dcRate) + aBen; // 目安用

    // ===== 死亡年: 相続計算（全資産統合） =====
    const processDeathInheritance = (label: string, dcAsset: number, nisaAssetForEstate: number, hasSpouseSurvivor: boolean) => {
      const legalHeirs = Math.max(1 + childEvents.length, 1);
      const shareRatio = hasSpouseSurvivor ? 0.5 : 1;
      const estateOther = Math.round((cumulativeCash + nisaAssetForEstate + cumulativeTaxable) * shareRatio);
      const result = calcInheritanceTax(estateOther, dcAsset, insurancePayoutTotal, legalHeirs, hasSpouseSurvivor);
      inheritanceTax = result.tax;
      inheritanceEstate = result.taxableEstate;
      if (dcAsset > 0) {
        eventCostBreakdown.push({ label: `DC/iDeCo死亡一時金(${label})`, icon: "💰", color: "#16a34a", amount: -dcAsset,
          detail: `${label === "本人" ? "DC" : "配偶者DC"}資産${Math.round(dcAsset / 10000)}万→遺族へ` });
        cumulativeCash += dcAsset;
      }
      if (result.tax > 0) {
        eventCostBreakdown.push({ label: `相続税(${label}死亡)`, icon: "🏛️", color: "#dc2626", amount: result.tax, detail: result.detail });
        cumulativeCash -= result.tax;
      } else {
        eventCostBreakdown.push({ label: `相続税(${label}死亡)`, icon: "🏛️", color: "#16a34a", amount: 0, detail: result.detail, isPhaseChange: true, phaseLabel: "相続税なし" });
      }
    };
    if (isDeathYear) {
      processDeathInheritance("本人", selfDCAsset, selfNISAAsset, !!spouse && !isSpouseDead);
      selfDCAsset = 0;
      cumulativeDCAsset = selfDCAsset + spouseDCAsset;
    }
    if (isSpouseDeathYear) {
      processDeathInheritance("配偶者", spouseDCAsset, spouseNISAAsset, true);
      spouseDCAsset = 0;
      cumulativeDCAsset = selfDCAsset + spouseDCAsset;
    }

    // ===== NISA死亡時処理 =====
    const liquidateNISA = (label: string, asset: number, cost: number, isDeathYr: boolean): { asset: number; cost: number } => {
      if (asset <= 0) return { asset, cost };
      if (isDeathYr) {
        eventCostBreakdown.push({ label: `NISA相続(${label})`, icon: "📊", color: "#22c55e", amount: -asset,
          detail: `${label}NISA時価${Math.round(asset / 10000)}万(元本${Math.round(cost / 10000)}万) → 現金化(非課税)` });
      }
      cumulativeCash += asset;
      return { asset: 0, cost: 0 };
    };
    if (isDeathYear || isSelfDead) {
      const r = liquidateNISA("本人", selfNISAAsset, selfNISACostBasis, !!isDeathYear);
      selfNISAAsset = r.asset; selfNISACostBasis = r.cost;
    }
    if (isSpouseDeathYear || isSpouseDead) {
      const r = liquidateNISA("配偶者", spouseNISAAsset, spouseNISACostBasis, !!isSpouseDeathYear);
      spouseNISAAsset = r.asset; spouseNISACostBasis = r.cost;
    }
    // 運用益を反映（元本は変わらない、時価のみ増加）
    selfNISAAsset = selfNISAAsset * (1 + nisaReturnRate);
    spouseNISAAsset = spouseNISAAsset * (1 + nisaReturnRate);
    cumulativeTaxable = cumulativeTaxable * (1 + taxableReturnRate);

    let nisaContribution = 0;
    let selfNISAContribution = 0;
    let spouseNISAContribution = 0;
    let taxableContribution = 0;
    let nisaWithdrawal = 0;
    let taxableWithdrawal = 0;

    cumulativeCash += annualNetCashFlow;

    const monthlyExpense = baseLivingExpense / 12;
    const cashReserveTarget = monthlyExpense * cashReserveMonths;

    // NISA取り崩しヘルパー: 時価を売却し、簿価を比例で減少（翌年に枠復活）
    const sellNISA = (asset: { v: number; c: number }, amount: number) => {
      const sell = Math.min(amount, asset.v);
      if (sell <= 0 || asset.v <= 0) return 0;
      const costRatio = asset.c / asset.v; // 簿価率
      asset.c -= sell * costRatio;          // 簿価も比例で減少 → この分の枠が翌年復活
      asset.v -= sell;
      return sell;
    };

    // Phase 8: 取り崩しヘルパー（configurable withdrawal order）
    const withdrawOrder = bp?.withdrawalOrder || ["taxable", "spouseNisa", "selfNisa"];
    const withdrawToTarget = (targetCash: number) => {
      let deficit = targetCash - cumulativeCash;
      if (deficit <= 0) return;

      for (const source of withdrawOrder) {
        if (deficit <= 0) break;
        if (source === "taxable" && cumulativeTaxable > 0) {
          const gainRatio = cumulativeTaxableCost > 0
            ? Math.max(cumulativeTaxable - cumulativeTaxableCost, 0) / cumulativeTaxable : 0;
          const netRatio = 1 - gainRatio * TAXABLE_TAX_RATE;
          const sellNeeded = Math.min(Math.ceil(deficit / netRatio), cumulativeTaxable);
          const tax = Math.round(sellNeeded * gainRatio * TAXABLE_TAX_RATE);
          taxableWithdrawal += sellNeeded;
          cumulativeTaxable -= sellNeeded;
          cumulativeTaxableCost = Math.max(cumulativeTaxableCost * (cumulativeTaxable / (cumulativeTaxable + sellNeeded) || 0), 0);
          cumulativeCash += sellNeeded - tax;
          deficit = Math.max(targetCash - cumulativeCash, 0);
        } else if (source === "spouseNisa" && spouseNISAAsset > 0) {
          const spRef = { v: spouseNISAAsset, c: spouseNISACostBasis };
          const sold = sellNISA(spRef, deficit);
          spouseNISAAsset = spRef.v; spouseNISACostBasis = spRef.c;
          nisaWithdrawal += sold; cumulativeCash += sold;
          deficit = Math.max(targetCash - cumulativeCash, 0);
        } else if (source === "selfNisa" && selfNISAAsset > 0) {
          const selfRef = { v: selfNISAAsset, c: selfNISACostBasis };
          const sold = sellNISA(selfRef, deficit);
          selfNISAAsset = selfRef.v; selfNISACostBasis = selfRef.c;
          nisaWithdrawal += sold; cumulativeCash += sold;
          deficit = Math.max(targetCash - cumulativeCash, 0);
        }
      }
    };

    if (nisa && nisaPriority) {
      if (cumulativeCash > cashReserveTarget) {
        const excess = cumulativeCash - cashReserveTarget;
        // 死亡者のNISA枠は使えない（口座閉鎖済み）
        const selfRoom = isSelfDead ? 0 : Math.max(Math.min(selfNISAAnnualLimit, selfNISALifetimeLimit - selfNISACostBasis), 0);
        const spouseRoom = isSpouseDead ? 0 : Math.max(Math.min(spouseNISAAnnualLimit, spouseNISALifetimeLimit - spouseNISACostBasis), 0);
        const selfContrib = Math.min(excess, selfRoom);
        const spouseContrib = Math.min(excess - selfContrib, spouseRoom);
        selfNISAContribution = selfContrib;
        spouseNISAContribution = spouseContrib;
        nisaContribution = selfContrib + spouseContrib;
        const remaining = excess - nisaContribution;
        if (remaining > 0) taxableContribution = remaining;
        // 時価と簿価の両方を増加
        selfNISAAsset += selfContrib; selfNISACostBasis += selfContrib;
        spouseNISAAsset += spouseContrib; spouseNISACostBasis += spouseContrib;
        cumulativeCash -= nisaContribution + taxableContribution;
      } else if (cumulativeCash < cashReserveTarget) {
        withdrawToTarget(cashReserveTarget);
      }
    } else {
      if (cumulativeCash < cashReserveTarget) withdrawToTarget(cashReserveTarget);
    }

    cumulativeTaxable += taxableContribution;
    cumulativeTaxableCost += taxableContribution;

    const taxableGain = Math.max(cumulativeTaxable - cumulativeTaxableCost, 0);
    const taxableUnrealizedTax = Math.round(taxableGain * TAXABLE_TAX_RATE);
    const taxableAfterTax = cumulativeTaxable - taxableUnrealizedTax;
    const totalNISA = selfNISAAsset + spouseNISAAsset;
    const cumulativeSavings = cumulativeCash + totalNISA + taxableAfterTax;

    totalC += aT;
    totalPensionLoss += pensionLossAnnual + spousePensionLossAnnual;

    // ===== DC/iDeCo受取: 受取開始年齢に達したら振替 =====
    // iDeCo/DCは60歳から75歳まで受取可能（退職年齢とは独立）
    // 受取開始年齢(annuityStartAge)に達した年にDC→現金振替
    let dcReceiveLumpSum = 0;
    let dcReceiveAnnuityAnnual = 0;
    let selfDCReceiveTax = 0, spouseDCReceiveTax = 0;
    let selfDCReceiveLumpSum = 0, spouseDCReceiveLumpSum = 0;
    let selfDCReceiveAnnuityAnnual = 0, spouseDCReceiveAnnuityAnnual = 0;
    let selfDCRetirementDeduction = 0, spouseDCRetirementDeduction = 0;
    {
      const processDCReceive = (label: string, asset: number, rm: DCReceiveMethod, retDed: number, otherRet: number, memberAge: number): number => {
        if (asset <= 0) return asset;
        const startAge = rm.annuityStartAge || 65;
        if (memberAge !== startAge) return asset;
        // 受取開始年齢に到達
        // DC受取は「資産の現金化」であり支出ではない。税金のみ dcReceiveTax に計上。
        if (rm.type === "lump_sum") {
          const tax = rTxC(asset + otherRet, retDed) - rTxC(otherRet, retDed);
          dcReceiveTax += tax;
          dcReceiveLumpSum += asset;
          eventCostBreakdown.push({ label: `DC一時金受取(${label})`, icon: "💰", color: "#16a34a", amount: 0,
            detail: `DC${Math.round(asset/10000)}万→現金化 控除${Math.round(retDed/10000)}万 税${Math.round(tax/10000)}万`,
            isPhaseChange: true, phaseLabel: `DC一時金受取(${label})` });
          cumulativeCash += asset - tax;
          return 0;
        }
        if (rm.type === "combined") {
          const ratio = (rm.combinedLumpSumRatio || 50) / 100;
          const lumpPart = Math.round(asset * ratio);
          const annuityPart = asset - lumpPart;
          const annuityAnnual = Math.round(annuityPart / (rm.annuityYears || 20));
          const tax = rTxC(lumpPart + otherRet, retDed) - rTxC(otherRet, retDed);
          dcReceiveTax += tax;
          dcReceiveLumpSum += lumpPart;
          dcReceiveAnnuityAnnual += annuityAnnual;
          eventCostBreakdown.push({ label: `DC併用受取(${label})`, icon: "💰", color: "#16a34a", amount: 0,
            detail: `一時金${Math.round(lumpPart/10000)}万 年金${Math.round(annuityAnnual/10000)}万/年×${rm.annuityYears||20}年`,
            isPhaseChange: true, phaseLabel: `DC併用受取(${label})` });
          cumulativeCash += lumpPart - tax;
          return annuityPart;
        }
        // 年金のみ
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
      selfDCAsset = processDCReceive("本人", selfDCAsset, rm, selfRetDed, otherRet, age);
      selfDCReceiveTax = dcReceiveTax - preSelfTax;
      selfDCReceiveLumpSum = dcReceiveLumpSum - preSelfLump;
      selfDCReceiveAnnuityAnnual = dcReceiveAnnuityAnnual - preSelfAnn;
      if (selfDCReceiveLumpSum > 0 || selfDCReceiveAnnuityAnnual > 0) selfDCRetirementDeduction = selfRetDed;

      if (spouseDCAsset > 0 && spouse) {
        const preSpTax = dcReceiveTax, preSpLump = dcReceiveLumpSum, preSpAnn = dcReceiveAnnuityAnnual;
        const spRM = spouse.dcReceiveMethod || DEFAULT_DC_RECEIVE_METHOD;
        const spContribYears = yearResults.filter(yr => yr.spouse.dcContribution > 0).length + 1;
        const spRetDed = rDed(Math.max(spContribYears, 1));
        spouseDCAsset = processDCReceive("配偶者", spouseDCAsset, spRM, spRetDed, 0, spouseAge);
        spouseDCReceiveTax = dcReceiveTax - preSpTax;
        spouseDCReceiveLumpSum = dcReceiveLumpSum - preSpLump;
        spouseDCReceiveAnnuityAnnual = dcReceiveAnnuityAnnual - preSpAnn;
        if (spouseDCReceiveLumpSum > 0 || spouseDCReceiveAnnuityAnnual > 0) spouseDCRetirementDeduction = spRetDed;
      }
      cumulativeDCAsset = selfDCAsset + spouseDCAsset;
    }

    // DC受取後の値で cumulativeSavings を再計算
    const postTotalNISA = selfNISAAsset + spouseNISAAsset;
    const postTaxableGain = Math.max(cumulativeTaxable - cumulativeTaxableCost, 0);
    const postTaxableAfterTax = cumulativeTaxable - Math.round(postTaxableGain * TAXABLE_TAX_RATE);
    const postCumulativeSavings = cumulativeCash + postTotalNISA + postTaxableAfterTax;

    const sp = spouseTaxResult; // alias
    const spouseFuruDed = sp.furusatoDonation > 0 ? Math.max(sp.furusatoDonation - 2000, 0) : 0;

    yearResults.push({
      age, grossMan: grownGrossMan,
      baseLivingExpense, eventOnetime, eventOngoing, totalExpense,
      takeHomePay,
      basicDeduction: 480000, spouseDeductionAmount: spouseDedAmount,
      dcMonthly: dcTotal, companyDC, idecoMonthly, annualContribution: aT,
      annualBenefit: aBen, annualNetBenefit: aBen,
      cumulativeDCAsset, cumulativeReinvest, annualNetCashFlow,
      cumulativeSavings: postCumulativeSavings, totalWealth: postCumulativeSavings + cumulativeDCAsset,
      pensionLossAnnual, pensionTax, pensionReduction, survivorIncome,
      survivorBasicPension, survivorEmployeePension, survivorWidowSupplement, survivorIncomeProtection,
      loanBalance,
      childCount: childEvents.length, dependentDeduction: dependentDeductionTotal, childAllowance,
      nisaContribution, nisaWithdrawal, nisaAsset: totalNISA,
      nisaGain: totalNISA - selfNISACostBasis - spouseNISACostBasis,
      taxableContribution, taxableWithdrawal, taxableAsset: cumulativeTaxable, taxableGain,
      cashSavings: cumulativeCash,
      insurancePremiumTotal, insurancePayoutTotal,
      inheritanceTax, inheritanceEstate,
      dcReceiveTax,
      propertySaleProceeds, propertyCapitalGainsTax, giftTax,
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
        dcAsset: selfDCAsset, loanBalance: selfLoanBalance,
        dcReceiveLumpSum: selfDCReceiveLumpSum, dcReceiveAnnuityAnnual: selfDCReceiveAnnuityAnnual,
        dcRetirementDeduction: selfDCRetirementDeduction, dcReceiveTax: selfDCReceiveTax,
        nisaAsset: selfNISAAsset, nisaCostBasis: selfNISACostBasis, nisaContribution: selfNISAContribution,
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
        dcAsset: spouseDCAsset, loanBalance: spouseLoanBalance,
        dcReceiveLumpSum: spouseDCReceiveLumpSum, dcReceiveAnnuityAnnual: spouseDCReceiveAnnuityAnnual,
        dcRetirementDeduction: spouseDCRetirementDeduction, dcReceiveTax: spouseDCReceiveTax,
        nisaAsset: spouseNISAAsset, nisaCostBasis: spouseNISACostBasis, nisaContribution: spouseNISAContribution,
      },
    });
  }

  const assetFV = cumulativeDCAsset;
  const fvB = cumulativeReinvest;
  const lPL = totalPensionLoss * PY;
  const dcRetDed = rDed(effectiveYears);

  // ===== DC/iDeCo受取方法に応じた税計算（本人・配偶者別） =====
  const rmFinal = effectiveDCReceiveMethod || DEFAULT_DC_RECEIVE_METHOD;
  const dcReceiveDetail = calcDCReceiveTax(selfDCAsset, otherRet, dcRetDed, rmFinal, retirementAge, rr);

  let spouseDCReceiveDetail: import("./types").DCReceiveDetail | undefined;
  if (spouseDCAsset > 0 && spouse) {
    const spContribYears = yearResults.filter(yr => yr.spouse.dcContribution > 0).length;
    const spYears = spContribYears > 0 ? spContribYears : effectiveYears;
    const spRetDed = rDed(spYears);
    spouseDCReceiveDetail = calcDCReceiveTax(spouseDCAsset, 0, spRetDed, spouseRM, retirementAge, rr);
  }

  const exitDelta = dcReceiveDetail.totalTax + (spouseDCReceiveDetail?.totalTax || 0);
  // DC手取り = 各人のnetAmount合計（一時金の場合はDC−税、年金の場合は運用益込み税引後総額）
  const dcNetTotal = dcReceiveDetail.netAmount + (spouseDCReceiveDetail?.netAmount || 0);
  const finalAssetNet = dcNetTotal;
  const ly = yearResults[yearResults.length - 1];
  const finalSavings = ly ? ly.cumulativeSavings : effectiveCurrentAssets * 10000;
  const finalWealth = finalAssetNet + finalSavings; // fvB(再投資)は目安のため総資産に含めない
  const finalScore = fvB - lPL - exitDelta;

  return {
    scenario: s, yearResults,
    totalC, assetFV, fvB, lPL, pvPL: lPL,
    dcRetDed, exitDelta, finalAssetNet, finalWealth, finalScore,
    multiPhase: dcTotalKF.length > 1 || idecoKF.length > 1 || incomeKF.length > 1,
    hasFuru, dcReceiveDetail, spouseDCReceiveDetail,
  };
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
