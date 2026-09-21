/**
 * 個人の所得税・住民税・社会保険料の年次計算（給与＋公的年金等の総合課税）。
 * 入力・出力はすべて円。
 */
import * as C from "./constants";
import type { Employment } from "@/domain/model";

export interface SocialInsurance {
  health: number; nursing: number; pension: number; employment: number; childSupport: number;
  total: number;
}

const ZERO_SI: SocialInsurance = { health: 0, nursing: 0, pension: 0, employment: 0, childSupport: 0, total: 0 };

/** 給与所得者の社会保険料（被保険者負担）。gross は DC 選択制拠出を除いた額。 */
export function employeeSocialInsurance(gross: number, age: number): SocialInsurance {
  if (gross <= 0) return ZERO_SI;
  // 賞与を含む年収を月額換算し、標準報酬上限を年ベースで近似
  const pensionBase = Math.min(gross, C.PENSION_STANDARD_MONTHLY_CAP * 12 + C.PENSION_BONUS_CAP_ANNUAL);
  const healthBase = Math.min(gross, C.HEALTH_STANDARD_MONTHLY_CAP * 12 + 5_730_000);
  const pension = age < 70 ? Math.round(pensionBase * C.PENSION_RATE_EMPLOYEE) : 0;
  const health = age < C.LATE_ELDERLY_AGE ? Math.round(healthBase * C.HEALTH_RATE_EMPLOYEE) : 0;
  const nursing = age >= 40 && age < 65 ? Math.round(healthBase * C.NURSING_RATE_EMPLOYEE) : 0;
  const employment = Math.round(gross * C.EMPLOYMENT_INSURANCE_RATE);
  const childSupport = age < C.LATE_ELDERLY_AGE ? Math.round(healthBase * C.CHILD_SUPPORT_RATE) : 0;
  return { health, nursing, pension, employment, childSupport, total: health + nursing + pension + employment + childSupport };
}

/**
 * 非給与所得者（自営業・退職者）の社会保険料。
 * incomeForNhi = 前年所得（給与所得＋年金雑所得等 − 基礎控除43万）の近似として当年値を使う。
 */
export function nonEmployeeSocialInsurance(taxableBase: number, age: number, opts: { nationalPension: boolean }): SocialInsurance {
  const base = Math.max(taxableBase, 0);
  // 均等割の軽減（7割／5割／2割）。判定所得は base（総所得金額等 − 43万）で近似
  const perCapitaRate = base <= C.NHI_REDUCE_7 ? 0.3 : base <= C.NHI_REDUCE_5 ? 0.5 : base <= C.NHI_REDUCE_2 ? 0.8 : 1;
  const pension = opts.nationalPension && age >= 20 && age < 60 ? C.NATIONAL_PENSION_MONTHLY * 12 : 0;
  let health = 0, nursing = 0;
  if (age >= C.LATE_ELDERLY_AGE) {
    health = Math.round(base * C.LATE_ELDERLY_RATE + C.LATE_ELDERLY_PER_CAPITA * perCapitaRate);
  } else {
    const withNursing = age >= 40 && age < 65;
    const rate = withNursing ? C.NHI_INCOME_RATE : C.NHI_INCOME_RATE - 0.02;
    health = Math.round(Math.min(base * rate + C.NHI_PER_CAPITA * perCapitaRate, withNursing ? C.NHI_CAP : C.NHI_CAP_NO_NURSING));
  }
  if (age >= 65) nursing = Math.round(Math.max(base * C.NURSING_65_PLUS_RATE, C.NURSING_65_PLUS_MIN));
  return { health, nursing, pension, employment: 0, childSupport: 0, total: health + nursing + pension };
}

/** 所得税（速算表、復興税込み、100円未満切捨て） */
export function incomeTaxOnTaxable(taxable: number): number {
  if (taxable <= 0) return 0;
  const t = Math.floor(taxable / 1000) * 1000;
  for (const b of C.INCOME_TAX_BRACKETS) {
    if (t <= b.upTo) return Math.floor((t * b.rate - b.deduction) * C.RECONSTRUCTION_SURTAX / 100) * 100;
  }
  return 0;
}

