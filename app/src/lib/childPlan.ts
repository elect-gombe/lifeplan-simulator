/**
 * 子供の設定モデル。
 * UI では「子供の配列 + 全員共通の設定」として編集し、保存時に従来どおりの
 * LifeEvent 群（親 = child イベント、教育・支援金 = サブイベント）へ展開する。
 * 既存データとの互換のため、イベント ⇄ プランの双方向変換を提供する。
 */
import type { LifeEvent, ParentalLeaveParams, ParentalLeaveSpec } from "./types";
import { nextEventId } from "./ids";

export type LivingType = "home" | "rural" | "urban";
export type StageVariant = "public" | "private";

export interface Stage {
  key: string;
  label: string;
  enabled: boolean;
  fromChildAge: number;
  toChildAge: number;
  annualMan: number;
  variant: StageVariant;
  livingType?: LivingType;
}

export const LIVING_COSTS: Record<LivingType, { label: string; annualMan: number }> = {
  home:  { label: "自宅", annualMan: 0 },
  rural: { label: "地方下宿", annualMan: 60 },
  urban: { label: "都内下宿", annualMan: 96 },
};

// 出典: 文部科学省「令和3年度子供の学習費調査」/ 日本学生支援機構「令和2年度学生生活調査」
// 値は学校教育費+学校外活動費の年額（万円）
export const STAGE_DEFAULTS: Record<string, { label: string; from: number; to: number; public: number; private: number; hasLiving?: boolean }> = {
  nursery:    { label: "保育園",   from: 0,  to: 3,  public: 26,  private: 37 },
  kinder:     { label: "幼稚園",   from: 3,  to: 6,  public: 17,  private: 31 },
  elementary: { label: "小学校",   from: 6,  to: 12, public: 35,  private: 167 },
  middle:     { label: "中学校",   from: 12, to: 15, public: 54,  private: 144 },
  high:       { label: "高校",     from: 15, to: 18, public: 51,  private: 105 },
  university: { label: "大学",     from: 18, to: 22, public: 67,  private: 137, hasLiving: true },
  grad:       { label: "大学院",   from: 22, to: 24, public: 80,  private: 120, hasLiving: true },
};

export interface StageTemplate {
  key: string; label: string;
  config: Record<string, { enabled: boolean; variant: StageVariant; livingType?: LivingType }>;
}
const pub = (livingType?: LivingType) => ({ enabled: true, variant: "public" as const, livingType });
const priv = (livingType?: LivingType) => ({ enabled: true, variant: "private" as const, livingType });
const off = { enabled: false, variant: "public" as const };
export const TEMPLATES: StageTemplate[] = [
  { key: "public_all", label: "すべて公立", config: { nursery: pub(), kinder: pub(), elementary: pub(), middle: pub(), high: pub(), university: pub(), grad: off } },
  { key: "private_all", label: "すべて私立", config: { nursery: priv(), kinder: priv(), elementary: priv(), middle: priv(), high: priv(), university: priv(), grad: off } },
  { key: "mixed", label: "公立 → 私立大学", config: { nursery: pub(), kinder: pub(), elementary: pub(), middle: pub(), high: pub(), university: priv(), grad: off } },
  { key: "rural_pub", label: "国公立+地方下宿", config: { nursery: pub(), kinder: pub(), elementary: pub(), middle: pub(), high: pub(), university: pub("rural"), grad: off } },
  { key: "urban_priv", label: "私立+都内下宿", config: { nursery: pub(), kinder: pub(), elementary: pub(), middle: pub(), high: pub(), university: priv("urban"), grad: off } },
  { key: "grad_pub", label: "大学院まで（国公立）", config: { nursery: pub(), kinder: pub(), elementary: pub(), middle: pub(), high: pub(), university: pub(), grad: pub() } },
];

export function calcStageAnnual(def: typeof STAGE_DEFAULTS[string], variant: StageVariant, livingType?: LivingType): number {
  const base = variant === "private" ? def.private : def.public;
  const living = def.hasLiving && livingType ? LIVING_COSTS[livingType].annualMan : 0;
  return base + living;
}

