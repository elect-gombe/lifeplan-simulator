import React from "react";
import type { Scenario, SettingKey, Keyframe } from "../lib/types";
import { sortKF } from "../lib/types";
import { Section } from "./Section";
import { Inp, Btns, Lnk, Check, FieldRow, SubGroup, MiniBtn, NumField } from "./ui";

const ALL_SETTING_KEYS: SettingKey[] = ["currentAge", "retirementAge", "simEndAge", "currentAssetsMan", "selfGender", "years", "dependentDeductionHolder", "pensionStartAge", "pensionWorkStartAge", "macroSlideRate", "rr", "inflationRate"];
const NHS_DEFAULT = { medEqualAmount: 0, medPerCapita: 0, medIncomeRate: 7.2, medCap: 650000, supportEqualAmount: 0, supportPerCapita: 0, supportIncomeRate: 2.4, supportCap: 240000, careEqualAmount: 0, carePerCapita: 0, careIncomeRate: 1.8, careCap: 170000 };
const PROTECTION_DEFAULT = { funeralCostMan: 200, emergencyReserveMan: 0, survivorLivingRatio: 70 };

/** Folds the rarely-touched groups into one <details>, opened when any of them is set. */
function AdvancedFold({ children, activeCount }: { children: React.ReactNode; activeCount: number }) {
  return (
    <details open={activeCount > 0} className="rounded border border-gray-200/70 bg-white/50 px-2 py-1">
      <summary className="cursor-pointer select-none text-[10px] font-semibold text-gray-600">
        詳細設定{activeCount > 0 && <span className="ml-1 rounded bg-blue-100 px-1 text-[9px] text-blue-700">{activeCount}件 設定済</span>}
        <span className="ml-1 font-normal text-gray-400">年金改定・年齢別利回り・支援制度・生活費調整・保障額・国保</span>
      </summary>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </details>
  );
}

