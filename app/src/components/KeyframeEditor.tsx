import React, { useState, useCallback } from "react";
import type { Keyframe, Scenario, TrackKey, SpouseConfig, DCReceiveMethod, SocialInsuranceParams, CareerPeriod, PensionSchemeType } from "../lib/types";
import { DEFAULT_DC_RECEIVE_METHOD, DEFAULT_SI_PARAMS } from "../lib/types";
import { sortKF } from "../lib/types";
import { Section } from "./Section";
import { Inp, Btns, Lnk } from "./ui";
import { EventSection } from "./EventSection";
import { HousingSection } from "./HousingSection";
import { NISASection } from "./NISASection";
import { ScenarioSettingsSection } from "./ScenarioSettingsSection";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

export interface TrackDef { key: TrackKey; label: string; unit: string; defaultValue: number; step: number; help?: string; }
const TRACKS: TrackDef[] = [
  { key: "incomeKF", label: "年収", unit: "万円", defaultValue: 700, step: 10 },
  { key: "expenseKF", label: "基本生活費(世帯)", unit: "万円/月", defaultValue: 15, step: 1, help: "世帯全体の月額生活費。住居費・イベント費は別途加算" },
  { key: "dcTotalKF", label: "DC合計", unit: "円/月", defaultValue: 55000, step: 1000 },
  { key: "companyDCKF", label: "会社DC", unit: "円/月", defaultValue: 1000, step: 1000 },
  { key: "idecoKF", label: "iDeCo", unit: "円/月", defaultValue: 0, step: 1000, help: "個人型DC拠出額。上限: 会社DC有→月2万, 無→月2.3万" },
];

