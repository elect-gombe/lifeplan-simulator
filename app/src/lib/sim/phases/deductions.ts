/** Dependent deduction, child allowance, tuition waivers and spouse pre-scans. */
import type { LifeEvent } from "../../types";
import { isEventActive, resolveEventAge } from "../../types";
import { calcLifeInsuranceDeduction } from "../../tax";
import { DEPENDENT_DEDUCTION_GENERAL, dependentDeductionForChild, childAllowanceMonthly, tashiTuitionWaiver, UNIVERSITY_AGE_FROM, UNIVERSITY_AGE_TO, highSchoolSupport, HIGH_SCHOOL_AGE_FROM, HIGH_SCHOOL_AGE_TO } from "../../dependents";
import type { SimConfig, AgeEventInfo, YearContext } from "../types";
import { prescanInsurancePremium, prescanHousingLoanDeduction } from "../propertyCosts";

// ===== phaseDeductions: Dependent deduction, child allowance, insurance/housing prescan =====
export interface DeductionInfo {
  childEvents: LifeEvent[];
  dependentDeductionTotal: number;
  childAllowance: number;
  tashiWaiver: number;
  hsSupport: number;
  selfDepDed: number;
  spouseDepDed: number;
  preSpouseInsPremium: number;
  preSpouseLifeInsDed: number;
  preSpouseHLDed: number;
}

export function phaseDeductions(ctx: YearContext, config: SimConfig, ageInfo: AgeEventInfo): DeductionInfo {
  const { age, isEffDisabled, events } = ctx;
  const { taxOpts, effectiveDepHolder } = config;
  const { isSelfDead, isSpouseDead } = ageInfo;

  const childEvents = events.filter(e => !isEffDisabled(e) && e.type === "child" && isEventActive(e, age, events));
  let dependentDeductionTotal = 0;
  for (const ce of childEvents) {
    const childBirthAge = resolveEventAge(ce, events);
    const childAge = age - childBirthAge;
    dependentDeductionTotal += dependentDeductionForChild(childAge);
  }
  dependentDeductionTotal += Math.max(taxOpts.dependentsCount, 0) * DEPENDENT_DEDUCTION_GENERAL;

  let childAllowance = 0;
  if (config.childAllowanceEnabled) {
    childEvents.forEach((ce, ci) => {
      const childBirthAge = resolveEventAge(ce, events);
      const childAge = age - childBirthAge;
      childAllowance += childAllowanceMonthly(childAge, ci) * 12;
    });
  }

  // 多子世帯授業料減免
  let tashiWaiver = 0;
  if (config.tashiWaiverEnabled) {
    const independenceAge = config.livingExpenseRules?.childIndependenceAge ?? 22;
    const dependentCount = childEvents.filter(ce => {
      const childAge = age - resolveEventAge(ce, events);
      return childAge >= 0 && childAge < independenceAge;
    }).length;
    if (dependentCount >= 3) {
      for (const ce of childEvents) {
        const childBirthAge = resolveEventAge(ce, events);
        const childAge = age - childBirthAge;
        if (childAge < UNIVERSITY_AGE_FROM || childAge >= UNIVERSITY_AGE_TO) continue;
        // 大学在学中の子のサブイベントを探して isPrivate を取得
        const eduSub = events.find(e =>
          e.parentId === ce.id && e.type === "education" &&
          isEventActive(e, age, events) &&
          (e.ageOffset !== undefined ? e.ageOffset >= UNIVERSITY_AGE_FROM : false)
        );
        const isPrivate = eduSub ? (eduSub.isPrivate ?? eduSub.label.includes("私立")) : false;
        const isFirstYear = childAge === UNIVERSITY_AGE_FROM;
        tashiWaiver += tashiTuitionWaiver(childAge, dependentCount, isPrivate, isFirstYear);
      }
    }
  }

  // 高校就学支援金
  let hsSupport = 0;
  if (config.hsSupportEnabled) {
    for (const ce of childEvents) {
      const childBirthAge = resolveEventAge(ce, events);
      const childAge = age - childBirthAge;
      if (childAge < HIGH_SCHOOL_AGE_FROM || childAge >= HIGH_SCHOOL_AGE_TO) continue;
      const eduSub = events.find(e =>
        e.parentId === ce.id && e.type === "education" &&
        isEventActive(e, age, events) &&
        (e.ageOffset !== undefined ? e.ageOffset >= HIGH_SCHOOL_AGE_FROM && e.ageOffset < HIGH_SCHOOL_AGE_TO : false)
      );
      const isPrivate = eduSub ? (eduSub.isPrivate ?? eduSub.label.includes("私立")) : false;
      hsSupport += highSchoolSupport(childAge, isPrivate);
    }
  }

  let depHolder: "self" | "spouse" = effectiveDepHolder || "self";
  if (depHolder === "self" && isSelfDead && !isSpouseDead) depHolder = "spouse";
  if (depHolder === "spouse" && isSpouseDead && !isSelfDead) depHolder = "self";
  const selfDepDed = depHolder === "self" ? dependentDeductionTotal : 0;
  const spouseDepDed = depHolder === "spouse" ? dependentDeductionTotal : 0;

  const preSpouseInsPremium = prescanInsurancePremium("spouse", events, age, isSpouseDead, isEffDisabled);
  const preSpouseLifeInsDed = calcLifeInsuranceDeduction(preSpouseInsPremium);
  const preSpouseHLDed = prescanHousingLoanDeduction("spouse", events, age, isEffDisabled);

  return {
    childEvents, dependentDeductionTotal, childAllowance, tashiWaiver, hsSupport,
    selfDepDed, spouseDepDed,
    preSpouseInsPremium, preSpouseLifeInsDed, preSpouseHLDed,
  };
}
