import type { TaxOpts } from "./types";

export const BRACKETS = [
  { lo: 0, hi: 1950000, r: 5 },
  { lo: 1950000, hi: 3300000, r: 10 },
  { lo: 3300000, hi: 6950000, r: 20 },
  { lo: 6950000, hi: 9000000, r: 23 },
  { lo: 9000000, hi: 18000000, r: 33 },
  { lo: 18000000, hi: 40000000, r: 40 },
  { lo: 40000000, hi: 9e15, r: 45 },
];

export function empDed(g: number): number {
  if (g <= 1625000) return 550000;
  if (g <= 1800000) return g * 0.4 - 100000;
  if (g <= 3600000) return g * 0.3 + 80000;
  if (g <= 6600000) return g * 0.2 + 440000;
  if (g <= 8500000) return g * 0.1 + 1100000;
  return 1950000;
}

export function iTx(ti: number): number {
  if (ti <= 0) return 0;
  let t = 0;
  for (const b of BRACKETS) {
    if (ti <= b.lo) break;
    t += ((Math.min(ti, b.hi) - b.lo) * b.r) / 100;
  }
  return Math.floor(t);
}

export function mR(ti: number): number {
  for (const b of BRACKETS) {
    if (ti <= b.hi) return b.r;
  }
  return 45;
}

export function rTx(ti: number): number {
  return Math.floor(Math.max(ti, 0) * 0.1);
}

export function txInc(g: number, opts?: TaxOpts & { dependentDeductionTotal?: number }): number {
  const o = opts || {} as TaxOpts;
  // Use precise dependent deduction if provided, otherwise fallback to count * 380000
  const depDed = o.dependentDeductionTotal != null
    ? o.dependentDeductionTotal
    : Math.max(Number(o.dependentsCount) || 0, 0) * 380000;
  const lifeDed = Math.max(Number(o.lifeInsuranceDeduction) || 0, 0);
  const sirRate = (o.sirPct != null ? o.sirPct : 15) / 100; // 社会保険料率
  return Math.max(g - empDed(g) - g * sirRate - 480000 - depDed - lifeDed, 0);
}

export function hlResidentCap(ti: number): number {
  return Math.min(Math.floor(Math.max(ti, 0) * 0.05), 97500);
}

export function apTxCr(it: number, rt: number, cr: number, ti: number) {
  const credit = Math.max(Number(cr) || 0, 0);
  const residentCap = hlResidentCap(ti);
  const itUsed = Math.min(Math.max(it, 0), credit);
  const rest = Math.max(credit - itUsed, 0);
  const rtUsed = Math.min(Math.max(rt, 0), rest, residentCap);
  return { it: Math.max(it - itUsed, 0), rt: Math.max(rt - rtUsed, 0), used: itUsed + rtUsed, itUsed, rtUsed, residentCap };
}

/** ふるさと納税控除上限額
 * = (住民税所得割額 − 住宅ローン控除の住民税分) × 20% ÷ (90% − 所得税率 × 1.021) + 2000
 * @param ti 課税所得（DC/iDeCo控除後、ふるさと控除前）
 * @param mr 所得税の最高税率(%)
 * @param hlRTDeduction 住宅ローン控除のうち住民税から控除される額（住民税所得割を減らす）
 */
export function fLm(ti: number, mr: number, hlRTDeduction: number = 0): number {
  const rtBase = Math.max(Math.max(ti, 0) * 0.1 - hlRTDeduction, 0);
  const d = 0.9 - (mr / 100) * 1.021;
  return d > 0 ? Math.floor((rtBase * 0.2) / d + 2000) : 0;
}

export function calcFurusatoDonation(limit: number): number {
  return Math.max(Math.floor(Math.max(limit, 0) / 1000) * 1000, 0);
}

/**
 * 配偶者控除 / 配偶者特別控除
 * @param selfIncome 本人の合計所得（給与収入 − 給与所得控除）
 * @param spouseIncome 配偶者の合計所得（給与収入 − 給与所得控除）
 * @returns 控除額（円）
 */
