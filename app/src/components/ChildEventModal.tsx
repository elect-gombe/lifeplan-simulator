import React, { useState } from "react";
import type { LifeEvent } from "../lib/types";

interface Stage {
  key: string;
  label: string;
  enabled: boolean;
  fromChildAge: number;
  toChildAge: number;
  annualMan: number;
  variant: "public" | "private";
}

const STAGE_DEFAULTS: Record<string, { label: string; from: number; to: number; public: number; private: number }> = {
  nursery:    { label: "保育園",   from: 0,  to: 3,  public: 30,  private: 40 },
  kinder:     { label: "幼稚園",   from: 3,  to: 6,  public: 25,  private: 50 },
  elementary: { label: "小学校",   from: 6,  to: 12, public: 35,  private: 160 },
  middle:     { label: "中学校",   from: 12, to: 15, public: 50,  private: 140 },
  high:       { label: "高校",     from: 15, to: 18, public: 50,  private: 100 },
  university: { label: "大学",     from: 18, to: 22, public: 80,  private: 130 },
  grad:       { label: "大学院",   from: 22, to: 24, public: 80,  private: 120 },
};

const TEMPLATES: { key: string; label: string; config: Record<string, { enabled: boolean; variant: "public" | "private" }> }[] = [
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
    key: "grad_pub", label: "大学院まで（国公立）",
    config: { nursery: { enabled: true, variant: "public" }, kinder: { enabled: true, variant: "public" }, elementary: { enabled: true, variant: "public" }, middle: { enabled: true, variant: "public" }, high: { enabled: true, variant: "public" }, university: { enabled: true, variant: "public" }, grad: { enabled: true, variant: "public" } },
  },
];

function buildStages(template: typeof TEMPLATES[number]): Stage[] {
  return Object.entries(STAGE_DEFAULTS).map(([key, def]) => {
    const cfg = template.config[key] || { enabled: false, variant: "public" as const };
    return {
      key, label: def.label, enabled: cfg.enabled,
      fromChildAge: def.from, toChildAge: def.to,
      annualMan: cfg.variant === "private" ? def.private : def.public,
      variant: cfg.variant,
    };
  });
}