export function buildStages(template: StageTemplate): Stage[] {
  return Object.entries(STAGE_DEFAULTS).map(([key, def]) => {
    const cfg = template.config[key] || off;
    return {
      key, label: def.label, enabled: cfg.enabled,
      fromChildAge: def.from, toChildAge: def.to,
      annualMan: calcStageAnnual(def, cfg.variant, cfg.livingType),
      variant: cfg.variant,
      livingType: def.hasLiving ? (cfg.livingType || "home") : undefined,
    };
  });
}

/** 現在のステージ構成に一致するテンプレートキー（なければ "custom"） */
export function matchTemplate(stages: Stage[]): string {
  for (const t of TEMPLATES) {
    const built = buildStages(t);
    const same = built.every((b, i) => {
      const s = stages[i];
      return s && s.enabled === b.enabled && (!s.enabled || (s.variant === b.variant && (s.livingType ?? "home") === (b.livingType ?? "home") && s.annualMan === b.annualMan));
    });
    if (same) return t.key;
  }
  return "custom";
}

// ============================================================
// Plan model
// ============================================================

export interface ChildPlan {
  /** 親イベントの id。保存時に維持される（リンク先シナリオの除外リストが壊れないように） */
  id: number;
  name: string;
  /** 誕生時の本人年齢 */
  birthAge: number;
  stages: Stage[];
  /** 育休の休業月数（0/undefined = なし）。給付金・復職後の条件は共通設定から */
  leaveSelfMonths: number;
  leaveSpouseMonths: number;
}

export interface ChildCommon {
  birthCostMan: number;
  baseCareMan: number;
  weddingSupport?: { amountMan: number; childAge: number };
  housingAid?: { amountMan: number; childAge: number };
  /** 育休の共通条件（月数は子ごと） */
  leave: { benefit: boolean; selfReturnRatio: number; selfReturnYears: number; spouseReturnRatio: number; spouseReturnYears: number };
}

export const DEFAULT_COMMON: ChildCommon = {
  birthCostMan: 50, baseCareMan: 30,
  weddingSupport: undefined, housingAid: undefined,
  leave: { benefit: true, selfReturnRatio: 100, selfReturnYears: 0, spouseReturnRatio: 100, spouseReturnYears: 0 },
};

export const CHILD_LABELS = ["第1子", "第2子", "第3子", "第4子", "第5子", "第6子"];

export { nextEventId as newEventId };

export function newChildPlan(index: number, birthAge: number, template: StageTemplate = TEMPLATES[0]): ChildPlan {
  return { id: nextEventId(), name: CHILD_LABELS[index] || `第${index + 1}子`, birthAge, stages: buildStages(template), leaveSelfMonths: 0, leaveSpouseMonths: 0 };
}

export function lastStageEnd(stages: Stage[]): number {
  return stages.filter(s => s.enabled).reduce((max, s) => Math.max(max, s.toChildAge), 18);
}

/** 1人あたりの費用合計（万円） */
export function childCostTotals(plan: ChildPlan, common: ChildCommon) {
  const enabled = plan.stages.filter(s => s.enabled);
  const end = lastStageEnd(plan.stages);
  const edu = enabled.reduce((s, st) => s + st.annualMan * (st.toChildAge - st.fromChildAge), 0);
  const care = common.baseCareMan * end;
  const oneTime = common.birthCostMan + (common.weddingSupport?.amountMan ?? 0) + (common.housingAid?.amountMan ?? 0);
  return { edu, care, oneTime, total: edu + care + oneTime, end };
}

