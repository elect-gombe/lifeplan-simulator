import React from "react";
import type { Scenario, SettingKey } from "../lib/types";
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
          <div className="flex items-center gap-1">
            <Inp label="スライド調整率" value={val("macroSlideRate", -0.8)} onChange={v => onChange({ ...s, macroSlideRate: v })} unit="%" w="w-14" step={0.1} min={-2} max={0} disabled={ro} />
            <span className="text-[10px] text-gray-400 whitespace-nowrap" title="年金改定率 = インフレ率 + マクロスライド調整率（名目下限0%）">
              ({val("inflationRate", defaultInflation ?? 1.5)}%{val("macroSlideRate", -0.8) >= 0 ? "+" : ""}{val("macroSlideRate", -0.8)}%={Math.max(0, (val("inflationRate", defaultInflation ?? 1.5) ?? 0) + (val("macroSlideRate", -0.8) ?? 0)).toFixed(1)}%/年)
            </span>
          </div>
        </div>
    </Section>
  );
}