export function spouseDeduction(selfIncome: number, spouseIncome: number): number {
  if (selfIncome > 10000000 || spouseIncome >= 1330000) return 0;

  // 本人所得に応じた区分 (0: <=900万, 1: 900超~950万, 2: 950超~1000万)
  const tier = selfIncome <= 9000000 ? 0 : selfIncome <= 9500000 ? 1 : 2;

  // 配偶者控除 (配偶者の合計所得 <= 48万)
  if (spouseIncome <= 480000) {
    return [380000, 260000, 130000][tier];
  }

  // 配偶者特別控除 (配偶者の合計所得 48万超〜133万未満)
  // tier0 deductions by spouse income bracket
  const brackets: [number, number[]][] = [
    [500000,  [380000, 260000, 130000]],
    [550000,  [360000, 240000, 120000]],
    [600000,  [310000, 210000, 110000]],
    [670000,  [260000, 180000, 90000]],
    [750000,  [210000, 140000, 70000]],
    [830000,  [160000, 110000, 60000]],
    [900000,  [110000, 80000, 40000]],
    [950000,  [60000, 40000, 20000]],
    [1000000, [30000, 20000, 10000]],
    [1330000, [0, 0, 0]],
  ];

  for (const [limit, amounts] of brackets) {
    if (spouseIncome <= limit) return amounts[tier];
  }
  return 0;
}

// 生命保険料控除（新制度 2012年〜）
// 一般生命保険料控除の計算（年間保険料 → 控除額、上限4万円）
export function calcLifeInsuranceDeduction(annualPremium: number): number {
  if (annualPremium <= 0) return 0;
  if (annualPremium <= 20000) return annualPremium;
  if (annualPremium <= 40000) return Math.floor(annualPremium / 2 + 10000);
  if (annualPremium <= 80000) return Math.floor(annualPremium / 4 + 20000);
  return 40000;
}

export function fvA(a: number, r: number, n: number): number {
  return r === 0 ? a * n : a * ((Math.pow(1 + r, n) - 1) / r);
}

export function rDed(y: number): number {
  return y <= 20 ? Math.max(400000 * y, 800000) : 8000000 + 700000 * (y - 20);
}

export function rTxC(amt: number, ded: number): number {
  const h = Math.max(Math.floor((amt - ded) / 2), 0);
  return iTx(h) + Math.floor(h * 0.1);
}

// ===== 老齢年金の自動計算（令和6年度基準） =====
// ref: 日本年金機構 https://www.nenkin.go.jp/

/** 老齢基礎年金: 816,000円 × (保険料納付月数 / 480月)
 *  国民年金は20歳〜60歳の40年(480月)が満額
 *  会社員期間は自動的に納付扱い */
const BASIC_PENSION_FULL = 816000; // 令和6年度満額
const BASIC_PENSION_MONTHS = 480;  // 40年

/** 老齢厚生年金(報酬比例部分):
 *  平均標準報酬額 × 5.481/1000 × 厚生年金加入月数
 *  標準報酬月額の上限: 65万/月 */
const EMPLOYEE_PENSION_RATE = 5.481 / 1000;
const STANDARD_SALARY_CAP_MONTHLY = 650000;

/** 繰上げ/繰下げ係数
 *  繰上げ(60-64歳): 1月あたり0.4%減額 → 60歳開始で24%減
 *  繰下げ(66-75歳): 1月あたり0.7%増額 → 75歳開始で84%増 */
function pensionAdjustmentFactor(startAge: number): number {
  if (startAge <= 60) return 1 - 0.004 * (65 - 60) * 12; // max 24% reduction
  if (startAge < 65) return 1 - 0.004 * (65 - startAge) * 12;
  if (startAge === 65) return 1;
  if (startAge <= 75) return 1 + 0.007 * (startAge - 65) * 12;
  return 1 + 0.007 * (75 - 65) * 12; // max 84% increase
}