export function marginalRate(taxable: number): number {
  for (const b of C.INCOME_TAX_BRACKETS) if (taxable <= b.upTo) return b.rate;
  return 0.45;
}

export function residentTaxOnTaxable(taxable: number): number {
  if (taxable <= 0) return 0;
  return Math.floor(Math.floor(taxable / 1000) * 1000 * C.RESIDENT_TAX_RATE / 100) * 100;
}

/** 配偶者控除・配偶者特別控除（所得税ベース）。所得 = 合計所得金額。 */
export function spouseDeduction(selfIncome: number, spouseIncome: number): { it: number; rt: number } {
  if (selfIncome > 10_000_000) return { it: 0, rt: 0 };
  const tier = selfIncome <= 9_000_000 ? 0 : selfIncome <= 9_500_000 ? 1 : 2;
  const table: [number, number[]][] = [
    [580_000, [380_000, 260_000, 130_000]],   // 配偶者控除（2025改正: 合計所得58万以下）
    [950_000, [380_000, 260_000, 130_000]],   // 以下 配偶者特別控除
    [1_000_000, [360_000, 240_000, 120_000]],
    [1_050_000, [310_000, 210_000, 110_000]],
    [1_100_000, [260_000, 180_000, 90_000]],
    [1_150_000, [210_000, 140_000, 70_000]],
    [1_200_000, [160_000, 110_000, 60_000]],
    [1_250_000, [110_000, 80_000, 40_000]],
    [1_300_000, [60_000, 40_000, 20_000]],
    [1_330_000, [30_000, 20_000, 10_000]],
  ];
  for (const [limit, amounts] of table) {
    if (spouseIncome <= limit) {
      const it = amounts[tier];
      const rt = Math.min(it, [330_000, 220_000, 110_000][tier]);
      return { it, rt };
    }
  }
  return { it: 0, rt: 0 };
}

/** 扶養控除（子の年齢から） */
export function dependentDeduction(childAge: number): { it: number; rt: number } {
  if (childAge < 16) return { it: 0, rt: 0 };
  if (childAge <= 18) return { it: C.DEPENDENT_GENERAL, rt: C.DEPENDENT_GENERAL_RT };
  if (childAge <= 22) return { it: C.DEPENDENT_SPECIFIC, rt: C.DEPENDENT_SPECIFIC_RT };
  return { it: 0, rt: 0 };
}

export interface LifeInsurancePremiums { general: number; medical: number; pension: number }
export const ZERO_LIFE: LifeInsurancePremiums = { general: 0, medical: 0, pension: 0 };

/** 生命保険料控除 1 区分分（新制度: 所得税上限 4 万 / 住民税上限 2.8 万） */
export function lifeInsuranceDeductionOne(annualPremium: number): { it: number; rt: number } {
  const p = Math.max(annualPremium, 0);
  const it = p <= 20_000 ? p : p <= 40_000 ? p / 2 + 10_000 : p <= 80_000 ? p / 4 + 20_000 : 40_000;
  const rt = p <= 12_000 ? p : p <= 32_000 ? p / 2 + 6_000 : p <= 56_000 ? p / 4 + 14_000 : 28_000;
  return { it: Math.floor(it), rt: Math.floor(rt) };
}

/** 生命保険料控除（一般・介護医療・個人年金の 3 区分合計。所得税 12 万 / 住民税 7 万が上限） */
export function lifeInsuranceDeduction(premiums: LifeInsurancePremiums | number): { it: number; rt: number; parts: Record<keyof LifeInsurancePremiums, { it: number; rt: number }> } {
  const pr: LifeInsurancePremiums = typeof premiums === "number" ? { general: premiums, medical: 0, pension: 0 } : premiums;
  const parts = { general: lifeInsuranceDeductionOne(pr.general), medical: lifeInsuranceDeductionOne(pr.medical), pension: lifeInsuranceDeductionOne(pr.pension) };
  const it = Math.min(parts.general.it + parts.medical.it + parts.pension.it, 120_000);
  const rt = Math.min(parts.general.rt + parts.medical.rt + parts.pension.rt, 70_000);
  return { it, rt, parts };
}