// ===== Scenario Settings Section =====
export function ScenarioSettingsSection({ s, onChange, isLinked, baseScenario, open, onToggle, defaultRR, defaultInflation }: {
  s: Scenario; onChange: (s: Scenario) => void;
  isLinked: boolean; baseScenario?: Scenario | null;
  open: boolean; onToggle: () => void;
  defaultRR?: number; defaultInflation?: number;
}) {
  // Global settings link: linked when overrideSettings is empty/undefined
  const settingsLocked = isLinked && !(s.overrideSettings && s.overrideSettings.length > 0);
  const toggleSettingsLock = () => {
    if (!isLinked) return;
    if (settingsLocked) {
      const copied: Partial<Scenario> = {};
      for (const k of ALL_SETTING_KEYS) (copied as Record<SettingKey, unknown>)[k] = baseScenario ? baseScenario[k] ?? s[k] : s[k];
      onChange({ ...s, overrideSettings: ALL_SETTING_KEYS, ...copied });
    } else {
      onChange({ ...s, overrideSettings: [] });
    }
  };
  // Display value: base if locked, own if unlocked. Every caller passes a fallback,
  // so the result is always defined.
  function val<K extends keyof Scenario>(key: K, fallback: NonNullable<Scenario[K]>): NonNullable<Scenario[K]> {
    if (settingsLocked && baseScenario) return baseScenario[key] ?? fallback;
    return s[key] ?? fallback;
  }
  const ro = settingsLocked;
  const rr = val("rr", defaultRR ?? 4);
  const infl = val("inflationRate", defaultInflation ?? 1.5);
  const slide = val("macroSlideRate", -0.8);
  const hasSpouse = !!(s.spouse?.enabled || (isLinked && baseScenario?.spouse?.enabled));

  const ps = { ...PROTECTION_DEFAULT, ...(s.protectionSettings || {}) };
  const setPS = (patch: Partial<typeof ps>) => onChange({ ...s, protectionSettings: { ...ps, ...patch } });
  const nhs = { ...NHS_DEFAULT, ...(s.nhsSettings || {}) };
  const setNHS = (patch: Partial<typeof NHS_DEFAULT>) => onChange({ ...s, nhsSettings: { ...nhs, ...patch } });
  const nhsGroup = (title: string, keys: [keyof typeof NHS_DEFAULT, keyof typeof NHS_DEFAULT, keyof typeof NHS_DEFAULT, keyof typeof NHS_DEFAULT], rateMax: number) => (
    <div>
      <div className="font-semibold text-gray-500">{title}</div>
      <FieldRow>
        <Inp label="所得割" value={nhs[keys[0]]} onChange={v => setNHS({ [keys[0]]: v })} unit="%" w="w-12" step={0.1} min={0} max={rateMax} />
        <Inp label="均等割" value={Math.round(nhs[keys[1]] / 10000)} onChange={v => setNHS({ [keys[1]]: v * 10000 })} unit="万/人" w="w-12" step={0.5} min={0} />
        <Inp label="平等割" value={Math.round(nhs[keys[2]] / 10000)} onChange={v => setNHS({ [keys[2]]: v * 10000 })} unit="万/世帯" w="w-12" step={0.5} min={0} />
        <Inp label="限度額" value={Math.round(nhs[keys[3]] / 10000)} onChange={v => setNHS({ [keys[3]]: v * 10000 })} unit="万" w="w-12" step={5} min={0} />
      </FieldRow>
    </div>
  );

  const flags = { child: s.childAllowanceEnabled !== false, tashi: s.tashiWaiverEnabled !== false, hs: s.hsSupportEnabled !== false };
  const flagsChanged = !flags.child || !flags.tashi || !flags.hs;
  const activeCount = [
    slide !== -0.8 || !!s.returnRateKF?.length,
    flagsChanged || !!s.retirementLivingExpenseMan,
    !!s.livingExpenseRules?.enabled,
    !!s.afterSelfDeathSpouseIncome?.enabled,
    !!s.protectionSettings,
    !!s.nhsSettings,
  ].filter(Boolean).length;

  return (
    <Section title="シナリオ設定" icon="⚙" borderColor="#6b7280" bgOpen="bg-gray-50/50" open={open} onToggle={onToggle}
      linked={settingsLocked}
      badge={<span className="font-normal text-gray-400 text-[10px]">(〜{val("simEndAge", 85)}歳 資産{val("currentAssetsMan", 0).toLocaleString()}万 利回り{rr}%)</span>}
      right={isLinked ? <Lnk linked={settingsLocked} onToggle={toggleSettingsLock} /> : undefined}>
      <div className="space-y-1.5">
        {/* 基本 */}
        <FieldRow>
          <Inp label="初期資産" value={val("currentAssetsMan", 0)} onChange={v => onChange({ ...s, currentAssetsMan: v })} unit="万円" w="w-20" step={100} min={0} disabled={ro}
            help="預貯金＋投資（DC/NISA除く）の合計。住宅等の実物資産は含めない" presets={ro ? undefined : [0, 300, 500, 1000, 2000, 3000]} />
          <Inp label="試算終了" value={val("simEndAge", 85)} onChange={v => onChange({ ...s, simEndAge: v })} unit="歳" w="w-12" min={val("retirementAge", 65)} max={110} step={5} disabled={ro} />
          <Inp label="運用利回り" value={rr} onChange={v => onChange({ ...s, rr: v })} unit="%" w="w-12" step={0.5} min={0} max={20} disabled={ro} help="投資資産の想定年率（名目）。個別口座の利回りは NISA/投資 で上書き可" />
          <Inp label="インフレ" value={infl} onChange={v => onChange({ ...s, inflationRate: v })} unit="%" w="w-12" step={0.25} min={0} max={10} disabled={ro} help="生活費・年金改定に反映" />
          {hasSpouse && (
            <>
              <Btns label="扶養控除" options={[{ value: "self" as const, label: "本人" }, { value: "spouse" as const, label: "配偶者" }]}
                value={val("dependentDeductionHolder", "self")} onChange={v => onChange({ ...s, dependentDeductionHolder: v })} disabled={ro} />
            </>
          )}
        </FieldRow>

        <AdvancedFold activeCount={activeCount}>
        {/* 年金・利回りの詳細 */}
        <>
          <SubGroup title="年金・利回りの詳細">
            <FieldRow>
              <span className="inline-flex items-center gap-1">
                <Inp label="マクロスライド" value={slide} onChange={v => onChange({ ...s, macroSlideRate: v })} unit="%" w="w-12" step={0.1} min={-2} max={0} disabled={ro} />
                <span className="text-[10px] text-gray-400" title="年金改定率 = インフレ率 + マクロスライド調整率（名目下限0%）">
                  → 年金改定 {Math.max(0, infl + slide).toFixed(1)}%/年
                </span>
              </span>
              <details className="text-[10px]">
                <summary className="cursor-pointer select-none text-gray-500">年齢別利回り{s.returnRateKF?.length ? ` (${s.returnRateKF.length}件)` : ""}</summary>
                <div className="mt-1 space-y-0.5 pl-2">
                  <div className="text-gray-400">設定した年齢以降のデフォルト利回りを上書き（個別設定がある口座は除外）</div>
                  {(s.returnRateKF || []).map((kf: Keyframe, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <NumField value={kf.age} step={1} min={val("currentAge", 30)} max={val("simEndAge", 85)} unit="歳〜" w="w-10"
                        onChange={a => onChange({ ...s, returnRateKF: (s.returnRateKF || []).map((k, j) => j === i ? { ...k, age: a } : k) })}
                        onCommit={() => onChange({ ...s, returnRateKF: sortKF(s.returnRateKF || []) })} />
                      <NumField value={kf.value} step={0.5} min={0} max={20} unit="%" w="w-10"
                        onChange={v => onChange({ ...s, returnRateKF: (s.returnRateKF || []).map((k, j) => j === i ? { ...k, value: v } : k) })} />
                      <button type="button" onClick={() => onChange({ ...s, returnRateKF: (s.returnRateKF || []).filter((_, j) => j !== i) })} className="text-gray-300 hover:text-red-500">×</button>
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <MiniBtn onClick={() => {
                      const cur = s.returnRateKF || [];
                      const newAge = cur.length > 0 ? cur[cur.length - 1].age + 10 : val("currentAge", 30);
                      onChange({ ...s, returnRateKF: sortKF([...cur, { age: newAge, value: rr }]) });
                    }}>＋ 追加</MiniBtn>
                    {(s.returnRateKF?.length ?? 0) > 0 && <MiniBtn tone="red" onClick={() => onChange({ ...s, returnRateKF: undefined })}>クリア</MiniBtn>}
                  </div>
                </div>
              </details>
            </FieldRow>
          </SubGroup>
        </>

        {/* 子育て支援・老後生活費 */}
        <>
          <SubGroup title="子育て支援制度・老後生活費">
            <FieldRow>
              <Check label="児童手当" checked={flags.child} onChange={v => onChange({ ...s, childAllowanceEnabled: v || undefined })} />
              <Check label="多子世帯授業料減免" checked={flags.tashi} onChange={v => onChange({ ...s, tashiWaiverEnabled: v || undefined })} />
              <Check label="高校就学支援金" checked={flags.hs} onChange={v => onChange({ ...s, hsSupportEnabled: v || undefined })} />
              <Inp label="老後生活費" value={s.retirementLivingExpenseMan ?? 0} onChange={v => onChange({ ...s, retirementLivingExpenseMan: v || undefined })} unit="万/月" w="w-12" step={1} min={0} help="0＝生活費の変化点をそのまま使用。設定時は年金開始以降に適用" />
            </FieldRow>
          </SubGroup>
        </>

        {/* 生活費自動調整 */}
        <>
          <SubGroup title="生活費の自動調整">
            <FieldRow>
              <Check label="子の独立・万一後に生活費を自動で減らす" checked={s.livingExpenseRules?.enabled ?? false}
                onChange={v => onChange({ ...s, livingExpenseRules: { childIndependenceAge: 22, reductionPerChildPct: 10, selfDeathReductionPct: 70, spouseDeathReductionPct: 70, ...(s.livingExpenseRules || {}), enabled: v } })} />
              {s.livingExpenseRules?.enabled && <>
                <Inp label="子独立" value={s.livingExpenseRules.childIndependenceAge} onChange={v => onChange({ ...s, livingExpenseRules: { ...s.livingExpenseRules!, childIndependenceAge: v } })} unit="歳" w="w-10" step={1} min={18} max={30} />
                <Inp label="1人あたり" value={s.livingExpenseRules.reductionPerChildPct} onChange={v => onChange({ ...s, livingExpenseRules: { ...s.livingExpenseRules!, reductionPerChildPct: v } })} unit="%減" w="w-10" step={5} min={0} max={50} />
                <Inp label="本人万一後" value={s.livingExpenseRules.selfDeathReductionPct} onChange={v => onChange({ ...s, livingExpenseRules: { ...s.livingExpenseRules!, selfDeathReductionPct: v } })} unit="%" w="w-10" step={5} min={0} max={100} />
                <Inp label="配偶者万一後" value={s.livingExpenseRules.spouseDeathReductionPct} onChange={v => onChange({ ...s, livingExpenseRules: { ...s.livingExpenseRules!, spouseDeathReductionPct: v } })} unit="%" w="w-10" step={5} min={0} max={100} />
              </>}
            </FieldRow>
          </SubGroup>
        </>

        {/* 万一後の配偶者収入 */}
        <>
          <SubGroup title="本人万一後の配偶者収入">
            <FieldRow>
              <Check label="見直す" checked={s.afterSelfDeathSpouseIncome?.enabled ?? false}
                onChange={v => onChange({ ...s, afterSelfDeathSpouseIncome: { monthlyMan: 20, bonusMan: 0, retirementAge: 65, ...(s.afterSelfDeathSpouseIncome || {}), enabled: v } })} />
              {s.afterSelfDeathSpouseIncome?.enabled && <>
                <Inp label="月収" value={s.afterSelfDeathSpouseIncome.monthlyMan} onChange={v => onChange({ ...s, afterSelfDeathSpouseIncome: { ...s.afterSelfDeathSpouseIncome!, monthlyMan: v } })} unit="万" w="w-12" step={5} min={0} />
                <Inp label="賞与" value={s.afterSelfDeathSpouseIncome.bonusMan} onChange={v => onChange({ ...s, afterSelfDeathSpouseIncome: { ...s.afterSelfDeathSpouseIncome!, bonusMan: v } })} unit="万/年" w="w-12" step={10} min={0} />
                <Inp label="退職" value={s.afterSelfDeathSpouseIncome.retirementAge} onChange={v => onChange({ ...s, afterSelfDeathSpouseIncome: { ...s.afterSelfDeathSpouseIncome!, retirementAge: v } })} unit="歳" w="w-12" step={1} min={40} max={75} />
              </>}
            </FieldRow>
          </SubGroup>
        </>

        {/* 必要保障額 */}
        <>
          <SubGroup title="必要保障額分析の前提">
            <FieldRow>
              <Inp label="葬儀費用" value={ps.funeralCostMan} onChange={v => setPS({ funeralCostMan: v })} unit="万" w="w-12" step={50} min={0} />
              <Inp label="予備資金" value={ps.emergencyReserveMan} onChange={v => setPS({ emergencyReserveMan: v })} unit="万" w="w-12" step={100} min={0} />
              <Inp label="遺族生活費" value={ps.survivorLivingRatio} onChange={v => setPS({ survivorLivingRatio: v })} unit="%" w="w-12" step={5} min={0} max={100} />
              <Inp label="死亡退職金" value={ps.deathRetirementBonusMan ?? 0} onChange={v => setPS({ deathRetirementBonusMan: v || undefined })} unit="万" w="w-12" step={100} min={0} />
              <Check label="万一後の家賃を見直す" checked={ps.afterDeathRentEnabled ?? false} onChange={v => setPS({ afterDeathRentEnabled: v })} />
              {ps.afterDeathRentEnabled && <>
                <Inp label="家賃" value={ps.afterDeathRentMonthlyMan ?? 0} onChange={v => setPS({ afterDeathRentMonthlyMan: v || undefined })} unit="万/月" w="w-12" step={1} min={0} />
                <Inp label="〜" value={ps.afterDeathRentEndAge ?? 0} onChange={v => setPS({ afterDeathRentEndAge: v || undefined })} unit="歳" w="w-12" step={5} min={0} max={100} help="0＝終身" />
              </>}
            </FieldRow>
          </SubGroup>
        </>

        {/* 国保 */}
        <>
          <SubGroup title="国民健康保険料率（退職後・年金受給者に影響）">
            <details className="text-[10px] text-gray-400">
              <summary className="cursor-pointer select-none text-gray-500">料率を入力{s.nhsSettings ? " ●" : "（未設定＝所得の約10%で概算）"}</summary>
              <div className="mt-1 space-y-1 pl-2">
                {nhsGroup("医療分", ["medIncomeRate", "medPerCapita", "medEqualAmount", "medCap"], 20)}
                {nhsGroup("後期高齢者支援金分", ["supportIncomeRate", "supportPerCapita", "supportEqualAmount", "supportCap"], 10)}
                {nhsGroup("介護分（40〜64歳）", ["careIncomeRate", "carePerCapita", "careEqualAmount", "careCap"], 5)}
                {s.nhsSettings && <MiniBtn tone="red" onClick={() => onChange({ ...s, nhsSettings: undefined })}>リセット（概算に戻す）</MiniBtn>}
              </div>
            </details>
          </SubGroup>
        </>
        </AdvancedFold>
      </div>
    </Section>
  );
}