export interface PensionEstimate {
  basicAnnual: number;        // 老齢基礎年金（年額）
  employeeAnnual: number;     // 老齢厚生年金（年額）
  adjustmentFactor: number;   // 繰上げ/繰下げ係数
  totalBeforeAdj: number;     // 調整前合計
  totalAnnual: number;        // 調整後合計（年額）
  detail: string;
}

/** 老齢年金を自動計算
 * @param avgAnnualSalary 平均年収（円）— 厚生年金加入期間中の平均
 * @param employeeMonths 厚生年金加入月数（会社員期間×12）
 * @param totalNationalMonths 国民年金保険料納付月数（会社員期間含む、最大480）
 * @param startAge 受給開始年齢（60-75）
 */
export function estimatePublicPension(
  avgAnnualSalary: number,
  employeeMonths: number,
  totalNationalMonths: number,
  startAge: number,
): PensionEstimate {
  // 老齢基礎年金
  const cappedNationalMonths = Math.min(totalNationalMonths, BASIC_PENSION_MONTHS);
  const basicAnnual = Math.round(BASIC_PENSION_FULL * cappedNationalMonths / BASIC_PENSION_MONTHS);

  // 老齢厚生年金（報酬比例部分）
  const avgMonthly = Math.min(avgAnnualSalary / 12, STANDARD_SALARY_CAP_MONTHLY);
  const employeeAnnual = Math.round(avgMonthly * EMPLOYEE_PENSION_RATE * employeeMonths);

  const totalBeforeAdj = basicAnnual + employeeAnnual;
  const factor = pensionAdjustmentFactor(startAge);
  const totalAnnual = Math.round(totalBeforeAdj * factor);

  const parts: string[] = [];
  parts.push(`基礎${Math.round(basicAnnual / 10000)}万(${Math.round(cappedNationalMonths / 12)}年)`);
  parts.push(`厚生${Math.round(employeeAnnual / 10000)}万(${Math.round(employeeMonths / 12)}年)`);
  if (factor !== 1) parts.push(`${startAge}歳開始(×${(factor * 100).toFixed(1)}%)`);

  return { basicAnnual, employeeAnnual, adjustmentFactor: factor, totalBeforeAdj, totalAnnual, detail: parts.join(" + ") };
}

// 公的年金等控除（令和2年以降、合計所得1000万以下）
// ref: 国税庁 No.1600
export function publicPensionDeduction(income: number, age: number): number {
  if (age >= 65) {
    if (income <= 1100000) return income; // 全額控除
    if (income <= 3300000) return 1100000;
    if (income <= 4100000) return income * 0.25 + 275000;
    if (income <= 7700000) return income * 0.15 + 685000;
    if (income <= 10000000) return income * 0.05 + 1455000;
    return 1955000;
  } else {
    if (income <= 600000) return income; // 全額控除
    if (income <= 1300000) return 600000;
    if (income <= 4100000) return income * 0.25 + 275000;
    if (income <= 7700000) return income * 0.15 + 685000;
    if (income <= 10000000) return income * 0.05 + 1455000;
    return 1955000;
  }
}

// DC/iDeCo年金受取時の年間税額
// 年金として受け取る場合、雑所得 = 年金額 - 公的年金等控除
// 所得税 + 住民税(10%)
export function annuityTax(annualAmount: number, age: number): number {
  const ded = publicPensionDeduction(annualAmount, age);
  const taxableIncome = Math.max(annualAmount - ded, 0);
  // 基礎控除48万は他の所得がない前提で適用
  const afterBasic = Math.max(taxableIncome - 480000, 0);
  const it = iTx(afterBasic);
  const rt = Math.floor(afterBasic * 0.1);
  return it + rt;
}

// ===== Phase 2: 不動産譲渡所得税 =====
// 参考: 国税庁 No.3302, No.3208
// 短期（5年以下）: 39.63%（所得税30.63% + 住民税9%）
// 長期（5年超）: 20.315%（所得税15.315% + 住民税5%）
// 居住用3000万円特別控除
export interface PropertyCapitalGainsTaxResult {
  gain: number;             // 譲渡所得（売却価格−取得費−譲渡費用）
  specialDeduction: number; // 特別控除（3000万円）
  taxableGain: number;      // 課税譲渡所得
  tax: number;              // 譲渡所得税
  isLongTerm: boolean;
}

