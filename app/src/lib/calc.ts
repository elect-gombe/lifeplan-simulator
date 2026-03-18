import type { Scenario, YearResult, ScenarioResult, BaseResult, TaxOpts, Keyframe, LifeEvent, EventYearCost, PropertyParams, CarParams, SpouseConfig, NISAConfig, BalancePolicy } from "./types";
import { resolveKF, isEventActive, resolveEventAge } from "./types";
import { txInc, mR, fLm, calcFurusatoDonation, iTx, rTx, apTxCr, hlResidentCap, rDed, rTxC, annuityTax, estimatePublicPension, empDed, spouseDeduction, calcLifeInsuranceDeduction } from "./tax";

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
function calcSurvivorPension(
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

// Compute yearly costs from a property event
function computePropertyYearCost(pp: PropertyParams, yearsSincePurchase: number, inflationFactor: number = 1): EventYearCost[] {
  const costs: EventYearCost[] = [];
  const loanAmount = (pp.priceMan - pp.downPaymentMan) * 10000;
  const repType = pp.repaymentType || "equal_payment";

  // Down payment + closing costs (year 0 only)
  if (yearsSincePurchase === 0) {
    const closingCost = Math.round(pp.priceMan * 0.07);
    costs.push({ label: "頭金＋諸費用", icon: "🏠", color: "#3b82f6", amount: (pp.downPaymentMan + closingCost) * 10000 });
  }

  // Mortgage payment (ローンがある場合のみ)
  if (loanAmount > 0 && yearsSincePurchase < pp.loanYears) {
    let rate: number;
    let rateLabel: string;
    let isPhaseChange = false;
    let phaseLabel: string | undefined;

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

    let annualPayment: number;
    let monthlyDisplay: number;
    const repLabel = repType === "equal_principal" ? "元金均等" : "元利均等";

    if (repType === "equal_principal") {
      annualPayment = calcAnnualPaymentPrincipalEqual(loanAmount, rate, pp.loanYears, yearsSincePurchase);
      monthlyDisplay = calcMonthlyPaymentPrincipalEqual(loanAmount, rate, pp.loanYears, yearsSincePurchase);
    } else {
      const monthly = calcMonthlyPaymentEqual(loanAmount, rate, pp.loanYears);
      annualPayment = monthly * 12;
      monthlyDisplay = monthly;
    }

    const balance = loanBalanceAfterYears(loanAmount, rate, pp.loanYears, yearsSincePurchase, repType);
    costs.push({
      label: `ローン返済(${repLabel}/${rateLabel})`, icon: "🏦", color: "#3b82f6",
      amount: annualPayment, detail: `残高${Math.round(balance / 10000)}万 月額${Math.round(monthlyDisplay / 10000)}万`,
      isPhaseChange, phaseLabel,
    });

    // Loan deduction (13 years, 0.7% of balance, max 35万)
    // ペアローン: deductionTarget に応じて本人/配偶者に分割
    if (pp.hasLoanDeduction && yearsSincePurchase < HOUSING_LOAN_DEDUCTION_YEARS) {
      const deduction = Math.min(Math.round(balance * HOUSING_LOAN_DEDUCTION_RATE), HOUSING_LOAN_DEDUCTION_MAX);
      const isLastYear = yearsSincePurchase === HOUSING_LOAN_DEDUCTION_YEARS - 1;
      const detailBase = `残高${Math.round(balance / 10000)}万×0.7% (${yearsSincePurchase + 1}/13年目)`;
      const dedTarget = pp.deductionTarget || "self";
      if (dedTarget === "both") {
        const selfRatio = (pp.pairRatio ?? 50) / 100;
        const selfDed = Math.round(deduction * selfRatio);
        const spouseDed = deduction - selfDed;
        if (selfDed > 0) {
          costs.push({
            label: "住宅ローン控除(本人)", icon: "🏠", color: "#16a34a", amount: -selfDed,
            detail: `${detailBase} 本人${Math.round(selfRatio * 100)}%`,
            isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined,
          });
        }
        if (spouseDed > 0) {
          costs.push({
            label: "住宅ローン控除(配偶者)", icon: "🏠", color: "#16a34a", amount: -spouseDed,
            detail: `${detailBase} 配偶者${Math.round((1 - selfRatio) * 100)}%`,
            isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined,
          });
        }
      } else {
        const dedLabel = dedTarget === "spouse" ? "住宅ローン控除(配偶者)" : "住宅ローン控除(本人)";
        costs.push({
          label: dedLabel, icon: "🏠", color: "#16a34a", amount: -deduction,
          detail: detailBase,
          isPhaseChange: isLastYear, phaseLabel: isLastYear ? "住宅ローン控除 終了" : undefined,
        });
      }
    } else if (pp.hasLoanDeduction && yearsSincePurchase === HOUSING_LOAN_DEDUCTION_YEARS) {
      costs.push({
        label: "住宅ローン控除終了", icon: "🏠", color: "#94a3b8", amount: 0,
        isPhaseChange: true, phaseLabel: "住宅ローン控除 終了",
      });
    }
  } else if (loanAmount > 0 && yearsSincePurchase === pp.loanYears) {
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
function dependentDeduction(childAge: number): number {
  if (childAge < 16) return 0;
  if (childAge < 19) return 380000;
  if (childAge < 23) return 630000;
  return 0;
}

// 児童手当 (2024改正後): 月額
function childAllowanceMonthly(childAge: number, childIndex: number): number {
  if (childAge < 0 || childAge >= 18) return 0;
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

// Spouse tax calculation — same framework as main person
interface SpouseTaxResult {
  gross: number;
  adjGross: number;             // DC自己負担控除後の収入(税計算ベース)
  sir: number;                  // 社保料率(小数)
  incomeTax: number;
  residentTax: number;
  socialInsurance: number;
  dcContribution: number;       // DC合計年額
  idecoContribution: number;    // iDeCo年額
  selfDCContribution: number;   // 自己負担DC年額
  incomeTaxSaving: number;
  residentTaxSaving: number;
  furusatoLimit: number;
  furusatoDonation: number;
  takeHome: number;
  taxableIncome: number;        // 課税所得(ふるさと控除後=税計算ベース)
  marginalRate: number;
  hlDeduction: number;          // 住宅ローン控除 適用額
  hlAvail: number;              // 住宅ローン控除 可能額
  hlIT: number;                 // 住宅ローン控除 所得税から
  hlRT: number;                 // 住宅ローン控除 住民税から
}
function calcSpouseFullTax(
  grossMan: number, sirPct: number,
  dcTotal: number, companyDC: number, idecoMonthly: number,
  hasFurusato: boolean, housingLoanDed: number,
  dependentDeductionTotal: number = 0,
  lifeInsuranceDed: number = 0
): SpouseTaxResult {
  const gross = grossMan * 10000;
  const zero: SpouseTaxResult = { gross: 0, adjGross: 0, sir: 0, incomeTax: 0, residentTax: 0, socialInsurance: 0,
    dcContribution: 0, idecoContribution: 0, selfDCContribution: 0,
    incomeTaxSaving: 0, residentTaxSaving: 0, furusatoLimit: 0, furusatoDonation: 0, takeHome: 0,
    taxableIncome: 0, marginalRate: 0, hlDeduction: 0, hlAvail: 0, hlIT: 0, hlRT: 0 };
  if (gross <= 0) return zero;

  const sir = sirPct / 100;
  const ds = Math.max(dcTotal - companyDC, 0);
  const aDS = ds * 12;
  const aI = idecoMonthly * 12;
  const aT = (dcTotal + idecoMonthly) * 12;
  const selfDC = ds * 12;
  const spTaxOpts = { dependentsCount: 0, lifeInsuranceDeduction: lifeInsuranceDed, sirPct, dependentDeductionTotal };

  const spEstHLRT = (ti: number) => {
    if (housingLoanDed <= 0) return 0;
    const estIT = iTx(ti);
    const itUsed = Math.min(estIT, housingLoanDed);
    return Math.min(housingLoanDed - itUsed, hlResidentCap(ti));
  };

  // Base tax (no DC/iDeCo)
  const baseTI = txInc(gross, spTaxOpts);
  const baseMR = mR(baseTI);
  const baseFL = fLm(baseTI, baseMR, spEstHLRT(baseTI));
  const baseFuruDon = hasFurusato ? calcFurusatoDonation(baseFL) : 0;
  const baseFDed = hasFurusato ? Math.max(baseFuruDon - 2000, 0) : 0;
  const baseTIaF = Math.max(baseTI - baseFDed, 0);
  const baseIT = iTx(baseTIaF), baseRT = rTx(baseTIaF);
  const baseTaxAdj = apTxCr(baseIT, baseRT, housingLoanDed, baseTIaF);

  // Tax with DC/iDeCo
  const adjG = gross - aDS;
  const adjTI = Math.max(txInc(adjG, spTaxOpts) - aI, 0);
  const nMR = mR(adjTI);
  const nFL = fLm(adjTI, nMR, spEstHLRT(adjTI));
  const furuDonNew = hasFurusato ? calcFurusatoDonation(nFL) : 0;
  const nFDed = hasFurusato ? Math.max(furuDonNew - 2000, 0) : 0;
  const adjTIaF = Math.max(adjTI - nFDed, 0);
  const nIT = iTx(adjTIaF), nRT = rTx(adjTIaF);
  const nTaxAdj = apTxCr(nIT, nRT, housingLoanDed, adjTIaF);

  const incomeTax = nTaxAdj.it;
  const residentTax = nTaxAdj.rt;
  const socialInsurance = Math.round(gross * sir);

  const itSv = baseTaxAdj.it - nTaxAdj.it;
  const rtSv = baseTaxAdj.rt - nTaxAdj.rt;

  const takeHome = gross - incomeTax - residentTax - socialInsurance - selfDC - aI;

  return {
    gross, adjGross: adjG, sir,
    incomeTax, residentTax, socialInsurance,
    dcContribution: aT, idecoContribution: aI, selfDCContribution: selfDC,
    incomeTaxSaving: itSv, residentTaxSaving: rtSv,
    furusatoLimit: nFL, furusatoDonation: furuDonNew,
    takeHome, taxableIncome: Math.round(adjTIaF), marginalRate: mR(adjTIaF),
    hlDeduction: nTaxAdj.itUsed + nTaxAdj.rtUsed, hlAvail: housingLoanDed,
    hlIT: nTaxAdj.itUsed, hlRT: nTaxAdj.rtUsed,
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
  const events = [...baseEvents, ...ownEvents].sort((a, b) => a.age - b.age);

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
  const nisaReturnRate = r; // 共通の運用利回りを使用
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
  // 特定口座 (taxable): same return rate, but gains taxed at 20.315%
  const TAXABLE_TAX_RATE = TAXABLE_ACCOUNT_TAX_RATE;
  const taxableReturnRate = nisaReturnRate;

  // Balance policy
  const bp: BalancePolicy | undefined = bpConfig;
  const cashReserveMonths = bp ? bp.cashReserveMonths : 6;
  const nisaPriority = bp ? bp.nisaPriority : (nisa ? true : false);

  // 配偶者DC受取方法
  const spouseRM = spouse?.dcReceiveMethod || { type: "lump_sum" as const, annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 };

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

    // 本人の老齢年金（自動計算: 平均年収×加入年数から算出）
    const selfPensionStartAge = effectivePensionStartAge ?? 65;
    const selfWorkStartAge = effectivePensionWorkStartAge ?? 22;
    let selfPensionIncome = 0;
    let selfPensionEmployeeAnnual = 0; // 老齢厚生年金（報酬比例部分、併給調整用）
    let selfPensionDetail = "";
    if (!isSelfDead && age >= selfPensionStartAge) {
      const avgSalary = salaryYears > 0 ? cumulativeSalary / salaryYears : 0;
      const employeeMonths = Math.max(Math.min(selfRetirementAge, 65) - selfWorkStartAge, 0) * 12;
      const nationalMonths = Math.min((65 - 20) * 12, 480);
      const pe = estimatePublicPension(avgSalary, employeeMonths, nationalMonths, selfPensionStartAge);
      selfPensionIncome = pe.totalAnnual;
      selfPensionEmployeeAnnual = Math.round(pe.employeeAnnual * pe.adjustmentFactor);
      selfPensionDetail = pe.detail;
    }

    // 配偶者の老齢年金（自動計算）
    const spPensionStartAge = spouse?.pensionStartAge ?? 65;
    const spWorkStartAge = spouse?.pensionWorkStartAge ?? 22;
    let spousePensionIncome = 0;
    let spousePensionEmployeeAnnual = 0; // 老齢厚生年金（報酬比例部分、併給調整用）
    let spousePensionDetail = "";
    if (spouse && !isSpouseDead && spouseAge >= spPensionStartAge) {
      const avgSpSalary = spouseSalaryYears > 0 ? spouseCumulativeSalary / spouseSalaryYears : 0;
      const spRetAge = spouse.retirementAge ?? 65;
      const spEmployeeMonths = Math.max(Math.min(spRetAge, 65) - spWorkStartAge, 0) * 12;
      const spNationalMonths = Math.min((65 - 20) * 12, 480);
      const pe = estimatePublicPension(avgSpSalary, spEmployeeMonths, spNationalMonths, spPensionStartAge);
      spousePensionIncome = pe.totalAnnual;
      spousePensionEmployeeAnnual = Math.round(pe.employeeAnnual * pe.adjustmentFactor);
      spousePensionDetail = pe.detail;
    }

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
    // 年金受給中かつ給与収入がある場合、老齢厚生年金を減額
    // 基本月額 + 総報酬月額相当額 > 50万/月 → 超過額の1/2が支給停止
    let pensionReduction = 0;
    if (selfPensionIncome > 0 && gross > 0) {
      const basicMonthly = selfPensionEmployeeAnnual / 12;  // 老齢厚生年金の月額
      const salaryMonthly = gross / 12;                      // 総報酬月額相当額
      if (basicMonthly + salaryMonthly > 500000) {
        const monthlyReduction = (basicMonthly + salaryMonthly - 500000) / 2;
        const annualReduction = Math.min(monthlyReduction * 12, selfPensionEmployeeAnnual);
        pensionReduction += annualReduction;
        selfPensionIncome = selfPensionIncome - annualReduction;
      }
    }

    // Dependent deduction: compute first (needed for both self and spouse tax calc)
    const childEvents = events.filter(e => !isEffDisabled(e) && e.type === "child" && isEventActive(e, age, events));
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

    // 扶養控除は世帯主設定に応じて本人 or 配偶者に適用
    const depHolder = effectiveDepHolder || "self";
    const selfDepDed = depHolder === "self" ? dependentDeductionTotal : 0;
    const spouseDepDed = depHolder === "spouse" ? dependentDeductionTotal : 0;

    // Spouse income (same framework as main person)
    const zeroSpouse: SpouseTaxResult = { gross: 0, incomeTax: 0, residentTax: 0, socialInsurance: 0,
      dcContribution: 0, idecoContribution: 0, selfDCContribution: 0,
      incomeTaxSaving: 0, residentTaxSaving: 0, furusatoLimit: 0, furusatoDonation: 0, takeHome: 0 };
    let spouseTaxResult: SpouseTaxResult = zeroSpouse;
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
      const eAge = resolveEventAge(e, events);
      const yearsSince = age - eAge;
      if (yearsSince >= HOUSING_LOAN_DEDUCTION_YEARS) continue;
      const loanAmt = (pp.priceMan - pp.downPaymentMan) * 10000;
      if (loanAmt <= 0) continue;
      const rate = pp.rateType === "fixed" ? pp.fixedRate
        : (yearsSince >= pp.variableRiseAfter ? pp.variableRiskRate : pp.variableInitRate);
      const bal = loanBalanceAfterYears(loanAmt, rate, pp.loanYears, yearsSince, pp.repaymentType || "equal_payment");
      const ded = Math.min(Math.round(bal * HOUSING_LOAN_DEDUCTION_RATE), HOUSING_LOAN_DEDUCTION_MAX);
      const dedTarget = pp.deductionTarget || "self";
      if (dedTarget === "spouse") {
        preSpouseHLDed += ded;
      } else if (dedTarget === "both") {
        const selfRatio = (pp.pairRatio ?? 50) / 100;
        preSpouseHLDed += ded - Math.round(ded * selfRatio);
      }
    }

    if (spouse) {
      const spouseAge = spouse.currentAge + yearsFromStart;
      const spouseRetired = spouseAge >= (spouse.retirementAge ?? 65);
      if (isSpouseDead || spouseRetired) {
        spouseTaxResult = zeroSpouse;
      } else {
        const spGrossMan = resolveKF(spouse.incomeKF, spouseAge, 0);
        let spGrowthYears = 0;
        for (let ki = spouse.incomeKF.length - 1; ki >= 0; ki--) {
          if (spouse.incomeKF[ki].age <= spouseAge) { spGrowthYears = spouseAge - spouse.incomeKF[ki].age; break; }
        }
        const grownSpGrossMan = spGrossMan * Math.pow(1 + (spouse.salaryGrowthRate || 0) / 100, spGrowthYears);
        const spDCTotal = resolveKF(spouse.dcTotalKF || [], spouseAge, 0);
        const spCompanyDC = resolveKF(spouse.companyDCKF || [], spouseAge, 0);
        const spIdeco = resolveKF(spouse.idecoKF || [], spouseAge, 0);
        const spSirPct = spouse.sirPct || sirPct;
        spouseTaxResult = calcSpouseFullTax(grownSpGrossMan, spSirPct, spDCTotal, spCompanyDC, spIdeco, spouse.hasFurusato, preSpouseHLDed, spouseDepDed, preSpouseLifeInsDed);
      }
    }
    const spouseGross = spouseTaxResult.gross;
    const spouseTakeHome = spouseTaxResult.takeHome;
    if (spouseGross > 0) {
      spouseCumulativeSalary += spouseGross;
      spouseSalaryYears++;
    }

    // 在職老齢年金: 配偶者分
    if (spousePensionIncome > 0 && spouseGross > 0) {
      const basicMonthly = spousePensionEmployeeAnnual / 12;
      const salaryMonthly = spouseGross / 12;
      if (basicMonthly + salaryMonthly > 500000) {
        const monthlyReduction = (basicMonthly + salaryMonthly - 500000) / 2;
        const annualReduction = Math.min(monthlyReduction * 12, spousePensionEmployeeAnnual);
        pensionReduction += annualReduction;
        spousePensionIncome = spousePensionIncome - annualReduction;
      }
    }

    // Base living expense (万円/月 → 年額, with inflation)
    const baseLivingMonthlyMan = resolveKF(expenseKF, age, 15);
    let baseLivingExpense = baseLivingMonthlyMan * 12 * 10000 * inflationFactor;

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

    // Insurance premiums and payouts
    let insurancePremiumTotal = 0;
    let insurancePremiumSelf = 0;   // 本人対象の保険料（生命保険料控除用）
    let insurancePremiumSpouse = 0; // 配偶者対象の保険料（生命保険料控除用）
    let insurancePayoutTotal = 0;

    for (const e of activeEvts) {
      const eAge = resolveEventAge(e, events);
      const yearsSince = age - eAge;

      if (e.propertyParams) {
        const pp = e.propertyParams;
        // 団信: check if the dead person is covered by danshin
        const danshinTarget = pp.danshinTarget || "self";
        const selfDP = selfDeathEvent?.deathParams;
        const spouseDP = spouseDeathEvent?.deathParams;
        const danshinTriggered =
          (isSelfDead && selfDP?.hasDanshin && (danshinTarget === "self" || danshinTarget === "both")) ||
          (isSpouseDead && (spouseDP?.hasDanshin || selfDP?.hasDanshin) && (danshinTarget === "spouse" || danshinTarget === "both"));
        // ペアローン: 団信が片方のみの場合、その人の負担分のみ免除
        const isPair = pp.loanStructure === "pair";
        const selfRatio = isPair ? (pp.pairRatio ?? 50) / 100 : 1;
        const spouseRatio = isPair ? 1 - selfRatio : 0;
        // 団信でカバーされる割合
        let danshinCoverRatio = 0;
        if (danshinTriggered) {
          if (danshinTarget === "both") danshinCoverRatio = 1;
          else if (danshinTarget === "self" && isSelfDead) danshinCoverRatio = selfRatio;
          else if (danshinTarget === "spouse" && isSpouseDead) danshinCoverRatio = spouseRatio;
        }

        if (danshinCoverRatio >= 1) {
          // 全額免除: 管理費・税のみ
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
          const deathEvt = isSelfDead ? selfDeathEvent! : spouseDeathEvent!;
          if (age === resolveEventAge(deathEvt, events)) {
            eventCostBreakdown.push({ label: "団信によるローン免除(全額)", icon: "🛡️", color: "#16a34a", amount: 0, isPhaseChange: true, phaseLabel: "団信発動" });
          }
        } else {
          // 通常計算（部分免除の場合は残りの分を計算）
          const costs = computePropertyYearCost(pp, yearsSince, inflationFactor);
          for (const c of costs) {
            if (danshinCoverRatio > 0 && c.label.includes("ローン返済")) {
              // 部分免除: ローン返済額を減額
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

        // Premium: pay if insured person is alive and within coverage period
        if (!insuredDead && age < ip.coverageEndAge) {
          const premium = ip.premiumMonthlyMan * 12 * 10000;
          insurancePremiumTotal += premium;
          if (insTarget === "spouse") { insurancePremiumSpouse += premium; } else { insurancePremiumSelf += premium; }
          eventCostBreakdown.push({ label: `保険料(${e.label})`, icon: "🛡️", color: "#6366f1", amount: premium });
          eventOngoing += premium;
        }
        // Payout: on insured person's death
        // 保険金はeventCostBreakdown/eventOngoingには入れない（収入セクションで表示）
        // takeHomePayに直接加算
        if (insuredDead) {
          if (ip.insuranceType === "term_life" && insuredDeathYear) {
            insurancePayoutTotal += ip.lumpSumPayoutMan * 10000;
          } else if (ip.insuranceType === "income_protection" && age < ip.payoutUntilAge) {
            insurancePayoutTotal += ip.monthlyPayoutMan * 12 * 10000;
          }
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

    // Property fixed costs that continue after durationYears (管理費・固定資産税)
    for (const e of propertyFixedCostEvts) {
      const pp = e.propertyParams!;
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
    }

    // One-time costs for simple events (non-structured)
    for (const e of onetimeEvts) {
      if (!e.propertyParams && !e.carParams && !e.insuranceParams) {
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

    // Track loan balance (consider 団信 coverage per property)
    let loanBalance = 0;
    for (const e of activeEvts) {
      if (e.propertyParams) {
        const eAge = resolveEventAge(e, events);
        const ys = age - eAge;
        const pp = e.propertyParams;
        const loanAmt = (pp.priceMan - pp.downPaymentMan) * 10000;
        if (ys < pp.loanYears && loanAmt > 0) {
          const dTarget = pp.danshinTarget || "self";
          let coverRatio = 0;
          const selfDP = selfDeathEvent?.deathParams;
          const spouseDP = spouseDeathEvent?.deathParams;
          if (isSelfDead && selfDP?.hasDanshin && (dTarget === "self" || dTarget === "both")) {
            coverRatio += pp.loanStructure === "pair" ? (pp.pairRatio ?? 50) / 100 : 1;
          }
          if (isSpouseDead && (spouseDP?.hasDanshin || selfDP?.hasDanshin) && (dTarget === "spouse" || dTarget === "both")) {
            coverRatio += pp.loanStructure === "pair" ? (1 - (pp.pairRatio ?? 50) / 100) : 0;
          }
          const rate = pp.rateType === "fixed" ? pp.fixedRate : (ys < pp.variableRiseAfter ? pp.variableInitRate : pp.variableRiskRate);
          const bal = loanBalanceAfterYears(loanAmt, rate, pp.loanYears, ys, pp.repaymentType);
          loanBalance += Math.round(bal * (1 - Math.min(coverRatio, 1)));
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
    // 65歳以降の併給調整:
    //   遺族厚生年金 = max(A, B) where A=死亡者報酬比例×3/4, B=死亡者報酬比例×1/2+本人老齢厚生×1/2
    //   実際の支給額 = max(A, B) - 本人の老齢厚生年金（差額支給）
    //   ※老齢基礎年金は全額支給（併給可）、遺族基礎年金は65歳で終了（老齢基礎へ切替）
    let survivorIncome = 0;
    let survivorBasicPension = 0;
    let survivorEmployeePension = 0;
    let survivorWidowSupplement = 0;
    let survivorIncomeProtection = 0;
    if (isDead && dp) {
      const avgSalary = salaryYears > 0 ? cumulativeSalary / salaryYears : defaultGrossMan * 10000;
      const contribYears = salaryYears;
      const childEvtsForPension = events.filter(e => e.type === "child" && isEventActive(e, age, events));
      const childAgesForPension = childEvtsForPension.map(ce => age - resolveEventAge(ce, events));
      const survivorAge = spouse ? spouse.currentAge + (age - currentAge) : age;
      // 本人死亡 → 遺族は配偶者（本人が男なら配偶者は女）
      const spouseIsFemale = selfGender === "male";
      const deathCalYear = baseCalendarYear + (resolveEventAge(selfDeathEvent!, events) - currentAge);
      const pensionCalc = calcSurvivorPension(avgSalary, contribYears, childAgesForPension, survivorAge, spouseIsFemale, deathCalYear);

      // 65歳以降の併給調整: 遺族厚生年金は配偶者の老齢厚生年金との差額のみ
      let adjEmployeePension = pensionCalc.employee;
      if (spousePensionEmployeeAnnual > 0) {
        // B = 死亡者報酬比例×1/2 + 遺族の老齢厚生×1/2
        const optionB = Math.round(pensionCalc.employee / 3 * 4 / 2) + Math.round(spousePensionEmployeeAnnual / 2);
        // A = pensionCalc.employee（既に報酬比例×3/4）
        const maxAmount = Math.max(pensionCalc.employee, optionB);
        adjEmployeePension = Math.max(maxAmount - spousePensionEmployeeAnnual, 0);
      }

      survivorBasicPension += pensionCalc.basic;
      survivorEmployeePension += adjEmployeePension;
      survivorWidowSupplement += pensionCalc.widowSupplement;
      survivorIncome += pensionCalc.basic + adjEmployeePension + pensionCalc.widowSupplement;
      if (dp.incomeProtectionManPerMonth > 0 && age < dp.incomeProtectionUntilAge) {
        const protectionAmt = dp.incomeProtectionManPerMonth * 12 * 10000;
        survivorIncome += protectionAmt;
        survivorIncomeProtection += protectionAmt;
      }
    }
    // Spouse death: survivor pension based on SPOUSE's salary history
    if (isSpouseDead && spouseDeathEvent?.deathParams) {
      const sdp = spouseDeathEvent.deathParams;
      const avgSpouseSalary = spouseSalaryYears > 0 ? spouseCumulativeSalary / spouseSalaryYears : 0;
      if (avgSpouseSalary > 0) {
        const contribYears = spouseSalaryYears;
        const childEvtsForPension = events.filter(e => e.type === "child" && isEventActive(e, age, events));
        const childAgesForPension = childEvtsForPension.map(ce => age - resolveEventAge(ce, events));
        // 配偶者死亡 → 遺族は本人
        const selfIsFemale = selfGender === "female";
        const spouseDeathCalYear = baseCalendarYear + (resolveEventAge(spouseDeathEvent!, events) - currentAge);
        const pensionCalc = calcSurvivorPension(avgSpouseSalary, contribYears, childAgesForPension, age, selfIsFemale, spouseDeathCalYear);

        // 65歳以降の併給調整: 遺族厚生年金は本人の老齢厚生年金との差額のみ
        let adjEmployeePension = pensionCalc.employee;
        if (selfPensionEmployeeAnnual > 0) {
          const optionB = Math.round(pensionCalc.employee / 3 * 4 / 2) + Math.round(selfPensionEmployeeAnnual / 2);
          const maxAmount = Math.max(pensionCalc.employee, optionB);
          adjEmployeePension = Math.max(maxAmount - selfPensionEmployeeAnnual, 0);
        }

        survivorBasicPension += pensionCalc.basic;
        survivorEmployeePension += adjEmployeePension;
        survivorWidowSupplement += pensionCalc.widowSupplement;
        survivorIncome += pensionCalc.basic + adjEmployeePension + pensionCalc.widowSupplement;
      }
      if (sdp.incomeProtectionManPerMonth > 0 && age < sdp.incomeProtectionUntilAge) {
        const protectionAmt = sdp.incomeProtectionManPerMonth * 12 * 10000;
        survivorIncome += protectionAmt;
        survivorIncomeProtection += protectionAmt;
      }
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
    const ds = Math.max(dcTotal - companyDC, 0);
    const aDS = ds * 12;
    const aI = idecoMonthly * 12;
    const aT = (dcTotal + idecoMonthly) * 12;
    const selfDC = ds * 12;

    // Spouse DC/iDeCo (added to household DC tracking)
    const spouseDCTotal = spouseTaxResult.dcContribution;

    // (扶養控除・児童手当は上で計算済み)
    // 生命保険料控除: 保険イベントの保険料から自動計算（手動設定がある場合はそちらを優先）
    const selfLifeInsDed = Math.max(calcLifeInsuranceDeduction(insurancePremiumSelf), taxOpts.lifeInsuranceDeduction || 0);
    const spouseLifeInsDed = calcLifeInsuranceDeduction(insurancePremiumSpouse);
    const effectiveTaxOpts = { ...taxOpts, dependentDeductionTotal: selfDepDed, lifeInsuranceDeduction: selfLifeInsDed };

    // 配偶者控除/配偶者特別控除の計算
    // selfIncome = 本人の合計所得 = gross - empDed(gross) (DC控除前のgrossで判定)
    // spouseIncome = 配偶者の合計所得 = spouseGross - empDed(spouseGross)
    const selfIncomeForSpouseDed = gross > 0 ? gross - empDed(gross) : 0;
    const spouseGrossForDed = spouseTaxResult.gross;
    const spouseIncomeForDed = spouseGrossForDed > 0 ? spouseGrossForDed - empDed(spouseGrossForDed) : 0;
    const spouseDedAmount = spouse ? spouseDeduction(selfIncomeForSpouseDed, spouseIncomeForDed) : 0;

    // Helper: estimate housing loan deduction applied to resident tax
    // (HL deduction is tax credit: first offsets IT, remainder offsets RT up to cap)
    const hlDed = yearHousingLoanDed; // 今年の住宅ローン控除額（イベントから動的算出）
    const estHLRT = (ti: number) => {
      if (hlDed <= 0) return 0;
      const estIT = iTx(ti);
      const itUsed = Math.min(estIT, hlDed);
      return Math.min(hlDed - itUsed, hlResidentCap(ti));
    };

    // *** Base tax: "no DC/iDeCo" scenario using THIS YEAR's gross ***
    const baseTI = Math.max(txInc(gross, effectiveTaxOpts) - spouseDedAmount, 0);
    const baseMR = mR(baseTI);
    const baseFL = fLm(baseTI, baseMR, estHLRT(baseTI));
    const baseFuruDon = hasFuru ? calcFurusatoDonation(baseFL) : 0;
    const baseFDed = hasFuru ? Math.max(baseFuruDon - 2000, 0) : 0;
    const baseTIaF = Math.max(baseTI - baseFDed, 0);
    const baseITraw = iTx(baseTIaF), baseRTraw = rTx(baseTIaF);
    const baseTaxAdj = apTxCr(baseITraw, baseRTraw, hlDed, baseTIaF);

    // Tax with DC/iDeCo
    const adjG = gross - aDS;
    const adjTI = Math.max(txInc(adjG, effectiveTaxOpts) - aI - spouseDedAmount, 0);
    const nMR = mR(adjTI);
    const nFL = fLm(adjTI, nMR, estHLRT(adjTI));
    const furuDonNew = hasFuru ? calcFurusatoDonation(nFL) : 0;
    const nFDed = hasFuru ? Math.max(furuDonNew - 2000, 0) : 0;
    const adjTIaF = Math.max(adjTI - nFDed, 0);

    const nITraw = iTx(adjTIaF), nRTraw = rTx(adjTIaF);
    const nTaxAdj = apTxCr(nITraw, nRTraw, hlDed, adjTIaF);
    const incomeTax = nTaxAdj.it;
    const residentTax = nTaxAdj.rt;
    const socialInsurance = Math.round(gross * sir);

    // Tax savings = base tax - actual tax
    const itSv = baseTaxAdj.it - nTaxAdj.it;
    const rtSv = baseTaxAdj.rt - nTaxAdj.rt;
    const siSv = aDS * sir;
    const aBen = itSv + rtSv + siSv;
    const aNet = aBen;

    // 年金の課税（公的年金等控除適用）
    const totalPensionReceived = selfPensionIncome + spousePensionIncome;
    let pensionTax = 0;
    if (selfPensionIncome > 0) pensionTax += annuityTax(selfPensionIncome, age);
    if (spousePensionIncome > 0) pensionTax += annuityTax(spousePensionIncome, spouseAge);
    const pensionNetIncome = totalPensionReceived - pensionTax;

    // 年金はeventCostBreakdownには入れない（専用セクションで表示）
    // takeHomePayに直接加算済み

    const takeHomePay = gross - incomeTax - residentTax - socialInsurance - selfDC - aI + childAllowance + survivorIncome + spouseTakeHome + pensionNetIncome + insurancePayoutTotal;
    const pensionLossAnnual = (ds * PENSION_RATE_PER_MILLE) / 1000 * 12;
    const spousePensionLossAnnual = spouse ? (spouseTaxResult.selfDCContribution / 12 * PENSION_RATE_PER_MILLE) / 1000 * 12 : 0;
    const annualNetCashFlow = takeHomePay - totalExpense;

    selfDCAsset = selfDCAsset * (1 + r) + aT;
    spouseDCAsset = spouseDCAsset * (1 + r) + spouseDCTotal;
    cumulativeDCAsset = selfDCAsset + spouseDCAsset;
    cumulativeReinvest = cumulativeReinvest * (1 + r) + aNet;

    // ===== 死亡年: 相続計算（全資産統合） =====
    // DC/iDeCo死亡一時金 + 保険金 → みなし相続財産（非課税枠あり）
    // その他資産（現預金, NISA, 特定口座）→ 本来の相続財産
    // 全体で相続税を計算し、税引後を遺族に渡す
    if (isDeathYear) {
      const legalHeirs = Math.max(1 + childEvents.length, 1);
      const hasSpouseSurvivor = !!spouse && !isSpouseDead;
      // DC死亡一時金（みなし相続財産）
      const dcDeath = selfDCAsset;
      // 保険金一時金（この年のinsurancePayoutTotal、みなし相続財産）
      const insDeath = insurancePayoutTotal;
      // 本来の相続財産: 被相続人の資産の一部
      // 簡易: 共有資産の1/2を相続対象とする（配偶者がいる場合）
      const shareRatio = hasSpouseSurvivor ? 0.5 : 1;
      const estateOther = Math.round((cumulativeCash + selfNISAAsset + cumulativeTaxable) * shareRatio);
      const inheritResult = calcInheritanceTax(estateOther, dcDeath, insDeath, legalHeirs, hasSpouseSurvivor);
      inheritanceTax = inheritResult.tax;
      inheritanceEstate = inheritResult.taxableEstate;
      // DC一時金を現金化
      if (dcDeath > 0) {
        eventCostBreakdown.push({
          label: "DC/iDeCo死亡一時金(本人)", icon: "💰", color: "#16a34a", amount: -dcDeath,
          detail: `DC資産${Math.round(dcDeath / 10000)}万→遺族へ`,
        });
        cumulativeCash += dcDeath;
        selfDCAsset = 0;
        cumulativeDCAsset = selfDCAsset + spouseDCAsset;
      }
      // 相続税を計上
      if (inheritanceTax > 0) {
        eventCostBreakdown.push({
          label: "相続税(本人死亡)", icon: "🏛️", color: "#dc2626", amount: inheritanceTax,
          detail: inheritResult.detail,
        });
        cumulativeCash -= inheritanceTax;
      } else {
        eventCostBreakdown.push({
          label: "相続税(本人死亡)", icon: "🏛️", color: "#16a34a", amount: 0,
          detail: inheritResult.detail, isPhaseChange: true, phaseLabel: "相続税なし",
        });
      }
    }
    if (isSpouseDeathYear) {
      const legalHeirs = Math.max(1 + childEvents.length, 1);
      const hasSpouseSurvivor = true; // 本人が生存
      // 配偶者DC死亡一時金
      const dcDeath = spouseDCAsset;
      const insDeath = insurancePayoutTotal;
      const shareRatio = 0.5; // 配偶者の持分
      const estateOther = Math.round((cumulativeCash + spouseNISAAsset + cumulativeTaxable) * shareRatio);
      const inheritResult = calcInheritanceTax(estateOther, dcDeath, insDeath, legalHeirs, hasSpouseSurvivor);
      inheritanceTax = inheritResult.tax;
      inheritanceEstate = inheritResult.taxableEstate;
      if (dcDeath > 0) {
        eventCostBreakdown.push({
          label: "DC/iDeCo死亡一時金(配偶者)", icon: "💰", color: "#16a34a", amount: -dcDeath,
          detail: `配偶者DC資産${Math.round(dcDeath / 10000)}万→遺族へ`,
        });
        cumulativeCash += dcDeath;
        spouseDCAsset = 0;
        cumulativeDCAsset = selfDCAsset + spouseDCAsset;
      }
      if (inheritanceTax > 0) {
        eventCostBreakdown.push({
          label: "相続税(配偶者死亡)", icon: "🏛️", color: "#dc2626", amount: inheritanceTax,
          detail: inheritResult.detail,
        });
        cumulativeCash -= inheritanceTax;
      } else {
        eventCostBreakdown.push({
          label: "相続税(配偶者死亡)", icon: "🏛️", color: "#16a34a", amount: 0,
          detail: inheritResult.detail, isPhaseChange: true, phaseLabel: "相続税なし",
        });
      }
    }

    // ===== NISA死亡時処理 =====
    // NISA口座は相続時に閉鎖。非課税のまま現金化
    if (isDeathYear && selfNISAAsset > 0) {
      eventCostBreakdown.push({ label: "NISA相続(本人)", icon: "📊", color: "#22c55e", amount: -selfNISAAsset,
        detail: `NISA時価${Math.round(selfNISAAsset / 10000)}万(元本${Math.round(selfNISACostBasis / 10000)}万) → 現金化(非課税)` });
      cumulativeCash += selfNISAAsset;
      selfNISACostBasis = 0; selfNISAAsset = 0;
    }
    if (isSpouseDeathYear && spouseNISAAsset > 0) {
      eventCostBreakdown.push({ label: "NISA相続(配偶者)", icon: "📊", color: "#22c55e", amount: -spouseNISAAsset,
        detail: `配偶者NISA時価${Math.round(spouseNISAAsset / 10000)}万(元本${Math.round(spouseNISACostBasis / 10000)}万) → 現金化(非課税)` });
      cumulativeCash += spouseNISAAsset;
      spouseNISACostBasis = 0; spouseNISAAsset = 0;
    }

    // ===== NISA（簿価ベース枠管理）/ 特定口座 / 現金 の自動配分・取り崩し =====
    // 死亡者のNISAは口座閉鎖済み → 残があれば強制現金化
    if (isSelfDead && selfNISAAsset > 0) {
      cumulativeCash += selfNISAAsset;
      selfNISACostBasis = 0; selfNISAAsset = 0;
    }
    if (isSpouseDead && spouseNISAAsset > 0) {
      cumulativeCash += spouseNISAAsset;
      spouseNISACostBasis = 0; spouseNISAAsset = 0;
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

    // 取り崩しヘルパー: 特定口座 → 配偶者NISA → 本人NISA の順
    const withdrawToTarget = (targetCash: number) => {
      let deficit = targetCash - cumulativeCash;
      if (deficit <= 0) return;

      // 1. 特定口座
      if (deficit > 0 && cumulativeTaxable > 0) {
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
      }
      // 2. 配偶者NISA（非課税で売却、簿価分の枠が翌年復活）
      if (deficit > 0 && spouseNISAAsset > 0) {
        const spRef = { v: spouseNISAAsset, c: spouseNISACostBasis };
        const sold = sellNISA(spRef, deficit);
        spouseNISAAsset = spRef.v; spouseNISACostBasis = spRef.c;
        nisaWithdrawal += sold; cumulativeCash += sold;
        deficit = Math.max(targetCash - cumulativeCash, 0);
      }
      // 3. 本人NISA
      if (deficit > 0 && selfNISAAsset > 0) {
        const selfRef = { v: selfNISAAsset, c: selfNISACostBasis };
        const sold = sellNISA(selfRef, deficit);
        selfNISAAsset = selfRef.v; selfNISACostBasis = selfRef.c;
        nisaWithdrawal += sold; cumulativeCash += sold;
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
    // 一時金: 全額を現金化
    // 併用: 一時金割合分を現金化、残りは年金として毎年取崩し（calcDCReceiveTaxで計算済み）
    // 年金: 全額を年金として毎年取崩し
    {
      const processDCReceive = (label: string, asset: number, rm: DCReceiveMethod, retDed: number, otherRet: number): number => {
        if (asset <= 0) return asset;
        const startAge = rm.annuityStartAge || 65;
        if (age !== startAge) return asset;
        // 受取開始年齢に到達
        if (rm.type === "lump_sum") {
          const tax = rTxC(asset + otherRet, retDed) - rTxC(otherRet, retDed);
          dcReceiveTax += tax;
          eventCostBreakdown.push({ label: `DC一時金受取(${label})`, icon: "💰", color: "#ea580c", amount: tax,
            detail: `${age}歳: DC${Math.round(asset/10000)}万 退職所得控除${Math.round(retDed/10000)}万 退職所得税${Math.round(tax/10000)}万`,
            isPhaseChange: true, phaseLabel: `DC一時金受取(${label})` });
          cumulativeCash += asset - tax;
          return 0;
        }
        if (rm.type === "combined") {
          const ratio = (rm.combinedLumpSumRatio || 50) / 100;
          const lumpPart = Math.round(asset * ratio);
          const annuityPart = asset - lumpPart;
          const tax = rTxC(lumpPart + otherRet, retDed) - rTxC(otherRet, retDed);
          dcReceiveTax += tax;
          eventCostBreakdown.push({ label: `DC併用受取開始(${label})`, icon: "💰", color: "#ea580c", amount: tax,
            detail: `${age}歳: 一時金${Math.round(lumpPart/10000)}万(${Math.round(ratio*100)}%) 退職所得税${Math.round(tax/10000)}万 年金${Math.round(annuityPart/10000)}万×${rm.annuityYears||20}年`,
            isPhaseChange: true, phaseLabel: `DC併用受取(${label})` });
          cumulativeCash += lumpPart - tax;
          return annuityPart;
        }
        // 年金のみ
        eventCostBreakdown.push({ label: `DC年金受取開始(${label})`, icon: "📋", color: "#ea580c", amount: 0,
          detail: `${age}歳: DC${Math.round(asset/10000)}万を${rm.annuityYears||20}年で取崩し開始`,
          isPhaseChange: true, phaseLabel: `DC年金受取開始(${label})` });
        return asset;
      };

      const rm = effectiveDCReceiveMethod || { type: "lump_sum" as const, annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 };
      selfDCAsset = processDCReceive("本人", selfDCAsset, rm, rDed(effectiveYears), otherRet);

      if (spouseDCAsset > 0 && spouse) {
        const spRM = spouse.dcReceiveMethod || { type: "lump_sum" as const, annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 };
        const spContribYears = yearResults.filter(yr => yr.spouseDCContribution > 0).length + 1;
        spouseDCAsset = processDCReceive("配偶者", spouseDCAsset, spRM, rDed(Math.max(spContribYears, 1)), 0);
      }
      cumulativeDCAsset = selfDCAsset + spouseDCAsset;
    }

    // DC受取後の値で cumulativeSavings を再計算
    const postTotalNISA = selfNISAAsset + spouseNISAAsset;
    const postTaxableGain = Math.max(cumulativeTaxable - cumulativeTaxableCost, 0);
    const postTaxableAfterTax = cumulativeTaxable - Math.round(postTaxableGain * TAXABLE_TAX_RATE);
    const postCumulativeSavings = cumulativeCash + postTotalNISA + postTaxableAfterTax;

    yearResults.push({
      age, gross, grossMan: grownGrossMan,
      baseLivingExpense, eventOnetime, eventOngoing, totalExpense,
      incomeTax, residentTax, socialInsurance, takeHomePay,
      // Tax detail — 全て実際の税計算と整合する値を格納
      // DC選択制は gross を減らしてから控除計算 → adjG = gross - selfDC
      employeeDeduction: Math.round(empDed(adjG)),        // 給与所得控除(adjGベース)
      taxableIncome: Math.round(adjTIaF),                 // 課税所得(ふるさと控除後=税計算ベース)
      marginalRate: mR(adjTIaF),                          // 課税所得に対する最高税率
      basicDeduction: 480000,
      selfDependentDeduction: selfDepDed,
      spouseDeductionAmount: spouseDedAmount,
      housingLoanDeduction: nTaxAdj.itUsed + nTaxAdj.rtUsed,
      housingLoanDeductionAvail: hlDed,
      housingLoanDeductionIT: nTaxAdj.itUsed,
      housingLoanDeductionRT: nTaxAdj.rtUsed,
      spouseHousingLoanDeduction: spouseTaxResult.hlDeduction,
      spouseHousingLoanDeductionAvail: spouseTaxResult.hlAvail,
      spouseHousingLoanDeductionIT: spouseTaxResult.hlIT,
      spouseHousingLoanDeductionRT: spouseTaxResult.hlRT,
      dcIdecoDeduction: aDS + aI,                         // DC自己負担+iDeCo(所得控除)
      spouseDCIdecoDeduction: spouseTaxResult.dcContribution + spouseTaxResult.idecoContribution,
      lifeInsuranceDeductionAmount: selfLifeInsDed,        // 生命保険料控除額（本人）
      spouseLifeInsuranceDeductionAmount: preSpouseLifeInsDed, // 生命保険料控除額（配偶者）
      socialInsuranceDeduction: Math.round(adjG * sir),    // 社保料控除(adjGベース=税計算で使用)
      spouseSocialInsuranceDeduction: Math.round(spouseTaxResult.adjGross * (spouseTaxResult.sir || sir)),
      furusatoDeduction: nFDed,                            // ふるさと納税控除(寄付額−2000円)
      spouseFurusatoDeduction: spouseTaxResult.furusatoDonation > 0 ? Math.max(spouseTaxResult.furusatoDonation - 2000, 0) : 0,
      spouseEmployeeDeduction: Math.round(empDed(spouseTaxResult.adjGross)),
      spouseTaxableIncome: spouseTaxResult.taxableIncome ?? 0,
      spouseMarginalRate: spouseTaxResult.marginalRate ?? 0,
      dcMonthly: dcTotal, companyDC, idecoMonthly, annualContribution: aT, selfDCContribution: selfDC,
      incomeTaxSaving: itSv, residentTaxSaving: rtSv, socialInsuranceSaving: siSv,
      annualBenefit: aBen, annualNetBenefit: aNet,
      cumulativeDCAsset, selfDCAsset, spouseDCAsset, cumulativeReinvest, annualNetCashFlow,
      cumulativeSavings: postCumulativeSavings, totalWealth: postCumulativeSavings + cumulativeDCAsset + cumulativeReinvest,
      furusatoLimit: nFL, furusatoDonation: furuDonNew,
      pensionLossAnnual, selfPensionIncome, spousePensionIncome, pensionTax, pensionReduction, survivorIncome,
      survivorBasicPension, survivorEmployeePension, survivorWidowSupplement, survivorIncomeProtection,
      loanBalance,
      childCount: childEvents.length, dependentDeduction: dependentDeductionTotal, childAllowance,
      nisaContribution, selfNISAContribution, spouseNISAContribution,
      nisaWithdrawal, nisaAsset: totalNISA, selfNISAAsset, spouseNISAAsset,
      selfNISACostBasis, spouseNISACostBasis, nisaGain: totalNISA - selfNISACostBasis - spouseNISACostBasis,
      taxableContribution, taxableWithdrawal, taxableAsset: cumulativeTaxable, taxableGain,
      cashSavings: cumulativeCash,
      spouseGross,
      spouseIncomeTax: spouseTaxResult.incomeTax, spouseResidentTax: spouseTaxResult.residentTax,
      spouseSocialInsurance: spouseTaxResult.socialInsurance,
      spouseDCContribution: spouseTaxResult.dcContribution, spouseIDeCoContribution: spouseTaxResult.idecoContribution,
      spouseIncomeTaxSaving: spouseTaxResult.incomeTaxSaving, spouseResidentTaxSaving: spouseTaxResult.residentTaxSaving,
      spouseFurusatoLimit: spouseTaxResult.furusatoLimit, spouseFurusatoDonation: spouseTaxResult.furusatoDonation,
      spouseTakeHome,
      insurancePremiumTotal, insurancePayoutTotal,
      inheritanceTax, inheritanceEstate, dcReceiveTax,
      activeEvents: [...activeEvts, ...propertyFixedCostEvts], eventCostBreakdown,
    });
  }

  const assetFV = cumulativeDCAsset;
  const fvB = cumulativeReinvest;
  const lPL = totalPensionLoss * PY;
  const dcRetDed = rDed(effectiveYears);

  // ===== DC/iDeCo受取方法に応じた税計算（本人・配偶者別） =====
  const rmFinal = effectiveDCReceiveMethod || { type: "lump_sum" as const, annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 };
  const dcReceiveDetail = calcDCReceiveTax(selfDCAsset, otherRet, dcRetDed, rmFinal, retirementAge, rr);

  let spouseDCReceiveDetail: import("./types").DCReceiveDetail | undefined;
  if (spouseDCAsset > 0 && spouse) {
    const spContribYears = yearResults.filter(yr => yr.spouseDCContribution > 0).length;
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
  const finalWealth = finalAssetNet + fvB + finalSavings;
  const finalScore = fvB - lPL - exitDelta;

  return {
    scenario: s, yearResults,
    totalC, assetFV, fvB, lPL, pvPL: lPL,
    dcRetDed, exitDelta, finalAssetNet, finalWealth, finalScore,
    multiPhase: dcTotalKF.length > 1 || idecoKF.length > 1 || incomeKF.length > 1,
    hasFuru, dcReceiveDetail, spouseDCReceiveDetail,
  };
}
