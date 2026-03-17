import React, { useState, useCallback } from "react";
import type { Keyframe, LifeEvent, Scenario, TrackKey, SpouseConfig, NISAConfig, BalancePolicy, DCReceiveMethod } from "../lib/types";
import { sortKF, EVENT_TYPES, resolveEventAge } from "../lib/types";
import { ChildEventModal } from "./ChildEventModal";
import { PropertyModal } from "./PropertyModal";
import { CarModal } from "./CarModal";
import { DeathModal } from "./DeathModal";
import { InsuranceModal } from "./InsuranceModal";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

// 折りたたみ状態をlocalStorageに保持
function usePersistedSet(key: string): [Set<number>, (fn: (prev: Set<number>) => Set<number>) => void] {
  const [set, setSet] = useState<Set<number>>(() => {
    try { const v = localStorage.getItem(key); return v ? new Set(JSON.parse(v)) : new Set(); } catch { return new Set(); }
  });
  const update = useCallback((fn: (prev: Set<number>) => Set<number>) => {
    setSet(prev => {
      const next = fn(prev);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [key]);
  return [set, update];
}

// タイプ別ソート: 子供→住宅→車→保険→死亡→結婚→…→カスタム、同タイプ内はage順
const TYPE_ORDER: Record<string, number> = { child: 0, education: 0, property: 1, car: 2, insurance: 3, death: 4, marriage: 5, rent: 6, travel: 7, custom: 8 };
function sortEventsByType(events: LifeEvent[], allEvents?: LifeEvent[]): LifeEvent[] {
  return [...events].sort((a, b) => {
    const ta = TYPE_ORDER[a.type] ?? 8, tb = TYPE_ORDER[b.type] ?? 8;
    if (ta !== tb) return ta - tb;
    const aAge = allEvents ? resolveEventAge(a, allEvents) : a.age;
    const bAge = allEvents ? resolveEventAge(b, allEvents) : b.age;
    return aAge - bAge;
  });
}

interface TrackDef { key: TrackKey; label: string; unit: string; defaultValue: number; step: number; }
const TRACKS: TrackDef[] = [
  { key: "incomeKF", label: "年収", unit: "万円", defaultValue: 700, step: 10 },
  { key: "expenseKF", label: "基本生活費", unit: "万円/月", defaultValue: 15, step: 1 },
  { key: "dcTotalKF", label: "DC合計", unit: "円/月", defaultValue: 55000, step: 1000 },
  { key: "companyDCKF", label: "会社DC", unit: "円/月", defaultValue: 1000, step: 1000 },
  { key: "idecoKF", label: "iDeCo", unit: "円/月", defaultValue: 0, step: 1000 },
];

// ===== Track Row (shared by 本人 and 配偶者) =====
function TrackRow({ track, keyframes, onChange, currentAge, retirementAge, linked, onToggleLink, baseKFs }: {
  track: TrackDef; keyframes: Keyframe[]; onChange: (kfs: Keyframe[]) => void;
  currentAge: number; retirementAge: number;
  linked: boolean; onToggleLink?: () => void; baseKFs?: Keyframe[];
}) {
  const [adding, setAdding] = useState(false);
  const [newAge, setNewAge] = useState(currentAge);
  const [newVal, setNewVal] = useState(track.defaultValue);
  const display = linked ? (baseKFs || []) : keyframes;
  const ro = linked;

  return (
    <div className="border-b pb-1.5 last:border-b-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-semibold text-gray-700">{track.label}（{track.unit}）</span>
        <div className="flex items-center gap-1.5">
          {onToggleLink && (
            <button onClick={onToggleLink} className={`text-[10px] rounded px-1.5 py-0.5 ${linked ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-600"}`}>
              {linked ? "🔗A" : "✏️"}
            </button>
          )}
          {!ro && <button onClick={() => { setAdding(!adding); setNewAge(currentAge); setNewVal(track.defaultValue); }} className="text-[10px] text-blue-500">+</button>}
        </div>
      </div>
      <div className="space-y-0.5">
        {display.map(kf => (
          <div key={kf.age} className={`flex items-center gap-1.5 pl-2 text-xs ${ro ? "opacity-50" : ""}`}>
            <span className="w-8 text-gray-500 font-mono text-[10px]">{kf.age}歳</span>
            {ro ? <span className="font-mono text-gray-500">{kf.value}</span>
              : <input type="number" value={kf.value} step={track.step} onChange={(e) => onChange(keyframes.map(k => k.age === kf.age ? { ...k, value: Number(e.target.value) } : k))} className="w-24 rounded border px-1.5 py-1 text-xs" />}
            <span className="text-gray-400 text-[10px]">{track.unit}</span>
            {!ro && <button onClick={() => onChange(keyframes.filter(k => k.age !== kf.age))} className="text-[10px] text-gray-300 hover:text-red-500">×</button>}
          </div>
        ))}
        {adding && !ro && (
          <div className="flex items-center gap-1.5 pl-2 text-xs bg-blue-50 rounded p-1">
            <input type="number" value={newAge} min={currentAge} max={retirementAge - 1} step={1} onChange={(e) => setNewAge(Number(e.target.value))} className="w-14 rounded border px-1.5 py-1 text-xs" />
            <span className="text-gray-400 text-[10px]">歳</span>
            <input type="number" value={newVal} step={track.step} onChange={(e) => setNewVal(Number(e.target.value))} className="w-24 rounded border px-1.5 py-0.5 text-xs" />
            <button onClick={() => { onChange(sortKF([...keyframes.filter(k => k.age !== newAge), { age: newAge, value: newVal }])); setAdding(false); }} className="text-[10px] text-blue-600 font-bold">OK</button>
            <button onClick={() => setAdding(false)} className="text-[10px] text-gray-400">×</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Unified Member Editor (本人 / 配偶者 共通) =====
// データの読み書きを抽象化して同一UIを使い回す
interface MemberData {
  incomeKF: Keyframe[]; expenseKF: Keyframe[];
  dcTotalKF: Keyframe[]; companyDCKF: Keyframe[]; idecoKF: Keyframe[];
  salaryGrowthRate: number; sirPct: number; hasFurusato: boolean;
}

function MemberEditor({ label, color, data, onUpdate, currentAge, retirementAge, extraFields, linked, readOnly, baseData, trackLinked, onToggleTrack }: {
  label: string; color: string;
  data: MemberData;
  onUpdate: (patch: Partial<MemberData & Record<string, any>>) => void;
  currentAge: number; retirementAge: number;
  extraFields?: React.ReactNode;
  linked?: boolean; readOnly?: boolean;
  baseData?: MemberData;
  trackLinked?: (key: TrackKey) => boolean;
  onToggleTrack?: (key: TrackKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const isRO = readOnly && linked;

  return (
    <div className="border-t pt-1">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-bold" style={{ color }}>
        <span className="text-[10px] text-gray-400">{open ? "▼" : "▶"}</span>
        {label}
        <span className="font-normal text-gray-400 text-[10px]">
          (昇給{data.salaryGrowthRate}% 社保{data.sirPct}% {data.hasFurusato ? "ふるさと納税" : ""})
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 pl-1">
          {/* Scalar settings — shared layout */}
          <div className="flex flex-wrap gap-2 text-xs">
            {extraFields}
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[10px]">昇給率</span>
              <input type="number" value={data.salaryGrowthRate} step={0.5} onChange={e => onUpdate({ salaryGrowthRate: Number(e.target.value) })} className="w-14 rounded border px-1 py-0.5 text-xs" disabled={isRO} />
              <span className="text-[10px] text-gray-400">%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[10px]">社保率</span>
              <input type="number" value={data.sirPct} step={0.25} onChange={e => onUpdate({ sirPct: Number(e.target.value) })} className="w-14 rounded border px-1 py-0.5 text-xs" disabled={isRO} />
              <span className="text-[10px] text-gray-400">%</span>
            </div>
            <label className="flex items-center gap-1 text-[10px] cursor-pointer">
              <input type="checkbox" checked={data.hasFurusato} onChange={e => onUpdate({ hasFurusato: e.target.checked })} className="accent-blue-600" disabled={isRO} />
              <span className="text-gray-500">ふるさと納税</span>
            </label>
          </div>
          {/* Track rows — with integrated linking toggle */}
          {TRACKS.map(t => {
            const isThisTrackLinked = trackLinked ? trackLinked(t.key) : false;
            return (
              <TrackRow key={t.key} track={t}
                keyframes={(data as any)[t.key] || []}
                onChange={(kfs) => onUpdate({ [t.key]: kfs })}
                currentAge={currentAge} retirementAge={retirementAge}
                linked={isThisTrackLinked}
                onToggleLink={onToggleTrack ? () => onToggleTrack(t.key) : undefined}
                baseKFs={baseData ? (baseData as any)[t.key] || [] : undefined} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== Collapsible Event List =====
function EventList({ events, updateEvent, updateEventMulti, removeEvent, currentAge, retirementAge, label, onEditProperty, onEditCar, onEditDeath, onEditInsurance }: {
  events: LifeEvent[];
  updateEvent: (id: number, f: string, v: any) => void;
  updateEventMulti?: (id: number, patch: Record<string, any>) => void;
  removeEvent: (id: number) => void;
  currentAge: number; retirementAge: number;
  label?: string;
  onEditProperty?: (e: LifeEvent) => void;
  onEditCar?: (e: LifeEvent) => void;
  onEditDeath?: (e: LifeEvent) => void;
  onEditInsurance?: (e: LifeEvent) => void;
}) {
  const [collapsed, setCollapsed] = usePersistedSet("sim-evt-collapsed");
  if (events.length === 0) return null;

  const parents = sortEventsByType(events.filter(e => !e.parentId), events);
  const childrenOf = (pid: number) => events.filter(e => e.parentId === pid);
  const orphans = events.filter(e => e.parentId && !events.some(p => p.id === e.parentId));
  const toggleCollapse = (id: number) => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const renderEvent = (e: LifeEvent, indent: boolean) => {
    const et = EVENT_TYPES[e.type] || EVENT_TYPES.custom;
    const children = childrenOf(e.id);
    const isCollapsed = collapsed.has(e.id);
    const hasChildren = children.length > 0;
    const totalChildCost = children.reduce((s, c) => s + c.annualCostMan * Math.max(c.durationYears, 1), 0);
    return (
      <div key={e.id}>
        <div className={`flex flex-wrap items-center gap-1 text-xs rounded px-2 py-0.5 bg-gray-50 ${indent ? "ml-4 border-l-2 border-gray-200" : ""}`}>
          {hasChildren && <button onClick={() => toggleCollapse(e.id)} className="text-[10px] text-gray-400 w-4">{isCollapsed ? "▶" : "▼"}</button>}
          <span style={{ color: et.color }}>{et.icon}</span>
          {e.propertyParams && onEditProperty && <button onClick={() => onEditProperty(e)} className="text-[10px] rounded px-1 py-0.5 bg-blue-100 text-blue-600">✏️</button>}
          {e.carParams && onEditCar && <button onClick={() => onEditCar(e)} className="text-[10px] rounded px-1 py-0.5 bg-green-100 text-green-600">✏️</button>}
          {e.deathParams && onEditDeath && <button onClick={() => onEditDeath(e)} className="text-[10px] rounded px-1 py-0.5 bg-gray-200 text-gray-600">✏️</button>}
          {e.insuranceParams && onEditInsurance && <button onClick={() => onEditInsurance(e)} className="text-[10px] rounded px-1 py-0.5 bg-indigo-100 text-indigo-600">✏️</button>}
          <input value={e.label} onChange={ev => updateEvent(e.id, "label", ev.target.value)} className="w-28 rounded border px-1.5 py-1 text-xs" />
          {e.propertyParams && updateEventMulti && (
            <span className="flex items-center gap-0.5">
              <button onClick={() => { const pp = e.propertyParams!; const v = pp.priceMan - 100; updateEventMulti(e.id, { propertyParams: { ...pp, priceMan: v }, label: `住宅(${v}万)` }); }} className="text-[10px] text-gray-400 hover:text-blue-500 px-0.5">-</button>
              <input type="number" value={e.propertyParams.priceMan} step={100}
                onChange={ev => { const v = Number(ev.target.value); const pp = e.propertyParams!; updateEventMulti(e.id, { propertyParams: { ...pp, priceMan: v }, label: `住宅(${v}万)` }); }}
                className="w-20 rounded border px-1 py-0.5 text-xs text-center font-mono" />
              <span className="text-[10px] text-gray-400">万</span>
              <button onClick={() => { const pp = e.propertyParams!; const v = pp.priceMan + 100; updateEventMulti(e.id, { propertyParams: { ...pp, priceMan: v }, label: `住宅(${v}万)` }); }} className="text-[10px] text-gray-400 hover:text-blue-500 px-0.5">+</button>
            </span>
          )}
          {e.ageOffset != null ? (
            <span className="text-[10px] text-gray-400 font-mono">{resolveEventAge(e, events)}歳 (+{e.ageOffset})</span>
          ) : (
            <><input type="number" value={e.age} min={currentAge} max={retirementAge} step={1} onChange={ev => updateEvent(e.id, "age", Number(ev.target.value))} className="w-14 rounded border px-1.5 py-1 text-xs" /><span className="text-[10px] text-gray-400">歳</span></>
          )}
          <input type="number" value={e.annualCostMan} step={5} onChange={ev => updateEvent(e.id, "annualCostMan", Number(ev.target.value))} className="w-16 rounded border px-1.5 py-1 text-xs" />
          <span className="text-[10px] text-gray-400">万/年</span>
          {e.durationYears > 0 && (<><input type="number" value={e.durationYears} min={0} step={1} onChange={ev => updateEvent(e.id, "durationYears", Number(ev.target.value))} className="w-12 rounded border px-1.5 py-1 text-xs" /><span className="text-[10px] text-gray-400">年</span></>)}
          {hasChildren && isCollapsed && <span className="text-[10px] text-gray-400">({children.length}件 計{totalChildCost}万)</span>}
          <button onClick={() => removeEvent(e.id)} className="text-[10px] text-gray-300 hover:text-red-500 ml-auto">×</button>
        </div>
        {hasChildren && !isCollapsed && children.map(c => renderEvent(c, true))}
      </div>
    );
  };

  return (
    <div className="mb-1">
      {label && <div className="text-[10px] text-gray-400 mb-0.5">{label}</div>}
      <div className="space-y-0.5">{parents.map(e => renderEvent(e, false))}{orphans.map(e => renderEvent(e, false))}</div>
    </div>
  );
}

// ===== Base Event List =====
function BaseEventList({ baseEvents, excludedIds, onUnlink, onRelink }: {
  baseEvents: LifeEvent[]; excludedIds: number[];
  onUnlink: (e: LifeEvent) => void; onRelink: (baseId: number) => void;
}) {
  const [collapsed, setCollapsed] = usePersistedSet("sim-base-evt-collapsed");
  const parents = sortEventsByType(baseEvents.filter(e => !e.parentId), baseEvents);
  const childrenOf = (pid: number) => baseEvents.filter(e => e.parentId === pid);
  const toggleCollapse = (id: number) => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const renderBaseEvent = (e: LifeEvent, indent: boolean) => {
    const et = EVENT_TYPES[e.type] || EVENT_TYPES.custom;
    const children = childrenOf(e.id);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(e.id);
    const excluded = excludedIds.includes(e.id);
    const totalChildCost = children.reduce((s, c) => s + c.annualCostMan * Math.max(c.durationYears, 1), 0);
    return (
      <div key={e.id}>
        <div className={`flex items-center gap-1 text-xs rounded px-2 py-0.5 ${indent ? "ml-4 border-l-2 border-gray-200" : ""} ${excluded ? "bg-gray-100 opacity-40" : "bg-gray-50"}`}>
          {hasChildren && <button onClick={() => toggleCollapse(e.id)} className="text-[10px] text-gray-400 w-4">{isCollapsed ? "▶" : "▼"}</button>}
          {!indent && (excluded
            ? <button onClick={() => onRelink(e.id)} className="text-[10px] rounded px-1 py-0.5 bg-gray-200 text-gray-400">🔗 戻す</button>
            : <button onClick={() => onUnlink(e)} className="text-[10px] rounded px-1 py-0.5 bg-blue-100 text-blue-600">✏️ 編集</button>
          )}
          <span style={{ color: et.color }}>{et.icon}</span>
          <span className="font-mono text-[10px] text-gray-500">{resolveEventAge(e, baseEvents)}歳{e.ageOffset != null ? ` (+${e.ageOffset})` : ""}</span>
          <span className={`text-gray-600 ${excluded ? "line-through" : ""}`}>{e.label}</span>
          {e.durationYears > 0 && <span className="text-gray-400 text-[10px]">({e.durationYears}年)</span>}
          {e.annualCostMan > 0 && <span className="text-gray-400 text-[10px]">{e.annualCostMan}万/年</span>}
          {e.oneTimeCostMan > 0 && <span className="text-gray-400 text-[10px]">+{e.oneTimeCostMan}万</span>}
          {hasChildren && isCollapsed && <span className="text-[10px] text-gray-400 ml-1">({children.length}件 計{totalChildCost}万)</span>}
        </div>
        {hasChildren && !isCollapsed && children.map(c => renderBaseEvent(c, true))}
      </div>
    );
  };
  return (
    <div className="mb-1">
      <div className="text-[10px] text-gray-400 mb-0.5">Aのイベント（✏️で個別編集に切り替え）</div>
      <div className="space-y-0.5">{parents.map(e => renderBaseEvent(e, false))}</div>
    </div>
  );
}

// ===== Event Section =====
function EventSection({ scenario, onChange, currentAge, retirementAge, baseScenario, isLinked }: {
  scenario: Scenario; onChange: (s: Scenario) => void;
  currentAge: number; retirementAge: number;
  baseScenario?: Scenario | null; isLinked: boolean;
}) {
  const events = scenario.events || [];
  const baseEvents = (isLinked && baseScenario) ? (baseScenario.events || []) : [];
  const excludedIds = scenario.excludedBaseEventIds || [];
  const [showMenu, setShowMenu] = useState(false);
  const [showChildModal, setShowChildModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [editingPropertyEvent, setEditingPropertyEvent] = useState<LifeEvent | null>(null);
  const [showCarModal, setShowCarModal] = useState(false);
  const [editingCarEvent, setEditingCarEvent] = useState<LifeEvent | null>(null);
  const [showDeathModal, setShowDeathModal] = useState(false);
  const [editingDeathEvent, setEditingDeathEvent] = useState<LifeEvent | null>(null);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [editingInsuranceEvent, setEditingInsuranceEvent] = useState<LifeEvent | null>(null);

  const setEvents = (evts: LifeEvent[]) => onChange({ ...scenario, events: evts });
  const addSimpleEvent = (type: string) => {
    const et = EVENT_TYPES[type]; const age = currentAge + 5; const parentId = Date.now();
    const newEvents: LifeEvent[] = [{ id: parentId, age, type, label: et.label, oneTimeCostMan: et.defaultOnetime, annualCostMan: et.defaultAnnual, durationYears: et.defaultDuration }];
    if (type === "marriage") newEvents.push({ id: parentId + 1, age, type: "custom", label: "結婚支援金（親）", oneTimeCostMan: -100, annualCostMan: 0, durationYears: 0, parentId, ageOffset: 0 });
    setEvents([...events, ...newEvents].sort((a, b) => a.age - b.age)); setShowMenu(false);
  };
  const addChildEvents = (newEvts: LifeEvent[]) => setEvents([...events, ...newEvts].sort((a, b) => a.age - b.age));
  const removeEvent = (id: number) => setEvents(events.filter(e => e.id !== id && e.parentId !== id));
  const updateEvent = (id: number, f: string, v: any) => setEvents(events.map(e => e.id === id ? { ...e, [f]: v } : e));
  const updateEventMulti = (id: number, patch: Record<string, any>) => setEvents(events.map(e => e.id === id ? { ...e, ...patch } : e));

  const unlinkBaseEvent = (e: LifeEvent) => {
    const children = baseEvents.filter(c => c.parentId === e.id);
    const toExclude = [e.id, ...children.map(c => c.id)];
    const newParentId = Date.now();
    onChange({ ...scenario, excludedBaseEventIds: [...excludedIds, ...toExclude], events: [...events, { ...e, id: newParentId }, ...children.map(c => ({ ...c, id: Date.now() + Math.round(Math.random() * 100000), parentId: newParentId }))].sort((a, b) => a.age - b.age) });
  };
  const relinkBaseEvent = (baseId: number) => {
    const toRestore = [baseId, ...baseEvents.filter(c => c.parentId === baseId).map(c => c.id)];
    onChange({ ...scenario, excludedBaseEventIds: excludedIds.filter(id => !toRestore.includes(id)) });
  };

  const [open, setOpen] = useState(true);
  const allCount = baseEvents.filter(e => !excludedIds.includes(e.id)).length + events.length;
  const topEvents = [...baseEvents.filter(e => !e.parentId && !excludedIds.includes(e.id)), ...events.filter(e => !e.parentId)];
  const summaryText = topEvents.map(e => `${(EVENT_TYPES[e.type] || EVENT_TYPES.custom).icon}${e.label}`).join(" ");

  const modalSave = (setter: (e: LifeEvent | null) => void, editing: LifeEvent | null) => (evt: LifeEvent) => {
    if (editing) setEvents(events.map(e => e.id === evt.id ? evt : e));
    else setEvents([...events, evt].sort((a, b) => a.age - b.age));
    setter(null);
  };

  return (
    <div className="border-t pt-1">
      <div className="flex items-center justify-between mb-1">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-bold text-gray-700">
          <span className="text-[10px] text-gray-400">{open ? "▼" : "▶"}</span>
          ライフイベント <span className="font-normal text-gray-400">({allCount}件{summaryText ? ` ${summaryText}` : ""})</span>
        </button>
        <button onClick={() => setShowMenu(!showMenu)} className="text-[10px] text-blue-500 hover:text-blue-700">+ 追加</button>
      </div>
      {open && (<>
        {showMenu && (
          <div className="mb-2 rounded border bg-blue-50 p-2">
            <div className="flex flex-wrap gap-1">
              {Object.entries(EVENT_TYPES).filter(([k]) => k !== "education").map(([k, v]) => (
                <button key={k} onClick={() => {
                  if (k === "child") { setShowChildModal(true); setShowMenu(false); }
                  else if (k === "property") { setShowPropertyModal(true); setShowMenu(false); }
                  else if (k === "car") { setShowCarModal(true); setShowMenu(false); }
                  else if (k === "death") { setShowDeathModal(true); setShowMenu(false); }
                  else if (k === "insurance") { setShowInsuranceModal(true); setShowMenu(false); }
                  else addSimpleEvent(k);
                }} className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-50">{v.icon} {v.label}</button>
              ))}
            </div>
          </div>
        )}
        <ChildEventModal isOpen={showChildModal} onClose={() => setShowChildModal(false)} onAdd={addChildEvents} currentAge={currentAge} retirementAge={retirementAge} />
        <PropertyModal isOpen={showPropertyModal} onClose={() => { setShowPropertyModal(false); setEditingPropertyEvent(null); }} onSave={modalSave(setEditingPropertyEvent, editingPropertyEvent)} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingPropertyEvent} />
        <CarModal isOpen={showCarModal} onClose={() => { setShowCarModal(false); setEditingCarEvent(null); }} onSave={modalSave(setEditingCarEvent, editingCarEvent)} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingCarEvent} />
        <DeathModal isOpen={showDeathModal} onClose={() => { setShowDeathModal(false); setEditingDeathEvent(null); }} onSave={modalSave(setEditingDeathEvent, editingDeathEvent)} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingDeathEvent} />
        <InsuranceModal isOpen={showInsuranceModal} onClose={() => { setShowInsuranceModal(false); setEditingInsuranceEvent(null); }} onSave={modalSave(setEditingInsuranceEvent, editingInsuranceEvent)} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingInsuranceEvent} />
        {isLinked && baseEvents.length > 0 && <BaseEventList baseEvents={baseEvents} excludedIds={excludedIds} onUnlink={unlinkBaseEvent} onRelink={relinkBaseEvent} />}
        <EventList events={events} updateEvent={updateEvent} updateEventMulti={updateEventMulti} removeEvent={removeEvent} currentAge={currentAge} retirementAge={retirementAge}
          label={isLinked && events.length > 0 ? `${scenario.name}の独自イベント` : undefined}
          onEditProperty={(e) => { setEditingPropertyEvent(e); setShowPropertyModal(true); }} onEditCar={(e) => { setEditingCarEvent(e); setShowCarModal(true); }}
          onEditDeath={(e) => { setEditingDeathEvent(e); setShowDeathModal(true); }} onEditInsurance={(e) => { setEditingInsuranceEvent(e); setShowInsuranceModal(true); }} />
        {events.length === 0 && baseEvents.length === 0 && <div className="text-[10px] text-gray-400 pl-2">イベントなし</div>}
      </>)}
    </div>
  );
}

// ===== NISA / Balance Policy Section =====
// ===== DC/iDeCo受取方法 =====
function DCReceiveSection({ s, onChange }: { s: Scenario; onChange: (s: Scenario) => void }) {
  const [open, setOpen] = useState(false);
  const rm: DCReceiveMethod = s.dcReceiveMethod || { type: "lump_sum", annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 };
  const setRM = (patch: Partial<DCReceiveMethod>) => onChange({ ...s, dcReceiveMethod: { ...rm, ...patch } });

  return (
    <div className="border-t pt-1">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-bold text-orange-700">
        <span className="text-[10px] text-gray-400">{open ? "▼" : "▶"}</span>
        DC/iDeCo受取
        <span className="font-normal text-gray-400 text-[10px]">
          ({rm.type === "lump_sum" ? "一時金" : rm.type === "annuity" ? `年金${rm.annuityYears}年` : `併用${rm.combinedLumpSumRatio}%一時金`})
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-2 pl-1 text-xs">
          <div className="flex gap-1">
            {(["lump_sum", "annuity", "combined"] as const).map(t => (
              <button key={t} onClick={() => setRM({ type: t })}
                className={`rounded px-2 py-1 ${rm.type === t ? "bg-orange-600 text-white" : "bg-gray-100"}`}>
                {t === "lump_sum" ? "一時金" : t === "annuity" ? "年金" : "併用"}
              </button>
            ))}
          </div>

          {(rm.type === "annuity" || rm.type === "combined") && (
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <span className="text-gray-500 text-[10px]">受取開始</span>
                <input type="number" value={rm.annuityStartAge} min={60} max={75} step={1}
                  onChange={e => setRM({ annuityStartAge: Number(e.target.value) })}
                  className="w-14 rounded border px-1 py-0.5 text-xs" />
                <span className="text-[10px] text-gray-400">歳</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500 text-[10px]">受取期間</span>
                {[5, 10, 15, 20].map(y => (
                  <button key={y} onClick={() => setRM({ annuityYears: y })}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${rm.annuityYears === y ? "bg-orange-600 text-white" : "bg-gray-100"}`}>
                    {y}年
                  </button>
                ))}
              </div>
            </div>
          )}

          {rm.type === "combined" && (
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[10px]">一時金割合</span>
              <input type="number" value={rm.combinedLumpSumRatio} min={10} max={90} step={10}
                onChange={e => setRM({ combinedLumpSumRatio: Number(e.target.value) })}
                className="w-14 rounded border px-1 py-0.5 text-xs" />
              <span className="text-[10px] text-gray-400">%（残り{100 - rm.combinedLumpSumRatio}%が年金）</span>
            </div>
          )}

          <div className="rounded bg-orange-50 p-2 text-[10px] text-gray-500 space-y-0.5">
            {rm.type === "lump_sum" && <div>退職所得として課税。退職所得控除後の1/2に所得税+住民税。税負担が最も軽い場合が多い。</div>}
            {rm.type === "annuity" && <div>雑所得として毎年課税。公的年金等控除が適用（65歳以上: 110万まで非課税）。他の年金と合算されるため税率が上がる場合あり。</div>}
            {rm.type === "combined" && <div>一時金は退職所得控除、年金部分は公的年金等控除。退職所得控除枠を使い切ったら残りを年金にするのが一般的。</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function NISASection({ s, onChange, isLinked, baseScenario }: { s: Scenario; onChange: (s: Scenario) => void; isLinked?: boolean; baseScenario?: Scenario | null }) {
  const defaultNi: NISAConfig = { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800, returnRate: 5 };
  const ni = s.nisa || defaultNi;
  const baseS = isLinked && baseScenario ? baseScenario : null;
  const inheritedFromBase = !ni.enabled && baseS?.nisa?.enabled;
  const effNi = inheritedFromBase ? baseS!.nisa! : ni;
  const bp = s.balancePolicy || (baseS?.balancePolicy ? baseS.balancePolicy : { cashReserveMonths: 6, nisaPriority: true });
  const setNISA = (patch: Partial<NISAConfig>) => onChange({ ...s, nisa: { ...ni, ...patch } });
  const setBP = (patch: Partial<BalancePolicy>) => onChange({ ...s, balancePolicy: { ...bp, ...patch } });
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t pt-1">
      <div className="flex items-center justify-between mb-1">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-bold text-green-700">
          <span className="text-[10px] text-gray-400">{open ? "▼" : "▶"}</span>
          NISA / 投資
          {effNi.enabled && <span className="font-normal text-gray-400">(有効{inheritedFromBase ? " 🔗A" : ""})</span>}
        </button>
        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
          <input type="checkbox" checked={ni.enabled} onChange={e => setNISA({ enabled: e.target.checked })} className="accent-green-600" />
          <span className="text-gray-500">{inheritedFromBase ? "独自設定に切替" : "有効"}</span>
        </label>
      </div>
      {open && ni.enabled && (
        <div className="space-y-1.5 pl-1 text-xs">
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[10px]">口座</span>
              <button onClick={() => setNISA({ accounts: 1 })} className={`rounded px-1.5 py-0.5 text-[10px] ${ni.accounts === 1 ? "bg-green-600 text-white" : "bg-gray-100"}`}>本人</button>
              <button onClick={() => setNISA({ accounts: 2 })} className={`rounded px-1.5 py-0.5 text-[10px] ${ni.accounts === 2 ? "bg-green-600 text-white" : "bg-gray-100"}`}>夫婦2</button>
            </div>
            <div className="flex items-center gap-1"><span className="text-gray-500 text-[10px]">年間枠</span><input type="number" value={ni.annualLimitMan} step={10} onChange={e => setNISA({ annualLimitMan: Number(e.target.value) })} className="w-16 rounded border px-1 py-0.5 text-xs" /><span className="text-[10px] text-gray-400">万/人</span></div>
            <div className="flex items-center gap-1"><span className="text-gray-500 text-[10px]">生涯枠</span><input type="number" value={ni.lifetimeLimitMan} step={100} onChange={e => setNISA({ lifetimeLimitMan: Number(e.target.value) })} className="w-16 rounded border px-1 py-0.5 text-xs" /><span className="text-[10px] text-gray-400">万/人</span></div>
            <div className="flex items-center gap-1"><span className="text-gray-500 text-[10px]">利回り</span><input type="number" value={ni.returnRate} step={0.5} onChange={e => setNISA({ returnRate: Number(e.target.value) })} className="w-14 rounded border px-1 py-0.5 text-xs" /><span className="text-[10px] text-gray-400">%</span></div>
          </div>
          <div className="text-[10px] text-gray-400">合計: 年{ni.annualLimitMan * (ni.accounts || 1)}万 / 生涯{ni.lifetimeLimitMan * (ni.accounts || 1)}万 ｜ NISA非課税、超過→特定口座(20.315%課税)</div>
          <div className="border-t border-green-100 pt-1">
            <span className="text-[10px] font-semibold text-gray-600">残高ポリシー</span>
            <div className="flex flex-wrap gap-2 mt-0.5">
              <div className="flex items-center gap-1"><span className="text-gray-500 text-[10px]">防衛資金</span><input type="number" value={bp.cashReserveMonths} step={1} min={0} onChange={e => setBP({ cashReserveMonths: Number(e.target.value) })} className="w-12 rounded border px-1 py-0.5 text-xs" /><span className="text-[10px] text-gray-400">ヶ月分</span></div>
              <label className="flex items-center gap-1 text-[10px] cursor-pointer"><input type="checkbox" checked={bp.nisaPriority} onChange={e => setBP({ nisaPriority: e.target.checked })} className="accent-green-600" /><span className="text-gray-500">余剰→NISA/特定優先</span></label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Main KeyframeEditor =====
export function KeyframeEditor({ s, onChange, idx, currentAge, retirementAge, baseScenario }: {
  s: Scenario; onChange: (s: Scenario) => void; idx: number;
  currentAge: number; retirementAge: number; baseScenario?: Scenario | null;
}) {
  const isBase = idx === 0;
  const isLinked = s.linkedToBase && !isBase && !!baseScenario;
  const isTrackLinked = (key: TrackKey) => isLinked && !s.overrideTracks.includes(key);

  const toggleTrack = (key: TrackKey) => {
    if (!isLinked) return;
    if (s.overrideTracks.includes(key)) {
      onChange({ ...s, overrideTracks: s.overrideTracks.filter(k => k !== key) });
    } else {
      const baseKFs = baseScenario ? [...((baseScenario as any)[key] || [])] : [];
      onChange({ ...s, overrideTracks: [...s.overrideTracks, key], [key]: baseKFs });
    }
  };

  // Default spouse config
  const defaultSp: SpouseConfig = { enabled: false, currentAge: 30, incomeKF: [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, sirPct: 15.75, hasFurusato: true };
  const sp = s.spouse || defaultSp;
  const baseS = isLinked && baseScenario ? baseScenario : null;
  const spInherited = !sp.enabled && !!baseS?.spouse?.enabled;

  return (
    <div className="rounded-lg border-2 p-3 space-y-2" style={{ borderColor: COLORS[idx] }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: COLORS[idx] }}>{s.name}</span>
        {isLinked && <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-2 py-0.5">🔗 Aベース + 差分</span>}
      </div>

      {/* 本人設定: MemberEditorを使用 */}
      <MemberEditor
        label={`本人${isLinked ? " 🔗A" : ""}`} color="#374151"
        data={{ incomeKF: s.incomeKF, expenseKF: s.expenseKF, dcTotalKF: s.dcTotalKF, companyDCKF: s.companyDCKF, idecoKF: s.idecoKF, salaryGrowthRate: s.salaryGrowthRate, sirPct: 15.75, hasFurusato: s.hasFurusato }}
        onUpdate={(patch) => onChange({ ...s, ...patch })}
        currentAge={currentAge} retirementAge={retirementAge}
        linked={isLinked}
        readOnly={isLinked}
        baseData={baseScenario ? { incomeKF: baseScenario.incomeKF, expenseKF: baseScenario.expenseKF, dcTotalKF: baseScenario.dcTotalKF, companyDCKF: baseScenario.companyDCKF, idecoKF: baseScenario.idecoKF, salaryGrowthRate: baseScenario.salaryGrowthRate, sirPct: 15.75, hasFurusato: baseScenario.hasFurusato } : undefined}
        trackLinked={isLinked ? isTrackLinked : undefined}
        onToggleTrack={isLinked ? toggleTrack : undefined}
        extraFields={<>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">資産</span>
            <input type="number" value={s.currentAssetsMan} step={100} onChange={e => onChange({ ...s, currentAssetsMan: Number(e.target.value) })} className="w-20 rounded border px-1 py-0.5 text-xs" />
            <span className="text-[10px] text-gray-400">万</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">DC通算</span>
            <input type="number" value={s.years} step={1} onChange={e => onChange({ ...s, years: Number(e.target.value) })} className="w-14 rounded border px-1 py-0.5 text-xs" />
            <span className="text-[10px] text-gray-400">年</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">扶養控除</span>
            <button onClick={() => onChange({ ...s, dependentDeductionHolder: "self" })}
              className={`rounded px-1.5 py-0.5 text-[10px] ${(s.dependentDeductionHolder || "self") === "self" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>本人</button>
            <button onClick={() => onChange({ ...s, dependentDeductionHolder: "spouse" })}
              className={`rounded px-1.5 py-0.5 text-[10px] ${s.dependentDeductionHolder === "spouse" ? "bg-pink-600 text-white" : "bg-gray-100"}`}>配偶者</button>
          </div>
        </>}
      />

      <EventSection scenario={s} onChange={onChange} currentAge={currentAge} retirementAge={retirementAge} baseScenario={baseScenario} isLinked={isLinked} />

      {/* DC/iDeCo受取方法 */}
      <DCReceiveSection s={s} onChange={onChange} />

      {/* 配偶者: 同じMemberEditorを使用 */}
      <div className="border-t pt-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-pink-700">配偶者{spInherited ? " 🔗A" : ""}</span>
          <label className="flex items-center gap-1 text-[10px] cursor-pointer">
            <input type="checkbox" checked={sp.enabled} onChange={e => onChange({ ...s, spouse: { ...sp, enabled: e.target.checked } })} className="accent-pink-600" />
            <span className="text-gray-500">{spInherited ? "独自設定に切替" : "有効"}</span>
          </label>
        </div>
        {sp.enabled && (
          <MemberEditor
            label="配偶者" color="#be185d"
            data={{ incomeKF: sp.incomeKF || [], expenseKF: sp.expenseKF || [], dcTotalKF: sp.dcTotalKF || [], companyDCKF: sp.companyDCKF || [], idecoKF: sp.idecoKF || [], salaryGrowthRate: sp.salaryGrowthRate, sirPct: sp.sirPct ?? 15.75, hasFurusato: sp.hasFurusato ?? true }}
            onUpdate={(patch) => onChange({ ...s, spouse: { ...sp, ...patch } })}
            currentAge={sp.currentAge} retirementAge={retirementAge}
            extraFields={
              <div className="flex items-center gap-1">
                <span className="text-gray-500 text-[10px]">年齢</span>
                <input type="number" value={sp.currentAge} step={1} onChange={e => onChange({ ...s, spouse: { ...sp, currentAge: Number(e.target.value) } })} className="w-14 rounded border px-1 py-0.5 text-xs" />
                <span className="text-[10px] text-gray-400">歳</span>
              </div>
            }
          />
        )}
      </div>

      <NISASection s={s} onChange={onChange} isLinked={isLinked} baseScenario={baseScenario} />
    </div>
  );
}