// ===== Track Row (shared by 本人 and 配偶者) =====
export function TrackRow({ track, keyframes, onChange, currentAge, retirementAge, linked, onToggleLink, baseKFs }: {
  track: TrackDef; keyframes: Keyframe[]; onChange: (kfs: Keyframe[]) => void;
  currentAge: number; retirementAge: number;
  linked: boolean; onToggleLink?: () => void; baseKFs?: Keyframe[];
}) {
  const [adding, setAdding] = useState(false);
  const [newAge, setNewAge] = useState(currentAge);
  const [newVal, setNewVal] = useState(track.defaultValue);
  const safeKFs = keyframes || [];
  const display = linked ? (baseKFs || []) : safeKFs;
  const ro = linked;

  return (
    <div className="border-b pb-1.5 last:border-b-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-semibold text-gray-700">{track.label}（{track.unit}）{track.help && <span className="ml-1 cursor-help text-gray-400" title={track.help}>ⓘ</span>}</span>
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
              : <input type="number" value={kf.value} step={track.step} onChange={(e) => onChange(safeKFs.map(k => k.age === kf.age ? { ...k, value: Number(e.target.value) } : k))} className="w-24 rounded border px-1.5 py-1 text-xs" />}
            <span className="text-gray-400 text-[10px]">{track.unit}</span>
            {!ro && <button onClick={() => onChange(safeKFs.filter(k => k.age !== kf.age))} className="text-[10px] text-gray-300 hover:text-red-500">×</button>}
          </div>
        ))}
        {adding && !ro && (
          <div className="flex items-center gap-1.5 pl-2 text-xs bg-blue-50 rounded p-1">
            <input type="number" value={newAge} min={currentAge} max={retirementAge - 1} step={1} onChange={(e) => setNewAge(Number(e.target.value))} className="w-14 rounded border px-1.5 py-1 text-xs" />
            <span className="text-gray-400 text-[10px]">歳</span>
            <input type="number" value={newVal} step={track.step} onChange={(e) => setNewVal(Number(e.target.value))} className="w-24 rounded border px-1.5 py-0.5 text-xs" />
            <button onClick={() => { onChange(sortKF([...safeKFs.filter(k => k.age !== newAge), { age: newAge, value: newVal }])); setAdding(false); }} className="text-[10px] text-blue-600 font-bold">OK</button>
            <button onClick={() => setAdding(false)} className="text-[10px] text-gray-400">×</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Phase 4: Career History Editor =====
const SCHEME_LABELS: Record<PensionSchemeType, string> = {
  employee: "厚生", national: "国民", mutual: "共済",
};

export function CareerHistoryEditor({ history, onChange, workStartAge, retirementAge, disabled }: {
  history: CareerPeriod[];
  onChange: (h: CareerPeriod[]) => void;
  workStartAge: number;
  retirementAge: number;
  disabled?: boolean;
}) {
  const addPeriod = () => {
    const lastEnd = history.length > 0 ? history[history.length - 1].endAge : workStartAge;
    onChange([...history, { id: Date.now(), startAge: lastEnd, endAge: retirementAge, pensionScheme: "employee" }]);
  };
  const autoGenerate = () => {
    onChange([{ id: Date.now(), startAge: workStartAge, endAge: retirementAge, pensionScheme: "employee" }]);
  };
  const removePeriod = (id: number) => onChange(history.filter(p => p.id !== id));
  const updatePeriod = (id: number, patch: Partial<CareerPeriod>) =>
    onChange(history.map(p => p.id === id ? { ...p, ...patch } : p));

  return (
    <details className="text-[10px] col-span-2 w-full">
      <summary className="cursor-pointer text-gray-500 flex items-center gap-1 select-none">
        職歴{history.length > 0 ? ` (${history.length}件)` : ""}
        <span className="text-gray-400">{history.length === 0 ? "（未設定=就職〜退職を厚生1期間）" : ""}</span>
      </summary>
      <div className="mt-1 border rounded p-1.5 space-y-1 bg-gray-50">
        {history.length === 0 && (
          <div className="text-gray-400">未設定: 就職〜退職を厚生年金1期間として自動計算</div>
        )}
        {history.map(p => (
          <div key={p.id} className="flex flex-wrap items-center gap-1 bg-white rounded border p-1">
            <Inp label="開始" value={p.startAge} onChange={v => updatePeriod(p.id, { startAge: v })} unit="歳" w="w-10" step={1} min={18} max={70} disabled={disabled} />
            <Inp label="終了" value={p.endAge} onChange={v => updatePeriod(p.id, { endAge: v })} unit="歳" w="w-10" step={1} min={p.startAge + 1} max={75} disabled={disabled} />
            <div className="flex items-center gap-0.5">
              <span className="text-gray-500">年金:</span>
              <Btns options={[{value:"employee" as const,label:"厚生"},{value:"national" as const,label:"国民"},{value:"mutual" as const,label:"共済"}]}
                value={p.pensionScheme} onChange={v => updatePeriod(p.id, { pensionScheme: v })} disabled={disabled} />
            </div>
            {p.pensionScheme !== "national" && (
              <Inp label="平均年収" value={p.avgAnnualSalaryMan ?? 0} onChange={v => updatePeriod(p.id, { avgAnnualSalaryMan: v || undefined })} unit="万(0=KF参照)" w="w-14" step={50} min={0} disabled={disabled} />
            )}
            <Inp label="退職金" value={p.retirementBonusMan ?? 0} onChange={v => updatePeriod(p.id, { retirementBonusMan: v || undefined })} unit="万(0=なし)" w="w-14" step={100} min={0} disabled={disabled} />
            <input value={p.label ?? ""} onChange={e => updatePeriod(p.id, { label: e.target.value || undefined })} placeholder="ラベル" className="w-20 rounded border px-1 py-0.5 text-[10px]" disabled={disabled} />
            {!disabled && <button onClick={() => removePeriod(p.id)} className="text-gray-300 hover:text-red-500 ml-auto">×</button>}
          </div>
        ))}
        {!disabled && (
          <div className="flex gap-1">
            <button onClick={autoGenerate} className="text-[10px] rounded px-1.5 py-0.5 bg-gray-200 text-gray-600 hover:bg-gray-300">自動生成</button>
            <button onClick={addPeriod} className="text-[10px] rounded px-1.5 py-0.5 bg-blue-100 text-blue-600 hover:bg-blue-200">＋追加</button>
            {history.length > 0 && <button onClick={() => onChange([])} className="text-[10px] rounded px-1.5 py-0.5 bg-red-50 text-red-400 hover:bg-red-100">クリア</button>}
          </div>
        )}
      </div>
    </details>
  );
}

// ===== Unified Member Editor (本人 / 配偶者 共通) =====
// データの読み書きを抽象化して同一UIを使い回す
export interface MemberData {
  incomeKF: Keyframe[]; expenseKF: Keyframe[];
  dcTotalKF: Keyframe[]; companyDCKF: Keyframe[]; idecoKF: Keyframe[];
  salaryGrowthRate: number; sirPct: number; hasFurusato: boolean;
  dcReceiveMethod?: DCReceiveMethod;
  siParams?: SocialInsuranceParams;
}

const DEFAULT_DC_RM = DEFAULT_DC_RECEIVE_METHOD;

export function MemberEditor({ label, color, data, onUpdate, currentAge, retirementAge, extraFields, linked, readOnly, baseData, trackLinked, onToggleTrack, excludeTracks, dcLinked, onToggleDCLink, open, onToggle, enabled, onToggleEnabled, enabledLabel }: {
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
  // currentAge が変わったとき、各KFの先頭年齢を連動させる
  const prevAge = React.useRef(currentAge);
  React.useEffect(() => {
    if (prevAge.current === currentAge) return;
    prevAge.current = currentAge;
    const syncFirst = (kf: Keyframe[]) =>
      kf.length > 0 ? [{ ...kf[0], age: currentAge }, ...kf.slice(1)] : kf;
    const patch: Partial<MemberData> = {};
    let changed = false;
    for (const key of ["incomeKF", "expenseKF", "dcTotalKF", "companyDCKF", "idecoKF"] as const) {
      const orig = data[key];
      if (orig.length > 0 && orig[0].age !== currentAge) { patch[key] = syncFirst(orig) as any; changed = true; }
    }
    if (changed) onUpdate(patch);
  }, [currentAge]);

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
          <Inp label="昇給率" value={display.salaryGrowthRate} onChange={v => onUpdate({ salaryGrowthRate: v })} unit="%" w="w-14" step={0.5} disabled={isRO} />
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
                <Inp key={key} label={lbl} value={(display.siParams || DEFAULT_SI_PARAMS)[key]}
                  onChange={v => onUpdate({ siParams: { ...(display.siParams || DEFAULT_SI_PARAMS), [key]: v } })}
                  unit="%" w="w-14" step={0.05} min={0} disabled={isRO} />
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
              <span className="text-[10px] font-semibold text-gray-600">DC受取<span className="ml-1 cursor-help text-gray-400" title="一時金=退職所得控除が使える。年金=雑所得として毎年課税">ⓘ</span></span>
              <Btns options={[{value:"lump_sum" as const,label:"一時金"},{value:"annuity" as const,label:"年金"},{value:"combined" as const,label:"併用"}]}
                value={rm.type} onChange={v => setRM({ type: v })} color="green" disabled={dcLinked} />
            </div>
            {onToggleDCLink && <Lnk linked={!!dcLinked} onToggle={onToggleDCLink} />}
          </div>
          <div className={`flex flex-wrap gap-2 pl-2 ${dcLinked ? "opacity-50" : ""}`}>
            <Inp label="受取開始" value={rm.annuityStartAge} onChange={v => setRM({ annuityStartAge: v })} unit="歳" w="w-12" min={60} max={75} step={1} disabled={dcLinked} />
          {(rm.type === "annuity" || rm.type === "combined") && (<>
              <Btns options={[{value:5,label:"5年"},{value:10,label:"10年"},{value:15,label:"15年"},{value:20,label:"20年"}]}
                value={rm.annuityYears} onChange={v => setRM({ annuityYears: v })} color="green" disabled={dcLinked} />
              {rm.type === "combined" && (
                <Inp label="一時金" value={rm.combinedLumpSumRatio} onChange={v => setRM({ combinedLumpSumRatio: v })} unit="%" w="w-12" min={10} max={90} step={10} disabled={dcLinked} />
              )}
            </>)}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ===== Main KeyframeEditor =====
export function KeyframeEditor({ s, onChange, idx, currentAge, retirementAge, baseScenario, sirPct, defaultRR, defaultInflation, onChangeBase }: {
  s: Scenario; onChange: (s: Scenario) => void; idx: number;
  currentAge: number; retirementAge: number; baseScenario?: Scenario | null;
  sirPct?: number; defaultRR?: number; defaultInflation?: number;
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
        open={secOpen("settings")} onToggle={() => toggleSec("settings")}
        defaultRR={defaultRR} defaultInflation={defaultInflation} />

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
          <Inp label="年齢" value={s.currentAge} onChange={v => onChange({ ...s, currentAge: v })} unit="歳" w="w-12" min={18} max={70} step={1} disabled={isLinked} />
          <Inp label="退職" value={s.retirementAge} onChange={v => onChange({ ...s, retirementAge: v })} unit="歳" w="w-12" min={s.currentAge + 1} max={80} step={1} disabled={isLinked} />
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">性別</span>
            <Btns options={[{value:"male" as const,label:"男"},{value:"female" as const,label:"女"}]}
              value={s.selfGender || "male"} onChange={v => onChange({ ...s, selfGender: v })} disabled={isLinked} />
          </div>
          <Inp label="DC通算" value={s.years} onChange={v => onChange({ ...s, years: v })} unit="年" w="w-14" step={1} disabled={isLinked} />
          <Inp label="年金開始" value={s.pensionStartAge ?? 65} onChange={v => onChange({ ...s, pensionStartAge: v })} unit="歳" w="w-12" min={60} max={75} step={1} disabled={isLinked} />
          <Inp label="就職" value={s.pensionWorkStartAge ?? 22} onChange={v => onChange({ ...s, pensionWorkStartAge: v })} unit="歳" w="w-12" min={18} max={30} step={1} disabled={isLinked} />
          <Inp label="結婚" value={s.marriageAge ?? 0} onChange={v => onChange({ ...s, marriageAge: v || undefined })} unit="歳(0=未設定)" w="w-12" min={0} max={60} step={1} disabled={isLinked} />
          <CareerHistoryEditor history={s.careerHistory || []} onChange={h => onChange({ ...s, careerHistory: h.length > 0 ? h : undefined })} workStartAge={s.pensionWorkStartAge ?? 22} retirementAge={s.retirementAge} disabled={isLinked} />
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
          <Inp label="年齢" value={effectiveSp.currentAge} onChange={v => onChange({ ...s, spouse: { ...sp, currentAge: v } })} unit="歳" w="w-12" step={1} disabled={spInherited} />
          <Inp label="退職" value={effectiveSp.retirementAge ?? 65} onChange={v => onChange({ ...s, spouse: { ...sp, retirementAge: v } })} unit="歳" w="w-12" min={effectiveSp.currentAge + 1} max={80} step={1} disabled={spInherited} />
          <Inp label="年金開始" value={effectiveSp.pensionStartAge ?? 65} onChange={v => onChange({ ...s, spouse: { ...sp, pensionStartAge: v } })} unit="歳" w="w-12" min={60} max={75} step={1} disabled={spInherited} />
          <Inp label="就職" value={effectiveSp.pensionWorkStartAge ?? 22} onChange={v => onChange({ ...s, spouse: { ...sp, pensionWorkStartAge: v } })} unit="歳" w="w-12" min={18} max={30} step={1} disabled={spInherited} />
          <CareerHistoryEditor history={effectiveSp.careerHistory || []} onChange={h => onChange({ ...s, spouse: { ...sp, careerHistory: h.length > 0 ? h : undefined } })} workStartAge={effectiveSp.pensionWorkStartAge ?? 22} retirementAge={effectiveSp.retirementAge ?? 65} disabled={spInherited} />
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
        open={secOpen("events")} onToggle={() => toggleSec("events")} defaultRR={defaultRR} />

      <HousingSection s={s} onChange={onChange} currentAge={currentAge} retirementAge={s.simEndAge ?? 85}
        open={secOpen("housing")} onToggle={() => toggleSec("housing")}
        isLinked={isLinked} baseScenario={baseScenario}
        allEvents={[
          ...(isLinked && baseScenario ? baseScenario.events.filter(e => !(s.excludedBaseEventIds || []).includes(e.id)) : []),
          ...(s.events || []),
        ]} />

      <NISASection s={s} onChange={onChange} currentAge={currentAge} isLinked={isLinked} baseScenario={baseScenario}
        open={secOpen("nisa")} onToggle={() => toggleSec("nisa")} />
    </div>
  );
}
