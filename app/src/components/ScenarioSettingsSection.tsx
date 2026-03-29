import React from "react";
import type { Scenario, SettingKey, Keyframe } from "../lib/types";
import { sortKF } from "../lib/types";
import { Section } from "./Section";
import { Inp, Btns, Lnk } from "./ui";

// ===== Scenario Settings Section =====
export function ScenarioSettingsSection({ s, onChange, isLinked, baseScenario, open, onToggle, defaultRR, defaultInflation }: {
  s: Scenario; onChange: (s: Scenario) => void;
  isLinked: boolean; baseScenario?: Scenario | null;
  open: boolean; onToggle: () => void;
  defaultRR?: number; defaultInflation?: number;
}) {
  const sp = s.spouse;
  // Global settings link: linked when overrideSettings is empty/undefined
  const settingsLocked = isLinked && !(s.overrideSettings && s.overrideSettings.length > 0);
  const toggleSettingsLock = () => {
    if (!isLinked) return;
    if (settingsLocked) {
      // Unlock: mark all settings as overridden (copy base values)
      const allKeys: SettingKey[] = ["currentAge", "retirementAge", "simEndAge", "currentAssetsMan", "selfGender", "years", "dependentDeductionHolder", "pensionStartAge", "pensionWorkStartAge", "macroSlideRate", "rr", "inflationRate"];
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
      right={isLinked ? <Lnk linked={settingsLocked} onToggle={toggleSettingsLock} /> : undefined}>
        <div className="flex flex-wrap gap-2 text-xs">
          <Inp label="シミュ終了" value={val("simEndAge", 85)} onChange={v => onChange({ ...s, simEndAge: v })} unit="歳" w="w-12" min={val("retirementAge", 65)} max={100} step={5} disabled={ro} />
          <Inp label="初期資産" value={val("currentAssetsMan", 0)} onChange={v => onChange({ ...s, currentAssetsMan: v })} unit="万" w="w-20" step={100} disabled={ro} />
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-[10px]">扶養控除</span>
            <Btns options={[{value:"self" as const,label:"本人"},{value:"spouse" as const,label:"配偶者"}]}
              value={val("dependentDeductionHolder", "self")} onChange={v => onChange({ ...s, dependentDeductionHolder: v })} disabled={ro} />
          </div>
          <Inp label="利回り" value={val("rr", defaultRR ?? 4)} onChange={v => onChange({ ...s, rr: v })} unit="%" w="w-14" step={0.5} min={0} max={20} disabled={ro} />
          <Inp label="インフレ" value={val("inflationRate", defaultInflation ?? 1.5)} onChange={v => onChange({ ...s, inflationRate: v })} unit="%" w="w-14" step={0.25} min={0} max={10} disabled={ro} />
          {/* Phase 5: 年齢別利回り */}
          <details className="text-[10px]">
            <summary className="cursor-pointer text-gray-500 select-none">年齢別利回り{s.returnRateKF?.length ? ` (${s.returnRateKF.length}件)` : ""}</summary>
            <div className="mt-1 pl-2 space-y-0.5">
              <div className="text-gray-400">設定した年齢以降のデフォルト利回りを上書き（個別設定がある口座は除外）</div>
              {(s.returnRateKF || []).map((kf: Keyframe) => (
                <div key={kf.age} className="flex items-center gap-1">
                  <input type="number" value={kf.age} step={1} min={val("currentAge", 30)} max={val("simEndAge", 85)}
                    onChange={e => onChange({ ...s, returnRateKF: sortKF((s.returnRateKF||[]).map(k => k.age === kf.age ? {...k, age: Number(e.target.value)} : k)) })}
                    className="w-10 rounded border px-1 py-0.5 text-[10px] font-mono" />
                  <span className="text-gray-400">歳</span>
                  <input type="number" value={kf.value} step={0.5} min={0} max={20}
                    onChange={e => onChange({ ...s, returnRateKF: (s.returnRateKF||[]).map(k => k.age === kf.age ? {...k, value: Number(e.target.value)} : k) })}
                    className="w-12 rounded border px-1 py-0.5 text-[10px]" />
                  <span className="text-gray-400">%</span>
                  <button onClick={() => onChange({ ...s, returnRateKF: (s.returnRateKF||[]).filter(k => k.age !== kf.age) })} className="text-gray-300 hover:text-red-500">×</button>
                </div>
              ))}
              <button onClick={() => {
                const cur = s.returnRateKF || [];
                const newAge = cur.length > 0 ? cur[cur.length - 1].age + 10 : val("currentAge", 30);
                onChange({ ...s, returnRateKF: sortKF([...cur, { age: newAge, value: val("rr", defaultRR ?? 4) }]) });
              }} className="text-[10px] rounded px-1.5 py-0.5 bg-blue-50 text-blue-600">＋追加</button>
              {(s.returnRateKF?.length ?? 0) > 0 && (
                <button onClick={() => onChange({ ...s, returnRateKF: undefined })} className="text-[10px] rounded px-1.5 py-0.5 bg-red-50 text-red-400 ml-1">クリア</button>
              )}
            </div>
          </details>
          <div className="flex items-center gap-1">
            <Inp label="スライド調整率" value={val("macroSlideRate", -0.8)} onChange={v => onChange({ ...s, macroSlideRate: v })} unit="%" w="w-14" step={0.1} min={-2} max={0} disabled={ro} />
            <span className="text-[10px] text-gray-400 whitespace-nowrap" title="年金改定率 = インフレ率 + マクロスライド調整率（名目下限0%）">
              ({val("inflationRate", defaultInflation ?? 1.5)}%{val("macroSlideRate", -0.8) >= 0 ? "+" : ""}{val("macroSlideRate", -0.8)}%={Math.max(0, (val("inflationRate", defaultInflation ?? 1.5) ?? 0) + (val("macroSlideRate", -0.8) ?? 0)).toFixed(1)}%/年)
            </span>
          </div>
        </div>
        {/* Phase 15: 児童手当 / Phase 16: 老後生活費 */}
        <div className="flex flex-wrap items-center gap-3 text-xs mt-1 border-t border-gray-100 pt-1">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={s.childAllowanceEnabled !== false}
              onChange={e => onChange({ ...s, childAllowanceEnabled: e.target.checked || undefined })} />
            <span className="text-gray-500 text-[10px]">児童手当を考慮する</span>
          </label>
          <Inp label="老後生活費" value={s.retirementLivingExpenseMan ?? 0} onChange={v => onChange({ ...s, retirementLivingExpenseMan: v || undefined })} unit="万/月(0=KF)" w="w-12" step={1} min={0} />
        </div>
        {/* Phase 7: 必要保障額分析設定 */}
        <div className="flex flex-wrap items-center gap-2 text-xs mt-1 border-t border-gray-100 pt-1">
          <details className="text-[10px] w-full">
            <summary className="cursor-pointer text-gray-500 select-none">必要保障額の設定{s.protectionSettings ? " ●" : ""}</summary>
            <div className="mt-1 pl-2 space-y-1.5">
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const ps0 = { funeralCostMan: 200, emergencyReserveMan: 0, survivorLivingRatio: 70, ...(s.protectionSettings || {}) };
                  return (<>
                    <Inp label="葬儀費用" value={ps0.funeralCostMan} onChange={v => onChange({ ...s, protectionSettings: { ...ps0, funeralCostMan: v }})} unit="万" w="w-14" step={50} min={0} />
                    <Inp label="予備資金" value={ps0.emergencyReserveMan} onChange={v => onChange({ ...s, protectionSettings: { ...ps0, emergencyReserveMan: v }})} unit="万" w="w-14" step={100} min={0} />
                    <Inp label="遺族生活費" value={ps0.survivorLivingRatio} onChange={v => onChange({ ...s, protectionSettings: { ...ps0, survivorLivingRatio: v }})} unit="%" w="w-12" step={5} min={0} max={100} />
                    <Inp label="死亡退職金" value={ps0.deathRetirementBonusMan ?? 0} onChange={v => onChange({ ...s, protectionSettings: { ...ps0, deathRetirementBonusMan: v || undefined }})} unit="万" w="w-14" step={100} min={0} />
                  </>);
                })()}
              </div>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={s.protectionSettings?.afterDeathRentEnabled ?? false}
                  onChange={e => onChange({ ...s, protectionSettings: { funeralCostMan: 200, emergencyReserveMan: 0, survivorLivingRatio: 70, ...(s.protectionSettings || {}), afterDeathRentEnabled: e.target.checked }})} />
                <span className="text-gray-500">万一後の家賃を見直す</span>
              </label>
              {s.protectionSettings?.afterDeathRentEnabled && (
                <div className="flex flex-wrap gap-2 pl-4">
                  <Inp label="月額" value={s.protectionSettings.afterDeathRentMonthlyMan ?? 0} onChange={v => onChange({ ...s, protectionSettings: { ...s.protectionSettings!, afterDeathRentMonthlyMan: v || undefined }})} unit="万" w="w-12" step={1} min={0} />
                  <Inp label="〜" value={s.protectionSettings.afterDeathRentEndAge ?? 0} onChange={v => onChange({ ...s, protectionSettings: { ...s.protectionSettings!, afterDeathRentEndAge: v || undefined }})} unit="歳(0=終身)" w="w-12" step={5} min={0} max={100} />
                </div>
              )}
            </div>
          </details>
        </div>
        {/* Phase 9: 国民健康保険料率詳細設定 */}
        <div className="flex flex-wrap items-center gap-2 text-xs mt-1 border-t border-gray-100 pt-1">
          <details className="text-[10px] w-full">
            <summary className="cursor-pointer text-gray-500 select-none">国民健康保険料率（詳細設定）{s.nhsSettings ? " ●" : ""}</summary>
            <div className="mt-1 pl-2 space-y-1 text-[10px] text-gray-400">
              <div>未設定時は概算率（所得の約10%）を使用。退職後・年金受給者に影響。</div>
              {(() => {
                const NHS_DEFAULT = { medEqualAmount: 0, medPerCapita: 0, medIncomeRate: 7.2, medCap: 650000, supportEqualAmount: 0, supportPerCapita: 0, supportIncomeRate: 2.4, supportCap: 240000, careEqualAmount: 0, carePerCapita: 0, careIncomeRate: 1.8, careCap: 170000 };
                const nhs = { ...NHS_DEFAULT, ...(s.nhsSettings || {}) };
                const upd = (patch: Partial<typeof NHS_DEFAULT>) => onChange({ ...s, nhsSettings: { ...nhs, ...patch } });
                return (
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-500">医療分</div>
                    <div className="flex flex-wrap gap-1">
                      <Inp label="所得割" value={nhs.medIncomeRate} onChange={v => upd({ medIncomeRate: v })} unit="%" w="w-12" step={0.1} min={0} max={20} />
                      <Inp label="均等割" value={Math.round(nhs.medPerCapita/10000)} onChange={v => upd({ medPerCapita: v * 10000 })} unit="万/人" w="w-12" step={1} min={0} />
                      <Inp label="平等割" value={Math.round(nhs.medEqualAmount/10000)} onChange={v => upd({ medEqualAmount: v * 10000 })} unit="万/世帯" w="w-14" step={1} min={0} />
                      <Inp label="限度額" value={Math.round(nhs.medCap/10000)} onChange={v => upd({ medCap: v * 10000 })} unit="万" w="w-12" step={5} min={0} />
                    </div>
                    <div className="font-semibold text-gray-500">後期高齢者支援金分</div>
                    <div className="flex flex-wrap gap-1">
                      <Inp label="所得割" value={nhs.supportIncomeRate} onChange={v => upd({ supportIncomeRate: v })} unit="%" w="w-12" step={0.1} min={0} max={10} />
                      <Inp label="均等割" value={Math.round(nhs.supportPerCapita/10000)} onChange={v => upd({ supportPerCapita: v * 10000 })} unit="万/人" w="w-12" step={0.5} min={0} />
                      <Inp label="平等割" value={Math.round(nhs.supportEqualAmount/10000)} onChange={v => upd({ supportEqualAmount: v * 10000 })} unit="万/世帯" w="w-14" step={0.5} min={0} />
                      <Inp label="限度額" value={Math.round(nhs.supportCap/10000)} onChange={v => upd({ supportCap: v * 10000 })} unit="万" w="w-12" step={5} min={0} />
                    </div>
                    <div className="font-semibold text-gray-500">介護分（40〜64歳）</div>
                    <div className="flex flex-wrap gap-1">
                      <Inp label="所得割" value={nhs.careIncomeRate} onChange={v => upd({ careIncomeRate: v })} unit="%" w="w-12" step={0.1} min={0} max={5} />
                      <Inp label="均等割" value={Math.round(nhs.carePerCapita/10000)} onChange={v => upd({ carePerCapita: v * 10000 })} unit="万/人" w="w-12" step={0.5} min={0} />
                      <Inp label="平等割" value={Math.round(nhs.careEqualAmount/10000)} onChange={v => upd({ careEqualAmount: v * 10000 })} unit="万/世帯" w="w-14" step={0.5} min={0} />
                      <Inp label="限度額" value={Math.round(nhs.careCap/10000)} onChange={v => upd({ careCap: v * 10000 })} unit="万" w="w-12" step={5} min={0} />
                    </div>
                    {s.nhsSettings && (
                      <button onClick={() => onChange({ ...s, nhsSettings: undefined })} className="text-[10px] rounded px-1.5 py-0.5 bg-red-50 text-red-400">リセット（概算に戻す）</button>
                    )}
                  </div>
                );
              })()}
            </div>
          </details>
        </div>
        {/* Phase 10: 万一後の配偶者収入見直し */}
        <div className="flex flex-wrap items-center gap-2 text-xs mt-1 border-t border-gray-100 pt-1">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={s.afterSelfDeathSpouseIncome?.enabled ?? false}
              onChange={e => onChange({ ...s, afterSelfDeathSpouseIncome: {
                monthlyMan: 20, bonusMan: 0, retirementAge: 65,
                ...(s.afterSelfDeathSpouseIncome || {}), enabled: e.target.checked,
              }})} />
            <span className="text-gray-500 text-[10px]">本人万一後に配偶者収入見直し</span>
          </label>
          {s.afterSelfDeathSpouseIncome?.enabled && <>
            <Inp label="月収" value={s.afterSelfDeathSpouseIncome.monthlyMan}
              onChange={v => onChange({ ...s, afterSelfDeathSpouseIncome: { ...s.afterSelfDeathSpouseIncome!, monthlyMan: v }})}
              unit="万" w="w-12" step={5} min={0} />
            <Inp label="賞与" value={s.afterSelfDeathSpouseIncome.bonusMan}
              onChange={v => onChange({ ...s, afterSelfDeathSpouseIncome: { ...s.afterSelfDeathSpouseIncome!, bonusMan: v }})}
              unit="万/年" w="w-12" step={10} min={0} />
            <Inp label="退職年齢" value={s.afterSelfDeathSpouseIncome.retirementAge}
              onChange={v => onChange({ ...s, afterSelfDeathSpouseIncome: { ...s.afterSelfDeathSpouseIncome!, retirementAge: v }})}
              unit="歳" w="w-12" step={1} min={40} max={75} />
          </>}
        </div>
        {/* Phase 1: 生活費自動調整 */}
        <div className="flex flex-wrap items-center gap-2 text-xs mt-1 border-t border-gray-100 pt-1">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={s.livingExpenseRules?.enabled ?? false}
              onChange={e => onChange({ ...s, livingExpenseRules: {
                childIndependenceAge: 22, reductionPerChildPct: 10,
                selfDeathReductionPct: 70, spouseDeathReductionPct: 70,
                ...(s.livingExpenseRules || {}),
                enabled: e.target.checked,
              }})} />
            <span className="text-gray-500 text-[10px]">生活費自動調整</span>
          </label>
          {s.livingExpenseRules?.enabled && <>
            <Inp label="子独立年齢" value={s.livingExpenseRules.childIndependenceAge}
              onChange={v => onChange({ ...s, livingExpenseRules: { ...s.livingExpenseRules!, childIndependenceAge: v }})}
              unit="歳" w="w-12" step={1} min={18} max={30} />
            <Inp label="独立1人あたり" value={s.livingExpenseRules.reductionPerChildPct}
              onChange={v => onChange({ ...s, livingExpenseRules: { ...s.livingExpenseRules!, reductionPerChildPct: v }})}
              unit="%" w="w-12" step={5} min={0} max={50} />
            <Inp label="本人万一後" value={s.livingExpenseRules.selfDeathReductionPct}
              onChange={v => onChange({ ...s, livingExpenseRules: { ...s.livingExpenseRules!, selfDeathReductionPct: v }})}
              unit="%" w="w-12" step={5} min={0} max={100} />
            <Inp label="配偶者万一後" value={s.livingExpenseRules.spouseDeathReductionPct}
              onChange={v => onChange({ ...s, livingExpenseRules: { ...s.livingExpenseRules!, spouseDeathReductionPct: v }})}
              unit="%" w="w-12" step={5} min={0} max={100} />
          </>}
        </div>
    </Section>
  );
}
