import React, { useState } from "react";
import type { Keyframe, LifeEvent, Scenario, TrackKey } from "../lib/types";
import { sortKF, EVENT_TYPES, resolveEventAge } from "../lib/types";
import { ChildEventModal } from "./ChildEventModal";
import { PropertyModal } from "./PropertyModal";
import { CarModal } from "./CarModal";
import { DeathModal } from "./DeathModal";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

interface TrackDef { key: TrackKey; label: string; unit: string; defaultValue: number; step: number; }
const TRACKS: TrackDef[] = [
  { key: "incomeKF", label: "年収", unit: "万円", defaultValue: 700, step: 10 },
  { key: "expenseKF", label: "基本生活費", unit: "万円/月", defaultValue: 15, step: 1 },
  { key: "dcTotalKF", label: "DC合計", unit: "円/月", defaultValue: 55000, step: 1000 },
  { key: "companyDCKF", label: "会社DC", unit: "円/月", defaultValue: 1000, step: 1000 },
  { key: "idecoKF", label: "iDeCo", unit: "円/月", defaultValue: 0, step: 1000 },
];

// ===== Track Row =====
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

// ===== Collapsible Event List =====
function EventList({ events, updateEvent, removeEvent, currentAge, retirementAge, label, onEditProperty, onEditCar, onEditDeath }: {
  events: LifeEvent[];
  updateEvent: (id: number, f: string, v: any) => void;
  removeEvent: (id: number) => void;
  currentAge: number; retirementAge: number;
  label?: string;
  onEditProperty?: (e: LifeEvent) => void;
  onEditCar?: (e: LifeEvent) => void;
  onEditDeath?: (e: LifeEvent) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  if (events.length === 0) return null;

  // Separate parents (no parentId) and children (has parentId)
  const parents = events.filter(e => !e.parentId);
  const childrenOf = (pid: number) => events.filter(e => e.parentId === pid);
  const orphans = events.filter(e => e.parentId && !events.some(p => p.id === e.parentId));

  const toggleCollapse = (id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const renderEvent = (e: LifeEvent, indent: boolean) => {
    const et = EVENT_TYPES[e.type] || EVENT_TYPES.custom;
    const children = childrenOf(e.id);
    const isCollapsed = collapsed.has(e.id);
    const hasChildren = children.length > 0;
    const totalChildCost = children.reduce((s, c) => s + c.annualCostMan * Math.max(c.durationYears, 1), 0);

    return (
      <div key={e.id}>
        <div className={`flex flex-wrap items-center gap-1 text-xs rounded px-2 py-0.5 bg-gray-50 ${indent ? "ml-4 border-l-2 border-gray-200" : ""}`}>
          {hasChildren && (
            <button onClick={() => toggleCollapse(e.id)} className="text-[10px] text-gray-400 w-4">
              {isCollapsed ? "▶" : "▼"}
            </button>
          )}
          <span style={{ color: et.color }}>{et.icon}</span>
          {e.propertyParams && onEditProperty && (
            <button onClick={() => onEditProperty(e)} className="text-[10px] rounded px-1 py-0.5 bg-blue-100 text-blue-600">✏️</button>
          )}
          {e.carParams && onEditCar && (
            <button onClick={() => onEditCar(e)} className="text-[10px] rounded px-1 py-0.5 bg-green-100 text-green-600">✏️</button>
          )}
          {e.deathParams && onEditDeath && (
            <button onClick={() => onEditDeath(e)} className="text-[10px] rounded px-1 py-0.5 bg-gray-200 text-gray-600">✏️</button>
          )}
          <input value={e.label} onChange={ev => updateEvent(e.id, "label", ev.target.value)} className="w-28 rounded border px-1.5 py-1 text-xs" />
          {e.ageOffset != null ? (
            <span className="text-[10px] text-gray-400 font-mono">{resolveEventAge(e, events)}歳 (+{e.ageOffset})</span>
          ) : (
            <>
              <input type="number" value={e.age} min={currentAge} max={retirementAge} step={1} onChange={ev => updateEvent(e.id, "age", Number(ev.target.value))} className="w-14 rounded border px-1.5 py-1 text-xs" />
              <span className="text-[10px] text-gray-400">歳</span>
            </>
          )}
          <input type="number" value={e.annualCostMan} step={5} onChange={ev => updateEvent(e.id, "annualCostMan", Number(ev.target.value))} className="w-16 rounded border px-1.5 py-1 text-xs" />
          <span className="text-[10px] text-gray-400">万/年</span>
          {e.durationYears > 0 && (
            <>
              <input type="number" value={e.durationYears} min={0} step={1} onChange={ev => updateEvent(e.id, "durationYears", Number(ev.target.value))} className="w-12 rounded border px-1.5 py-1 text-xs" />
              <span className="text-[10px] text-gray-400">年</span>
            </>
          )}
          {hasChildren && isCollapsed && (
            <span className="text-[10px] text-gray-400">({children.length}件 計{totalChildCost}万)</span>
          )}
          <button onClick={() => removeEvent(e.id)} className="text-[10px] text-gray-300 hover:text-red-500 ml-auto">×</button>
        </div>
        {hasChildren && !isCollapsed && children.map(c => renderEvent(c, true))}
      </div>
    );
  };

  return (
    <div className="mb-1">
      {label && <div className="text-[10px] text-gray-400 mb-0.5">{label}</div>}
      <div className="space-y-0.5">
        {parents.map(e => renderEvent(e, false))}
        {orphans.map(e => renderEvent(e, false))}
      </div>
    </div>
  );
}

// ===== Base Event List (linked, with parent-child collapse) =====
function BaseEventList({ baseEvents, excludedIds, onUnlink, onRelink }: {
  baseEvents: LifeEvent[];
  excludedIds: number[];
  onUnlink: (e: LifeEvent) => void;
  onRelink: (baseId: number) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  // Only show top-level events (parents + orphans without parent in baseEvents)
  const parents = baseEvents.filter(e => !e.parentId);
  const childrenOf = (pid: number) => baseEvents.filter(e => e.parentId === pid);

  const toggleCollapse = (id: number) => {
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

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
          {hasChildren && (
            <button onClick={() => toggleCollapse(e.id)} className="text-[10px] text-gray-400 w-4">
              {isCollapsed ? "▶" : "▼"}
            </button>
          )}
          {/* ON/OFF toggles the whole parent + children at once */}
          {!indent && (
            excluded ? (
              <button onClick={() => onRelink(e.id)} className="text-[10px] rounded px-1 py-0.5 bg-gray-200 text-gray-400">🔗 戻す</button>
            ) : (
              <button onClick={() => onUnlink(e)} className="text-[10px] rounded px-1 py-0.5 bg-blue-100 text-blue-600">✏️ 編集</button>
            )
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
      <div className="space-y-0.5">
        {parents.map(e => renderBaseEvent(e, false))}
      </div>
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

  const setEvents = (evts: LifeEvent[]) => onChange({ ...scenario, events: evts });
  const setExcluded = (ids: number[]) => onChange({ ...scenario, excludedBaseEventIds: ids });

  const addSimpleEvent = (type: string) => {
    const et = EVENT_TYPES[type];
    const age = currentAge + 5;
    const parentId = Date.now();
    const newEvents: LifeEvent[] = [
      { id: parentId, age, type, label: et.label, oneTimeCostMan: et.defaultOnetime, annualCostMan: et.defaultAnnual, durationYears: et.defaultDuration },
    ];
    // Marriage: add 結婚支援金 as a child event (subsidy, reduces cost)
    if (type === "marriage") {
      newEvents.push({
        id: parentId + 1, age, type: "custom", label: "結婚支援金（親）",
        oneTimeCostMan: -100, annualCostMan: 0, durationYears: 0, parentId, ageOffset: 0,
      });
    }
    setEvents([...events, ...newEvents].sort((a, b) => a.age - b.age));
    setShowMenu(false);
  };

  const addChildEvents = (newEvts: LifeEvent[]) => {
    setEvents([...events, ...newEvts].sort((a, b) => a.age - b.age));
  };

  const removeEvent = (id: number) => setEvents(events.filter(e => e.id !== id && e.parentId !== id));
  const updateEvent = (id: number, f: string, v: any) => setEvents(events.map(e => e.id === id ? { ...e, [f]: v } : e));

  // Unlink a base event: exclude it from base, copy it (and children) into own events for editing
  const unlinkBaseEvent = (e: LifeEvent) => {
    // Find this event + its children in baseEvents
    const children = baseEvents.filter(c => c.parentId === e.id);
    const toExclude = [e.id, ...children.map(c => c.id)];
    // Copy with new IDs, preserving parentId mapping
    const newParentId = Date.now();
    const copies: LifeEvent[] = [
      { ...e, id: newParentId },
      ...children.map(c => ({ ...c, id: Date.now() + Math.round(Math.random() * 100000), parentId: newParentId })),
    ];
    onChange({
      ...scenario,
      excludedBaseEventIds: [...excludedIds, ...toExclude],
      events: [...events, ...copies].sort((a, b) => a.age - b.age),
    });
  };

  // Re-link: remove own copies, restore base event
  const relinkBaseEvent = (baseId: number) => {
    // Remove from excluded list (the base event and its children)
    const baseChildren = baseEvents.filter(c => c.parentId === baseId);
    const toRestore = [baseId, ...baseChildren.map(c => c.id)];
    onChange({
      ...scenario,
      excludedBaseEventIds: excludedIds.filter(id => !toRestore.includes(id)),
    });
  };

  const [open, setOpen] = useState(true);

  const allCount = baseEvents.filter(e => !excludedIds.includes(e.id)).length + events.length;
  const topEvents = [...baseEvents.filter(e => !e.parentId && !excludedIds.includes(e.id)), ...events.filter(e => !e.parentId)];
  const summaryText = topEvents.map(e => `${(EVENT_TYPES[e.type] || EVENT_TYPES.custom).icon}${e.label}`).join(" ");

  return (
    <div className="border-t pt-1">
      <div className="flex items-center justify-between mb-1">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-bold text-gray-700">
          <span className="text-[10px] text-gray-400">{open ? "▼" : "▶"}</span>
          ライフイベント
          <span className="font-normal text-gray-400">({allCount}件{summaryText ? ` ${summaryText}` : ""})</span>
        </button>
        <button onClick={() => setShowMenu(!showMenu)} className="text-[10px] text-blue-500 hover:text-blue-700">+ 追加</button>
      </div>
      {open && (<>

      {/* Add menu */}
      {showMenu && (
        <div className="mb-2 rounded border bg-blue-50 p-2">
          <div className="flex flex-wrap gap-1">
            {Object.entries(EVENT_TYPES).filter(([k]) => k !== "education").map(([k, v]) => (
              <button key={k} onClick={() => {
                if (k === "child") { setShowChildModal(true); setShowMenu(false); }
                else if (k === "property") { setShowPropertyModal(true); setShowMenu(false); }
                else if (k === "car") { setShowCarModal(true); setShowMenu(false); }
                else if (k === "death") { setShowDeathModal(true); setShowMenu(false); }
                else { addSimpleEvent(k); }
              }}
                className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-50">
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <ChildEventModal isOpen={showChildModal} onClose={() => setShowChildModal(false)}
        onAdd={addChildEvents} currentAge={currentAge} retirementAge={retirementAge} />
      <PropertyModal isOpen={showPropertyModal}
        onClose={() => { setShowPropertyModal(false); setEditingPropertyEvent(null); }}
        onSave={(evt) => {
          if (editingPropertyEvent) {
            // Update existing
            setEvents(events.map(e => e.id === evt.id ? evt : e));
          } else {
            setEvents([...events, evt].sort((a, b) => a.age - b.age));
          }
          setEditingPropertyEvent(null);
        }}
        currentAge={currentAge} retirementAge={retirementAge}
        existingEvent={editingPropertyEvent} />
      <CarModal isOpen={showCarModal}
        onClose={() => { setShowCarModal(false); setEditingCarEvent(null); }}
        onSave={(evt) => {
          if (editingCarEvent) {
            setEvents(events.map(e => e.id === evt.id ? evt : e));
          } else {
            setEvents([...events, evt].sort((a, b) => a.age - b.age));
          }
          setEditingCarEvent(null);
        }}
        currentAge={currentAge} retirementAge={retirementAge}
        existingEvent={editingCarEvent} />
      <DeathModal isOpen={showDeathModal}
        onClose={() => { setShowDeathModal(false); setEditingDeathEvent(null); }}
        onSave={(evt) => {
          if (editingDeathEvent) {
            setEvents(events.map(e => e.id === evt.id ? evt : e));
          } else {
            setEvents([...events, evt].sort((a, b) => a.age - b.age));
          }
          setEditingDeathEvent(null);
        }}
        currentAge={currentAge} retirementAge={retirementAge}
        existingEvent={editingDeathEvent} />

      {/* Base events (with parent-child collapsing + unlink to edit) */}
      {isLinked && baseEvents.length > 0 && (
        <BaseEventList baseEvents={baseEvents} excludedIds={excludedIds}
          onUnlink={unlinkBaseEvent} onRelink={relinkBaseEvent} />
      )}

      {/* Own events (editable, with parent-child collapsing) */}
      <EventList events={events} updateEvent={updateEvent} removeEvent={removeEvent}
        currentAge={currentAge} retirementAge={retirementAge}
        label={isLinked && events.length > 0 ? `${scenario.name}の独自イベント` : undefined}
        onEditProperty={(e) => { setEditingPropertyEvent(e); setShowPropertyModal(true); }}
        onEditCar={(e) => { setEditingCarEvent(e); setShowCarModal(true); }}
        onEditDeath={(e) => { setEditingDeathEvent(e); setShowDeathModal(true); }} />

      {events.length === 0 && baseEvents.length === 0 && <div className="text-[10px] text-gray-400 pl-2">イベントなし</div>}
      </>)}
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

  return (
    <div className="rounded-lg border-2 p-3 space-y-2" style={{ borderColor: COLORS[idx] }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: COLORS[idx] }}>{s.name}</span>
        {isLinked && <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-2 py-0.5">🔗 Aベース + 差分</span>}
      </div>
      {TRACKS.map(t => (
        <TrackRow key={t.key} track={t}
          keyframes={(s[t.key] as Keyframe[]) || []}
          onChange={(kfs) => onChange({ ...s, [t.key]: kfs })}
          currentAge={currentAge} retirementAge={retirementAge}
          linked={isTrackLinked(t.key)}
          onToggleLink={isLinked ? () => toggleTrack(t.key) : undefined}
          baseKFs={baseScenario ? ((baseScenario as any)[t.key] || []) : undefined} />
      ))}
      <EventSection
        scenario={s} onChange={onChange}
        currentAge={currentAge} retirementAge={retirementAge}
        baseScenario={baseScenario} isLinked={isLinked} />
    </div>
  );
}
