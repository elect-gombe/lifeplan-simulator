import React, { useState } from "react";
import type { Scenario, BaseResult } from "../../lib/types";
import type { CalcParams } from "../../lib/calc";
import { DEFAULT_WIZARD, STEPS, LAST_STEP, SPOUSE_STEP, type WizardData } from "./types";
import { scenarioToWizardData } from "./convert";
import { StepSelf, StepSpouse } from "./MemberStep";
import { StepFamily } from "./StepFamily";
import { StepAssets } from "./StepAssets";
import { StepInsuranceCar } from "./StepInsuranceCar";
import { StepNISA } from "./StepNISA";
import { StepPreview, CompleteButton } from "./StepPreview";

/** Multi-step onboarding wizard that produces the base Scenario. */
export function SetupWizard({
  onComplete,
  onClose,
  calcParams,
  base,
  initialScenario,
}: {
  onComplete: (s: Scenario) => void;
  onClose: () => void;
  calcParams: CalcParams;
  base: BaseResult;
  initialScenario?: Scenario;
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(() =>
    initialScenario ? scenarioToWizardData(initialScenario) : DEFAULT_WIZARD
  );

  // Step 3 is spouse — skip if no spouse
  const nextStep = (cur: number) => {
    const n = cur + 1;
    if (n === SPOUSE_STEP && !data.hasSpouse) return SPOUSE_STEP + 1;
    return n;
  };
  const prevStep = (cur: number) => {
    const n = cur - 1;
    if (n === SPOUSE_STEP && !data.hasSpouse) return SPOUSE_STEP - 1;
    return n;
  };
  const canGoTo = (n: number) => {
    if (n === step) return false;
    if (n === SPOUSE_STEP && !data.hasSpouse) return false;
    return true;
  };

  const canNext = () => {
    if (step === 1) return data.currentAge >= 20 && data.currentAge <= 70;
    return true;
  };

  const next = () => { if (step < LAST_STEP) setStep(s => nextStep(s)); };
  const prev = () => { if (step > 1) setStep(s => prevStep(s)); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl flex flex-col" style={{height: "min(900px, 95vh)"}}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h1 className="text-sm font-bold text-gray-800">ライフプランをはじめましょう</h1>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        {/* Progress */}
        <div className="px-5 py-2 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const n = i + 1;
              const skipped = n === SPOUSE_STEP && !data.hasSpouse;
              const done = n < step && !skipped;
              const active = n === step;
              const clickable = canGoTo(n);
              return (
                <React.Fragment key={n}>
                  <button
                    onClick={() => clickable && setStep(n)}
                    className="flex flex-col items-center gap-0.5"
                    disabled={skipped}
                  >
                    <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${active ? "bg-blue-600 text-white" : skipped ? "bg-gray-100 text-gray-300" : done ? "bg-green-500 text-white cursor-pointer" : "bg-gray-200 text-gray-500 cursor-pointer hover:bg-gray-300"}`}>
                      {skipped ? "−" : done ? "✓" : n}
                    </div>
                    <span className={`text-[9px] ${active ? "text-blue-600 font-semibold" : skipped ? "text-gray-300" : done ? "text-green-600" : "text-gray-400"}`}>
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 ${n < step && !skipped ? "bg-green-400" : "bg-gray-200"}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && <StepSelf data={data} onChange={setData} />}
          {step === 2 && <StepFamily data={data} onChange={setData} />}
          {step === 3 && <StepSpouse data={data} onChange={setData} />}
          {step === 4 && <StepAssets data={data} onChange={setData} />}
          {step === 5 && <StepInsuranceCar data={data} onChange={setData} />}
          {step === 6 && <StepNISA data={data} onChange={setData} />}
          {step === 7 && <StepPreview data={data} calcParams={calcParams} base={base} />}
        </div>

        {/* Footer nav */}
        {step < LAST_STEP && (
          <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50">
            <button
              onClick={prev}
              disabled={step === 1}
              className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-30"
            >
              ← 戻る
            </button>
            <button
              onClick={next}
              disabled={!canNext()}
              className="rounded bg-blue-600 px-5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              次へ →
            </button>
          </div>
        )}
        {step === LAST_STEP && (
          <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50">
            <div className="flex gap-2">
              <button onClick={prev} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-200">
                ← 戻る
              </button>
              <button
                onClick={() => { setData(DEFAULT_WIZARD); setStep(1); }}
                className="rounded px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-100"
              >
                はじめから
              </button>
            </div>
            <CompleteButton data={data} onComplete={onComplete} />
          </div>
        )}
      </div>
    </div>
  );
}
