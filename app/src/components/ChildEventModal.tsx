import React, { useState, useEffect, useMemo } from "react";
import type { LifeEvent } from "../lib/types";
import { BarChart } from "./ui";

export type LivingType = "home" | "rural" | "urban";

interface Stage {
  key: string;
  label: string;
  enabled: boolean;
  fromChildAge: number;
  toChildAge: number;
  annualMan: number;
  variant: "public" | "private";
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

export const TEMPLATES: { key: string; label: string; config: Record<string, { enabled: boolean; variant: "public" | "private"; livingType?: LivingType }> }[] = [
  {
    key: "public_all", label: "すべて公立",
    config: { nursery: { enabled: true, variant: "public" }, kinder: { enabled: true, variant: "public" }, elementary: { enabled: true, variant: "public" }, middle: { enabled: true, variant: "public" }, high: { enabled: true, variant: "public" }, university: { enabled: true, variant: "public" }, grad: { enabled: false, variant: "public" } },
  },
  {
    key: "private_all", label: "すべて私立",
    config: { nursery: { enabled: true, variant: "private" }, kinder: { enabled: true, variant: "private" }, elementary: { enabled: true, variant: "private" }, middle: { enabled: true, variant: "private" }, high: { enabled: true, variant: "private" }, university: { enabled: true, variant: "private" }, grad: { enabled: false, variant: "private" } },
  },
  {
    key: "mixed", label: "公立 → 私立大学",
    config: { nursery: { enabled: true, variant: "public" }, kinder: { enabled: true, variant: "public" }, elementary: { enabled: true, variant: "public" }, middle: { enabled: true, variant: "public" }, high: { enabled: true, variant: "public" }, university: { enabled: true, variant: "private" }, grad: { enabled: false, variant: "private" } },
  },
  {
    key: "rural_pub", label: "国公立+地方下宿",
    config: { nursery: { enabled: true, variant: "public" }, kinder: { enabled: true, variant: "public" }, elementary: { enabled: true, variant: "public" }, middle: { enabled: true, variant: "public" }, high: { enabled: true, variant: "public" }, university: { enabled: true, variant: "public", livingType: "rural" }, grad: { enabled: false, variant: "public" } },
  },
  {
    key: "urban_priv", label: "私立+都内下宿",
    config: { nursery: { enabled: true, variant: "public" }, kinder: { enabled: true, variant: "public" }, elementary: { enabled: true, variant: "public" }, middle: { enabled: true, variant: "public" }, high: { enabled: true, variant: "public" }, university: { enabled: true, variant: "private", livingType: "urban" }, grad: { enabled: false, variant: "private" } },
  },
  {
    key: "grad_pub", label: "大学院まで（国公立）",
    config: { nursery: { enabled: true, variant: "public" }, kinder: { enabled: true, variant: "public" }, elementary: { enabled: true, variant: "public" }, middle: { enabled: true, variant: "public" }, high: { enabled: true, variant: "public" }, university: { enabled: true, variant: "public" }, grad: { enabled: true, variant: "public" } },
  },
];

export function calcStageAnnual(def: typeof STAGE_DEFAULTS[string], variant: "public" | "private", livingType?: LivingType): number {
  const base = variant === "private" ? def.private : def.public;
  const living = def.hasLiving && livingType ? LIVING_COSTS[livingType].annualMan : 0;
  return base + living;
}

export function buildStages(template: typeof TEMPLATES[number]): Stage[] {
  return Object.entries(STAGE_DEFAULTS).map(([key, def]) => {
    const cfg = template.config[key] || { enabled: false, variant: "public" as const };
    return {
      key, label: def.label, enabled: cfg.enabled,
      fromChildAge: def.from, toChildAge: def.to,
      annualMan: calcStageAnnual(def, cfg.variant, cfg.livingType),
      variant: cfg.variant,
      livingType: def.hasLiving ? (cfg.livingType || "home") : undefined,
    };
  });
}

// Reconstruct stages from existing child sub-events
function reconstructStages(parentEvent: LifeEvent, subEvents: LifeEvent[]): Stage[] {
  const eduEvents = subEvents.filter(e => e.type === "education");
  return Object.entries(STAGE_DEFAULTS).map(([key, def]) => {
    // Match by ageOffset and duration
    const match = eduEvents.find(e =>
      e.ageOffset === def.from && e.durationYears === (def.to - def.from)
    );
    if (match) {
      const isPrivate = match.label.includes("私立") || match.annualCostMan >= def.private * 0.8;
      let livingType: LivingType | undefined;
      if (def.hasLiving) {
        if (match.label.includes("都内下宿")) livingType = "urban";
        else if (match.label.includes("地方下宿")) livingType = "rural";
        else livingType = "home";
      }
      return {
        key, label: def.label, enabled: true,
        fromChildAge: def.from, toChildAge: def.to,
        annualMan: match.annualCostMan,
        variant: isPrivate ? "private" as const : "public" as const,
        livingType,
      };
    }
    return {
      key, label: def.label, enabled: false,
      fromChildAge: def.from, toChildAge: def.to,
      annualMan: def.public,
      variant: "public" as const,
      livingType: def.hasLiving ? "home" as LivingType : undefined,
    };
  });
}

// ===== Cost Preview Component =====
function CostPreview({ stages, baseCareMan, birthCostMan, weddingSupportEnabled, weddingSupportMan, weddingSupportChildAge, housingAidEnabled, housingAidMan, housingAidChildAge, childCount }: {
  stages: Stage[];
  baseCareMan: number;
  birthCostMan: number;
  weddingSupportEnabled: boolean;
  weddingSupportMan: number;
  weddingSupportChildAge: number;
  housingAidEnabled: boolean;
  housingAidMan: number;
  housingAidChildAge: number;
  childCount: number;
}) {
  const enabledStages = stages.filter(s => s.enabled);
  const lastStageEnd = enabledStages.reduce((max, s) => Math.max(max, s.toChildAge), 18);

  const maxChildAge = Math.max(
    lastStageEnd,
    weddingSupportEnabled ? weddingSupportChildAge : 0,
    housingAidEnabled ? housingAidChildAge : 0,
  );

  // Build year-by-year cost array for one child
  const yearCosts: { age: number; care: number; edu: number; event: number }[] = [];
  for (let childAge = 0; childAge <= maxChildAge; childAge++) {
    let edu = 0;
    for (const s of enabledStages) {
      if (childAge >= s.fromChildAge && childAge < s.toChildAge) edu += s.annualMan;
    }
    const care = childAge < lastStageEnd ? baseCareMan : 0;
    let event = 0;
    if (childAge === 0) event += birthCostMan;
    if (weddingSupportEnabled && childAge === weddingSupportChildAge) event += weddingSupportMan;
    if (housingAidEnabled && childAge === housingAidChildAge) event += housingAidMan;
    yearCosts.push({ age: childAge, care, edu, event });
  }

  const totalCare = yearCosts.reduce((s, y) => s + y.care, 0);
  const totalEdu = enabledStages.reduce((s, st) => s + st.annualMan * (st.toChildAge - st.fromChildAge), 0);
  const totalEvent = birthCostMan + (weddingSupportEnabled ? weddingSupportMan : 0) + (housingAidEnabled ? housingAidMan : 0);
  const grandTotal = totalCare + totalEdu + totalEvent;
  const maxYear = Math.max(...yearCosts.map(y => y.care + y.edu + y.event), 1);

  // Stage color map
  const stageColors: Record<string, string> = {
    nursery: "#fbbf24", kinder: "#f59e0b", elementary: "#3b82f6",
    middle: "#8b5cf6", high: "#ec4899", university: "#ef4444", grad: "#dc2626",
  };

  return (
    <div className="rounded border border-amber-200 bg-amber-50/50 p-3 space-y-2">
      <div className="font-bold text-amber-800 text-sm">養育費プレビュー（1人あたり）</div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="rounded bg-amber-100 p-1">
          <div className="text-[9px] text-amber-600">養育費</div>
          <div className="font-bold text-amber-800 text-xs">{totalCare}万</div>
        </div>
        <div className="rounded bg-blue-100 p-1">
          <div className="text-[9px] text-blue-600">教育費</div>
          <div className="font-bold text-blue-800 text-xs">{totalEdu}万</div>
        </div>
        <div className="rounded bg-pink-100 p-1">
          <div className="text-[9px] text-pink-600">出産+支援金</div>
          <div className="font-bold text-pink-800 text-xs">{totalEvent}万</div>
        </div>
        <div className="rounded bg-red-100 p-1">
          <div className="text-[9px] text-red-600">合計</div>
          <div className="font-bold text-red-800 text-xs">{grandTotal}万</div>
        </div>
      </div>

      {/* Bar chart: year-by-year cost */}
      <BarChart height={64} maxValue={maxYear}>
        {yearCosts.map((y, i) => {
          const total = y.care + y.edu + y.event;
          const hPx = Math.max(Math.round(total / maxYear * 64), 1);
          const careRatio = total > 0 ? y.care / total : 0;
          const eduRatio = total > 0 ? y.edu / total : 0;
          const eventRatio = total > 0 ? y.event / total : 0;
          let stageKey = "";
          for (const s of enabledStages) {
            if (y.age >= s.fromChildAge && y.age < s.toChildAge) { stageKey = s.key; break; }
          }
          return (
            <div key={i} className="flex-1 relative group flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: hPx, alignSelf: "flex-end" }}>
              {eventRatio > 0 && <div className="bg-pink-400 w-full" style={{ height: `${eventRatio * 100}%` }} />}
              {eduRatio > 0 && <div className="w-full" style={{ height: `${eduRatio * 100}%`, backgroundColor: stageColors[stageKey] || "#3b82f6" }} />}
              {careRatio > 0 && <div className="bg-amber-300 w-full" style={{ height: `${careRatio * 100}%` }} />}
              <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 pointer-events-none mb-1">
                {y.age}歳: {total}万/年{y.edu > 0 ? ` (教育${y.edu}万)` : ""}{y.event > 0 ? ` (一時${y.event}万)` : ""}
              </div>
            </div>
          );
        })}
      </BarChart>
      <div className="flex justify-between text-[9px] text-gray-400 ml-8">
        <span>0歳</span>
        <span>{Math.floor(yearCosts.length / 2)}歳</span>
        <span>{yearCosts.length - 1}歳</span>
      </div>

      {/* Stage legend */}
      <div className="flex flex-wrap gap-1.5 text-[9px]">
        <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-amber-300" />養育費</span>
        {enabledStages.map(s => (
          <span key={s.key} className="flex items-center gap-0.5">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: stageColors[s.key] }} />
            {s.label}({s.variant === "private" ? "私" : "公"})
          </span>
        ))}
        <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-pink-400" />一時費用</span>
      </div>

