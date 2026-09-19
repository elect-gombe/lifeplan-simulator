/**
 * Public API of the simulation engine.
 *
 * The implementation lives in `./sim/*`; this module only re-exports the
 * stable surface used by the UI so existing `../lib/calc` imports keep working.
 */
export { computeBase, computeScenario } from "./sim/scenario";
export type { CalcParams } from "./sim/types";
export { resolveScenarioField } from "./sim/config";
export { calcRetirementDeduction } from "./sim/pension";
export { calcNecessaryProtection } from "./sim/protection";
export type { ProtectionNeedEntry } from "./sim/protection";

// Re-exports of sibling modules kept for backward compatibility
export { DEPENDENT_DEDUCTION_GENERAL, DEPENDENT_DEDUCTION_SPECIAL, DEPENDENT_MIN_AGE, DEPENDENT_SPECIAL_MIN_AGE, DEPENDENT_SPECIAL_MAX_AGE, CHILD_ALLOWANCE_MAX_AGE, dependentDeductionForChild, childAllowanceMonthly, tashiTuitionWaiver, UNIVERSITY_AGE_FROM, UNIVERSITY_AGE_TO, highSchoolSupport, HIGH_SCHOOL_AGE_FROM, HIGH_SCHOOL_AGE_TO } from "./dependents";
export { calcMonthlyPaymentEqual, loanBalanceAfterYears, buildLoanSchedule, calcAnnualPaymentPrincipalEqual, calcMonthlyPaymentPrincipalEqual } from "./mortgage";
export type { LoanScheduleEntry } from "./mortgage";
export { calcSurvivorPension } from "./survivor";
