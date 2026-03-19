import React, { useState, useCallback, useMemo } from "react";
import type { Keyframe, LifeEvent, Scenario, TrackKey, SettingKey, SpouseConfig, NISAConfig, BalancePolicy, DCReceiveMethod, SocialInsuranceParams, PropertyParams, HousingPhase } from "../lib/types";
import { DEFAULT_DC_RECEIVE_METHOD, DEFAULT_SI_PARAMS } from "../lib/types";
import { sortKF, EVENT_TYPES, resolveEventAge } from "../lib/types";
import { ChildEventModal } from "./ChildEventModal";
import { PropertyModal } from "./PropertyModal";
import { Modal } from "./ui";
import { CarModal } from "./CarModal";
import { DeathModal } from "./DeathModal";
import { InsuranceModal } from "./InsuranceModal";
import { GiftModal } from "./GiftModal";
import { RelocationModal } from "./RelocationModal";
import { buildLoanSchedule } from "../lib/calc";
import { calcPropertyCapitalGainsTax } from "../lib/tax";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

// リンクバッジ共通
const LinkBadge = ({ linked }: { linked?: boolean }) =>
  linked ? <span className="text-[9px] bg-gray-200 text-gray-500 rounded px-1 py-px">🔗A</span> : null;

// 折りたたみセクション共通ラッパー（grid-rows アニメーション）
function Section({ title, icon, borderColor, bgOpen, open, onToggle, badge, right, children, linked }: {
  title: string; icon?: string; borderColor: string; bgOpen?: string;
  open: boolean; onToggle: () => void; badge?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
  linked?: boolean;
}) {
  return (
    <div className={`rounded-md border-l-[3px] transition-colors duration-150 ${open ? bgOpen || "bg-gray-50/50" : "hover:bg-gray-50/50"}`} style={{ borderLeftColor: borderColor }}>
      <div className={`flex items-center justify-between px-2 py-1.5 cursor-pointer select-none rounded-r-md ${!open ? "hover:bg-gray-100/60" : ""}`} onClick={onToggle}>
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] w-4 text-center transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`} style={{ color: borderColor }}>▼</span>
          {icon && <span className="text-xs">{icon}</span>}
          <span className="text-xs font-bold" style={{ color: borderColor }}>{title}</span>
          <LinkBadge linked={linked} />
          {badge}
        </div>
        {right && <div onClick={e => e.stopPropagation()}>{right}</div>}
      </div>
      <div className="grid transition-[grid-template-rows] duration-200 ease-in-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="px-2 pb-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

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
const TYPE_ORDER: Record<string, number> = { child: 0, education: 0, property: 1, car: 2, insurance: 3, nursing: 4, death: 5, marriage: 6, rent: 7, travel: 8, custom: 9 };
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
  { key: "expenseKF", label: "基本生活費(世帯)", unit: "万円/月", defaultValue: 15, step: 1 },
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
            <button onClick={onToggleLink} className={`text-[10px] rounded px-1.5 py-0.5 ${linked ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-600"}`}
              title={linked ? "Aにリンク中（クリックで独自設定）" : "独自設定中（クリックでAにリンク）"}>
              {linked ? "🔗A" : "✏️独自"}
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
  dcReceiveMethod?: DCReceiveMethod;
  siParams?: SocialInsuranceParams;
}

const DEFAULT_DC_RM = DEFAULT_DC_RECEIVE_METHOD;

function MemberEditor({ label, color, data, onUpdate, currentAge, retirementAge, extraFields, linked, readOnly, baseData, trackLinked, onToggleTrack, excludeTracks, dcLinked, onToggleDCLink, open, onToggle, enabled, onToggleEnabled, enabledLabel }: {
  label: string; color: string;
  data: MemberData;
  onUpdate: (patch: Partial<MemberData & Record<string, any>>) => void;
  currentAge: number; retirementAge: number;
  extraFields?: React.ReactNode;
  linked?: boolean; readOnly?: boolean;
  baseData?: MemberData;
  trackLinked?: (key: TrackKey) => boolean;
  onToggleTrack?: (key: TrackKey) => void;
  excludeTracks?: TrackKey[];
  dcLinked?: boolean;
  onToggleDCLink?: () => void;
  open: boolean;
  onToggle: () => void;
  enabled?: boolean;              // undefined = always enabled (no toggle shown)
  onToggleEnabled?: (v: boolean) => void;
  enabledLabel?: string;
}) {
  const isRO = readOnly && linked;
  // When linked & readOnly, display base data for scalar settings
  const display = isRO && baseData ? baseData : data;
  const rm = (dcLinked && baseData ? baseData.dcReceiveMethod : data.dcReceiveMethod) || DEFAULT_DC_RM;
  const setRM = (patch: Partial<DCReceiveMethod>) => onUpdate({ dcReceiveMethod: { ...rm, ...patch } });

  const isDisabled = enabled != null && !enabled;
  const summary = `昇給${display.salaryGrowthRate}% ${rm.type === "lump_sum" ? "一時金" : rm.type === "annuity" ? `年金${rm.annuityYears}年` : "併用"}`;
  return (
    <Section title={label} borderColor={color} bgOpen="bg-slate-50/60" open={!isDisabled && open} onToggle={isDisabled ? () => {} : onToggle}
      linked={linked}
      badge={isDisabled ? <span className="text-[9px] text-gray-400">無効</span> : <span className="font-normal text-gray-400 text-[10px]">({summary})</span>}
      right={onToggleEnabled ? (
        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
          <input type="checkbox" checked={!!enabled} onChange={e => onToggleEnabled(e.target.checked)} className="accent-pink-600" />
          <span className="text-gray-500">{enabledLabel || "有効"}</span>
        </label>
      ) : undefined}>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2 text-xs">
          {extraFields}
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">昇給率</span>
            <input type="number" value={display.salaryGrowthRate} step={0.5} onChange={e => onUpdate({ salaryGrowthRate: Number(e.target.value) })} className="w-14 rounded border px-1 py-0.5 text-xs" disabled={isRO} />
            <span className="text-[10px] text-gray-400">%</span>
          </div>
          <details className="text-[10px]">
            <summary className="cursor-pointer text-gray-500 flex items-center gap-1">
              社保
              <span className="font-mono text-gray-700">詳細</span>
            </summary>
            <div className="mt-1 rounded border p-1.5 space-y-0.5 bg-gray-50">
              <div className="text-gray-400">厚生年金 9.15%(固定) 雇用 0.60%(固定)</div>
              {([
                ["healthInsuranceRate", "健保率"] as const,
                ["nursingInsuranceRate", "介護率"] as const,
                ["childSupportRate", "子育支援"] as const,
              ] as const).map(([key, lbl]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className="text-gray-500 w-12">{lbl}</span>
                  <input type="number" value={(display.siParams || DEFAULT_SI_PARAMS)[key]} step={0.05} min={0}
                    onChange={e => onUpdate({ siParams: { ...(display.siParams || DEFAULT_SI_PARAMS), [key]: Number(e.target.value) } })}
                    className="w-14 rounded border px-1 py-0.5" disabled={isRO} />
                  <span className="text-gray-400">%</span>
                </div>
              ))}
            </div>
          </details>
          <label className="flex items-center gap-1 text-[10px] cursor-pointer">
            <input type="checkbox" checked={display.hasFurusato} onChange={e => onUpdate({ hasFurusato: e.target.checked })} className="accent-blue-600" disabled={isRO} />
            <span className="text-gray-500">ふるさと納税</span>
          </label>
        </div>
        {/* Track rows */}
        {TRACKS.filter(t => !excludeTracks?.includes(t.key)).map(t => {
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
        {/* DC/iDeCo受取方法 — 統合 */}
        <div className="border-t pt-1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-gray-600">DC受取</span>
              {(["lump_sum", "annuity", "combined"] as const).map(t => (
              <button key={t} onClick={() => setRM({ type: t })} disabled={dcLinked}
                className={`rounded px-1.5 py-0.5 text-[10px] ${rm.type === t ? "bg-orange-600 text-white" : "bg-gray-100"}`}>
                {t === "lump_sum" ? "一時金" : t === "annuity" ? "年金" : "併用"}
              </button>
            ))}
            </div>
            {onToggleDCLink && (
              <button onClick={onToggleDCLink} className={`text-[10px] rounded px-1.5 py-0.5 ${dcLinked ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-600"}`}
                title={dcLinked ? "Aにリンク中（クリックで独自設定）" : "独自設定中（クリックでAにリンク）"}>
                {dcLinked ? "🔗A" : "✏️独自"}
              </button>
            )}
          </div>
          <div className={`flex flex-wrap gap-2 pl-2 ${dcLinked ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[10px]">受取開始</span>
              <input type="number" value={rm.annuityStartAge} min={60} max={75} step={1} disabled={dcLinked}
                onChange={e => setRM({ annuityStartAge: Number(e.target.value) })} className="w-12 rounded border px-1 py-0.5 text-xs" />
              <span className="text-[10px] text-gray-400">歳</span>
            </div>
          {(rm.type === "annuity" || rm.type === "combined") && (<>
              <div className="flex items-center gap-0.5">
                {[5, 10, 15, 20].map(y => (
                  <button key={y} onClick={() => setRM({ annuityYears: y })} disabled={dcLinked}
                    className={`rounded px-1 py-0.5 text-[10px] ${rm.annuityYears === y ? "bg-orange-600 text-white" : "bg-gray-100"}`}>{y}年</button>
                ))}
              </div>
              {rm.type === "combined" && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 text-[10px]">一時金</span>
                  <input type="number" value={rm.combinedLumpSumRatio} min={10} max={90} step={10} disabled={dcLinked}
                    onChange={e => setRM({ combinedLumpSumRatio: Number(e.target.value) })} className="w-12 rounded border px-1 py-0.5 text-xs" />
                  <span className="text-[10px] text-gray-400">%</span>
                </div>
              )}
            </>)}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ===== Collapsible Event List =====
function EventList({ events, updateEvent, updateEventMulti, removeEvent, currentAge, retirementAge, label, onEditProperty, onEditCar, onEditDeath, onEditInsurance, onEditGift, onEditRelocation, onEditChild }: {
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
  onEditGift?: (e: LifeEvent) => void;
  onEditRelocation?: (e: LifeEvent) => void;
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
          {e.propertyParams && onEditProperty && <button onClick={() => onEditProperty(e)} className="text-[10px] rounded px-1 py-0.5 bg-blue-100 text-blue-600">✏️</button>}
          {e.carParams && onEditCar && <button onClick={() => onEditCar(e)} className="text-[10px] rounded px-1 py-0.5 bg-green-100 text-green-600">✏️</button>}
          {e.deathParams && onEditDeath && <button onClick={() => onEditDeath(e)} className="text-[10px] rounded px-1 py-0.5 bg-gray-200 text-gray-600">✏️</button>}
          {e.insuranceParams && onEditInsurance && <button onClick={() => onEditInsurance(e)} className="text-[10px] rounded px-1 py-0.5 bg-indigo-100 text-indigo-600">✏️</button>}
          {e.giftParams && onEditGift && <button onClick={() => onEditGift(e)} className="text-[10px] rounded px-1 py-0.5 bg-purple-100 text-purple-600">✏️</button>}
          {e.relocationParams && onEditRelocation && <button onClick={() => onEditRelocation(e)} className="text-[10px] rounded px-1 py-0.5 bg-cyan-100 text-cyan-600">✏️</button>}
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
function EventSection({ scenario, onChange, currentAge, retirementAge, baseScenario, isLinked, open, onToggle }: {
  scenario: Scenario; onChange: (s: Scenario) => void;
  currentAge: number; retirementAge: number;
  baseScenario?: Scenario | null; isLinked: boolean;
  open: boolean; onToggle: () => void;
}) {
  const events = scenario.events || [];
  const baseEvents = (isLinked && baseScenario) ? (baseScenario.events || []) : [];
  const excludedIds = scenario.excludedBaseEventIds || [];
  type ModalType = "child" | "property" | "car" | "death" | "insurance" | "gift" | "relocation" | null;
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null);
  const [editingChildEvents, setEditingChildEvents] = useState<LifeEvent[]>([]);
  const openModalFor = (type: ModalType, evt?: LifeEvent | null) => { setOpenModal(type); setEditingEvent(evt ?? null); };
  const closeModal = () => { setOpenModal(null); setEditingEvent(null); setEditingChildEvents([]); };

  const setEvents = (evts: LifeEvent[]) => onChange({ ...scenario, events: evts });
  const addSimpleEvent = (type: string) => {
    const et = EVENT_TYPES[type]; const age = currentAge + 5; const parentId = Date.now();
    const newEvents: LifeEvent[] = [{ id: parentId, age, type, label: et.label, oneTimeCostMan: et.defaultOnetime, annualCostMan: et.defaultAnnual, durationYears: et.defaultDuration }];
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
            if (["child", "property", "car", "death", "insurance", "gift", "relocation"].includes(k)) { openModalFor(k as ModalType); }
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
        onEditProperty={(e) => openModalFor("property", e)} onEditCar={(e) => openModalFor("car", e)}
        onEditDeath={(e) => openModalFor("death", e)} onEditInsurance={(e) => openModalFor("insurance", e)}
        onEditGift={(e) => openModalFor("gift", e)} onEditRelocation={(e) => openModalFor("relocation", e)}
        onEditChild={(e) => { const childEvts = [e, ...events.filter(c => c.parentId === e.id)]; setEditingChildEvents(childEvts); setOpenModal("child"); }} />
      {events.length === 0 && baseEvents.length === 0 && <div className="text-[10px] text-gray-400 pl-2">イベントなし</div>}
    </Section>
  );
}

// ===== Housing Timeline Section =====

function HousingSection({ s, onChange, currentAge, retirementAge, open, onToggle, allEvents, isLinked, baseScenario }: {
  s: Scenario; onChange: (s: Scenario) => void;
  currentAge: number; retirementAge: number;
  open: boolean; onToggle: () => void;
  allEvents: LifeEvent[];
  isLinked?: boolean; baseScenario?: Scenario | null;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addingType, setAddingType] = useState<"rent" | "own" | null>(null);
  const linked = !!(isLinked && baseScenario);
  const inheritedFromBase = !s.housingTimeline && linked && !!baseScenario?.housingTimeline;
  const DEFAULT_PP: PropertyParams = {
    priceMan: 5000, downPaymentMan: 500, loanYears: 35, repaymentType: "equal_payment",
    rateType: "variable", fixedRate: 1.8, variableInitRate: 0.5, variableRiskRate: 1.5, variableRiseAfter: 10,
    maintenanceMonthlyMan: 2, taxAnnualMan: 15, hasLoanDeduction: true,
    loanStructure: "single", pairRatio: 50, deductionTarget: "self", danshinTarget: "self",
  };

  const phases: HousingPhase[] = useMemo(() => {
    if (s.housingTimeline?.length) return s.housingTimeline;
    if (inheritedFromBase && baseScenario?.housingTimeline) return baseScenario.housingTimeline;
    return [{ startAge: currentAge, type: "rent" as const, rentMonthlyMan: 10 }];
  }, [s.housingTimeline, inheritedFromBase, baseScenario?.housingTimeline, currentAge]);

  const setPhases = (p: HousingPhase[]) => onChange({ ...s, housingTimeline: p });
  const updatePhase = (i: number, patch: Partial<HousingPhase>) => { const np = [...phases]; np[i] = { ...np[i], ...patch }; setPhases(np); };
  const removePhase = (i: number) => {
    const np = [...phases];
    // 前フェーズが持家で売却年齢が削除するフェーズに連動していたらクリア
    if (i > 0 && np[i - 1].type === "own" && np[i - 1].propertyParams?.saleAge === np[i].startAge) {
      np[i - 1] = { ...np[i - 1], propertyParams: { ...np[i - 1].propertyParams!, saleAge: undefined, salePriceMan: undefined, appreciationRate: undefined } };
    }
    const result = np.filter((_, j) => j !== i);
    setPhases(result.length ? result : [{ startAge: currentAge, type: "rent", rentMonthlyMan: 10 }]);
  };

  const simEnd = s.simEndAge ?? 85;
  const phaseEnd = (i: number) => i < phases.length - 1 ? phases[i + 1].startAge : simEnd;
  const isManaged = !!s.housingTimeline;
  const isReadOnly = inheritedFromBase && !isManaged;
  const canEdit = isManaged && !isReadOnly;
  if (!s.housingTimeline && !isReadOnly) { setTimeout(() => setPhases(phases), 0); }

  const saleEstimate = (phase: HousingPhase, nextAge: number) => {
    if (phase.type !== "own" || !phase.propertyParams) return null;
    const pp = phase.propertyParams, ys = nextAge - phase.startAge;
    if (ys <= 0) return null;
    const price = pp.priceMan * 10000;
    const sp = pp.salePriceMan != null ? pp.salePriceMan * 10000 : Math.round(price * Math.pow(1 + (pp.appreciationRate ?? -1) / 100, ys));
    const sch = buildLoanSchedule(pp, phase.startAge);
    const rem = ys < sch.length ? sch[ys]?.balance ?? 0 : 0;
    const cgt = calcPropertyCapitalGainsTax(price, sp, ys, pp.saleIsResidence ?? true, pp.saleCostRate ?? 4);
    const cost = Math.round(sp * (pp.saleCostRate ?? 4) / 100);
    return { sp, rem, cost, tax: cgt.tax, net: sp - rem - cost - cgt.tax };
  };

  const summary = phases.map((p, i) => p.type === "rent" ? `賃貸${p.startAge}-${phaseEnd(i)}` : `持家${p.startAge}-${phaseEnd(i)}`).join("→");
  const [tempPhase, setTempPhase] = useState<HousingPhase | null>(null);

  const openAdd = (type: "rent" | "own") => {
    const lastEnd = phases.length > 0 ? phases[phases.length - 1].startAge + 10 : currentAge;
    setTempPhase(type === "rent" ? { startAge: lastEnd, type: "rent", rentMonthlyMan: 10 } : { startAge: lastEnd, type: "own", propertyParams: { ...DEFAULT_PP } });
    setAddingType(type);
  };
  const saveNewPhase = (phase: HousingPhase) => { setPhases([...phases, phase].sort((a, b) => a.startAge - b.startAge)); setAddingType(null); setTempPhase(null); };
  const editPhase = editingIdx != null ? phases[editingIdx] : null;

  return (
    <Section title="住居プラン" icon="🏠" borderColor="#3b82f6" bgOpen="bg-blue-50/30" open={open} onToggle={onToggle}
      linked={isReadOnly} badge={<span className="font-normal text-gray-400 text-[10px]">({summary})</span>}
      right={linked && baseScenario?.housingTimeline ? (
        <button onClick={() => isReadOnly ? setPhases([...phases]) : onChange({ ...s, housingTimeline: undefined })}
          className={`text-[10px] px-1.5 py-0.5 rounded ${isReadOnly ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-600"}`}
          title={isReadOnly ? "Aにリンク中（クリックで独自設定）" : "独自設定中（クリックでAにリンク）"}
        >{isReadOnly ? "🔗A" : "✏️独自"}</button>
      ) : undefined}>
      <div className="space-y-1.5">
        <div className="flex rounded overflow-hidden h-6 border border-gray-200">
          {phases.map((p, i) => {
            const end = phaseEnd(i);
            return (
              <div key={i} className={`${p.type === "own" ? "bg-blue-400" : "bg-gray-300"} relative group flex items-center justify-center text-[8px] text-white font-bold cursor-pointer hover:opacity-80`}
                style={{ width: `${Math.max((end - p.startAge) / (simEnd - currentAge) * 100, 3)}%` }}
                onClick={() => canEdit && setEditingIdx(i)}>
                {p.type === "own" ? `🏠${p.propertyParams?.priceMan ?? "?"}万` : `🏢${p.rentMonthlyMan ?? "?"}万/月`}
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded px-2 py-1 text-[9px] whitespace-nowrap z-10 mb-1">
                  {p.startAge}〜{end}歳({end - p.startAge}年) {p.type === "own" ? "持家" : `賃貸${p.rentMonthlyMan}万/月`}{canEdit ? " クリックで編集" : ""}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[8px] text-gray-400"><span>{currentAge}歳</span><span>{simEnd}歳</span></div>

        {phases.map((p, i) => {
          const end = phaseEnd(i);
          const next = i < phases.length - 1 ? phases[i + 1] : null;
          const sale = next ? saleEstimate(p, end) : null;
          return (
            <div key={i} className={`rounded border p-1.5 text-[10px] space-y-0.5 ${p.type === "own" ? "border-blue-200 bg-blue-50/30" : "border-gray-200"}`}>
              <div className="flex items-center gap-1.5">
                <span className="font-bold">{p.type === "own" ? "🏠" : "🏢"}</span>
                <span className="text-gray-500">{p.startAge}〜{end}歳</span>
                {p.type === "rent" && <span className="text-gray-600">{p.rentMonthlyMan}万/月（年{(p.rentMonthlyMan ?? 0) * 12}万）</span>}
                {p.type === "own" && p.propertyParams && <span className="text-blue-600">{p.propertyParams.priceMan}万</span>}
                {canEdit && <button onClick={() => setEditingIdx(i)} className="text-blue-500 hover:underline ml-auto">✏️</button>}
                {canEdit && phases.length > 1 && <button onClick={() => removePhase(i)} className="text-gray-300 hover:text-red-500">×</button>}
              </div>
              {sale && p.type === "own" && (
                <div className="flex flex-wrap items-center gap-1 text-[9px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                  →売却 {Math.round(sale.sp / 10000)}万 残債{Math.round(sale.rem / 10000)}万 税{Math.round(sale.tax / 10000)}万
                  <span className="font-bold text-green-700">手取{Math.round(sale.net / 10000)}万</span>
                  {next?.type === "own" && next.propertyParams && <span className="text-blue-600">→頭金{next.propertyParams.downPaymentMan}万</span>}
                </div>
              )}
            </div>
          );
        })}

        {canEdit && (
          <div className="flex gap-1.5">
            <button onClick={() => openAdd("rent")} className="rounded border px-2 py-0.5 text-[10px] hover:bg-gray-50">+ 🏢 賃貸</button>
            <button onClick={() => openAdd("own")} className="rounded border px-2 py-0.5 text-[10px] hover:bg-blue-50">+ 🏠 購入</button>
          </div>
        )}

        {/* 賃貸モーダル（編集） */}
        {editingIdx != null && editPhase?.type === "rent" && (
          <Modal isOpen={true} onClose={() => setEditingIdx(null)} title="🏢 賃貸設定" onSave={() => setEditingIdx(null)} saveLabel="閉じる">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-semibold text-gray-600 mb-1">開始年齢</label>
                <input type="number" value={editPhase.startAge} min={currentAge} max={simEnd - 1}
                  onChange={e => updatePhase(editingIdx, { startAge: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
              <div><label className="block font-semibold text-gray-600 mb-1">月額家賃（万円/月）</label>
                <input type="number" value={editPhase.rentMonthlyMan ?? 10} step={0.5} min={0}
                  onChange={e => updatePhase(editingIdx, { rentMonthlyMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
            </div>
            <div className="rounded bg-blue-50 p-2 text-gray-700">年額: <b>{((editPhase.rentMonthlyMan ?? 10) * 12)}万円/年</b></div>
          </Modal>
        )}
        {/* 賃貸モーダル（新規） */}
        {addingType === "rent" && tempPhase && (
          <Modal isOpen={true} onClose={() => { setAddingType(null); setTempPhase(null); }} title="🏢 賃貸追加"
            onSave={() => saveNewPhase(tempPhase)} saveLabel="追加">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-semibold text-gray-600 mb-1">開始年齢</label>
                <input type="number" value={tempPhase.startAge} min={currentAge} max={simEnd - 1}
                  onChange={e => setTempPhase({ ...tempPhase, startAge: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
              <div><label className="block font-semibold text-gray-600 mb-1">月額家賃（万円/月）</label>
                <input type="number" value={tempPhase.rentMonthlyMan ?? 10} step={0.5} min={0}
                  onChange={e => setTempPhase({ ...tempPhase, rentMonthlyMan: Number(e.target.value) })} className="w-full rounded border px-2 py-1.5" /></div>
            </div>
            <div className="rounded bg-blue-50 p-2 text-gray-700">年額: <b>{((tempPhase.rentMonthlyMan ?? 10) * 12)}万円/年</b></div>
          </Modal>
        )}
        {/* 購入モーダル（編集） */}
        {editingIdx != null && editPhase?.type === "own" && editPhase.propertyParams && (() => {
          // 次フェーズがあれば売却年齢を自動設定
          const nextPhaseStartAge = editingIdx < phases.length - 1 ? phases[editingIdx + 1].startAge : undefined;
          const ppWithSale = nextPhaseStartAge
            ? { ...editPhase.propertyParams, saleAge: editPhase.propertyParams.saleAge ?? nextPhaseStartAge }
            : editPhase.propertyParams;
          return <PropertyModal isOpen={true} onClose={() => setEditingIdx(null)}
            onSave={(evt) => {
              if (evt.propertyParams) {
                updatePhase(editingIdx, { propertyParams: evt.propertyParams, startAge: evt.age });
                // 売却年齢が変更されたら次フェーズのstartAgeも連動
                if (evt.propertyParams.saleAge && editingIdx < phases.length - 1) {
                  const np = [...phases];
                  np[editingIdx + 1] = { ...np[editingIdx + 1], startAge: evt.propertyParams.saleAge };
                  np[editingIdx] = { ...np[editingIdx], propertyParams: evt.propertyParams, startAge: evt.age };
                  setPhases(np);
                }
              }
              setEditingIdx(null);
            }}
            currentAge={editPhase.startAge} retirementAge={simEnd}
            existingEvent={{ id: -1, age: editPhase.startAge, type: "property", label: "", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0, propertyParams: ppWithSale }} />;
        })()}
        {/* 購入モーダル（新規） */}
        {addingType === "own" && tempPhase?.propertyParams && (
          <PropertyModal isOpen={true} onClose={() => { setAddingType(null); setTempPhase(null); }}
            onSave={(evt) => { if (evt.propertyParams) saveNewPhase({ startAge: evt.age, type: "own", propertyParams: evt.propertyParams }); }}
            currentAge={tempPhase.startAge} retirementAge={simEnd} />
        )}
      </div>
    </Section>
  );
}
// ===== NISA / Balance Policy Section =====


function NISASection({ s, onChange, isLinked, baseScenario, open, onToggle }: { s: Scenario; onChange: (s: Scenario) => void; isLinked?: boolean; baseScenario?: Scenario | null; open: boolean; onToggle: () => void }) {
  const defaultNi: NISAConfig = { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800, returnRate: 5 };
  const ni = s.nisa || defaultNi;
  const baseS = isLinked && baseScenario ? baseScenario : null;
  const inheritedFromBase = !ni.enabled && baseS?.nisa?.enabled;
  const effNi = inheritedFromBase ? baseS!.nisa! : ni;
  const bp = s.balancePolicy || (baseS?.balancePolicy ? baseS.balancePolicy : { cashReserveMonths: 6, nisaPriority: true });
  const setNISA = (patch: Partial<NISAConfig>) => onChange({ ...s, nisa: { ...ni, ...patch } });
  const setBP = (patch: Partial<BalancePolicy>) => onChange({ ...s, balancePolicy: { ...bp, ...patch } });

  return (
    <Section title="NISA / 投資" icon="📈" borderColor="#16a34a" bgOpen="bg-green-50/30" open={open} onToggle={onToggle}
      linked={!!inheritedFromBase}
      badge={effNi.enabled ? <span className="font-normal text-gray-400 text-[10px]">(有効)</span> : undefined}
      right={
        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
          <input type="checkbox" checked={ni.enabled || !!inheritedFromBase} onChange={e => setNISA({ enabled: e.target.checked })} className="accent-green-600" />
          <span className="text-gray-500">有効</span>
        </label>
      }>
      {ni.enabled && (
        <div className="space-y-1.5 text-xs">
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[10px]">口座</span>
              <button onClick={() => setNISA({ accounts: 1 })} className={`rounded px-1.5 py-0.5 text-[10px] ${ni.accounts === 1 ? "bg-green-600 text-white" : "bg-gray-100"}`}>本人</button>
              <button onClick={() => setNISA({ accounts: 2 })} className={`rounded px-1.5 py-0.5 text-[10px] ${ni.accounts === 2 ? "bg-green-600 text-white" : "bg-gray-100"}`}>夫婦2</button>
            </div>
            <div className="flex items-center gap-1"><span className="text-gray-500 text-[10px]">年間枠</span><input type="number" value={ni.annualLimitMan} step={10} onChange={e => setNISA({ annualLimitMan: Number(e.target.value) })} className="w-16 rounded border px-1 py-0.5 text-xs" /><span className="text-[10px] text-gray-400">万/人</span></div>
            <div className="flex items-center gap-1"><span className="text-gray-500 text-[10px]">生涯枠</span><input type="number" value={ni.lifetimeLimitMan} step={100} onChange={e => setNISA({ lifetimeLimitMan: Number(e.target.value) })} className="w-16 rounded border px-1 py-0.5 text-xs" /><span className="text-[10px] text-gray-400">万/人</span></div>
          </div>
          <div className="text-[10px] text-gray-400">合計: 年{ni.annualLimitMan * (ni.accounts || 1)}万 / 生涯{ni.lifetimeLimitMan * (ni.accounts || 1)}万 ｜ NISA非課税、超過→特定口座(20.315%課税)</div>
          {/* Phase 3: 個別利回り */}
          <div className="border-t border-green-100 pt-1">
            <details className="text-[10px]">
              <summary className="cursor-pointer font-semibold text-gray-600">
                利回り設定
                <span className="font-normal text-gray-400 ml-1">
                  {(s.dcReturnRate != null || s.nisaReturnRate != null || s.taxableReturnRate != null || s.cashInterestRate != null)
                    ? `(個別: DC${s.dcReturnRate ?? "共通"}% NISA${s.nisaReturnRate ?? "共通"}% 特定${s.taxableReturnRate ?? "共通"}% 現金${s.cashInterestRate ?? 0}%)`
                    : "(共通利回りを使用)"}
                </span>
              </summary>
              <div className="mt-1 space-y-1 bg-green-50 rounded p-1.5">
                <div className="text-gray-500">未設定の場合、グローバル運用利回り(rr)が適用されます</div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">DC</span>
                    <input type="number" value={s.dcReturnRate ?? ""} step={0.5} placeholder="共通"
                      onChange={e => onChange({ ...s, dcReturnRate: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">NISA</span>
                    <input type="number" value={s.nisaReturnRate ?? ""} step={0.5} placeholder="共通"
                      onChange={e => onChange({ ...s, nisaReturnRate: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">特定口座</span>
                    <input type="number" value={s.taxableReturnRate ?? ""} step={0.5} placeholder="共通"
                      onChange={e => onChange({ ...s, taxableReturnRate: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">現金</span>
                    <input type="number" value={s.cashInterestRate ?? 0} step={0.1} min={0}
                      onChange={e => onChange({ ...s, cashInterestRate: Number(e.target.value) || undefined })}
                      className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%</span>
                  </div>
                </div>
              </div>
            </details>
          </div>
          <div className="border-t border-green-100 pt-1">
            <span className="text-[10px] font-semibold text-gray-600">残高ポリシー</span>
            <div className="flex flex-wrap gap-2 mt-0.5">
              <div className="flex items-center gap-1"><span className="text-gray-500 text-[10px]">防衛資金</span><input type="number" value={bp.cashReserveMonths} step={1} min={0} onChange={e => setBP({ cashReserveMonths: Number(e.target.value) })} className="w-12 rounded border px-1 py-0.5 text-xs" /><span className="text-[10px] text-gray-400">ヶ月分</span></div>
              <label className="flex items-center gap-1 text-[10px] cursor-pointer"><input type="checkbox" checked={bp.nisaPriority} onChange={e => setBP({ nisaPriority: e.target.checked })} className="accent-green-600" /><span className="text-gray-500">余剰→NISA/特定優先</span></label>
            </div>
            {/* Phase 8: 引出戦略 */}
            <details className="text-[10px] mt-1">
              <summary className="cursor-pointer text-gray-500">引出順序{bp.withdrawalOrder ? " (カスタム)" : " (デフォルト)"}</summary>
              <div className="mt-1 space-y-1 bg-gray-50 rounded p-1.5">
                <div className="text-gray-400">資産取り崩し順序（上から優先）</div>
                {(() => {
                  const order = bp.withdrawalOrder || ["taxable", "spouseNisa", "selfNisa"];
                  const labels: Record<string, string> = { taxable: "特定口座", spouseNisa: "配偶者NISA", selfNisa: "本人NISA" };
                  const moveUp = (i: number) => { if (i <= 0) return; const o = [...order]; [o[i - 1], o[i]] = [o[i], o[i - 1]]; setBP({ withdrawalOrder: o as any }); };
                  const moveDown = (i: number) => { if (i >= order.length - 1) return; const o = [...order]; [o[i], o[i + 1]] = [o[i + 1], o[i]]; setBP({ withdrawalOrder: o as any }); };
                  return order.map((src, i) => (
                    <div key={src} className="flex items-center gap-1">
                      <span className="w-4 text-center text-gray-400">{i + 1}.</span>
                      <span className="flex-1">{labels[src]}</span>
                      <button onClick={() => moveUp(i)} className="text-gray-400 hover:text-blue-500" disabled={i === 0}>▲</button>
                      <button onClick={() => moveDown(i)} className="text-gray-400 hover:text-blue-500" disabled={i === order.length - 1}>▼</button>
                    </div>
                  ));
                })()}
                {bp.withdrawalOrder && <button onClick={() => setBP({ withdrawalOrder: undefined })} className="text-blue-500 hover:underline">デフォルトに戻す</button>}
              </div>
            </details>
          </div>
        </div>
      )}
    </Section>
  );
}

// ===== Scenario Settings Section =====
function ScenarioSettingsSection({ s, onChange, isLinked, baseScenario, open, onToggle }: {
  s: Scenario; onChange: (s: Scenario) => void;
  isLinked: boolean; baseScenario?: Scenario | null;
  open: boolean; onToggle: () => void;
}) {
  const sp = s.spouse;
  // Global settings link: linked when overrideSettings is empty/undefined
  const settingsLocked = isLinked && !(s.overrideSettings && s.overrideSettings.length > 0);
  const toggleSettingsLock = () => {
    if (!isLinked) return;
    if (settingsLocked) {
      // Unlock: mark all settings as overridden (copy base values)
      const allKeys: SettingKey[] = ["currentAge", "retirementAge", "simEndAge", "currentAssetsMan", "selfGender", "years", "dependentDeductionHolder", "pensionStartAge", "pensionWorkStartAge"];
      const copied: any = {};
      for (const k of allKeys) copied[k] = baseScenario ? (baseScenario as any)[k] ?? (s as any)[k] : (s as any)[k];
      onChange({ ...s, overrideSettings: allKeys, ...copied });
    } else {
      // Re-lock: clear overrides
      onChange({ ...s, overrideSettings: [] });
    }
  };
  // Display value: base if locked, own if unlocked
  const val = (key: string, fallback?: any) => {
    if (settingsLocked && baseScenario) return (baseScenario as any)[key] ?? fallback;
    return (s as any)[key] ?? fallback;
  };
  const ro = settingsLocked; // read-only shorthand

  return (
    <Section title="シナリオ設定" icon="⚙" borderColor="#6b7280" bgOpen="bg-gray-50/50" open={open} onToggle={onToggle}
      linked={settingsLocked}
      badge={<span className="font-normal text-gray-400 text-[10px]">(〜{val("simEndAge", 85)}歳 資産{val("currentAssetsMan", 0)}万)</span>}
      right={isLinked ? (
        <button onClick={toggleSettingsLock} className={`text-[10px] px-1.5 py-0.5 rounded ${settingsLocked ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-600"}`}
          title={settingsLocked ? "Aにリンク中（クリックで独自設定）" : "独自設定中（クリックでAにリンク）"}
        >{settingsLocked ? "🔗A" : "✏️独自"}</button>
      ) : undefined}>
        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">シミュ終了</span>
            <input type="number" value={val("simEndAge", 85)} min={val("retirementAge", 65)} max={100} step={5}
              disabled={ro}
              onChange={e => onChange({ ...s, simEndAge: Number(e.target.value) })}
              className={`w-12 rounded border px-1 py-0.5 text-xs ${ro ? "bg-gray-100 text-gray-400" : ""}`} />
            <span className="text-[10px] text-gray-400">歳</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">初期資産</span>
            <input type="number" value={val("currentAssetsMan", 0)} step={100}
              disabled={ro}
              onChange={e => onChange({ ...s, currentAssetsMan: Number(e.target.value) })}
              className={`w-20 rounded border px-1 py-0.5 text-xs ${ro ? "bg-gray-100 text-gray-400" : ""}`} />
            <span className="text-[10px] text-gray-400">万</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">扶養控除</span>
            <button onClick={() => !ro && onChange({ ...s, dependentDeductionHolder: "self" })}
              className={`rounded px-1.5 py-0.5 text-[10px] ${(val("dependentDeductionHolder", "self")) === "self" ? "bg-blue-600 text-white" : "bg-gray-100"} ${ro ? "opacity-50 cursor-not-allowed" : ""}`}>本人</button>
            <button onClick={() => !ro && onChange({ ...s, dependentDeductionHolder: "spouse" })}
              className={`rounded px-1.5 py-0.5 text-[10px] ${val("dependentDeductionHolder", "self") === "spouse" ? "bg-pink-600 text-white" : "bg-gray-100"} ${ro ? "opacity-50 cursor-not-allowed" : ""}`}>配偶者</button>
          </div>
        </div>
    </Section>
  );
}

// ===== Main KeyframeEditor =====
export function KeyframeEditor({ s, onChange, idx, currentAge, retirementAge, baseScenario, sirPct, onChangeBase }: {
  s: Scenario; onChange: (s: Scenario) => void; idx: number;
  currentAge: number; retirementAge: number; baseScenario?: Scenario | null;
  sirPct?: number;
  onChangeBase?: (s: Scenario) => void; // ベースシナリオのonChange（リンク時のsectionOpen同期用）
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
  const defaultSp: SpouseConfig = { enabled: false, currentAge: 28, retirementAge: 65, incomeKF: [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, sirPct: 15.75, hasFurusato: true };
  const sp = s.spouse || defaultSp;
  const baseS = isLinked && baseScenario ? baseScenario : null;
  const baseSp = baseS?.spouse;
  const spInherited = !sp.enabled && !!baseSp?.enabled;
  const effectiveSp = spInherited ? baseSp! : sp;

  // Spouse track linking: per-track, same pattern as main person
  const spouseOT = s.spouseOverrideTracks || [];
  const isSpouseTrackLinked = (key: TrackKey) => spInherited && !spouseOT.includes(key);
  const toggleSpouseTrack = (key: TrackKey) => {
    if (!spInherited || !baseSp) return;
    if (spouseOT.includes(key)) {
      // Re-link: remove from overrides
      onChange({ ...s, spouseOverrideTracks: spouseOT.filter(k => k !== key) });
    } else {
      // Unlink: copy base data for this track, add to overrides
      const baseKFs = [...((baseSp as any)[key] || [])];
      onChange({ ...s, spouseOverrideTracks: [...spouseOT, key], spouse: { ...sp, [key]: baseKFs } });
    }
  };
  const isSpouseDCLinked = spInherited && !sp.dcReceiveMethod;
  const toggleSpouseDCLink = () => {
    if (!spInherited || !baseSp) return;
    if (!sp.dcReceiveMethod) {
      onChange({ ...s, spouse: { ...sp, dcReceiveMethod: baseSp.dcReceiveMethod || DEFAULT_DC_RECEIVE_METHOD } });
    } else {
      onChange({ ...s, spouse: { ...sp, dcReceiveMethod: undefined } });
    }
  };

  // Section open/close: persisted in scenario JSON
  // リンクシナリオはベースの開閉状態を参照し、開閉操作はベース側を更新
  const SECTION_DEFAULTS: Record<string, boolean> = { settings: true, self: false, spouse: false, events: true, nisa: false };
  const ownOpen = s.sectionOpen || {};
  const baseOpen = (isLinked && baseScenario?.sectionOpen) || {};
  const secOpen = (key: string): boolean => {
    if (isLinked) return baseOpen[key] ?? SECTION_DEFAULTS[key] ?? false;
    return ownOpen[key] ?? SECTION_DEFAULTS[key] ?? false;
  };
  const toggleSec = (key: string) => {
    const next = !secOpen(key);
    if (isLinked && baseScenario && onChangeBase) {
      // リンクシナリオ: ベース側の開閉を更新（全シナリオ同期）
      onChangeBase({ ...baseScenario, sectionOpen: { ...baseOpen, [key]: next } });
    } else {
      onChange({ ...s, sectionOpen: { ...ownOpen, [key]: next } });
    }
  };

  // Enable/disable linking: spouse & NISA follow base when linked and not explicitly set
  const spouseEnabled = sp.enabled || spInherited;
  const nisaEnabled = (s.nisa?.enabled) || (!s.nisa?.enabled && isLinked && !!baseScenario?.nisa?.enabled);

  return (
    <div className="rounded-lg border-2 p-3 space-y-1.5" style={{ borderColor: COLORS[idx] }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: COLORS[idx] }}>{s.name}</span>
        {isLinked && <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-2 py-0.5">🔗 Aベース + 差分</span>}
      </div>

      {/* シナリオ設定 */}
      <ScenarioSettingsSection s={s} onChange={onChange} isLinked={isLinked} baseScenario={baseScenario}
        open={secOpen("settings")} onToggle={() => toggleSec("settings")} />

      {/* 本人設定 */}
      <MemberEditor
        label="本人" color="#374151"
        data={{ incomeKF: s.incomeKF, expenseKF: s.expenseKF, dcTotalKF: s.dcTotalKF, companyDCKF: s.companyDCKF, idecoKF: s.idecoKF, salaryGrowthRate: s.salaryGrowthRate, sirPct: sirPct ?? 15.75, hasFurusato: s.hasFurusato, dcReceiveMethod: s.dcReceiveMethod, siParams: s.siParams }}
        onUpdate={(patch) => onChange({ ...s, ...patch })}
        currentAge={currentAge} retirementAge={retirementAge}
        linked={isLinked}
        readOnly={isLinked}
        baseData={baseScenario ? { incomeKF: baseScenario.incomeKF, expenseKF: baseScenario.expenseKF, dcTotalKF: baseScenario.dcTotalKF, companyDCKF: baseScenario.companyDCKF, idecoKF: baseScenario.idecoKF, salaryGrowthRate: baseScenario.salaryGrowthRate, sirPct: sirPct ?? 15.75, hasFurusato: baseScenario.hasFurusato, dcReceiveMethod: baseScenario.dcReceiveMethod, siParams: baseScenario.siParams } : undefined}
        trackLinked={isLinked ? isTrackLinked : undefined}
        onToggleTrack={isLinked ? toggleTrack : undefined}
        dcLinked={isLinked && !s.dcReceiveMethod}
        onToggleDCLink={isLinked ? () => {
          if (!s.dcReceiveMethod) {
            // リンク解除: ベースの値をコピーして独自設定に
            onChange({ ...s, dcReceiveMethod: baseScenario?.dcReceiveMethod || DEFAULT_DC_RECEIVE_METHOD });
          } else {
            // リンク復帰: undefinedでベースに追従
            const { dcReceiveMethod: _, ...rest } = s;
            onChange({ ...rest, dcReceiveMethod: undefined } as any);
          }
        } : undefined}
        open={secOpen("self")} onToggle={() => toggleSec("self")}
        extraFields={<>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">年齢</span>
            <input type="number" value={s.currentAge} min={18} max={70} step={1} disabled={isLinked}
              onChange={e => onChange({ ...s, currentAge: Number(e.target.value) })}
              className={`w-12 rounded border px-1 py-0.5 text-xs ${isLinked ? "bg-gray-100 text-gray-400" : ""}`} />
            <span className="text-[10px] text-gray-400">歳</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">退職</span>
            <input type="number" value={s.retirementAge} min={s.currentAge + 1} max={80} step={1} disabled={isLinked}
              onChange={e => onChange({ ...s, retirementAge: Number(e.target.value) })}
              className={`w-12 rounded border px-1 py-0.5 text-xs ${isLinked ? "bg-gray-100 text-gray-400" : ""}`} />
            <span className="text-[10px] text-gray-400">歳</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">性別</span>
            <button onClick={() => !isLinked && onChange({ ...s, selfGender: "male" })}
              className={`rounded px-1.5 py-0.5 text-[10px] ${(s.selfGender || "male") === "male" ? "bg-blue-600 text-white" : "bg-gray-100"} ${isLinked ? "opacity-50 cursor-not-allowed" : ""}`}>男</button>
            <button onClick={() => !isLinked && onChange({ ...s, selfGender: "female" })}
              className={`rounded px-1.5 py-0.5 text-[10px] ${s.selfGender === "female" ? "bg-pink-600 text-white" : "bg-gray-100"} ${isLinked ? "opacity-50 cursor-not-allowed" : ""}`}>女</button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">DC通算</span>
            <input type="number" value={s.years} step={1} disabled={isLinked}
              onChange={e => onChange({ ...s, years: Number(e.target.value) })}
              className={`w-14 rounded border px-1 py-0.5 text-xs ${isLinked ? "bg-gray-100 text-gray-400" : ""}`} />
            <span className="text-[10px] text-gray-400">年</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">年金開始</span>
            <input type="number" value={s.pensionStartAge ?? 65} step={1} min={60} max={75} disabled={isLinked}
              onChange={e => onChange({ ...s, pensionStartAge: Number(e.target.value) })}
              className={`w-12 rounded border px-1 py-0.5 text-xs ${isLinked ? "bg-gray-100 text-gray-400" : ""}`} />
            <span className="text-[10px] text-gray-400">歳</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">就職</span>
            <input type="number" value={s.pensionWorkStartAge ?? 22} step={1} min={18} max={30} disabled={isLinked}
              onChange={e => onChange({ ...s, pensionWorkStartAge: Number(e.target.value) })}
              className={`w-12 rounded border px-1 py-0.5 text-xs ${isLinked ? "bg-gray-100 text-gray-400" : ""}`} />
            <span className="text-[10px] text-gray-400">歳</span>
          </div>
        </>}
      />

      {/* 配偶者: 本人と同レベルのSection */}
      <MemberEditor
        label="配偶者" color="#be185d"
        excludeTracks={["expenseKF"]}
        data={{ incomeKF: sp.incomeKF || [], expenseKF: sp.expenseKF || [], dcTotalKF: sp.dcTotalKF || [], companyDCKF: sp.companyDCKF || [], idecoKF: sp.idecoKF || [], salaryGrowthRate: sp.salaryGrowthRate || effectiveSp.salaryGrowthRate, sirPct: sp.sirPct ?? effectiveSp.sirPct ?? 15.75, hasFurusato: sp.hasFurusato ?? effectiveSp.hasFurusato ?? true, dcReceiveMethod: sp.dcReceiveMethod, siParams: sp.siParams ?? effectiveSp.siParams }}
        onUpdate={(patch) => onChange({ ...s, spouse: { ...sp, ...patch } })}
        currentAge={effectiveSp.currentAge} retirementAge={retirementAge}
        linked={spInherited}
        readOnly={false}
        baseData={baseSp ? { incomeKF: baseSp.incomeKF || [], expenseKF: baseSp.expenseKF || [], dcTotalKF: baseSp.dcTotalKF || [], companyDCKF: baseSp.companyDCKF || [], idecoKF: baseSp.idecoKF || [], salaryGrowthRate: baseSp.salaryGrowthRate, sirPct: baseSp.sirPct ?? 15.75, hasFurusato: baseSp.hasFurusato ?? true, dcReceiveMethod: baseSp.dcReceiveMethod, siParams: baseSp.siParams } : undefined}
        trackLinked={spInherited ? isSpouseTrackLinked : undefined}
        onToggleTrack={spInherited ? toggleSpouseTrack : undefined}
        dcLinked={isSpouseDCLinked}
        onToggleDCLink={spInherited ? toggleSpouseDCLink : undefined}
        extraFields={<>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">年齢</span>
            <input type="number" value={effectiveSp.currentAge} step={1} onChange={e => onChange({ ...s, spouse: { ...sp, currentAge: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5 text-xs" disabled={spInherited} />
            <span className="text-[10px] text-gray-400">歳</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">退職</span>
            <input type="number" value={effectiveSp.retirementAge ?? 65} step={1} min={effectiveSp.currentAge + 1} max={80}
              onChange={e => onChange({ ...s, spouse: { ...sp, retirementAge: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5 text-xs" disabled={spInherited} />
            <span className="text-[10px] text-gray-400">歳</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">年金開始</span>
            <input type="number" value={effectiveSp.pensionStartAge ?? 65} step={1} min={60} max={75}
              onChange={e => onChange({ ...s, spouse: { ...sp, pensionStartAge: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5 text-xs" disabled={spInherited} />
            <span className="text-[10px] text-gray-400">歳</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">就職</span>
            <input type="number" value={effectiveSp.pensionWorkStartAge ?? 22} step={1} min={18} max={30}
              onChange={e => onChange({ ...s, spouse: { ...sp, pensionWorkStartAge: Number(e.target.value) } })} className="w-12 rounded border px-1 py-0.5 text-xs" disabled={spInherited} />
            <span className="text-[10px] text-gray-400">歳</span>
          </div>
        </>}
        open={secOpen("spouse")} onToggle={() => toggleSec("spouse")}
        enabled={spouseEnabled}
        onToggleEnabled={(v) => {
          if (spInherited && !v) {
            onChange({ ...s, spouse: { ...defaultSp, enabled: false } });
          } else if (!sp.enabled && v && baseSp?.enabled) {
            onChange({ ...s, spouse: { ...baseSp, enabled: true } });
          } else {
            onChange({ ...s, spouse: { ...sp, enabled: v } });
          }
        }}
        enabledLabel="有効"
      />

      <EventSection scenario={s} onChange={onChange} currentAge={currentAge} retirementAge={retirementAge} baseScenario={baseScenario} isLinked={isLinked}
        open={secOpen("events")} onToggle={() => toggleSec("events")} />

      <HousingSection s={s} onChange={onChange} currentAge={currentAge} retirementAge={s.simEndAge ?? 85}
        open={secOpen("housing")} onToggle={() => toggleSec("housing")}
        isLinked={isLinked} baseScenario={baseScenario}
        allEvents={[
          ...(isLinked && baseScenario ? baseScenario.events.filter(e => !(s.excludedBaseEventIds || []).includes(e.id)) : []),
          ...(s.events || []),
        ]} />

      <NISASection s={s} onChange={onChange} isLinked={isLinked} baseScenario={baseScenario}
        open={secOpen("nisa")} onToggle={() => toggleSec("nisa")} />
    </div>
  );
}
