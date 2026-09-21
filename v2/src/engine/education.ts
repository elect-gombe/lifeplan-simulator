/** 教育費の標準テーブルと公的支援（児童手当・高校就学支援金・多子世帯大学無償化）。 */
import type { Child, EducationStage, LivingAway, StageKey } from "@/domain/model";
import { STAGE_ORDER } from "@/domain/model";
import * as C from "./constants";

/** 年額（万円）: 学校教育費＋学校外活動費。出典: 文科省 子供の学習費調査(R5) / JASSO 学生生活調査 を丸めた値 */
export const STAGE_TABLE: Record<StageKey, { label: string; from: number; to: number; public: number; private: number; hasAway: boolean }> = {
  nursery:    { label: "保育園",  from: 0,  to: 3,  public: 25,  private: 40,  hasAway: false },
  kinder:     { label: "幼稚園",  from: 3,  to: 6,  public: 18,  private: 35,  hasAway: false },
  elementary: { label: "小学校",  from: 6,  to: 12, public: 34,  private: 183, hasAway: false },
  middle:     { label: "中学校",  from: 12, to: 15, public: 54,  private: 156, hasAway: false },
  high:       { label: "高校",    from: 15, to: 18, public: 60,  private: 103, hasAway: false },
  university: { label: "大学",    from: 18, to: 22, public: 65,  private: 130, hasAway: true },
  grad:       { label: "大学院",  from: 22, to: 24, public: 65,  private: 110, hasAway: true },
};
/** 大学の初年度に上乗せする入学金等（万円） */
export const ADMISSION_EXTRA: Record<StageKey, { public: number; private: number }> = {
  nursery: { public: 0, private: 0 }, kinder: { public: 0, private: 10 }, elementary: { public: 0, private: 30 },
  middle: { public: 0, private: 30 }, high: { public: 0, private: 25 }, university: { public: 28, private: 30 }, grad: { public: 28, private: 25 },
};
export const AWAY_COST: Record<LivingAway, { label: string; annual: number }> = {
  home: { label: "自宅", annual: 0 },
  rural: { label: "地方で一人暮らし", annual: 72 },
  urban: { label: "都市部で一人暮らし", annual: 110 },
};

/**
 * 年額（万円）。annualOverride は「学費＋下宿費」を合わせた年額そのもの（画面の金額欄と同じ意味）。
 * 入学金等（初年度のみ）は上書きの有無にかかわらず加算する。
 */
export function stageAnnualCost(key: StageKey, st: EducationStage, firstYear: boolean): number {
  const t = STAGE_TABLE[key];
  const away = t.hasAway && st.away ? AWAY_COST[st.away].annual : 0;
  const base = st.annualOverride ?? (st.kind === "private" ? t.private : t.public) + away;
  const adm = firstYear ? ADMISSION_EXTRA[key][st.kind] : 0;
  return base + adm;
}

export interface ChildYearCost { education: number; care: number; stage: StageKey | null; isPrivate: boolean }

/** 子の年齢 childAge における年間費用（万円） */
export function childCostAt(child: Child, childAge: number, careMonthly: number, independenceAge: number): ChildYearCost {
  let education = 0; let stage: StageKey | null = null; let isPrivate = false;
  for (const key of STAGE_ORDER) {
    const st = child.education[key];
    const t = STAGE_TABLE[key];
    if (!st?.enabled || childAge < t.from || childAge >= t.to) continue;
    education += stageAnnualCost(key, st, childAge === t.from);
    stage = key; isPrivate = st.kind === "private";
  }
  const care = childAge >= 0 && childAge < independenceAge ? careMonthly * 12 : 0;
  return { education, care, stage, isPrivate };
}

/** 子1人の教育費合計（万円、入学金込み） */
export function totalEducationCost(child: Child): number {
  let sum = 0;
  for (const key of STAGE_ORDER) {
    const st = child.education[key]; const t = STAGE_TABLE[key];
    if (!st?.enabled) continue;
    for (let a = t.from; a < t.to; a++) sum += stageAnnualCost(key, st, a === t.from);
  }
  return sum;
}

/** 児童手当（円/年）。childIndex は年齢降順（第1子=0）ではなく出生順で 3人目以降を判定。 */
export function childAllowanceAnnual(childAge: number, isThirdOrLater: boolean): number {
  if (childAge < 0 || childAge >= 19) return 0;
  if (isThirdOrLater) return C.CHILD_ALLOWANCE_THIRD * 12;
  return (childAge < 3 ? C.CHILD_ALLOWANCE_UNDER3 : C.CHILD_ALLOWANCE_3_18) * 12;
}

/** 高校就学支援金（円/年、所得制限なし） */
export function highSchoolSupport(childAge: number, stage: StageKey | null, isPrivate: boolean): number {
  if (stage !== "high" || childAge < 15 || childAge >= 18) return 0;
  return isPrivate ? C.HS_SUPPORT_PRIVATE : C.HS_SUPPORT_PUBLIC;
}

/** 多子世帯の大学授業料減免（円/年）: 扶養する子が3人以上のとき */
export function tashiWaiver(childAge: number, stage: StageKey | null, isPrivate: boolean, dependentChildren: number): number {
  if (dependentChildren < 3 || stage !== "university") return 0;
  const tuition = isPrivate ? C.TASHI_TUITION_PRIVATE : C.TASHI_TUITION_PUBLIC;
  const adm = childAge === 18 ? (isPrivate ? C.TASHI_ADMISSION_PRIVATE : C.TASHI_ADMISSION_PUBLIC) : 0;
  return tuition + adm;
}

/**
 * 育児休業: 出生から months 連続で休業したとき、出生後 t 年目（0始まり）の休業月数と給付月数。
 */
export function leaveMonthsInYear(months: number, t: number): { leave: number; first: number; after: number } {
  if (months <= 0 || t < 0) return { leave: 0, first: 0, after: 0 };
  const start = 12 * t, end = Math.min(months, 12 * (t + 1));
  const leave = Math.max(0, end - start);
  const first = Math.max(0, Math.min(end, C.LEAVE_FIRST_MONTHS) - start);
  return { leave, first, after: Math.max(leave - first, 0) };
}

export function leaveBenefit(fullSalaryAnnual: number, first: number, after: number): number {
  if (fullSalaryAnnual <= 0) return 0;
  const m = fullSalaryAnnual / 12;
  return Math.round(Math.min(m * C.LEAVE_RATE_FIRST, C.LEAVE_CAP_FIRST) * first + Math.min(m * C.LEAVE_RATE_AFTER, C.LEAVE_CAP_AFTER) * after);
}