export function ChildEventModal({ isOpen, onClose, onAdd, currentAge, retirementAge }: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (events: LifeEvent[]) => void;
  currentAge: number;
  retirementAge: number;
}) {
  const [mode, setMode] = useState<"single" | "batch">("single");
  // Single mode
  const [childName, setChildName] = useState("第1子");
  const [birthAge, setBirthAge] = useState(currentAge + 3);
  const [birthCostMan, setBirthCostMan] = useState(50);
  const [baseCareMan, setBaseCareMan] = useState(30);
  const [stages, setStages] = useState<Stage[]>(() => buildStages(TEMPLATES[2]));
  // Batch mode
  const [childCount, setChildCount] = useState(3);
  const [firstBirthAge, setFirstBirthAge] = useState(currentAge + 3);
  const [interval, setInterval] = useState(2);

  const CHILD_LABELS = ["第1子", "第2子", "第3子", "第4子", "第5子"];

  if (!isOpen) return null;

  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    setStages(buildStages(tpl));
  };

  const updateStage = (idx: number, patch: Partial<Stage>) => {
    setStages(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const next = { ...s, ...patch };
      // If variant changed, reset cost to default
      if (patch.variant && patch.variant !== s.variant) {
        const def = STAGE_DEFAULTS[s.key];
        next.annualMan = patch.variant === "private" ? def.private : def.public;
      }
      return next;
    }));
  };

  const totalCost = stages.filter(s => s.enabled).reduce((sum, s) => sum + s.annualMan * (s.toChildAge - s.fromChildAge), 0);

  // Find the end of the last enabled stage (child's age at independence)
  const lastStageEnd = stages.filter(s => s.enabled).reduce((max, s) => Math.max(max, s.toChildAge), 18);

  const buildOneChild = (name: string, age: number): LifeEvent[] => {
    const parentId = Date.now() + Math.round(Math.random() * 100000);
    const evts: LifeEvent[] = [
      { id: parentId, age, type: "child", label: name, oneTimeCostMan: birthCostMan, annualCostMan: baseCareMan, durationYears: lastStageEnd },
    ];
    for (const s of stages) {
      if (!s.enabled) continue;
      evts.push({
        id: parentId + Math.round(Math.random() * 100000),
        age: age + s.fromChildAge,
        type: "education",
        label: `${name} ${s.label}(${s.variant === "private" ? "私立" : "公立"})`,
        oneTimeCostMan: 0,
        annualCostMan: s.annualMan,
        durationYears: s.toChildAge - s.fromChildAge,
        parentId,
        ageOffset: s.fromChildAge,
      });
    }
    return evts;
  };

  const handleAdd = () => {
    if (mode === "single") {
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3">
          <p className="text-sm font-bold">👶 子供の追加</p>
        </div>
        <div className="p-4 space-y-4">

          {/* Mode switcher */}
          <div className="flex gap-2">
            <button onClick={() => setMode("single")}
              className={`rounded px-3 py-1 text-xs ${mode === "single" ? "bg-amber-500 text-white" : "bg-gray-100"}`}>1人ずつ追加</button>
            <button onClick={() => setMode("batch")}
              className={`rounded px-3 py-1 text-xs ${mode === "batch" ? "bg-amber-500 text-white" : "bg-gray-100"}`}>一括追加</button>
          </div>

          {/* Batch settings */}
          {mode === "batch" && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 space-y-2">
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
                  <input type="number" value={interval} min={1} max={10} onChange={e => setInterval(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="text-xs text-amber-700">
                {Array.from({ length: childCount }, (_, i) => `${CHILD_LABELS[i] || `第${i+1}子`}: ${firstBirthAge + i * interval}歳`).join(" → ")}
              </div>
            </div>
          )}

          {/* Single mode: name & age */}
          {mode === "single" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">名前</label>
                <input value={childName} onChange={e => setChildName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">誕生時のあなたの年齢</label>
                <input type="number" value={birthAge} min={currentAge} max={retirementAge - 1} onChange={e => setBirthAge(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
            </div>
          )}

          {/* Common: costs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">出産費用（万円）</label>
              <input type="number" value={birthCostMan} step={10} onChange={e => setBirthCostMan(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">基本養育費（万円/年）</label>
              <input type="number" value={baseCareMan} step={5} onChange={e => setBaseCareMan(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
          </div>

          {/* Templates */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">テンプレート</label>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map(tpl => (
                <button key={tpl.key} onClick={() => applyTemplate(tpl)}
                  className="rounded border px-2.5 py-1 text-xs hover:bg-blue-50 hover:border-blue-300 transition-colors">
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
                <div key={s.key} className={`flex items-center gap-2 px-3 py-2 ${!s.enabled ? "bg-gray-50 opacity-50" : ""}`}>
                  <input type="checkbox" checked={s.enabled} onChange={e => updateStage(i, { enabled: e.target.checked })} className="accent-blue-600" />
                  <span className="text-xs font-semibold w-16">{s.label}</span>
                  <span className="text-[10px] text-gray-400 w-16">{s.fromChildAge}〜{s.toChildAge}歳</span>
                  <select value={s.variant} onChange={e => updateStage(i, { variant: e.target.value as any })}
                    disabled={!s.enabled}
                    className="rounded border px-1.5 py-0.5 text-xs">
                    <option value="public">公立</option>
                    <option value="private">私立</option>
                  </select>
                  <input type="number" value={s.annualMan} step={5} min={0}
                    disabled={!s.enabled}
                    onChange={e => updateStage(i, { annualMan: Number(e.target.value) })}
                    className="w-16 rounded border px-1.5 py-0.5 text-xs text-right" />
                  <span className="text-[10px] text-gray-400">万/年</span>
                  {s.enabled && (
                    <span className="text-[10px] text-gray-400 ml-auto">
                      計 {s.annualMan * (s.toChildAge - s.fromChildAge)}万
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-1 text-xs text-gray-500 text-right">
              {mode === "batch" ? (
                <>1人あたり教育費: <b>{totalCost.toLocaleString()}万円</b> × {childCount}人 = <b>{(totalCost * childCount).toLocaleString()}万円</b></>
              ) : (
                <>教育費合計: <b>{totalCost.toLocaleString()}万円</b></>
              )}
              （出産費{birthCostMan}万 + 養育費{baseCareMan}万/年は別途）
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={handleAdd} className="rounded bg-amber-500 px-4 py-1.5 text-xs text-white font-bold hover:bg-amber-600">追加</button>
        </div>
      </div>
    </div>
  );
}
