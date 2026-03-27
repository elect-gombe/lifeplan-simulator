/** 扶養控除: 一般扶養親族(16-18歳) */
export const DEPENDENT_DEDUCTION_GENERAL = 380000;
/** 扶養控除: 特定扶養親族(19-22歳) */
export const DEPENDENT_DEDUCTION_SPECIAL = 630000;
/** 扶養控除: 対象開始年齢 */
export const DEPENDENT_MIN_AGE = 16;
/** 扶養控除: 特定扶養親族 開始年齢 */
export const DEPENDENT_SPECIAL_MIN_AGE = 19;
/** 扶養控除: 特定扶養親族 終了年齢 */
export const DEPENDENT_SPECIAL_MAX_AGE = 23;
/** 児童手当: 対象終了年齢（18歳到達年度末≈19歳未満で近似） */
export const CHILD_ALLOWANCE_MAX_AGE = 19;

// 扶養控除: child age determines deduction amount
export function dependentDeductionForChild(childAge: number): number {
  if (childAge < DEPENDENT_MIN_AGE) return 0;
  if (childAge < DEPENDENT_SPECIAL_MIN_AGE) return DEPENDENT_DEDUCTION_GENERAL;
  if (childAge < DEPENDENT_SPECIAL_MAX_AGE) return DEPENDENT_DEDUCTION_SPECIAL;
  return 0;
}

// 児童手当 (2024改正後): 月額
export function childAllowanceMonthly(childAge: number, childIndex: number): number {
  if (childAge < 0 || childAge >= CHILD_ALLOWANCE_MAX_AGE) return 0;
  if (childIndex >= 2) return 30000;
  if (childAge < 3) return 15000;
  return 10000;
}
