import React, { useState } from "react";
import type { Keyframe, Scenario, TrackKey, SpouseConfig, DCReceiveMethod, SocialInsuranceParams, CareerPeriod, PensionSchemeType } from "../lib/types";
import { DEFAULT_DC_RECEIVE_METHOD, DEFAULT_SI_PARAMS } from "../lib/types";
import { sortKF } from "../lib/types";
import { SCENARIO_COLORS } from "../lib/scenarioFactory";
import { Section } from "./Section";
import { Inp, Btns, Lnk, Check, FieldRow, SubGroup, MiniBtn, NumField, Help } from "./ui";
import { EventSection } from "./EventSection";
import { HousingSection } from "./HousingSection";
import { NISASection } from "./NISASection";
import { ScenarioSettingsSection } from "./ScenarioSettingsSection";

export interface TrackDef {
  key: TrackKey; label: string; unit: string; defaultValue: number; step: number; help?: string;
  /** Quick-pick chips shown on the single-value row. */
  presets?: number[];
  min?: number;
}
const TRACKS: TrackDef[] = [
  { key: "incomeKF", label: "年収", unit: "万円", defaultValue: 700, step: 10, presets: [300, 400, 500, 600, 800, 1000, 1500], min: 0 },
  { key: "expenseKF", label: "基本生活費(世帯)", unit: "万円/月", defaultValue: 15, step: 1, help: "世帯全体の月額生活費。住居費・イベント費は別途加算", presets: [10, 15, 20, 25, 30], min: 0 },
  { key: "dcTotalKF", label: "DC合計", unit: "円/月", defaultValue: 55000, step: 1000, help: "企業型DC＋マッチング拠出等の合計（会社負担分を含む）", presets: [0, 10000, 20000, 27500, 55000], min: 0 },
  { key: "companyDCKF", label: "会社DC", unit: "円/月", defaultValue: 1000, step: 1000, help: "会社負担の拠出額。iDeCo上限の判定に使用", min: 0 },
  { key: "idecoKF", label: "iDeCo", unit: "円/月", defaultValue: 0, step: 1000, help: "個人型DC拠出額。上限: 会社DC有→月2万, 無→月2.3万", presets: [0, 5000, 12000, 20000, 23000], min: 0 },
];

// ============================================================
// Track Row (年齢別キーフレーム) — shared by 本人 / 配偶者 / wizard
// ============================================================

function dedupeSort(kfs: Keyframe[]): Keyframe[] {
  const byAge = new Map<number, Keyframe>();
  for (const k of kfs) byAge.set(k.age, k); // later wins
  return sortKF([...byAge.values()]);
}

