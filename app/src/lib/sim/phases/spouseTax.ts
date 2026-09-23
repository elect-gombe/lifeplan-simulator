/** 配偶者の給与・DC拠出・税計算（本人と同じ枠組み）。 */
import { resolveKF } from "../../types";
import type { SimConfig, AgeEventInfo } from "../types";
import { calcMemberTax, ZERO_MEMBER_TAX } from "../memberTax";
import type { MemberTaxResult } from "../memberTax";
import type { DeductionInfo } from "./deductions";
import { phaseMemberIncome } from "./income";

/** 配偶者の休業なしの年収（円）。育休給付金・年金保護の基準に使う。 */
export function spouseFullGross(config: SimConfig, ageInfo: AgeEventInfo): number {
  const { spouse } = config;
  const { isSelfDead, isSpouseDead, spouseAge, spouseRetired } = ageInfo;
  if (!spouse || isSpouseDead) return 0;
  const spInc = phaseMemberIncome(isSpouseDead, spouseRetired, spouseAge, spouse.incomeKF, spouse.salaryGrowthRate, 0);
  const asdi = config.afterSelfDeathSpouseIncome;
  if (isSelfDead && asdi?.enabled) return (spouseAge < asdi.retirementAge ? asdi.monthlyMan * 12 + asdi.bonusMan : 0) * 10000;
  return spInc.gross;
}

export function phaseSpouseTax(
  config: SimConfig, ageInfo: AgeEventInfo, dedInfo: DeductionInfo, spousePensionIncome: number,
  /** 育休の就労係数（0〜1）。省略時 1 */
  incomeFactor = 1,
): MemberTaxResult {
  const { spouse } = config;
  const { isSpouseDead, spouseAge, spouseRetired } = ageInfo;
  if (!spouse || isSpouseDead) return ZERO_MEMBER_TAX;

  // 退職後でも年金収入があれば税計算が必要
  const spGrossMan = spouseFullGross(config, ageInfo) / 10000 * incomeFactor;
  const spDCTotal = spouseRetired ? 0 : resolveKF(spouse.dcTotalKF || [], spouseAge, 0);
  const spCompanyDC = spouseRetired ? 0 : resolveKF(spouse.companyDCKF || [], spouseAge, 0);
  const spIdeco = spouseRetired ? 0 : resolveKF(spouse.idecoKF || [], spouseAge, 0);
  if (spGrossMan <= 0 && spousePensionIncome <= 0) return ZERO_MEMBER_TAX;

  return calcMemberTax(
    spGrossMan, spDCTotal, spCompanyDC, spIdeco, spouse.hasFurusato,
    dedInfo.preSpouseHLDed, dedInfo.spouseDepDed, dedInfo.preSpouseLifeInsDed,
    0, false, spouseAge, spouse.siParams, spousePensionIncome, config.nhsSettings,
  );
}