/** 世帯合計: 親の年齢ごとの子供関連費用（万円/年） */
export function householdChildCostByAge(plans: ChildPlan[], common: ChildCommon): { age: number; care: number; edu: number; oneTime: number }[] {
  if (plans.length === 0) return [];
  const minAge = Math.min(...plans.map(p => p.birthAge));
  const maxAge = Math.max(...plans.map(p => p.birthAge + Math.max(lastStageEnd(p.stages), common.weddingSupport?.childAge ?? 0, common.housingAid?.childAge ?? 0)));
  const out: { age: number; care: number; edu: number; oneTime: number }[] = [];
  for (let age = minAge; age <= maxAge; age++) {
    let care = 0, edu = 0, oneTime = 0;
    for (const p of plans) {
      const c = age - p.birthAge;
      if (c < 0) continue;
      if (c < lastStageEnd(p.stages)) care += common.baseCareMan;
      for (const s of p.stages) if (s.enabled && c >= s.fromChildAge && c < s.toChildAge) edu += s.annualMan;
      if (c === 0) oneTime += common.birthCostMan;
      if (common.weddingSupport && c === common.weddingSupport.childAge) oneTime += common.weddingSupport.amountMan;
      if (common.housingAid && c === common.housingAid.childAge) oneTime += common.housingAid.amountMan;
    }
    out.push({ age, care, edu, oneTime });
  }
  return out;
}

// ============================================================
// Events ⇄ Plans
// ============================================================

const WEDDING_LABEL = "結婚支援金";
const HOUSING_LABEL = "住宅取得援助";

function stagesFromSubEvents(subs: LifeEvent[]): Stage[] {
  const edu = subs.filter(e => e.type === "education");
  return Object.entries(STAGE_DEFAULTS).map(([key, def]) => {
    const match = edu.find(e => e.ageOffset === def.from && e.durationYears === def.to - def.from);
    if (!match) {
      return { key, label: def.label, enabled: false, fromChildAge: def.from, toChildAge: def.to, annualMan: def.public, variant: "public" as const, livingType: def.hasLiving ? "home" as LivingType : undefined };
    }
    const isPrivate = match.isPrivate ?? (match.label.includes("私立") || match.annualCostMan >= def.private * 0.8);
    let livingType: LivingType | undefined;
    if (def.hasLiving) livingType = match.label.includes("都内下宿") ? "urban" : match.label.includes("地方下宿") ? "rural" : "home";
    return { key, label: def.label, enabled: true, fromChildAge: def.from, toChildAge: def.to, annualMan: match.annualCostMan, variant: isPrivate ? "private" as const : "public" as const, livingType };
  });
}

/** 子供関連イベント（親 + サブ）かどうか */
export function isChildRelatedEvent(e: LifeEvent, all: LifeEvent[]): boolean {
  if (e.type === "child" && !e.parentId) return true;
  if (e.parentId != null) return all.some(p => p.id === e.parentId && p.type === "child");
  return false;
}

/** 既存イベントから プラン配列 + 共通設定 を復元 */
export function eventsToChildPlans(events: LifeEvent[]): { plans: ChildPlan[]; common: ChildCommon } {
  const parents = events.filter(e => e.type === "child" && !e.parentId).sort((a, b) => a.age - b.age);
  const common: ChildCommon = { ...DEFAULT_COMMON, leave: { ...DEFAULT_COMMON.leave } };
  const plans: ChildPlan[] = parents.map((p, i) => {
    const subs = events.filter(e => e.parentId === p.id);
    if (i === 0) {
      common.birthCostMan = p.oneTimeCostMan;
      common.baseCareMan = p.annualCostMan;
      const w = subs.find(e => e.type === "custom" && e.label.includes(WEDDING_LABEL));
      if (w) common.weddingSupport = { amountMan: w.oneTimeCostMan, childAge: w.ageOffset ?? 30 };
      const h = subs.find(e => e.type === "custom" && e.label.includes(HOUSING_LABEL));
      if (h) common.housingAid = { amountMan: h.oneTimeCostMan, childAge: h.ageOffset ?? 30 };
    }
    return {
      id: p.id, name: p.label, birthAge: p.age, stages: stagesFromSubEvents(subs),
      leaveSelfMonths: p.parentalLeave?.self?.months ?? 0,
      leaveSpouseMonths: p.parentalLeave?.spouse?.months ?? 0,
    };
  });
  // 育休の共通条件は最初に設定がある子から
  const firstLeave = parents.map(p => p.parentalLeave).find(pl => pl?.self || pl?.spouse);
  if (firstLeave) {
    const s = firstLeave.self, sp = firstLeave.spouse;
    common.leave = {
      benefit: (s?.benefit ?? sp?.benefit) ?? true,
      selfReturnRatio: s?.returnRatio ?? 100, selfReturnYears: s?.returnYears ?? 0,
      spouseReturnRatio: sp?.returnRatio ?? 100, spouseReturnYears: sp?.returnYears ?? 0,
    };
  }
  return { plans, common };
}