export function TrackRow({ track, keyframes, onChange, currentAge, retirementAge, linked, onToggleLink, baseKFs }: {
  track: TrackDef; keyframes: Keyframe[]; onChange: (kfs: Keyframe[]) => void;
  currentAge: number; retirementAge: number;
  linked: boolean; onToggleLink?: () => void; baseKFs?: Keyframe[];
}) {
  const safe = keyframes || [];
  const display = linked ? (baseKFs || []) : safe;
  const ro = linked;
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const setValueAt = (i: number, v: number) => onChange(safe.map((k, j) => (j === i ? { ...k, value: v } : k)));
  const setAgeAt = (i: number, a: number) => onChange(safe.map((k, j) => (j === i ? { ...k, age: a } : k)));
  const normalize = () => { const n = dedupeSort(safe); if (n.length !== safe.length || n.some((k, i) => k !== safe[i])) onChange(n); };
  const remove = (i: number) => onChange(safe.filter((_, j) => j !== i));
  const setSingle = (v: number) => (safe.length ? setValueAt(0, v) : onChange([{ age: currentAge, value: v }]));
  const add = () => {
    const last = safe[safe.length - 1];
    let age = Math.min(last ? last.age + 5 : currentAge, retirementAge - 1);
    while (safe.some(k => k.age === age) && age < retirementAge - 1) age++;
    if (safe.some(k => k.age === age)) return;
    const next = sortKF([...safe, { age, value: last?.value ?? track.defaultValue }]);
    onChange(next);
    setFocusIdx(next.findIndex(k => k.age === age));
  };

  const compact = display.length <= 1;
  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-gray-700">
        {track.label}<span className="ml-1 font-normal text-gray-400">({track.unit})</span><Help text={track.help} />
      </span>
      <span className="flex items-center gap-1.5">
        {onToggleLink && <Lnk linked={linked} onToggle={onToggleLink} />}
        {!ro && <MiniBtn onClick={add} title="年齢を指定して値を変える">＋ 変化点</MiniBtn>}
      </span>
    </div>
  );

  if (compact) {
    const first = display[0];
    return (
      <div className="border-b border-gray-100 pb-1.5 last:border-b-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-700">
            {track.label}<Help text={track.help} />
          </span>
          <span className="flex items-center gap-1.5">
            {onToggleLink && <Lnk linked={linked} onToggle={onToggleLink} />}
            <NumField value={first?.value ?? 0} onChange={setSingle} step={track.step} min={track.min} unit={track.unit} w="w-24" disabled={ro} />
            {!ro && <MiniBtn onClick={add} tone="gray" title="年齢を指定して値を変える">＋ 変化点</MiniBtn>}
          </span>
        </div>
        {!ro && track.presets && (
          <div className="mt-0.5 flex flex-wrap justify-end gap-0.5">
            {track.presets.map(p => (
              <button key={p} type="button" onClick={() => setSingle(p)}
                className={`rounded px-1 py-px text-[9px] leading-tight ${first?.value === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-700"}`}>
                {p.toLocaleString()}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 pb-1.5 last:border-b-0">
      {header}
      <div className="mt-0.5 space-y-0.5">
        {display.length === 0 && <div className="pl-2 text-[10px] text-gray-400">未設定（＋ 変化点 で追加）</div>}
        {display.map((kf, i) => (
          <div key={i} className={`flex items-center gap-1.5 pl-2 text-xs ${ro ? "opacity-60" : ""}`}>
            {i === 0
              ? <span className="w-[68px] text-right text-[10px] text-gray-500 tabular-nums" title="最初の値は現在年齢に連動します">{kf.age}歳〜</span>
              : <NumField value={kf.age} onChange={(a) => setAgeAt(i, a)} onCommit={normalize} step={1} min={currentAge + 1} max={retirementAge - 1}
                  unit="歳〜" w="w-10" disabled={ro} autoFocus={focusIdx === i} />}
            <NumField value={kf.value} onChange={(v) => setValueAt(i, v)} step={track.step} min={track.min} unit={track.unit} w="w-24" disabled={ro} />
            {!ro && <button type="button" onClick={() => remove(i)} className="px-1 text-[11px] text-gray-300 hover:text-red-500" title="削除">×</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Career History Editor (職歴)
// ============================================================
const SCHEME_LABELS: Record<PensionSchemeType, string> = { employee: "厚生", national: "国民", mutual: "共済" };

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
  const autoGenerate = () => onChange([{ id: Date.now(), startAge: workStartAge, endAge: retirementAge, pensionScheme: "employee" }]);
  const removePeriod = (id: number) => onChange(history.filter(p => p.id !== id));
  const updatePeriod = (id: number, patch: Partial<CareerPeriod>) => onChange(history.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const summary = history.length > 0 ? history.map(p => `${p.startAge}-${p.endAge}${SCHEME_LABELS[p.pensionScheme]}`).join(" / ") : "";

  return (
    <details className="w-full text-[10px]">
      <summary className="flex cursor-pointer select-none items-center gap-1 text-gray-500">
        職歴{history.length > 0 ? ` (${history.length}件)` : ""}
        <span className="text-gray-400">{history.length === 0 ? "（未設定＝就職〜退職を厚生年金1期間）" : summary}</span>
      </summary>
      <div className="mt-1 space-y-1 rounded border bg-gray-50 p-1.5">
        {history.map(p => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border bg-white p-1">
            <Inp label="開始" value={p.startAge} onChange={v => updatePeriod(p.id, { startAge: v })} unit="歳" w="w-10" step={1} min={15} max={75} disabled={disabled} />
            <Inp label="終了" value={p.endAge} onChange={v => updatePeriod(p.id, { endAge: v })} unit="歳" w="w-10" step={1} min={p.startAge + 1} max={80} disabled={disabled} />
            <Btns label="年金" options={[{ value: "employee" as const, label: "厚生" }, { value: "national" as const, label: "国民" }, { value: "mutual" as const, label: "共済" }]}
              value={p.pensionScheme} onChange={v => updatePeriod(p.id, { pensionScheme: v })} disabled={disabled} />
            {p.pensionScheme !== "national" && (
              <Inp label="平均年収" value={p.avgAnnualSalaryMan ?? 0} onChange={v => updatePeriod(p.id, { avgAnnualSalaryMan: v || undefined })} unit="万" w="w-14" step={50} min={0} disabled={disabled} help="0＝年収の変化点から推定" />
            )}
            <Inp label="退職金" value={p.retirementBonusMan ?? 0} onChange={v => updatePeriod(p.id, { retirementBonusMan: v || undefined })} unit="万" w="w-14" step={100} min={0} disabled={disabled} help="0＝なし" />
            <input value={p.label ?? ""} onChange={e => updatePeriod(p.id, { label: e.target.value || undefined })} placeholder="ラベル（任意）" className="w-24 rounded border px-1 py-0.5 text-[10px]" disabled={disabled} />
            {!disabled && <button type="button" onClick={() => removePeriod(p.id)} className="ml-auto text-gray-300 hover:text-red-500">×</button>}
          </div>
        ))}
        {!disabled && (
          <div className="flex gap-1">
            <MiniBtn onClick={autoGenerate} tone="gray">自動生成</MiniBtn>
            <MiniBtn onClick={addPeriod}>＋ 追加</MiniBtn>
            {history.length > 0 && <MiniBtn onClick={() => onChange([])} tone="red">クリア</MiniBtn>}
          </div>
        )}
      </div>
    </details>
  );
}

// ============================================================
// Unified Member Editor (本人 / 配偶者 共通)
// ============================================================
export interface MemberData {
  incomeKF: Keyframe[]; expenseKF: Keyframe[];
  dcTotalKF: Keyframe[]; companyDCKF: Keyframe[]; idecoKF: Keyframe[];
  salaryGrowthRate: number; sirPct: number; hasFurusato: boolean;
  dcReceiveMethod?: DCReceiveMethod;
  siParams?: SocialInsuranceParams;
}

/** Patch accepted by MemberEditor; careerHistory is edited via `extraFields` by some hosts (wizard). */
export type MemberPatch = Partial<MemberData> & { careerHistory?: CareerPeriod[] };

const DEFAULT_DC_RM = DEFAULT_DC_RECEIVE_METHOD;

function rmSummary(rm: DCReceiveMethod): string {
  return rm.type === "lump_sum" ? "一時金" : rm.type === "annuity" ? `年金${rm.annuityYears}年` : `併用(一時金${rm.combinedLumpSumRatio}%)`;
}

export function MemberEditor({ label, color, data, onUpdate, currentAge, retirementAge, extraFields, linked, readOnly, baseData, trackLinked, onToggleTrack, excludeTracks, dcLinked, onToggleDCLink, open, onToggle, enabled, onToggleEnabled, enabledLabel }: {
  label: string; color: string;
  data: MemberData;
  onUpdate: (patch: MemberPatch) => void;
  currentAge: number; retirementAge: number;
  /** Identity fields (年齢・退職…) rendered at the top. */
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
    const syncFirst = (kf: Keyframe[]) => (kf.length > 0 ? [{ ...kf[0], age: currentAge }, ...kf.slice(1)] : kf);
    const patch: Partial<MemberData> = {};
    let changed = false;
    for (const key of ["incomeKF", "expenseKF", "dcTotalKF", "companyDCKF", "idecoKF"] as const) {
      const orig = data[key];
      if (orig.length > 0 && orig[0].age !== currentAge) { patch[key] = syncFirst(orig); changed = true; }
    }
    if (changed) onUpdate(patch);
  }, [currentAge]);

  const isRO = readOnly && linked;
  const display = isRO && baseData ? baseData : data;
  const rm = (dcLinked && baseData ? baseData.dcReceiveMethod : data.dcReceiveMethod) || DEFAULT_DC_RM;
  const setRM = (patch: Partial<DCReceiveMethod>) => onUpdate({ dcReceiveMethod: { ...rm, ...patch } });
  const si = display.siParams || DEFAULT_SI_PARAMS;

  const isDisabled = enabled != null && !enabled;
  const income = (linked && baseData && trackLinked?.("incomeKF") ? baseData : data).incomeKF?.[0]?.value;
  const summary = [income != null ? `年収${income}万` : null, `昇給${display.salaryGrowthRate}%`, rmSummary(rm)].filter(Boolean).join(" ");

  const visibleTracks = TRACKS.filter(t => !excludeTracks?.includes(t.key));

  return (
    <Section title={label} borderColor={color} bgOpen="bg-slate-50/60" open={!isDisabled && open} onToggle={isDisabled ? () => {} : onToggle}
      linked={linked}
      badge={isDisabled ? <span className="text-[9px] text-gray-400">無効</span> : <span className="font-normal text-gray-400 text-[10px]">({summary})</span>}
      right={onToggleEnabled ? (
        <Check label={enabledLabel || "有効"} checked={!!enabled} onChange={onToggleEnabled} accent="accent-pink-600" />
      ) : undefined}>
      <div className="space-y-2">
        {extraFields && <FieldRow>{extraFields}</FieldRow>}

        {/* Track rows */}
        <div className="rounded border border-gray-200/70 bg-white/60 px-2 pt-1">
          {visibleTracks.map(t => (
            <TrackRow key={t.key} track={t}
              keyframes={data[t.key] || []}
              onChange={(kfs) => onUpdate({ [t.key]: kfs })}
              currentAge={currentAge} retirementAge={retirementAge}
              linked={trackLinked ? trackLinked(t.key) : false}
              onToggleLink={onToggleTrack ? () => onToggleTrack(t.key) : undefined}
              baseKFs={baseData ? baseData[t.key] || [] : undefined} />
          ))}
        </div>

        <SubGroup title="税・社会保険">
          <FieldRow>
            <Inp label="昇給率" value={display.salaryGrowthRate} onChange={v => onUpdate({ salaryGrowthRate: v })} unit="%/年" w="w-12" step={0.5} min={-5} max={15} disabled={isRO} help="年収の変化点の値に毎年複利で加算。一般的に1〜3%" />
            <Check label="ふるさと納税" checked={display.hasFurusato} onChange={v => onUpdate({ hasFurusato: v })} disabled={isRO} help="控除上限まで寄付する前提で計算" />
            <>
              <details className="text-[10px]">
                <summary className="cursor-pointer select-none text-gray-500">社保料率の詳細{display.siParams ? " ●" : ""}</summary>
                <div className="mt-1 space-y-1 rounded border bg-gray-50 p-1.5">
                  <div className="text-gray-400">厚生年金 9.15%・雇用保険 0.60% は固定</div>
                  <FieldRow>
                    {([["healthInsuranceRate", "健保"], ["nursingInsuranceRate", "介護"], ["childSupportRate", "子育て支援"]] as const).map(([key, lbl]) => (
                      <Inp key={key} label={lbl} value={si[key]} onChange={v => onUpdate({ siParams: { ...si, [key]: v } })} unit="%" w="w-12" step={0.05} min={0} max={20} disabled={isRO} />
                    ))}
                  </FieldRow>
                </div>
              </details>
            </>
          </FieldRow>
        </SubGroup>

        {/* DC/iDeCo 受取方法 */}
        
        <>
          <SubGroup title={<>DC/iDeCo 受取方法<Help text="一時金＝退職所得控除が使える。年金＝雑所得として毎年課税" /></>}
            right={onToggleDCLink && <Lnk linked={!!dcLinked} onToggle={onToggleDCLink} />}>
            <FieldRow className={dcLinked ? "opacity-50" : ""}>
              <Btns options={[{ value: "lump_sum" as const, label: "一時金" }, { value: "annuity" as const, label: "年金" }, { value: "combined" as const, label: "併用" }]}
                value={rm.type} onChange={v => setRM({ type: v })} color="green" disabled={dcLinked} />
              <Inp label="受取開始" value={rm.annuityStartAge} onChange={v => setRM({ annuityStartAge: v })} unit="歳" w="w-12" min={60} max={75} step={1} disabled={dcLinked} />
              {(rm.type === "annuity" || rm.type === "combined") && (
                <Btns label="受取期間" options={[{ value: 5, label: "5年" }, { value: 10, label: "10年" }, { value: 15, label: "15年" }, { value: 20, label: "20年" }]}
                  value={rm.annuityYears} onChange={v => setRM({ annuityYears: v })} color="green" disabled={dcLinked} />
              )}
              {rm.type === "combined" && (
                <Inp label="一時金割合" value={rm.combinedLumpSumRatio} onChange={v => setRM({ combinedLumpSumRatio: v })} unit="%" w="w-12" min={10} max={90} step={10} disabled={dcLinked} />
              )}
            </FieldRow>
          </SubGroup>
        </>
      </div>
    </Section>
  );
}

// ============================================================
// Main KeyframeEditor (1 scenario column)
// ============================================================
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
      const baseKFs = baseScenario ? [...(baseScenario[key] || [])] : [];
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
      onChange({ ...s, spouseOverrideTracks: spouseOT.filter(k => k !== key) });
    } else {
      const baseKFs = [...(baseSp[key] || [])];
      onChange({ ...s, spouseOverrideTracks: [...spouseOT, key], spouse: { ...sp, [key]: baseKFs } });
    }
  };
  const isSpouseDCLinked = spInherited && !sp.dcReceiveMethod;
  const toggleSpouseDCLink = () => {
    if (!spInherited || !baseSp) return;
    if (!sp.dcReceiveMethod) onChange({ ...s, spouse: { ...sp, dcReceiveMethod: baseSp.dcReceiveMethod || DEFAULT_DC_RECEIVE_METHOD } });
    else onChange({ ...s, spouse: { ...sp, dcReceiveMethod: undefined } });
  };

  // Section open/close: persisted in scenario JSON
  // リンクシナリオはベースの開閉状態を参照し、開閉操作はベース側を更新
  const SECTION_DEFAULTS: Record<string, boolean> = { settings: true, self: true, spouse: false, events: true, housing: false, nisa: false };
  const ownOpen = s.sectionOpen || {};
  const baseOpen = (isLinked && baseScenario?.sectionOpen) || {};
  const secOpen = (key: string): boolean => {
    if (isLinked) return baseOpen[key] ?? SECTION_DEFAULTS[key] ?? false;
    return ownOpen[key] ?? SECTION_DEFAULTS[key] ?? false;
  };
  const toggleSec = (key: string) => {
    const next = !secOpen(key);
    if (isLinked && baseScenario && onChangeBase) onChangeBase({ ...baseScenario, sectionOpen: { ...baseOpen, [key]: next } });
    else onChange({ ...s, sectionOpen: { ...ownOpen, [key]: next } });
  };

  // Enable/disable linking: spouse & NISA follow base when linked and not explicitly set
  const spouseEnabled = sp.enabled || spInherited;
  const memberData = (x: Scenario): MemberData => ({ incomeKF: x.incomeKF, expenseKF: x.expenseKF, dcTotalKF: x.dcTotalKF, companyDCKF: x.companyDCKF, idecoKF: x.idecoKF, salaryGrowthRate: x.salaryGrowthRate, sirPct: sirPct ?? 15.75, hasFurusato: x.hasFurusato, dcReceiveMethod: x.dcReceiveMethod, siParams: x.siParams });
  const spouseData = (x: SpouseConfig, eff: SpouseConfig): MemberData => ({ incomeKF: x.incomeKF || [], expenseKF: x.expenseKF || [], dcTotalKF: x.dcTotalKF || [], companyDCKF: x.companyDCKF || [], idecoKF: x.idecoKF || [], salaryGrowthRate: x.salaryGrowthRate || eff.salaryGrowthRate, sirPct: x.sirPct ?? eff.sirPct ?? 15.75, hasFurusato: x.hasFurusato ?? eff.hasFurusato ?? true, dcReceiveMethod: x.dcReceiveMethod, siParams: x.siParams ?? eff.siParams });

  const color = SCENARIO_COLORS[idx] || SCENARIO_COLORS[0];
  return (
    <div className="rounded-lg border-2 p-3 space-y-1.5" style={{ borderColor: color }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color }}>{s.name}</span>
        {isLinked && <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-2 py-0.5">🔗 Aベース + 差分</span>}
      </div>

      {/* シナリオ設定 */}
      <ScenarioSettingsSection s={s} onChange={onChange} isLinked={isLinked} baseScenario={baseScenario}
        open={secOpen("settings")} onToggle={() => toggleSec("settings")}
        defaultRR={defaultRR} defaultInflation={defaultInflation} />

      {/* 本人設定 */}
      <MemberEditor
        label="本人" color="#374151"
        data={memberData(s)}
        onUpdate={(patch) => onChange({ ...s, ...patch })}
        currentAge={currentAge} retirementAge={retirementAge}
        linked={isLinked}
        readOnly={isLinked}
        baseData={baseScenario ? memberData(baseScenario) : undefined}
        trackLinked={isLinked ? isTrackLinked : undefined}
        onToggleTrack={isLinked ? toggleTrack : undefined}
        dcLinked={isLinked && !s.dcReceiveMethod}
        onToggleDCLink={isLinked ? () => {
          if (!s.dcReceiveMethod) onChange({ ...s, dcReceiveMethod: baseScenario?.dcReceiveMethod || DEFAULT_DC_RECEIVE_METHOD });
          // `undefined` is intentional here: it means "follow base" for linked scenarios.
          else onChange({ ...s, dcReceiveMethod: undefined as unknown as DCReceiveMethod });
        } : undefined}
        open={secOpen("self")} onToggle={() => toggleSec("self")}
        extraFields={<>
          <Inp label="年齢" value={s.currentAge} onChange={v => onChange({ ...s, currentAge: v })} unit="歳" w="w-12" min={18} max={70} step={1} disabled={isLinked} />
          <Inp label="退職" value={s.retirementAge} onChange={v => onChange({ ...s, retirementAge: v })} unit="歳" w="w-12" min={s.currentAge + 1} max={80} step={1} disabled={isLinked} />
          <>
            <Btns label="性別" options={[{ value: "male" as const, label: "男" }, { value: "female" as const, label: "女" }]}
              value={s.selfGender || "male"} onChange={v => onChange({ ...s, selfGender: v })} disabled={isLinked} />
          </>
          
            <Inp label="DC通算" value={s.years} onChange={v => onChange({ ...s, years: v })} unit="年" w="w-12" step={1} min={0} max={60} disabled={isLinked} help="退職所得控除の通算加入期間（重複を除く）" />
          
          <>
            <Inp label="年金開始" value={s.pensionStartAge ?? 65} onChange={v => onChange({ ...s, pensionStartAge: v })} unit="歳" w="w-12" min={60} max={75} step={1} disabled={isLinked} />
            <Inp label="就職" value={s.pensionWorkStartAge ?? 22} onChange={v => onChange({ ...s, pensionWorkStartAge: v })} unit="歳" w="w-12" min={15} max={40} step={1} disabled={isLinked} />
          </>
          
            <Inp label="結婚" value={s.marriageAge ?? 0} onChange={v => onChange({ ...s, marriageAge: v || undefined })} unit="歳" w="w-12" min={0} max={60} step={1} disabled={isLinked} help="0＝未設定。第3号被保険者期間の計算に使用" />
          
          
            <CareerHistoryEditor history={s.careerHistory || []} onChange={h => onChange({ ...s, careerHistory: h.length > 0 ? h : undefined })} workStartAge={s.pensionWorkStartAge ?? 22} retirementAge={s.retirementAge} disabled={isLinked} />
          
        </>}
      />

      {/* 配偶者 */}
      <MemberEditor
        label="配偶者" color="#be185d"
        excludeTracks={["expenseKF"]}
        data={spouseData(sp, effectiveSp)}
        onUpdate={(patch) => onChange({ ...s, spouse: { ...sp, ...patch } })}
        currentAge={effectiveSp.currentAge} retirementAge={retirementAge}
        linked={spInherited}
        readOnly={false}
        baseData={baseSp ? spouseData(baseSp, baseSp) : undefined}
        trackLinked={spInherited ? isSpouseTrackLinked : undefined}
        onToggleTrack={spInherited ? toggleSpouseTrack : undefined}
        dcLinked={isSpouseDCLinked}
        onToggleDCLink={spInherited ? toggleSpouseDCLink : undefined}
        extraFields={<>
          <Inp label="年齢" value={effectiveSp.currentAge} onChange={v => onChange({ ...s, spouse: { ...sp, currentAge: v } })} unit="歳" w="w-12" min={18} max={80} step={1} disabled={spInherited} />
          <Inp label="退職" value={effectiveSp.retirementAge ?? 65} onChange={v => onChange({ ...s, spouse: { ...sp, retirementAge: v } })} unit="歳" w="w-12" min={effectiveSp.currentAge + 1} max={80} step={1} disabled={spInherited} />
          <>
            <Inp label="年金開始" value={effectiveSp.pensionStartAge ?? 65} onChange={v => onChange({ ...s, spouse: { ...sp, pensionStartAge: v } })} unit="歳" w="w-12" min={60} max={75} step={1} disabled={spInherited} />
            <Inp label="就職" value={effectiveSp.pensionWorkStartAge ?? 22} onChange={v => onChange({ ...s, spouse: { ...sp, pensionWorkStartAge: v } })} unit="歳" w="w-12" min={15} max={40} step={1} disabled={spInherited} />
          </>
          
            <CareerHistoryEditor history={effectiveSp.careerHistory || []} onChange={h => onChange({ ...s, spouse: { ...sp, careerHistory: h.length > 0 ? h : undefined } })} workStartAge={effectiveSp.pensionWorkStartAge ?? 22} retirementAge={effectiveSp.retirementAge ?? 65} disabled={spInherited} />
          
        </>}
        open={secOpen("spouse")} onToggle={() => toggleSec("spouse")}
        enabled={spouseEnabled}
        onToggleEnabled={(v) => {
          if (spInherited && !v) onChange({ ...s, spouse: { ...defaultSp, enabled: false } });
          else if (!sp.enabled && v && baseSp?.enabled) onChange({ ...s, spouse: { ...baseSp, enabled: true } });
          else onChange({ ...s, spouse: { ...sp, enabled: v } });
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
