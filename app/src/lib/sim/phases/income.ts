/** Salary income for a member in a given year (keyframe + growth). */
import type { Keyframe } from "../../types";
import { resolveKF } from "../../types";

// ===== phaseMemberIncome: Symmetric self/spouse salary computation =====
export function phaseMemberIncome(
  isDead: boolean, retired: boolean, age: number,
  incomeKF: Keyframe[], growthRate: number | undefined, defaultGrossMan: number,
): { gross: number; grownGrossMan: number } {
  if (isDead || retired) return { gross: 0, grownGrossMan: 0 };
  const grossManBase = resolveKF(incomeKF, age, defaultGrossMan);
  let growthYears = 0;
  for (let ki = incomeKF.length - 1; ki >= 0; ki--) {
    if (incomeKF[ki].age <= age) { growthYears = age - incomeKF[ki].age; break; }
  }
  const grownGrossMan = grossManBase * Math.pow(1 + (growthRate || 0) / 100, growthYears);
  return { gross: grownGrossMan * 10000, grownGrossMan };
}
