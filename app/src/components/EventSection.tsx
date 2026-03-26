import React, { useState } from "react";
import type { LifeEvent, Scenario } from "../lib/types";
import { EVENT_TYPES, resolveEventAge } from "../lib/types";
import { Section, usePersistedSet } from "./Section";
import { ChildEventModal } from "./ChildEventModal";
import { PropertyModal } from "./PropertyModal";
import { CarModal } from "./CarModal";
import { DeathModal } from "./DeathModal";
import { InsuranceModal } from "./InsuranceModal";
import { CrashModal } from "./CrashModal";
import { GiftModal } from "./GiftModal";
import { RelocationModal } from "./RelocationModal";

// タイプ別ソート: 子供→住宅→車→保険→死亡→結婚→…→カスタム、同タイプ内はage順
const TYPE_ORDER: Record<string, number> = { child: 0, education: 0, property: 1, car: 2, insurance: 3, nursing: 4, death: 5, crash: 6, marriage: 7, rent: 8, travel: 9, custom: 10 };
function sortEventsByType(events: LifeEvent[], allEvents?: LifeEvent[]): LifeEvent[] {
  return [...events].sort((a, b) => {
    const ta = TYPE_ORDER[a.type] ?? 8, tb = TYPE_ORDER[b.type] ?? 8;
    if (ta !== tb) return ta - tb;
    const aAge = allEvents ? resolveEventAge(a, allEvents) : a.age;
    const bAge = allEvents ? resolveEventAge(b, allEvents) : b.age;
    return aAge - bAge;
  });
}

