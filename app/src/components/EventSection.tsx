import React, { useState } from "react";
import type { LifeEvent, Scenario } from "../lib/types";
import { EVENT_TYPES, resolveEventAge } from "../lib/types";
import { nextEventId } from "../lib/ids";
import { Section, usePersistedSet } from "./Section";
import { Btns, Inp, NumField } from "./ui";
import { ChildrenModal } from "./ChildrenModal";
import { PropertyModal } from "./PropertyModal";
import { CarModal } from "./CarModal";
import { DeathModal } from "./DeathModal";
import { InsuranceModal } from "./InsuranceModal";
import { PrivatePensionModal } from "./PrivatePensionModal";
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

/** Event types that open a dedicated modal. */
const MODAL_TYPES = ["child", "property", "car", "death", "insurance", "gift", "relocation", "crash", "pension_private"] as const;
type ModalType = typeof MODAL_TYPES[number] | null;
/** Buttons shown in the add-bar. Housing types live in 住居プラン. */
const ADD_BAR_TYPES = ["child", "car", "insurance", "travel", "nursing", "custom", "death", "pension_private", "gift", "crash"] as const;
const PERIODIC_TYPES = new Set(["car", "rent", "nursing", "travel", "custom"]);
const AFTER_DEATH_TYPES = new Set(["car", "rent", "nursing", "travel", "custom", "pension_private"]);

const ruleActive = (r?: LifeEvent["afterDeathRule"]) =>
  !!r && ((r.selfDeath && r.selfDeath !== "continue") || (r.spouseDeath && r.spouseDeath !== "continue"));

