/** 配偶者の給与・DC拠出・税計算（本人と同じ枠組み）。 */
import { resolveKF } from "../../types";
import type { SimConfig, AgeEventInfo } from "../types";
import { calcMemberTax, ZERO_MEMBER_TAX } from "../memberTax";
import type { MemberTaxResult } from "../memberTax";
import type { DeductionInfo } from "./deductions";
import { phaseMemberIncome } from "./income";

export function phaseSpouseTax(
  config: SimConfig, ageInfo: AgeEventInfo, dedInfo: DeductionInfo, spousePensionIncome: number,
): MemberTaxResult {
  const { spouse } = config;
  const { isSelfDead, isSpouseDead, spouseAge, spouseRetired } = ageInfo;
  if (!spouse || isSpouseDead) return ZERO_MEMBER_TAX;

  // 退職後でも年金収入があれば税計算が必要
  const spInc = phaseMemberIncome(isSpouseDead, spouseRetired, spouseAge, spouse.incomeKF, spouse.salaryGrowthRate, 0);
  // Phase 10: 世帯主万一後の配偶者収入見直し
  let spGrossMan = spInc.grownGrossMan;
  const asdi = config.afterSelfDeathSpouseIncome;
  if (isSelfDead && asdi?.enabled) {
    spGrossMan = spouseAge < asdi.retirementAge ? asdi.monthlyMan * 12 + asdi.bonusMan : 0;
  }
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
