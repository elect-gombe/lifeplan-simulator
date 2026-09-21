/**
 * 育休（育児休業）: 子供イベントに付与された休業設定を、各年の本人/配偶者の
 * 就労係数・給付金月数・年金保護フラグに変換する。
 *
 * 前提（概算）:
 *  - 休業は出生月から連続。年内の休業月数ぶん給与・社保がゼロになる（社保免除の近似）。
 *  - 育児休業給付金: 180日（6ヶ月）まで休業開始時賃金の67%、以降50%。月額上限あり。非課税・社保対象外。
 *    賃金は年収÷12で近似（賞与も含めた平均）。
 *  - 子が3歳未満の年は、年金記録（平均標準報酬）を休業前の給与で積み上げる（養育期間の従前標準報酬みなし）。
 *  - 復職後の時短勤務は returnRatio × returnYears で年収を減額（休業終了年から数える）。
 */
import type { ParentalLeaveSpec } from "../../types";
import { resolveEventAge } from "../../types";
import type { AgeEventInfo, YearContext } from "../types";

export const LEAVE_BENEFIT_RATE_FIRST = 0.67;          // 休業180日まで
export const LEAVE_BENEFIT_RATE_AFTER = 0.50;          // 181日以降
export const LEAVE_BENEFIT_FIRST_MONTHS = 6;
export const LEAVE_BENEFIT_CAP_FIRST_MONTHLY = 315_369; // 円/月（2025年度 上限）
export const LEAVE_BENEFIT_CAP_AFTER_MONTHLY = 235_350;
export const PENSION_PROTECT_CHILD_AGE = 3;             // 従前標準報酬みなし: 子が3歳になるまで

export interface MemberLeave {
  /** 当年の休業月数（複数の子の重複は合算し12で打ち切り） */
  leaveMonths: number;
  /** 当年の就労係数（0〜1）: (12−休業月)/12 × 復職後比率 */
  incomeFactor: number;
  /** 給付金 67% 対象月数 / 50% 対象月数 */
  benefitMonthsFirst: number;
  benefitMonthsAfter: number;
  /** 年金記録を休業前給与で積み上げるか */
  protectPension: boolean;
}

const NO_LEAVE: MemberLeave = { leaveMonths: 0, incomeFactor: 1, benefitMonthsFirst: 0, benefitMonthsAfter: 0, protectPension: false };

/** 1人の子・1人の親についての当年ぶんを計算 */
function memberLeaveForChild(spec: ParentalLeaveSpec, yearsSinceBirth: number): MemberLeave {
  if (yearsSinceBirth < 0 || spec.months <= 0) return NO_LEAVE;
  const t = yearsSinceBirth;
  const startM = 12 * t, endM = Math.min(spec.months, 12 * (t + 1));
  const leaveMonths = Math.max(0, endM - startM);
  const benefitMonthsFirst = spec.benefit ? Math.max(0, Math.min(endM, LEAVE_BENEFIT_FIRST_MONTHS) - startM) : 0;
  const benefitMonthsAfter = spec.benefit ? leaveMonths - benefitMonthsFirst : 0;
  // 復職後比率: 休業終了年（部分年を含む）から returnYears 年間
  const leaveEndYear = Math.floor((spec.months - 1) / 12); // 休業が終わる年のインデックス
  const returnYears = spec.returnYears ?? 0;
  const ratio = spec.returnRatio == null ? 1 : Math.max(0, Math.min(1, spec.returnRatio / 100));
  const inReturnPeriod = returnYears > 0 && ratio < 1 && t >= leaveEndYear && t < leaveEndYear + returnYears;
  const workedRatio = inReturnPeriod ? ratio : 1;
  const incomeFactor = Math.max(0, (12 - leaveMonths) / 12) * workedRatio;
  const protectPension = t < PENSION_PROTECT_CHILD_AGE && (leaveMonths > 0 || inReturnPeriod);
  return { leaveMonths, incomeFactor, benefitMonthsFirst, benefitMonthsAfter, protectPension };
}

/** 複数の子の休業を1人の親について合成 */
function mergeLeaves(items: MemberLeave[]): MemberLeave {
  if (items.length === 0) return NO_LEAVE;
  const leaveMonths = Math.min(12, items.reduce((s, x) => s + x.leaveMonths, 0));
  const benefitMonthsFirst = Math.min(leaveMonths, items.reduce((s, x) => s + x.benefitMonthsFirst, 0));
  const benefitMonthsAfter = Math.min(leaveMonths - benefitMonthsFirst, items.reduce((s, x) => s + x.benefitMonthsAfter, 0));
  // 就労係数: 休業月の合算 × 復職後比率の最小値
  const minRatio = Math.min(...items.map(x => (12 - x.leaveMonths) > 0 ? x.incomeFactor / ((12 - x.leaveMonths) / 12) : 1));
  const incomeFactor = Math.max(0, (12 - leaveMonths) / 12) * Math.min(1, minRatio);
  return { leaveMonths, incomeFactor, benefitMonthsFirst, benefitMonthsAfter, protectPension: items.some(x => x.protectPension) };
}

export function phaseParentalLeave(ctx: YearContext, ageInfo: AgeEventInfo): { self: MemberLeave; spouse: MemberLeave } {
  const { age, events, isEffDisabled } = ctx;
  const selfItems: MemberLeave[] = [], spouseItems: MemberLeave[] = [];
  for (const e of events) {
    if (e.type !== "child" || !e.parentalLeave || isEffDisabled(e)) continue;
    const t = age - resolveEventAge(e, events);
    if (t < 0 || t > 30) continue;
    if (e.parentalLeave.self && !ageInfo.isSelfDead) selfItems.push(memberLeaveForChild(e.parentalLeave.self, t));
    if (e.parentalLeave.spouse && !ageInfo.isSpouseDead && ctx.config.spouse) spouseItems.push(memberLeaveForChild(e.parentalLeave.spouse, t));
  }
  return { self: mergeLeaves(selfItems), spouse: mergeLeaves(spouseItems) };
}

/** 育児休業給付金（円/年）。fullGross = 休業がなかった場合の年収（円）。 */
export function calcLeaveBenefit(fullGross: number, lv: MemberLeave): number {
  if (fullGross <= 0) return 0;
  const monthly = fullGross / 12;
  const first = Math.min(monthly * LEAVE_BENEFIT_RATE_FIRST, LEAVE_BENEFIT_CAP_FIRST_MONTHLY) * lv.benefitMonthsFirst;
  const after = Math.min(monthly * LEAVE_BENEFIT_RATE_AFTER, LEAVE_BENEFIT_CAP_AFTER_MONTHLY) * lv.benefitMonthsAfter;
  return Math.round(first + after);
}