// ===== Collapsible Event List =====
function EventList({ events, updateEvent, updateEventMulti, removeEvent, currentAge, retirementAge, label, onEdit, onEditChild }: {
  events: LifeEvent[];
  updateEvent: (id: number, f: string, v: any) => void;
  updateEventMulti?: (id: number, patch: Record<string, any>) => void;
  removeEvent: (id: number) => void;
  currentAge: number; retirementAge: number;
  label?: string;
  onEdit?: (e: LifeEvent) => void;
  onEditChild?: (e: LifeEvent) => void;
}) {
  const [collapsed, setCollapsed] = usePersistedSet("sim-evt-collapsed");
  if (events.length === 0) return null;

  const parents = sortEventsByType(events.filter(e => !e.parentId), events);
  const childrenOf = (pid: number) => events.filter(e => e.parentId === pid);
  const orphans = events.filter(e => e.parentId && !events.some(p => p.id === e.parentId));
  const toggleCollapse = (id: number) => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const renderEvent = (e: LifeEvent, indent: boolean, parentDisabled?: boolean) => {
    const et = EVENT_TYPES[e.type] || EVENT_TYPES.custom;
    const children = childrenOf(e.id);
    const isCollapsed = collapsed.has(e.id);
    const hasChildren = children.length > 0;
    const totalChildCost = children.reduce((s, c) => s + c.annualCostMan * Math.max(c.durationYears, 1), 0);
    const isDisabled = !!e.disabled || !!parentDisabled;
    return (
      <div key={e.id}>
        <div className={`flex flex-wrap items-center gap-1 text-xs rounded px-2 py-0.5 bg-gray-50 ${indent ? "ml-4 border-l-2 border-gray-200" : ""} ${isDisabled ? "opacity-30 line-through" : ""}`}>
          {hasChildren && <button onClick={() => toggleCollapse(e.id)} className="text-[10px] text-gray-400 w-4">{isCollapsed ? "▶" : "▼"}</button>}
          <span style={{ color: et.color }}>{et.icon}</span>
          {e.type === "child" && !e.parentId && onEditChild && <button onClick={() => onEditChild(e)} className="text-[10px] rounded px-1 py-0.5 bg-amber-100 text-amber-600">✏️</button>}
          {et.paramsKey && (e as any)[et.paramsKey] && onEdit && <button onClick={() => onEdit(e)} className={`text-[10px] rounded px-1 py-0.5 ${et.editBtnClass}`}>✏️</button>}
          <input value={e.label} onChange={ev => updateEvent(e.id, "label", ev.target.value)} className="w-28 rounded border px-1.5 py-1 text-xs" />
          {e.marketCrashParams && (
            <span className="text-[10px] text-gray-500">-{e.marketCrashParams.dropRate}% {e.marketCrashParams.target === "all" ? "全口座" : e.marketCrashParams.target === "nisa" ? "NISA" : "特定"}</span>
          )}
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
          {!e.marketCrashParams && !e.deathParams && !e.insuranceParams && !e.giftParams && (<>
            <input type="number" value={e.annualCostMan} step={5} onChange={ev => updateEvent(e.id, "annualCostMan", Number(ev.target.value))} className="w-16 rounded border px-1.5 py-1 text-xs" />
            <span className="text-[10px] text-gray-400">万/年</span>
          </>)}
          {e.durationYears > 0 && !e.marketCrashParams && (<><input type="number" value={e.durationYears} min={0} step={1} onChange={ev => updateEvent(e.id, "durationYears", Number(ev.target.value))} className="w-12 rounded border px-1.5 py-1 text-xs" /><span className="text-[10px] text-gray-400">年</span></>)}
          {e.marketCrashParams && <span className="text-[10px] text-gray-400">({e.durationYears}年)</span>}
          {hasChildren && isCollapsed && <span className="text-[10px] text-gray-400">({children.length}件 計{totalChildCost}万)</span>}
          <div className="flex items-center gap-1 ml-auto">
            <input type="checkbox" checked={!e.disabled} onChange={() => updateEvent(e.id, "disabled", !e.disabled)} className="accent-blue-600 w-3 h-3" title={e.disabled ? "有効にする" : "無効にする"} />
            <button onClick={() => removeEvent(e.id)} className="text-[10px] text-gray-300 hover:text-red-500">×</button>
          </div>
        </div>
        {hasChildren && !isCollapsed && children.map(c => renderEvent(c, true, isDisabled))}
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
function BaseEventList({ baseEvents, excludedIds, disabledIds, onUnlink, onRelink, onToggleDisable }: {
  baseEvents: LifeEvent[]; excludedIds: number[]; disabledIds: number[];
  onUnlink: (e: LifeEvent) => void; onRelink: (baseId: number) => void;
  onToggleDisable: (id: number) => void;
}) {
  const [collapsed, setCollapsed] = usePersistedSet("sim-base-evt-collapsed");
  const parents = sortEventsByType(baseEvents.filter(e => !e.parentId), baseEvents);
  const childrenOf = (pid: number) => baseEvents.filter(e => e.parentId === pid);
  const toggleCollapse = (id: number) => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const renderBaseEvent = (e: LifeEvent, indent: boolean, parentExcluded?: boolean, parentDisabled?: boolean) => {
    const et = EVENT_TYPES[e.type] || EVENT_TYPES.custom;
    const children = childrenOf(e.id);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(e.id);
    const excluded = excludedIds.includes(e.id) || !!parentExcluded;
    const isDisabled = disabledIds.includes(e.id) || !!e.disabled || !!parentDisabled;
    const totalChildCost = children.reduce((s, c) => s + c.annualCostMan * Math.max(c.durationYears, 1), 0);
    return (
      <div key={e.id}>
        <div className={`flex items-center gap-1 text-xs rounded px-2 py-0.5 ${indent ? "ml-4 border-l-2 border-gray-200" : ""} ${excluded ? "bg-gray-100 opacity-40" : isDisabled ? "opacity-30 line-through bg-gray-50" : "bg-gray-50"}`}>
          {hasChildren && <button onClick={() => toggleCollapse(e.id)} className="text-[10px] text-gray-400 w-4">{isCollapsed ? "▶" : "▼"}</button>}
          <span style={{ color: et.color }}>{et.icon}</span>
          <span className="font-mono text-[10px] text-gray-500">{resolveEventAge(e, baseEvents)}歳{e.ageOffset != null ? ` (+${e.ageOffset})` : ""}</span>
          <span className={`text-gray-600 ${excluded || isDisabled ? "line-through" : ""}`}>{e.label}</span>
          {e.durationYears > 0 && <span className="text-gray-400 text-[10px]">({e.durationYears}年)</span>}
          {e.annualCostMan > 0 && <span className="text-gray-400 text-[10px]">{e.annualCostMan}万/年</span>}
          {e.oneTimeCostMan > 0 && <span className="text-gray-400 text-[10px]">+{e.oneTimeCostMan}万</span>}
          {hasChildren && isCollapsed && <span className="text-[10px] text-gray-400">({children.length}件 計{totalChildCost}万)</span>}
          {!indent && !excluded && <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => onUnlink(e)} className="text-[10px] rounded px-1.5 py-0.5 bg-gray-200 text-gray-500"
              title="Aにリンク中（クリックで独自設定に切替）">🔗A</button>
            <input type="checkbox" checked={!isDisabled} onChange={() => onToggleDisable(e.id)} className="accent-blue-600 w-3 h-3" title={isDisabled ? "有効にする" : "無効にする"} />
          </div>}
          {!indent && excluded && <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => onRelink(e.id)} className="text-[10px] rounded px-1.5 py-0.5 bg-blue-100 text-blue-600"
              title="独自設定中（クリックでAにリンクを戻す）">✏️独自</button>
          </div>}
        </div>
        {hasChildren && !isCollapsed && children.map(c => renderBaseEvent(c, true, excluded, isDisabled))}
      </div>
    );
  };
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-0.5">
        <span className="bg-gray-200 text-gray-500 rounded px-1 py-px">🔗A</span>
        <span>のイベント</span>
      </div>
      <div className="space-y-0.5">{parents.map(e => renderBaseEvent(e, false))}</div>
    </div>
  );
}

