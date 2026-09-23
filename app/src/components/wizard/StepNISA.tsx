import { useState, useMemo } from "react";
import type { Scenario, SpouseConfig } from "../../lib/types";
import { NISASection } from "../NISASection";
import { mkScenario } from "../../lib/scenarioFactory";
import type { StepProps } from "./types";

export function StepNISA({ data, onChange }: StepProps) {
  const [open, setOpen] = useState(true);

  const nisaScenario = useMemo<Scenario>(() => ({
    ...mkScenario(0),
    currentAge: data.currentAge,
    nisa: {
      enabled: data.nisaEnabled,
      accounts: data.nisaAccounts,
      annualLimitMan: data.nisaAnnualLimitMan,
      lifetimeLimitMan: data.nisaLifetimeLimitMan,
    },
    nisaReturnRate: data.nisaReturnRate,
    dcReturnRate: data.dcReturnRate,
    taxableReturnRate: data.taxableReturnRate,
    cashInterestRate: data.cashInterestRate,
    balancePolicy: data.balancePolicy,
    spouse: { ...(mkScenario(0).spouse as SpouseConfig), enabled: data.hasSpouse },
  }), [data.currentAge, data.nisaEnabled, data.nisaAccounts, data.nisaAnnualLimitMan, data.nisaLifetimeLimitMan,
      data.nisaReturnRate, data.dcReturnRate, data.taxableReturnRate, data.cashInterestRate,
      data.balancePolicy, data.hasSpouse]);

  const handleNisaChange = (s: Scenario) => {
    onChange({
      ...data,
      nisaEnabled: s.nisa?.enabled ?? false,
      nisaAccounts: (s.nisa?.accounts ?? 1) as 1 | 2,
      nisaAnnualLimitMan: s.nisa?.annualLimitMan ?? 360,
      nisaLifetimeLimitMan: s.nisa?.lifetimeLimitMan ?? 1800,
      nisaReturnRate: s.nisaReturnRate,
      dcReturnRate: s.dcReturnRate,
      taxableReturnRate: s.taxableReturnRate,
      cashInterestRate: s.cashInterestRate,
      balancePolicy: s.balancePolicy ?? data.balancePolicy,
    });
  };

  return (
    <div className="space-y-2">
      <h2 className="text-base font-bold text-gray-800">NISA・投資の設定</h2>
      <NISASection
        s={nisaScenario}
        onChange={handleNisaChange}
        currentAge={data.currentAge}
        open={open}
        onToggle={() => setOpen(o => !o)}
      />
    </div>
  );
}