/** 地震保険料控除（所得税: 全額・上限 5 万 / 住民税: 1/2・上限 2.5 万） */
export function earthquakeInsuranceDeduction(annualPremium: number): { it: number; rt: number } {
  const p = Math.max(annualPremium, 0);
  return { it: Math.min(p, 50_000), rt: Math.min(Math.floor(p / 2), 25_000) };
}

/** ふるさと納税 控除上限（自己負担2,000円で全額控除される寄附額） */
export function furusatoLimit(residentIncomeTax: number, marginal: number): number {
  if (residentIncomeTax <= 0) return 0;
  const d = 0.9 - marginal * C.RECONSTRUCTION_SURTAX;
  return Math.floor((residentIncomeTax * 0.2) / d + 2000);
}

export interface PersonTaxInput {
  age: number;
  employment: Employment;
  salary: number;            // 額面給与（円/年、DC選択制拠出を除いた後）
  pension: number;           // 公的年金等（円/年、DC年金受取・課税対象の私的年金を含む）
  otherTaxableIncome: number; // 雑所得（不動産・事業等の所得金額）
  idecoAnnual: number;       // 小規模企業共済等掛金控除（iDeCo・マッチング）
  /** 生命保険料（年額、円）。数値なら一般生命保険料のみ */
  lifeInsurancePremium: number | LifeInsurancePremiums;
  /** 地震保険料（年額、円） */
  earthquakePremium?: number;
  dependentIt: number;       // 扶養控除 合計（所得税）
  dependentRt: number;
  spouseIncomeForDeduction: number | null; // 配偶者の合計所得（null: 配偶者なし）
  housingLoanCredit: number; // 住宅ローン控除 可能額（円）
  furusato: boolean;
  /** 会社員が年間まるごと育休中（社保免除・被保険者資格は継続） */
  onLeave?: boolean;
  /** 社会保険の加入: auto = 年収で判定（106万以上で加入／130万未満かつ扶養可能なら被扶養者）、join = 必ず加入、dependent = 被扶養者 */
  siMode?: SiMode;
  /** 配偶者が被用者保険の被保険者で、扶養に入れる状態か */
  canBeDependent?: boolean;
  /** 住民税の非課税限度額に使う扶養親族等（同一生計配偶者＋扶養親族、16歳未満を含む）の数 */
  dependentsForRt?: number;
}

export type SiMode = "auto" | "join" | "dependent";
export type SiStatus = "employee" | "dependent" | "self" | "exemptLeave" | "none";

/** 社会保険の加入状態を判定する。gross は給与＋年金＋その他（収入ベース） */
export function resolveSiStatus(inp: PersonTaxInput, salary: number, gross: number): SiStatus {
  if (inp.employment === "employee" && inp.onLeave && salary <= 0) return "exemptLeave"; // 育休中は免除
  const mode = inp.siMode ?? "auto";
  if (mode === "join") return "employee";
  if (mode === "dependent") return "dependent";
  // auto: 106万以上の給与がある会社員は加入
  if (inp.employment === "employee" && salary >= C.SI_ENROLL_ANNUAL) return "employee";
  // 130万（60歳以上は180万）未満で、配偶者が被用者保険なら被扶養者
  const limit = inp.age >= 60 ? C.SI_DEPENDENT_LIMIT_SENIOR : C.SI_DEPENDENT_LIMIT;
  if (inp.canBeDependent && inp.age < C.LATE_ELDERLY_AGE && gross < limit) return "dependent";
  // それ以外は自分で国民年金・国保（会社員でも適用外の短時間労働者・無職で扶養に入れない人はここ）
  return "self";
}