// ===== Event Section =====
export function EventSection({ scenario, onChange, currentAge, retirementAge, baseScenario, isLinked, open, onToggle, defaultRR }: {
  scenario: Scenario; onChange: (s: Scenario) => void;
  currentAge: number; retirementAge: number;
  baseScenario?: Scenario | null; isLinked: boolean;
  open: boolean; onToggle: () => void;
  defaultRR?: number;
}) {
  const events = scenario.events || [];
  const baseEvents = (isLinked && baseScenario) ? (baseScenario.events || []) : [];
  const excludedIds = scenario.excludedBaseEventIds || [];
  type ModalType = "child" | "property" | "car" | "death" | "insurance" | "gift" | "relocation" | "crash" | null;
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null);
  const [editingChildEvents, setEditingChildEvents] = useState<LifeEvent[]>([]);
  const openModalFor = (type: ModalType, evt?: LifeEvent | null) => { setOpenModal(type); setEditingEvent(evt ?? null); };
  const closeModal = () => { setOpenModal(null); setEditingEvent(null); setEditingChildEvents([]); };

  const setEvents = (evts: LifeEvent[]) => onChange({ ...scenario, events: evts });
  const addSimpleEvent = (type: string) => {
    const et = EVENT_TYPES[type]; const age = currentAge + 5; const parentId = Date.now();
    const newEvents: LifeEvent[] = [{ id: parentId, age, type, label: et.label, oneTimeCostMan: et.defaultOnetime, annualCostMan: et.defaultAnnual, durationYears: et.defaultDuration,
      ...(type === "crash" ? { label: "暴落 -50%", marketCrashParams: { dropRate: 50, target: "all" as const } } : {}),
    }];
    if (type === "marriage") newEvents.push({ id: parentId + 1, age, type: "custom", label: "結婚支援金（親）", oneTimeCostMan: -100, annualCostMan: 0, durationYears: 0, parentId, ageOffset: 0 });
    setEvents([...events, ...newEvents].sort((a, b) => a.age - b.age));
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

  const allCount = baseEvents.filter(e => !excludedIds.includes(e.id)).length + events.length;
  const topEvents = [...baseEvents.filter(e => !e.parentId && !excludedIds.includes(e.id)), ...events.filter(e => !e.parentId)];
  const summaryText = topEvents.map(e => `${(EVENT_TYPES[e.type] || EVENT_TYPES.custom).icon}${e.label}`).join(" ");

  const modalSave = (evt: LifeEvent) => {
    if (editingEvent) setEvents(events.map(e => e.id === evt.id ? evt : e));
    else setEvents([...events, evt].sort((a, b) => a.age - b.age));
    closeModal();
  };

  return (
    <Section title="ライフイベント" icon="📅" borderColor="#d97706" bgOpen="bg-amber-50/30" open={open} onToggle={onToggle}
      linked={isLinked}
      badge={<span className="font-normal text-gray-400 text-[10px]">({allCount}件{summaryText ? ` ${summaryText}` : ""})</span>}>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {Object.entries(EVENT_TYPES).filter(([k]) => k !== "education" && k !== "marriage" && k !== "rent" && k !== "property" && k !== "relocation").map(([k, v]) => (
          <button key={k} onClick={() => {
            if (["child", "property", "car", "death", "insurance", "gift", "relocation", "crash"].includes(k)) { openModalFor(k as ModalType); }
            else addSimpleEvent(k);
          }} className="rounded border bg-white px-1.5 py-0.5 text-[10px] hover:bg-blue-50 hover:border-blue-300">{v.icon} {v.label}</button>
        ))}
      </div>
      <ChildEventModal isOpen={openModal === "child"} onClose={closeModal} onAdd={addChildEvents} currentAge={currentAge} retirementAge={retirementAge}
        existingEvents={editingChildEvents.length > 0 ? editingChildEvents : undefined}
        onUpdate={(oldIds, newEvts) => { setEvents([...events.filter(e => !oldIds.includes(e.id)), ...newEvts].sort((a, b) => a.age - b.age)); closeModal(); }} />
      <PropertyModal isOpen={openModal === "property"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
      <CarModal isOpen={openModal === "car"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
      <DeathModal isOpen={openModal === "death"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
      <InsuranceModal isOpen={openModal === "insurance"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
      <CrashModal isOpen={openModal === "crash"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} defaultRR={defaultRR} />
      <GiftModal isOpen={openModal === "gift"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
      <RelocationModal isOpen={openModal === "relocation"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent}
        allEvents={[...baseEvents.filter(e => !excludedIds.includes(e.id)), ...events]}
        onUpdatePropertySale={(propId, patch) => {
          // 既存物件のpropertyParamsに売却設定を反映（own eventsから探す。base eventsなら先にunlinkが必要）
          const ownEvt = events.find(e => e.id === propId);
          if (ownEvt?.propertyParams) {
            setEvents(events.map(e => e.id === propId ? { ...e, propertyParams: { ...e.propertyParams!, ...patch } } : e));
          } else {
            // baseイベントの場合: unlinkしてから更新
            const baseEvt = baseEvents.find(e => e.id === propId);
            if (baseEvt?.propertyParams) {
              const newId = Date.now();
              const children = baseEvents.filter(c => c.parentId === propId);
              const toExclude = [propId, ...children.map(c => c.id)];
              onChange({
                ...scenario,
                excludedBaseEventIds: [...excludedIds, ...toExclude],
                events: [...events, { ...baseEvt, id: newId, propertyParams: { ...baseEvt.propertyParams!, ...patch } },
                  ...children.map(c => ({ ...c, id: Date.now() + Math.round(Math.random() * 100000), parentId: newId }))
                ].sort((a, b) => a.age - b.age),
              });
            }
          }
        }} />
      {isLinked && baseEvents.length > 0 && <BaseEventList baseEvents={baseEvents} excludedIds={excludedIds} disabledIds={scenario.disabledBaseEventIds || []}
        onUnlink={unlinkBaseEvent} onRelink={relinkBaseEvent}
        onToggleDisable={(id) => {
          const dIds = scenario.disabledBaseEventIds || [];
          const childIds = baseEvents.filter(c => c.parentId === id).map(c => c.id);
          const allIds = [id, ...childIds];
          if (dIds.includes(id)) {
            onChange({ ...scenario, disabledBaseEventIds: dIds.filter(d => !allIds.includes(d)) });
          } else {
            onChange({ ...scenario, disabledBaseEventIds: [...dIds, ...allIds] });
          }
        }} />}
      <EventList events={events} updateEvent={updateEvent} updateEventMulti={updateEventMulti} removeEvent={removeEvent} currentAge={currentAge} retirementAge={retirementAge}
        label={isLinked && events.length > 0 ? "✏️独自イベント" : undefined}
        onEdit={(e) => openModalFor(e.type as ModalType, e)}
        onEditChild={(e) => { const childEvts = [e, ...events.filter(c => c.parentId === e.id)]; setEditingChildEvents(childEvts); setOpenModal("child"); }} />
      {events.length === 0 && baseEvents.length === 0 && <div className="text-[10px] text-gray-400 pl-2">イベントなし</div>}
    </Section>
  );
}