function leaveSpec(months: number, benefit: boolean, ratio: number, years: number): ParentalLeaveSpec | undefined {
  if (months <= 0) return undefined;
  return { months, benefit, returnRatio: ratio, returnYears: ratio < 100 ? years : 0 };
}

/** プラン配列 + 共通設定 を LifeEvent 群に展開。親 id は維持、サブは再生成。 */
export function childPlansToEvents(plans: ChildPlan[], common: ChildCommon): LifeEvent[] {
  const out: LifeEvent[] = [];
  for (const p of plans) {
    const self = leaveSpec(p.leaveSelfMonths, common.leave.benefit, common.leave.selfReturnRatio, common.leave.selfReturnYears);
    const spouse = leaveSpec(p.leaveSpouseMonths, common.leave.benefit, common.leave.spouseReturnRatio, common.leave.spouseReturnYears);
    const parentalLeave: ParentalLeaveParams | undefined = (self || spouse) ? { ...(self ? { self } : {}), ...(spouse ? { spouse } : {}) } : undefined;
    out.push({
      id: p.id, age: p.birthAge, type: "child", label: p.name,
      oneTimeCostMan: common.birthCostMan, annualCostMan: common.baseCareMan, durationYears: lastStageEnd(p.stages),
      ...(parentalLeave ? { parentalLeave } : {}),
    });
    for (const s of p.stages) {
      if (!s.enabled) continue;
      out.push({
        id: nextEventId(), age: p.birthAge + s.fromChildAge, type: "education",
        label: `${p.name} ${s.label}(${s.variant === "private" ? "私立" : "公立"}${s.livingType && s.livingType !== "home" ? `・${LIVING_COSTS[s.livingType].label}` : ""})`,
        oneTimeCostMan: 0, annualCostMan: s.annualMan, durationYears: s.toChildAge - s.fromChildAge,
        parentId: p.id, ageOffset: s.fromChildAge, isPrivate: s.variant === "private",
      });
    }
    if (common.weddingSupport && common.weddingSupport.amountMan > 0) {
      out.push({ id: nextEventId(), age: p.birthAge + common.weddingSupport.childAge, type: "custom", label: `${p.name} ${WEDDING_LABEL}`,
        oneTimeCostMan: common.weddingSupport.amountMan, annualCostMan: 0, durationYears: 1, parentId: p.id, ageOffset: common.weddingSupport.childAge });
    }
    if (common.housingAid && common.housingAid.amountMan > 0) {
      out.push({ id: nextEventId(), age: p.birthAge + common.housingAid.childAge, type: "custom", label: `${p.name} ${HOUSING_LABEL}`,
        oneTimeCostMan: common.housingAid.amountMan, annualCostMan: 0, durationYears: 1, parentId: p.id, ageOffset: common.housingAid.childAge });
    }
  }
  return out;
}

/** events 内の子供関連イベントを plans から作り直したものに置き換える（他のイベントは保持、年齢順） */
export function replaceChildEvents(events: LifeEvent[], plans: ChildPlan[], common: ChildCommon): LifeEvent[] {
  const others = events.filter(e => !isChildRelatedEvent(e, events));
  return [...others, ...childPlansToEvents(plans, common)].sort((a, b) => a.age - b.age);
}