      {/* Stage breakdown table */}
      <div className="text-[10px]">
        <table className="w-full">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left px-1 py-0.5">ステージ</th>
              <th className="text-right px-1 py-0.5">年齢</th>
              <th className="text-right px-1 py-0.5">年額</th>
              <th className="text-right px-1 py-0.5">期間</th>
              <th className="text-right px-1 py-0.5 font-bold">小計</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-1 py-0.5">出産</td>
              <td className="px-1 py-0.5 text-right text-gray-400">0歳</td>
              <td className="px-1 py-0.5 text-right">-</td>
              <td className="px-1 py-0.5 text-right">-</td>
              <td className="px-1 py-0.5 text-right font-mono">{birthCostMan}万</td>
            </tr>
            <tr className="border-b border-gray-100 bg-amber-50">
              <td className="px-1 py-0.5">基本養育費</td>
              <td className="px-1 py-0.5 text-right text-gray-400">0〜{lastStageEnd}歳</td>
              <td className="px-1 py-0.5 text-right font-mono">{baseCareMan}万</td>
              <td className="px-1 py-0.5 text-right">{lastStageEnd}年</td>
              <td className="px-1 py-0.5 text-right font-mono">{totalCare}万</td>
            </tr>
            {enabledStages.map(s => (
              <tr key={s.key} className="border-b border-gray-100">
                <td className="px-1 py-0.5">
                  <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: stageColors[s.key] }} />
                  {s.label}({s.variant === "private" ? "私立" : "公立"})
                </td>
                <td className="px-1 py-0.5 text-right text-gray-400">{s.fromChildAge}〜{s.toChildAge}歳</td>
                <td className="px-1 py-0.5 text-right font-mono">{s.annualMan}万</td>
                <td className="px-1 py-0.5 text-right">{s.toChildAge - s.fromChildAge}年</td>
                <td className="px-1 py-0.5 text-right font-mono">{s.annualMan * (s.toChildAge - s.fromChildAge)}万</td>
              </tr>
            ))}
            {weddingSupportEnabled && (
              <tr className="border-b border-gray-100">
                <td className="px-1 py-0.5">結婚支援金</td>
                <td className="px-1 py-0.5 text-right text-gray-400">{weddingSupportChildAge}歳</td>
                <td className="px-1 py-0.5 text-right">-</td>
                <td className="px-1 py-0.5 text-right">-</td>
                <td className="px-1 py-0.5 text-right font-mono">{weddingSupportMan}万</td>
              </tr>
            )}
            {housingAidEnabled && (
              <tr className="border-b border-gray-100">
                <td className="px-1 py-0.5">住宅取得援助</td>
                <td className="px-1 py-0.5 text-right text-gray-400">{housingAidChildAge}歳</td>
                <td className="px-1 py-0.5 text-right">-</td>
                <td className="px-1 py-0.5 text-right">-</td>
                <td className="px-1 py-0.5 text-right font-mono">{housingAidMan}万</td>
              </tr>
            )}
            <tr className="font-bold bg-gray-50">
              <td className="px-1 py-0.5" colSpan={4}>1人あたり合計</td>
              <td className="px-1 py-0.5 text-right font-mono">{grandTotal.toLocaleString()}万</td>
            </tr>
            {childCount > 1 && (
              <tr className="font-bold bg-red-50 text-red-700">
                <td className="px-1 py-0.5" colSpan={4}>{childCount}人合計</td>
                <td className="px-1 py-0.5 text-right font-mono">{(grandTotal * childCount).toLocaleString()}万</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ChildEventModal({ isOpen, onClose, onAdd, currentAge, retirementAge, existingEvents, onUpdate }: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (events: LifeEvent[]) => void;
  currentAge: number;
  retirementAge: number;
  existingEvents?: LifeEvent[];  // for editing: parent + sub-events
  onUpdate?: (oldIds: number[], newEvents: LifeEvent[]) => void;  // replace existing events
}) {
  const isEditing = !!(existingEvents && existingEvents.length > 0);
  const existingParent = isEditing ? existingEvents!.find(e => e.type === "child" && !e.parentId) : null;
  const existingSubs = isEditing && existingParent ? existingEvents!.filter(e => e.parentId === existingParent.id) : [];

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [childName, setChildName] = useState("第1子");
  const [birthAge, setBirthAge] = useState(currentAge + 3);
  const [birthCostMan, setBirthCostMan] = useState(50);
  const [baseCareMan, setBaseCareMan] = useState(30);
  const [weddingSupportMan, setWeddingSupportMan] = useState(92);
  const [weddingSupportChildAge, setWeddingSupportChildAge] = useState(30);
  const [weddingSupportEnabled, setWeddingSupportEnabled] = useState(true);
  const [housingAidEnabled, setHousingAidEnabled] = useState(false);
  const [housingAidChildAge, setHousingAidChildAge] = useState(30);
  const [housingAidMan, setHousingAidMan] = useState(300);
  const [stages, setStages] = useState<Stage[]>(() => buildStages(TEMPLATES[2]));
  const [childCount, setChildCount] = useState(3);
  const [firstBirthAge, setFirstBirthAge] = useState(currentAge + 3);
  const [interval, setIntervalVal] = useState(2);

  // Restore state from existing events when editing
  useEffect(() => {
    if (!isEditing || !existingParent) return;
    setMode("single");
    setChildName(existingParent.label);
    setBirthAge(existingParent.age);
    setBirthCostMan(existingParent.oneTimeCostMan);
    setBaseCareMan(existingParent.annualCostMan);

    // Reconstruct stages
    setStages(reconstructStages(existingParent, existingSubs));

    // Reconstruct wedding support
    const weddingEvt = existingSubs.find(e => e.type === "custom" && e.label.includes("結婚支援金"));
    if (weddingEvt) {
      setWeddingSupportEnabled(true);
      setWeddingSupportMan(weddingEvt.oneTimeCostMan);
      setWeddingSupportChildAge(weddingEvt.ageOffset ?? 30);
    } else {
      setWeddingSupportEnabled(false);
    }

    // Reconstruct housing aid
    const housingAidEvt = existingSubs.find(e => e.type === "custom" && e.label.includes("住宅取得援助"));
    if (housingAidEvt) {
      setHousingAidEnabled(true);
      setHousingAidMan(housingAidEvt.oneTimeCostMan);
      setHousingAidChildAge(housingAidEvt.ageOffset ?? 30);
    } else {
      setHousingAidEnabled(false);
    }
  }, [isEditing, existingParent?.id]);

  const CHILD_LABELS = ["第1子", "第2子", "第3子", "第4子", "第5子"];

  if (!isOpen) return null;

  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    setStages(buildStages(tpl));
  };

  const updateStage = (idx: number, patch: Partial<Stage>) => {
    setStages(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const next = { ...s, ...patch };
      if (patch.variant !== undefined || patch.livingType !== undefined) {
        const def = STAGE_DEFAULTS[s.key];
        next.annualMan = calcStageAnnual(def, next.variant, next.livingType);
      }
      return next;
    }));
  };

  const lastStageEnd = stages.filter(s => s.enabled).reduce((max, s) => Math.max(max, s.toChildAge), 18);

  const buildOneChild = (name: string, age: number, existingId?: number): LifeEvent[] => {
    const parentId = existingId || Date.now() + Math.round(Math.random() * 100000);
    const evts: LifeEvent[] = [
      { id: parentId, age, type: "child", label: name, oneTimeCostMan: birthCostMan, annualCostMan: baseCareMan, durationYears: lastStageEnd },
    ];
    for (const s of stages) {
      if (!s.enabled) continue;
      evts.push({
        id: Date.now() + Math.round(Math.random() * 100000),
        age: age + s.fromChildAge,
        type: "education",
        label: `${name} ${s.label}(${s.variant === "private" ? "私立" : "公立"}${s.livingType && s.livingType !== "home" ? `・${LIVING_COSTS[s.livingType].label}` : ""})`,
        oneTimeCostMan: 0,
        annualCostMan: s.annualMan,
        durationYears: s.toChildAge - s.fromChildAge,
        parentId,
        ageOffset: s.fromChildAge,
      });
    }
    if (weddingSupportEnabled && weddingSupportMan > 0) {
      evts.push({
        id: Date.now() + Math.round(Math.random() * 100000),
        age: age + weddingSupportChildAge,
        type: "custom",
        label: `${name} 結婚支援金`,
        oneTimeCostMan: weddingSupportMan,
        annualCostMan: 0,
        durationYears: 1,
        parentId,
        ageOffset: weddingSupportChildAge,
      });
    }
    if (housingAidEnabled && housingAidMan > 0) {
      evts.push({
        id: Date.now() + Math.round(Math.random() * 100000),
        age: age + housingAidChildAge,
        type: "custom",
        label: `${name} 住宅取得援助`,
        oneTimeCostMan: housingAidMan,
        annualCostMan: 0,
        durationYears: 1,
        parentId,
        ageOffset: housingAidChildAge,
      });
    }
    return evts;
  };

  const handleAdd = () => {
    if (isEditing && existingParent && onUpdate) {
      // Replace existing events
      const oldIds = existingEvents!.map(e => e.id);
      const newEvents = buildOneChild(childName, birthAge, existingParent.id);
      onUpdate(oldIds, newEvents);
    } else if (mode === "single") {
      onAdd(buildOneChild(childName, birthAge));
    } else {
      const allEvents: LifeEvent[] = [];
      for (let i = 0; i < childCount; i++) {
        const name = CHILD_LABELS[i] || `第${i + 1}子`;
        const age = firstBirthAge + i * interval;
        allEvents.push(...buildOneChild(name, age));
      }
      onAdd(allEvents);
    }
    onClose();
  };

  const effectiveChildCount = mode === "batch" ? childCount : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3">
          <p className="text-sm font-bold">👶 子供の{isEditing ? "編集" : "追加"}</p>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">

          {/* Mode switcher (only for new) */}
          {!isEditing && (
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMode("single")}
                className={`rounded px-3 py-1 text-xs ${mode === "single" ? "bg-amber-500 text-white" : "bg-gray-100"}`}>1人ずつ追加</button>
              <button onClick={() => setMode("batch")}
                className={`rounded px-3 py-1 text-xs ${mode === "batch" ? "bg-amber-500 text-white" : "bg-gray-100"}`}>一括追加</button>
            </div>
          )}

          {/* Batch settings (above 2-column) */}
          {!isEditing && mode === "batch" && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 space-y-2 mb-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">人数</label>
                  <input type="number" value={childCount} min={1} max={5} onChange={e => setChildCount(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">第1子の年齢</label>
                  <input type="number" value={firstBirthAge} min={currentAge} max={retirementAge - 1} onChange={e => setFirstBirthAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">間隔（年）</label>
                  <input type="number" value={interval} min={1} max={10} onChange={e => setIntervalVal(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="text-xs text-amber-700">
                {Array.from({ length: childCount }, (_, i) => `${CHILD_LABELS[i] || `第${i+1}子`}: ${firstBirthAge + i * interval}歳`).join(" → ")}
              </div>
            </div>
          )}

          {/* 2-column layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Settings */}
            <div className="space-y-3">
              {/* Single mode: name & age */}
              {(mode === "single" || isEditing) && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">名前</label>
                    <input value={childName} onChange={e => setChildName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">誕生時の年齢</label>
                    <input type="number" value={birthAge} min={currentAge} max={retirementAge - 1} onChange={e => setBirthAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                  </div>
                </div>
              )}

              {/* Costs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">出産費用（万円）</label>
                  <input type="number" value={birthCostMan} step={10} onChange={e => setBirthCostMan(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">養育費（万円/年）<span className="ml-1 cursor-help text-gray-400" title="教育費以外の年間養育費(食費・衣服・習い事等)。目安: 20〜50万/年">ⓘ</span></label>
                  <input type="number" value={baseCareMan} step={5} onChange={e => setBaseCareMan(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
              </div>

              {/* 結婚支援金 */}
              <div className="flex flex-wrap items-center gap-2 rounded border p-2">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={weddingSupportEnabled} onChange={e => setWeddingSupportEnabled(e.target.checked)} className="accent-pink-500" />
                  <span className="text-xs font-semibold text-gray-600">結婚支援金</span>
                </label>
                {weddingSupportEnabled && (<>
                  <input type="number" value={weddingSupportMan} step={10} min={0}
                    onChange={e => setWeddingSupportMan(Number(e.target.value))}
                    className="w-14 rounded border px-1.5 py-1 text-xs text-right" />
                  <span className="text-[10px] text-gray-400">万</span>
                  <span className="text-[10px] text-gray-500">子が</span>
                  <input type="number" value={weddingSupportChildAge} step={1} min={20} max={40}
                    onChange={e => setWeddingSupportChildAge(Number(e.target.value))}
                    className="w-10 rounded border px-1 py-1 text-xs text-right" />
                  <span className="text-[10px] text-gray-400">歳時</span>
                </>)}
              </div>

              {/* 住宅取得援助 */}
              <div className="flex flex-wrap items-center gap-2 rounded border p-2">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={housingAidEnabled} onChange={e => setHousingAidEnabled(e.target.checked)} className="accent-blue-500" />
                  <span className="text-xs font-semibold text-gray-600">住宅取得援助</span>
                </label>
                {housingAidEnabled && (<>
                  <input type="number" value={housingAidMan} step={50} min={0}
                    onChange={e => setHousingAidMan(Number(e.target.value))}
                    className="w-14 rounded border px-1.5 py-1 text-xs text-right" />
                  <span className="text-[10px] text-gray-400">万</span>
                  <span className="text-[10px] text-gray-500">子が</span>
                  <input type="number" value={housingAidChildAge} step={1} min={20} max={45}
                    onChange={e => setHousingAidChildAge(Number(e.target.value))}
                    className="w-10 rounded border px-1 py-1 text-xs text-right" />
                  <span className="text-[10px] text-gray-400">歳時</span>
                </>)}
              </div>

              {/* Templates */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">テンプレート</label>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATES.map(tpl => (
                    <button key={tpl.key} onClick={() => applyTemplate(tpl)}
                      className="rounded border px-2 py-0.5 text-[10px] hover:bg-blue-50 hover:border-blue-300 transition-colors">
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stage editor */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">教育ステージ別設定</label>
                <div className="rounded border divide-y">
                  {stages.map((s, i) => (
                    <div key={s.key} className={`flex items-center gap-1.5 px-2 py-1.5 ${!s.enabled ? "bg-gray-50 opacity-50" : ""}`}>
                      <input type="checkbox" checked={s.enabled} onChange={e => updateStage(i, { enabled: e.target.checked })} className="accent-blue-600" />
                      <span className="text-[10px] font-semibold w-12">{s.label}</span>
                      <span className="text-[9px] text-gray-400 w-12">{s.fromChildAge}〜{s.toChildAge}歳</span>
                      <select value={s.variant} onChange={e => updateStage(i, { variant: e.target.value as any })}
                        disabled={!s.enabled}
                        className="rounded border px-1 py-0.5 text-[10px]">
                        <option value="public">公立</option>
                        <option value="private">私立</option>
                      </select>
                      {s.livingType !== undefined && (
                        <select value={s.livingType} onChange={e => updateStage(i, { livingType: e.target.value as LivingType })}
                          disabled={!s.enabled}
                          className="rounded border px-1 py-0.5 text-[10px]">
                          <option value="home">自宅</option>
                          <option value="rural">地方下宿(+60万)</option>
                          <option value="urban">都内下宿(+96万)</option>
                        </select>
                      )}
                      <input type="number" value={s.annualMan} step={5} min={0}
                        disabled={!s.enabled}
                        onChange={e => updateStage(i, { annualMan: Number(e.target.value) })}
                        className="w-14 rounded border px-1 py-0.5 text-[10px] text-right" />
                      <span className="text-[9px] text-gray-400">万/年</span>
                      {s.enabled && <span className="text-[9px] text-gray-400 ml-auto">計{s.annualMan * (s.toChildAge - s.fromChildAge)}万</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Cost Preview */}
            <CostPreview
              stages={stages}
              baseCareMan={baseCareMan}
              birthCostMan={birthCostMan}
              weddingSupportEnabled={weddingSupportEnabled}
              weddingSupportMan={weddingSupportMan}
              weddingSupportChildAge={weddingSupportChildAge}
              housingAidEnabled={housingAidEnabled}
              housingAidMan={housingAidMan}
              housingAidChildAge={housingAidChildAge}
              childCount={effectiveChildCount}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={handleAdd} className="rounded bg-amber-500 px-4 py-1.5 text-xs text-white font-bold hover:bg-amber-600">
            {isEditing ? "更新" : "追加"}
          </button>
        </div>
      </div>
    </div>
  );
}