/** 住民税の非課税限度額（合計所得金額）。均等割・所得割それぞれ */
export function residentTaxExemptLimit(dependents: number): { perCapita: number; income: number } {
  if (dependents <= 0) return { perCapita: C.RT_EXEMPT_SINGLE, income: C.RT_EXEMPT_SINGLE };
  const base = C.RT_EXEMPT_PER_PERSON * (dependents + 1);
  return { perCapita: base + C.RT_EXEMPT_ADD_PER_CAPITA, income: base + C.RT_EXEMPT_ADD_INCOME };
}

export interface PersonTaxResult {
  gross: number;                 // 給与＋年金＋その他（課税前の受取額）
  employmentDeduction: number;
  pensionDeduction: number;
  totalIncome: number;           // 合計所得金額
  socialInsurance: SocialInsurance;
  deductionsIt: number;          // 所得控除 合計（所得税）
  taxableIt: number;
  taxableRt: number;
  incomeTax: number;             // 税額控除後
  residentTax: number;
  housingLoanCreditUsed: number;
  furusatoDonation: number;      // 寄附額（実質負担 2,000 円）
  marginalRate: number;
  takeHome: number;              // 手取り = gross − 税 − 社保 − ふるさと納税寄附額（税は寄附控除後）
  /** 計算根拠（UI の「計算式」表示用）。すべて円。 */
  breakdown: TaxBreakdown;
}

export interface TaxBreakdown {
  age: number; employment: Employment; onLeave: boolean;
  // 収入 → 所得
  salary: number; pension: number; other: number;
  salaryIncome: number; pensionIncome: number;
  // 所得控除（所得税 / 住民税）
  basicIt: number; basicRt: number;
  spouseIt: number; spouseRt: number; spouseIncome: number | null;
  lifeIt: number; lifeRt: number; lifePremium: number; lifePremiums: LifeInsurancePremiums; lifeParts: Record<keyof LifeInsurancePremiums, { it: number; rt: number }>;
  earthquakeIt: number; earthquakeRt: number; earthquakePremium: number;
  siStatus: SiStatus; rtExempt: boolean; rtLimit: number; dependentsForRt: number;
  dependentIt: number; dependentRt: number;
  ideco: number;
  dedRt: number;
  // 課税所得（ふるさと納税の寄附金控除前）
  taxableIt0: number; taxableRt0: number;
  // 税額（税額控除前）
  incomeTaxBeforeCredit: number;   // 速算表 × 復興税（寄附金控除後の課税所得ベース）
  residentIncomeLevy: number;      // 住民税 所得割（10%）
  residentPerCapita: number;       // 均等割
  // ふるさと納税
  donationDed: number;             // 寄附額 − 2,000
  furusatoItRelief: number;        // 所得税の軽減分
  furusatoRtCredit: number;        // 住民税の税額控除（基本分＋特例分）
  // 住宅ローン控除
  housingLoanAvailable: number; hlFromIt: number; hlFromRt: number;
}