export function calcPropertyCapitalGainsTax(
  purchasePrice: number,    // 取得費（円）
  salePrice: number,        // 売却価格（円）
  yearsSince: number,       // 所有期間（年）
  isResidence: boolean = true, // 居住用
  saleCostRate: number = 4,    // 売却費用率（%）デフォルト4%
): PropertyCapitalGainsTaxResult {
  // 譲渡費用: 仲介手数料3%+6万+印紙税等（概算で売却価格×費用率%）
  const transferCost = Math.round(salePrice * saleCostRate / 100);
  const gain = salePrice - purchasePrice - transferCost;
  if (gain <= 0) return { gain, specialDeduction: 0, taxableGain: 0, tax: 0, isLongTerm: yearsSince > 5 };

  const isLongTerm = yearsSince > 5;
  const specialDeduction = isResidence ? Math.min(gain, 30000000) : 0;
  const taxableGain = Math.max(gain - specialDeduction, 0);

  // 税率
  const taxRate = isLongTerm ? 0.20315 : 0.3963;
  const tax = Math.round(taxableGain * taxRate);

  return { gain, specialDeduction, taxableGain, tax, isLongTerm };
}

// ===== Phase 6: 贈与税 =====
// 参考: 国税庁 No.4408, No.4103
export interface GiftTaxResult {
  taxableAmount: number;    // 課税価格
  deduction: number;        // 控除額
  tax: number;              // 贈与税
  detail: string;
}

// 暦年課税の税率テーブル（一般贈与）
const GIFT_TAX_GENERAL: [number, number, number][] = [
  // [上限, 税率%, 控除額]
  [2000000, 10, 0],
  [3000000, 15, 100000],
  [4000000, 20, 250000],
  [6000000, 30, 650000],
  [10000000, 40, 1250000],
  [15000000, 45, 1750000],
  [30000000, 50, 2500000],
  [9e15, 55, 4000000],
];

// 暦年課税の税率テーブル（直系尊属からの特例贈与）
const GIFT_TAX_LINEAL: [number, number, number][] = [
  [2000000, 10, 0],
  [4000000, 15, 100000],
  [6000000, 20, 300000],
  [10000000, 30, 900000],
  [15000000, 40, 1900000],
  [30000000, 45, 2650000],
  [45000000, 50, 4150000],
  [9e15, 55, 6400000],
];

export function calcGiftTax(
  amountYen: number,
  giftType: "calendar" | "settlement",
  recipientRelation: "lineal" | "other",
): GiftTaxResult {
  if (giftType === "settlement") {
    // 相続時精算課税: 累積2500万円控除、超過分20%
    const deduction = Math.min(amountYen, 25000000);
    const taxableAmount = Math.max(amountYen - deduction, 0);
    const tax = Math.round(taxableAmount * 0.20);
    return { taxableAmount, deduction, tax, detail: `精算課税: 控除${Math.round(deduction / 10000)}万 超過${Math.round(taxableAmount / 10000)}万×20%` };
  }

  // 暦年課税: 年110万円控除
  const basicDeduction = 1100000;
  const taxableAmount = Math.max(amountYen - basicDeduction, 0);
  if (taxableAmount <= 0) return { taxableAmount: 0, deduction: basicDeduction, tax: 0, detail: "暦年課税: 基礎控除内(非課税)" };

  const table = recipientRelation === "lineal" ? GIFT_TAX_LINEAL : GIFT_TAX_GENERAL;
  let tax = 0;
  for (const [limit, rate, ded] of table) {
    if (taxableAmount <= limit) {
      tax = Math.round(taxableAmount * rate / 100 - ded);
      break;
    }
  }
  const relLabel = recipientRelation === "lineal" ? "直系尊属" : "一般";
  return { taxableAmount, deduction: basicDeduction, tax, detail: `暦年課税(${relLabel}): ${Math.round(taxableAmount / 10000)}万×税率 = ${Math.round(tax / 10000)}万` };
}
