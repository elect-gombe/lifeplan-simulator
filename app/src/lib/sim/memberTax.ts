/**
 * Per-member (self / spouse) tax & social insurance calculation, unified for
 * salary income and public pension income.
 */
import type { Scenario, SocialInsuranceParams } from "../types";
import { DEFAULT_SI_PARAMS, PENSION_INSURANCE_RATE, PENSION_MONTHLY_CAP, EMPLOYMENT_INSURANCE_RATE, NURSING_INSURANCE_MIN_AGE, NURSING_INSURANCE_MAX_AGE } from "../types";
import { mR, fLm, calcFurusatoDonation, iTx, rTx, apTxCr, hlResidentCap, empDed, publicPensionDeduction } from "../tax";
import { NHI_RATE, LATE_ELDERLY_RATE, NURSING_1ST_RATE, LATE_ELDERLY_AGE } from "./constants";

// Member tax calculation — unified for both self and spouse
export interface MemberTaxResult {
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
export interface SIBreakdown {
  total: number;       // 社保料合計
  pension: number;     // 厚生年金
  health: number;      // 健康保険
  nursing: number;     // 介護保険
  employment: number;  // 雇用保険
  childSupport: number; // 子ども・子育て支援金
  ratePct: number;     // 実効社保料率(%)（税計算用、DC控除前grossベース）
}

export function calcSocialInsurance(gross: number, age: number, siParams?: SocialInsuranceParams, _fallbackSirPct?: number, pensionIncome: number = 0, nhsSettings?: Scenario["nhsSettings"]): SIBreakdown {
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

  let health: number;
  let nursing: number;
  if (age >= LATE_ELDERLY_AGE) {
    // 後期高齢者医療
    if (nhsSettings) {
      const medPart = Math.min(taxBase * nhsSettings.medIncomeRate / 100 + nhsSettings.medEqualAmount + nhsSettings.medPerCapita, nhsSettings.medCap);
      const suppPart = Math.min(taxBase * nhsSettings.supportIncomeRate / 100 + nhsSettings.supportEqualAmount + nhsSettings.supportPerCapita, nhsSettings.supportCap);
      health = Math.round(medPart + suppPart);
    } else {
      health = Math.round(taxBase * LATE_ELDERLY_RATE);
    }
    nursing = Math.round(taxBase * NURSING_1ST_RATE);
  } else if (nhsSettings) {
    // 国民健康保険（詳細設定あり）
    const medPart = Math.min(taxBase * nhsSettings.medIncomeRate / 100 + nhsSettings.medEqualAmount + nhsSettings.medPerCapita, nhsSettings.medCap);
    const suppPart = Math.min(taxBase * nhsSettings.supportIncomeRate / 100 + nhsSettings.supportEqualAmount + nhsSettings.supportPerCapita, nhsSettings.supportCap);
    health = Math.round(medPart + suppPart);
    if (age >= NURSING_INSURANCE_MIN_AGE) {
      const carePart = Math.min(taxBase * nhsSettings.careIncomeRate / 100 + nhsSettings.careEqualAmount + nhsSettings.carePerCapita, nhsSettings.careCap);
      nursing = age >= 65 ? Math.round(taxBase * NURSING_1ST_RATE) : Math.round(carePart);
    } else {
      nursing = 0;
    }
  } else {
    // 国民健康保険（概算）
    health = Math.round(taxBase * NHI_RATE);
    nursing = age >= 65 ? Math.round(taxBase * NURSING_1ST_RATE)
      : age >= NURSING_INSURANCE_MIN_AGE ? Math.round(taxBase * 0.02) : 0;
  }

  const total = health + nursing;
  const ratePct = pensionIncome > 0 ? total / pensionIncome * 100 : 0;

  return { total, pension: 0, health, nursing, employment: 0, childSupport: 0, ratePct };
}

export const ZERO_MEMBER_TAX: MemberTaxResult = {
  gross: 0, adjGross: 0, sir: 0, employeeDeduction: 0, incomeTax: 0, residentTax: 0, socialInsurance: 0,
  socialInsuranceDeduction: 0, siPension: 0, siHealth: 0, siNursing: 0, siEmployment: 0, siChildSupport: 0,
  dcContribution: 0, idecoContribution: 0, selfDCContribution: 0,
  incomeTaxSaving: 0, residentTaxSaving: 0, socialInsuranceSaving: 0,
  furusatoLimit: 0, furusatoDonation: 0, takeHome: 0,
  taxableIncome: 0, marginalRate: 0, hlDeduction: 0, hlAvail: 0, hlIT: 0, hlRT: 0,
  pensionIncomeTax: 0, pensionResidentTax: 0, pensionDeduction: 0, pensionTaxableIncome: 0,
};

export function calcMemberTax(
  grossMan: number,
  dcTotal: number, companyDC: number, idecoMonthly: number,
  hasFurusato: boolean, housingLoanDed: number,
  dependentDeductionTotal: number = 0,
  lifeInsuranceDed: number = 0,
  spouseDeductionAmount: number = 0,
  includeSISaving: boolean = false,
  age: number = 30,
  siParams?: SocialInsuranceParams,
  pensionIncome: number = 0,    // 公的年金収入（円/年）
  nhsSettings?: Scenario["nhsSettings"],
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
  const sib = calcSocialInsurance(adjGForSI, age, siParams, undefined, pensionIncome, nhsSettings);
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