export function computePersonTax(inp: PersonTaxInput): PersonTaxResult {
  const salary = Math.max(inp.salary, 0);
  const pension = Math.max(inp.pension, 0);
  const other = Math.max(inp.otherTaxableIncome, 0);
  const gross = salary + pension + other;

  const empDed = salary > 0 ? Math.min(C.employmentIncomeDeduction(salary), salary) : 0;
  const penDed = pension > 0 ? Math.min(C.publicPensionDeduction(pension, inp.age), pension) : 0;
  const salaryIncome = salary - empDed;
  const pensionIncome = pension - penDed;
  const totalIncome = salaryIncome + pensionIncome + other;

  // 社会保険料
  let si: SocialInsurance;
  const siStatus = resolveSiStatus(inp, salary, gross);
  if (siStatus === "employee") {
    si = employeeSocialInsurance(salary, inp.age);
  } else {
    // 自営業 or 無職・退職後: 国保等は前年所得ベースだが当年所得で近似
    const nhiBase = Math.max(totalIncome - C.BASIC_DEDUCTION_RT, 0);
    if (siStatus === "dependent" || siStatus === "exemptLeave" || siStatus === "none") {
      // 被扶養者（第3号被保険者）・収入なし → 保険料なし
      // 会社員の育休中 → 社会保険料は免除（厚生年金の被保険者期間は継続）
      si = ZERO_SI;
    } else {
      si = nonEmployeeSocialInsurance(nhiBase, inp.age, { nationalPension: inp.employment === "selfEmployed" || (inp.employment === "employee" && salary <= 0 && inp.age < 60) });
    }
  }

  const basicIt = totalIncome <= C.BASIC_DEDUCTION_IT_LOW_LIMIT ? C.BASIC_DEDUCTION_IT_LOW : C.BASIC_DEDUCTION_IT;
  const spouse = inp.spouseIncomeForDeduction == null ? { it: 0, rt: 0 } : spouseDeduction(totalIncome, inp.spouseIncomeForDeduction);
  const lifePremiums: LifeInsurancePremiums = typeof inp.lifeInsurancePremium === "number" ? { general: inp.lifeInsurancePremium, medical: 0, pension: 0 } : inp.lifeInsurancePremium;
  const life = lifeInsuranceDeduction(lifePremiums);
  const quake = earthquakeInsuranceDeduction(inp.earthquakePremium ?? 0);
  const commonDed = si.total + inp.idecoAnnual;
  const dedIt = commonDed + basicIt + spouse.it + life.it + quake.it + inp.dependentIt;
  const dedRt = commonDed + C.BASIC_DEDUCTION_RT + spouse.rt + life.rt + quake.rt + inp.dependentRt;

  const taxableIt0 = Math.max(totalIncome - dedIt, 0);
  const taxableRt0 = Math.max(totalIncome - dedRt, 0);
  const mr = marginalRate(taxableIt0);

  // ふるさと納税: 上限まで寄附。所得税は寄附金控除（所得控除）、住民税は税額控除
  let donation = 0;
  if (inp.furusato && totalIncome > residentTaxExemptLimit(inp.dependentsForRt ?? 0).income) {
    const rtIncomeTax = residentTaxOnTaxable(taxableRt0);
    // 住宅ローン控除で住民税所得割が減る分を考慮（概算）
    const hlToRt = Math.min(Math.max(inp.housingLoanCredit - incomeTaxOnTaxable(taxableIt0), 0), C.HOUSING_LOAN_RT_CAP);
    donation = Math.max(Math.floor(furusatoLimit(Math.max(rtIncomeTax - hlToRt, 0), mr) / 1000) * 1000, 0);
  }
  const donationDed = Math.max(donation - 2000, 0);
  const taxableIt = Math.max(taxableIt0 - donationDed, 0);
  const taxableRt = taxableRt0;

  let incomeTax = incomeTaxOnTaxable(taxableIt);
  const incomeTaxBeforeCredit = incomeTax;
  // 住民税の非課税限度額（合計所得が限度以下なら所得割・均等割とも課されない）
  const rtLimit = residentTaxExemptLimit(inp.dependentsForRt ?? 0);
  const rtIncomeExempt = totalIncome <= rtLimit.income;
  const rtPerCapitaExempt = totalIncome <= rtLimit.perCapita;
  const perCapita = totalIncome > 0 && !rtPerCapitaExempt ? C.RESIDENT_TAX_PER_CAPITA : 0;
  let residentTax = (rtIncomeExempt ? 0 : residentTaxOnTaxable(taxableRt)) + perCapita;
  // ふるさと納税の住民税控除（基本分 + 特例分 = 寄附額−2000 − 所得税軽減分）
  let furusatoItRelief = 0, furusatoRtCredit = 0;
  if (donationDed > 0) {
    furusatoItRelief = Math.floor(donationDed * mr * C.RECONSTRUCTION_SURTAX);
    furusatoRtCredit = Math.min(Math.max(donationDed - furusatoItRelief, 0), residentTax);
    residentTax -= furusatoRtCredit;
  }
  // 住宅ローン控除（所得税 → 住民税 上限 97,500）
  let hlUsed = 0, hlFromIt = 0, hlFromRt = 0;
  if (inp.housingLoanCredit > 0) {
    hlFromIt = Math.min(incomeTax, inp.housingLoanCredit);
    incomeTax -= hlFromIt;
    hlFromRt = Math.min(Math.max(residentTax - C.RESIDENT_TAX_PER_CAPITA, 0), inp.housingLoanCredit - hlFromIt, C.HOUSING_LOAN_RT_CAP);
    residentTax -= hlFromRt;
    hlUsed = hlFromIt + hlFromRt;
  }

  const takeHome = gross - incomeTax - residentTax - si.total - donation;
  return {
    gross, employmentDeduction: empDed, pensionDeduction: penDed, totalIncome,
    socialInsurance: si, deductionsIt: dedIt, taxableIt, taxableRt,
    incomeTax, residentTax, housingLoanCreditUsed: hlUsed, furusatoDonation: donation,
    marginalRate: mr, takeHome,
    breakdown: {
      age: inp.age, employment: inp.employment, onLeave: !!inp.onLeave,
      salary, pension, other, salaryIncome, pensionIncome,
      basicIt, basicRt: C.BASIC_DEDUCTION_RT,
      spouseIt: spouse.it, spouseRt: spouse.rt, spouseIncome: inp.spouseIncomeForDeduction,
      lifeIt: life.it, lifeRt: life.rt, lifePremium: lifePremiums.general + lifePremiums.medical + lifePremiums.pension, lifePremiums, lifeParts: life.parts,
      earthquakeIt: quake.it, earthquakeRt: quake.rt, earthquakePremium: inp.earthquakePremium ?? 0,
      dependentIt: inp.dependentIt, dependentRt: inp.dependentRt,
      ideco: inp.idecoAnnual, dedRt,
      taxableIt0, taxableRt0,
      incomeTaxBeforeCredit, residentIncomeLevy: rtIncomeExempt ? 0 : residentTaxOnTaxable(taxableRt), residentPerCapita: perCapita,
      siStatus, rtExempt: rtIncomeExempt || rtPerCapitaExempt, rtLimit: rtLimit.income, dependentsForRt: inp.dependentsForRt ?? 0,
      donationDed, furusatoItRelief, furusatoRtCredit,
      housingLoanAvailable: inp.housingLoanCredit, hlFromIt, hlFromRt,
    },
  };
}

