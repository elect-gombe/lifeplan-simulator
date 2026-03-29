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

// ===== 高校授業料無償化（就学支援金、2026年度〜所得制限撤廃） =====
export const HS_SUPPORT_PUBLIC = 118800;    // 国公立 11万8800円/年
export const HS_SUPPORT_PRIVATE = 457200;   // 私立 45万7200円/年
export const HIGH_SCHOOL_AGE_FROM = 15;
export const HIGH_SCHOOL_AGE_TO = 18;       // exclusive

/** 高校就学支援金（円/年） */
export function highSchoolSupport(childAge: number, isPrivate: boolean): number {
  if (childAge < HIGH_SCHOOL_AGE_FROM || childAge >= HIGH_SCHOOL_AGE_TO) return 0;
  return isPrivate ? HS_SUPPORT_PRIVATE : HS_SUPPORT_PUBLIC;
}

// ===== 多子世帯 大学授業料等無償化（2025年度〜） =====
export const TASHI_MIN_DEPENDENTS = 3;          // 扶養する子の最低人数
export const TASHI_TUITION_PUBLIC = 540000;     // 国公立 授業料上限 54万円/年
export const TASHI_TUITION_PRIVATE = 700000;    // 私立 授業料上限 70万円/年
export const TASHI_ADMISSION_PUBLIC = 280000;   // 国公立 入学金上限 28万円
export const TASHI_ADMISSION_PRIVATE = 260000;  // 私立 入学金上限 26万円
export const UNIVERSITY_AGE_FROM = 18;
export const UNIVERSITY_AGE_TO = 22;            // exclusive

/** 多子世帯授業料減免額（円/年）。条件を満たさなければ 0 */
export function tashiTuitionWaiver(
  childAge: number,
  dependentCount: number,
  isPrivate: boolean,
  isFirstYear: boolean,
): number {
  if (dependentCount < TASHI_MIN_DEPENDENTS) return 0;
  if (childAge < UNIVERSITY_AGE_FROM || childAge >= UNIVERSITY_AGE_TO) return 0;
  const tuition = isPrivate ? TASHI_TUITION_PRIVATE : TASHI_TUITION_PUBLIC;
  const admission = isFirstYear
    ? (isPrivate ? TASHI_ADMISSION_PRIVATE : TASHI_ADMISSION_PUBLIC)
    : 0;
  return tuition + admission;
}