// ===== Collapsible Event List =====
function EventList({ events, updateEvent, updateEventMulti, removeEvent, currentAge, retirementAge, label, onEdit, onEditChild }: {
  events: LifeEvent[];
  updateEvent: <K extends keyof LifeEvent>(id: number, f: K, v: LifeEvent[K]) => void;
  updateEventMulti?: (id: number, patch: Partial<LifeEvent>) => void;
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
    const hasStructuredParams = !!(e.marketCrashParams || e.deathParams || e.insuranceParams || e.giftParams || e.privatePensionParams);
    const rule = e.afterDeathRule;
    const setRule = (patch: Partial<NonNullable<LifeEvent["afterDeathRule"]>>) =>
      updateEventMulti?.(e.id, { afterDeathRule: { selfDeath: "continue", spouseDeath: "continue", ...(rule || {}), ...patch } });
    return (
      <div key={e.id}>
        {/* 1行固定: ラベルだけが伸縮して省略され、数値欄は右に揃う */}
        <div className={`flex items-center gap-1 whitespace-nowrap rounded bg-gray-50 px-1.5 py-0.5 text-xs ${indent ? "ml-4 border-l-2 border-gray-200" : ""} ${isDisabled ? "opacity-30 line-through" : ""}`}>
          {hasChildren && <button type="button" onClick={() => toggleCollapse(e.id)} className="w-3 shrink-0 text-[10px] text-gray-400">{isCollapsed ? "▶" : "▼"}</button>}
          <span className="shrink-0" style={{ color: et.color }}>{et.icon}</span>
          {e.type === "child" && !e.parentId && onEditChild && <button type="button" onClick={() => onEditChild(e)} className="rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-600" title="子供をまとめて編集">✏️</button>}
          {et.paramsKey && e[et.paramsKey] && onEdit && <button type="button" onClick={() => onEdit(e)} className={`rounded px-1 py-0.5 text-[10px] ${et.editBtnClass}`} title="詳細を編集">✏️</button>}
          <input value={e.label} onChange={ev => updateEvent(e.id, "label", ev.target.value)} title={e.label}
            className="min-w-[3.5rem] flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          {e.parentalLeave && (
            <span className="shrink-0 rounded bg-pink-50 px-1 text-[9px] text-pink-600"
              title={`育休: ${[e.parentalLeave.self && `本人${e.parentalLeave.self.months}ヶ月`, e.parentalLeave.spouse && `配偶者${e.parentalLeave.spouse.months}ヶ月`].filter(Boolean).join("・")}`}>
              🍼{e.parentalLeave.self?.months ?? 0}/{e.parentalLeave.spouse?.months ?? 0}
            </span>
          )}
          {e.marketCrashParams && (
            <span className="text-[10px] text-gray-500">-{e.marketCrashParams.dropRate}% {e.marketCrashParams.target === "all" ? "全口座" : e.marketCrashParams.target === "nisa" ? "NISA" : "特定"}</span>
          )}
          {e.propertyParams && updateEventMulti && (
            <NumField value={e.propertyParams.priceMan} step={100} min={0} unit="万" w="w-16"
              onChange={v => updateEventMulti(e.id, { propertyParams: { ...e.propertyParams!, priceMan: v }, label: `住宅(${v}万)` })} />
          )}
          {e.ageOffset != null ? (
            <span className="shrink-0 font-mono text-[10px] text-gray-400" title={`親イベントから +${e.ageOffset}年`}>{resolveEventAge(e, events)}歳</span>
          ) : (
            <NumField value={e.age} min={currentAge} max={retirementAge} step={1} unit="歳" w="w-8" onChange={v => updateEvent(e.id, "age", v)} />
          )}
          {!hasStructuredParams && (
            <NumField value={e.annualCostMan} step={5} unit="万/年" w="w-11" onChange={v => updateEvent(e.id, "annualCostMan", v)} title="年間費用（マイナス＝収入）" />
          )}
          {e.durationYears > 0 && !e.marketCrashParams && (
            <NumField value={e.durationYears} min={0} max={80} step={1} unit="年" w="w-7" onChange={v => updateEvent(e.id, "durationYears", v)} title="期間（年）" />
          )}
          {PERIODIC_TYPES.has(e.type) && updateEventMulti && (
            
              <Inp label="毎" value={e.intervalYears ?? 1} onChange={v => updateEventMulti(e.id, { intervalYears: v <= 1 ? undefined : v })} unit="年" w="w-8" step={1} min={1} max={20} help="N年ごとに発生（1＝毎年）" />
            
          )}
          {e.marketCrashParams && <span className="text-[10px] text-gray-400">({e.durationYears}年)</span>}
          {hasChildren && isCollapsed && <span className="shrink-0 text-[10px] text-gray-400">+{children.length}件 {totalChildCost}万</span>}
          <div className="ml-1 flex shrink-0 items-center gap-1">
            <input type="checkbox" checked={!e.disabled} onChange={() => updateEvent(e.id, "disabled", !e.disabled)} className="h-3 w-3 accent-blue-600" title={e.disabled ? "有効にする" : "無効にする"} />
            <button type="button" onClick={() => removeEvent(e.id)} className="text-[10px] text-gray-300 hover:text-red-500" title="削除">×</button>
          </div>
        </div>
        {AFTER_DEATH_TYPES.has(e.type) && !isDisabled && updateEventMulti && (
          <>
            <details className="ml-4 text-[10px] text-gray-400">
              <summary className="cursor-pointer select-none py-0.5 hover:text-gray-600">死亡後の取扱い{ruleActive(rule) ? " ●" : ""}</summary>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pb-1 pl-2">
                <span className="inline-flex items-center gap-1">
                  <Btns label="本人万一:" options={[{ value: "continue" as const, label: "継続" }, { value: "stop" as const, label: "停止" }, { value: "reduce" as const, label: "減額" }]}
                    value={rule?.selfDeath ?? "continue"} onChange={v => setRule({ selfDeath: v })} />
                  {rule?.selfDeath === "reduce" && <Inp value={rule.selfDeathReducePct ?? 50} unit="%" w="w-10" step={10} min={0} max={100} onChange={v => setRule({ selfDeathReducePct: v })} />}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Btns label="配偶者万一:" options={[{ value: "continue" as const, label: "継続" }, { value: "stop" as const, label: "停止" }, { value: "reduce" as const, label: "減額" }]}
                    value={rule?.spouseDeath ?? "continue"} onChange={v => setRule({ spouseDeath: v })} />
                  {rule?.spouseDeath === "reduce" && <Inp value={rule.spouseDeathReducePct ?? 50} unit="%" w="w-10" step={10} min={0} max={100} onChange={v => setRule({ spouseDeathReducePct: v })} />}
                </span>
              </div>
            </details>
          </>
        )}
        {hasChildren && !isCollapsed && children.map(c => renderEvent(c, true, isDisabled))}
      </div>
    );
  };

  return (
    <div className="mb-1">
      {label && <div className="mb-0.5 text-[10px] text-gray-400">{label}</div>}
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
        <div className={`flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${indent ? "ml-4 border-l-2 border-gray-200" : ""} ${excluded ? "bg-gray-100 opacity-40" : isDisabled ? "bg-gray-50 opacity-30 line-through" : "bg-gray-50"}`}>
          {hasChildren && <button type="button" onClick={() => toggleCollapse(e.id)} className="w-4 text-[10px] text-gray-400">{isCollapsed ? "▶" : "▼"}</button>}
          <span style={{ color: et.color }}>{et.icon}</span>
          <span className="font-mono text-[10px] text-gray-500">{resolveEventAge(e, baseEvents)}歳{e.ageOffset != null ? ` (+${e.ageOffset})` : ""}</span>
          <span className={`min-w-0 flex-1 truncate text-gray-600 ${excluded || isDisabled ? "line-through" : ""}`} title={e.label}>{e.label}</span>
          {e.parentalLeave && <span className="shrink-0 rounded bg-pink-50 px-1 text-[9px] text-pink-600" title="育休">🍼{e.parentalLeave.self?.months ?? 0}/{e.parentalLeave.spouse?.months ?? 0}</span>}
          {e.durationYears > 0 && <span className="text-[10px] text-gray-400">({e.durationYears}年)</span>}
          {e.annualCostMan > 0 && <span className="text-[10px] text-gray-400">{e.annualCostMan}万/年</span>}
          {e.oneTimeCostMan > 0 && <span className="text-[10px] text-gray-400">+{e.oneTimeCostMan}万</span>}
          {hasChildren && isCollapsed && <span className="text-[10px] text-gray-400">({children.length}件 計{totalChildCost}万)</span>}
          {!indent && !excluded && <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => onUnlink(e)} className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500" title="Aにリンク中（クリックで独自設定に切替）">🔗A</button>
            <input type="checkbox" checked={!isDisabled} onChange={() => onToggleDisable(e.id)} className="h-3 w-3 accent-blue-600" title={isDisabled ? "有効にする" : "無効にする"} />
          </div>}
          {!indent && excluded && <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => onRelink(e.id)} className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600" title="独自設定中（クリックでAにリンクを戻す）">✏️独自</button>
          </div>}
        </div>
        {hasChildren && !isCollapsed && children.map(c => renderBaseEvent(c, true, excluded, isDisabled))}
      </div>
    );
  };
  return (
    <div className="mb-1">
      <div className="mb-0.5 flex items-center gap-1 text-[10px] text-gray-400">
        <span className="rounded bg-gray-200 px-1 py-px text-gray-500">🔗A</span>
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
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null);
  const [focusChildId, setFocusChildId] = useState<number | undefined>();
  const openModalFor = (type: ModalType, evt?: LifeEvent | null) => { setOpenModal(type); setEditingEvent(evt ?? null); };
  const closeModal = () => { setOpenModal(null); setEditingEvent(null); setFocusChildId(undefined); };

  const setEvents = (evts: LifeEvent[]) => onChange({ ...scenario, events: evts });
  const addSimpleEvent = (type: string) => {
    const et = EVENT_TYPES[type]; const age = currentAge + 5; const parentId = nextEventId();
    const newEvents: LifeEvent[] = [{ id: parentId, age, type, label: et.label, oneTimeCostMan: et.defaultOnetime, annualCostMan: et.defaultAnnual, durationYears: et.defaultDuration,
      ...(type === "crash" ? { label: "暴落 -50%", marketCrashParams: { dropRate: 50, target: "all" as const } } : {}),
    }];
    if (type === "marriage") newEvents.push({ id: nextEventId(), age, type: "custom", label: "結婚支援金（親）", oneTimeCostMan: -100, annualCostMan: 0, durationYears: 0, parentId, ageOffset: 0 });
    setEvents([...events, ...newEvents].sort((a, b) => a.age - b.age));
  };
  const removeEvent = (id: number) => setEvents(events.filter(e => e.id !== id && e.parentId !== id));
  const updateEvent = <K extends keyof LifeEvent>(id: number, f: K, v: LifeEvent[K]) => setEvents(events.map(e => e.id === id ? { ...e, [f]: v } : e));
  const updateEventMulti = (id: number, patch: Partial<LifeEvent>) => setEvents(events.map(e => e.id === id ? { ...e, ...patch } : e));

  const unlinkBaseEvent = (e: LifeEvent) => {
    const children = baseEvents.filter(c => c.parentId === e.id);
    const toExclude = [e.id, ...children.map(c => c.id)];
    const newParentId = nextEventId();
    onChange({ ...scenario, excludedBaseEventIds: [...excludedIds, ...toExclude], events: [...events, { ...e, id: newParentId }, ...children.map(c => ({ ...c, id: nextEventId(), parentId: newParentId }))].sort((a, b) => a.age - b.age) });
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
  const isModalType = (k: string): k is NonNullable<ModalType> => (MODAL_TYPES as readonly string[]).includes(k);

  return (
    <Section title="ライフイベント" icon="📅" borderColor="#d97706" bgOpen="bg-amber-50/30" open={open} onToggle={onToggle}
      linked={isLinked}
      badge={<span className="font-normal text-gray-400 text-[10px]">({allCount}件{summaryText ? ` ${summaryText}` : ""})</span>}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-gray-400">追加:</span>
        {ADD_BAR_TYPES.map(k => {
          const v = EVENT_TYPES[k];
          return (
            <button key={k} type="button" onClick={() => (isModalType(k) ? openModalFor(k) : addSimpleEvent(k))}
              className="rounded border bg-white px-1.5 py-0.5 text-[10px] hover:border-blue-300 hover:bg-blue-50">{v.icon} {v.label}</button>
          );
        })}
      </div>
      {/* 子供は配列としてまとめて編集（このシナリオ独自のイベントが対象） */}
      <ChildrenModal isOpen={openModal === "child"} onClose={closeModal} events={events} onSave={setEvents}
        currentAge={currentAge} retirementAge={retirementAge} focusChildId={focusChildId} />
      <PropertyModal isOpen={openModal === "property"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
      <CarModal isOpen={openModal === "car"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
      <DeathModal isOpen={openModal === "death"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
      <InsuranceModal isOpen={openModal === "insurance"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
      <PrivatePensionModal isOpen={openModal === "pension_private"} onClose={closeModal} onSave={modalSave} currentAge={currentAge} retirementAge={retirementAge} existingEvent={editingEvent} />
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
            const baseEvt = baseEvents.find(e => e.id === propId);
            if (baseEvt?.propertyParams) {
              const newId = nextEventId();
              const children = baseEvents.filter(c => c.parentId === propId);
              const toExclude = [propId, ...children.map(c => c.id)];
              onChange({
                ...scenario,
                excludedBaseEventIds: [...excludedIds, ...toExclude],
                events: [...events, { ...baseEvt, id: newId, propertyParams: { ...baseEvt.propertyParams!, ...patch } },
                  ...children.map(c => ({ ...c, id: nextEventId(), parentId: newId }))
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
          if (dIds.includes(id)) onChange({ ...scenario, disabledBaseEventIds: dIds.filter(d => !allIds.includes(d)) });
          else onChange({ ...scenario, disabledBaseEventIds: [...dIds, ...allIds] });
        }} />}
      <EventList events={events} updateEvent={updateEvent} updateEventMulti={updateEventMulti} removeEvent={removeEvent} currentAge={currentAge} retirementAge={retirementAge}
        label={isLinked && events.length > 0 ? "✏️独自イベント" : undefined}
        onEdit={(e) => (isModalType(e.type) ? openModalFor(e.type, e) : undefined)}
        onEditChild={(e) => { setFocusChildId(e.id); setOpenModal("child"); }} />
      {events.length === 0 && baseEvents.length === 0 && <div className="pl-2 text-[10px] text-gray-400">イベントなし。上のボタンから追加してください</div>}
    </Section>
  );
}