/** 退職所得の税額（一時金）。他の退職金と合算して差額課税。 */
export function retirementLumpTax(amount: number, serviceYears: number, otherLumpSameYear = 0): number {
  const ded = C.retirementIncomeDeduction(serviceYears);
  const taxOn = (a: number) => {
    const taxable = Math.floor(Math.max(a - ded, 0) / 2 / 1000) * 1000;
    return incomeTaxOnTaxable(taxable) + residentTaxOnTaxable(taxable);
  };
  return Math.max(taxOn(amount + otherLumpSameYear) - taxOn(otherLumpSameYear), 0);
}

/** 不動産譲渡所得税（居住用3000万控除） */
export function propertySaleTax(salePrice: number, acquisitionCost: number, ownedYears: number, saleCostRate = 0.04): { tax: number; gain: number } {
  const gain = salePrice - acquisitionCost - Math.round(salePrice * saleCostRate);
  if (gain <= 0) return { tax: 0, gain };
  const taxable = Math.max(gain - C.RESIDENCE_SALE_SPECIAL_DEDUCTION, 0);
  const rate = ownedYears > 5 ? C.PROPERTY_GAIN_TAX_LONG : C.PROPERTY_GAIN_TAX_SHORT;
  return { tax: Math.round(taxable * rate), gain };
}
