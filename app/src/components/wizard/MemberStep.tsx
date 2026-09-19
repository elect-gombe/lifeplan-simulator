import { useState } from "react";
import { Inp, Btns } from "../ui";
import { MemberEditor, CareerHistoryEditor, type MemberData, type MemberPatch } from "../KeyframeEditor";
import type { WizardData, StepProps } from "./types";
import { calcTakeHome, calcPensionEstimate } from "./convert";

// ============================================================
// 共通: MemberStep（本人・配偶者で対称）
// ============================================================

function MemberStep({ data, onChange, isSelf }: {
  data: WizardData;
  onChange: (d: WizardData) => void;
  isSelf: boolean;
}) {
  const [memberOpen, setMemberOpen] = useState(true);

  // 年齢キーとKFキーを対象的に解決
  const ageKey      = isSelf ? "currentAge"      : "spouseAge"      as const;
  const retKey      = isSelf ? "retirementAge"    : "spouseRetirementAge" as const;
  const penKey      = isSelf ? "pensionStartAge"  : "spousePensionStartAge" as const;
  const workKey     = isSelf ? "pensionWorkStartAge" : "spousePensionWorkStartAge" as const;
  const typeKey     = isSelf ? "incomeType"       : "spouseIncomeType" as const;
  const growthKey   = isSelf ? "salaryGrowthRate" : "spouseSalaryGrowthRate" as const;
  const furusatoKey = isSelf ? "hasFurusato"      : "spouseHasFurusato" as const;
  const dcRxKey     = isSelf ? "dcReceiveMethod"  : "spouseDcReceiveMethod" as const;
  const careerKey   = isSelf ? "careerHistory"    : "spouseCareerHistory" as const;
  const incKey      = isSelf ? "incomeKF"         : "spouseIncomeKF" as const;
  const dcKey       = isSelf ? "dcTotalKF"        : "spouseDcTotalKF" as const;
  const coKey       = isSelf ? "companyDCKF"      : "spouseCompanyDCKF" as const;
  const idKey       = isSelf ? "idecoKF"          : "spouseIdecoKF" as const;

  const u = (patch: Partial<WizardData>) => {
    const next = { ...data, ...patch };
    if (isSelf) {
      if ("currentAge" in patch && !next.retirementTouched)
        next.retirementAge = Math.min(70, Math.max(55, next.currentAge + 35));
      if ("retirementAge" in patch && !next.simEndTouched)
        next.simEndAge = next.retirementAge + 25;
    }
    onChange(next);
  };

  const currentAge    = data[ageKey];
  const retirementAge = data[retKey];
  const incomeKF      = isSelf ? data.incomeKF : (data.spouseIncomeKF.length > 0 ? data.spouseIncomeKF : (data.spouseIncomeMan > 0 ? [{ age: data.spouseAge, value: data.spouseIncomeMan }] : []));
  const currentIncome = incomeKF[0]?.value ?? 0;
  const pensionAnnual = data[typeKey] === "employee"
    ? calcPensionEstimate(currentIncome, retirementAge, data[workKey], data[penKey])
    : 81;

  const memberData: MemberData = {
    incomeKF,
    expenseKF: isSelf ? data.expenseKF : [],
    dcTotalKF:   data[dcKey],
    companyDCKF: data[coKey],
    idecoKF:     data[idKey],
    salaryGrowthRate: data[growthKey],
    sirPct: 15.75,
    hasFurusato: data[furusatoKey],
    dcReceiveMethod: data[dcRxKey],
  };

  const handleUpdate = (patch: MemberPatch) => {
    const p: Partial<WizardData> = {};
    if ("incomeKF"        in patch) { (p as Partial<WizardData>)[incKey] = patch.incomeKF; if (!isSelf) p.spouseIncomeMan = patch.incomeKF?.[0]?.value ?? 0; }
    if ("expenseKF"       in patch && isSelf) p.expenseKF = patch.expenseKF;
    if ("dcTotalKF"       in patch) (p as Partial<WizardData>)[dcKey]       = patch.dcTotalKF;
    if ("companyDCKF"     in patch) (p as Partial<WizardData>)[coKey]       = patch.companyDCKF;
    if ("idecoKF"         in patch) (p as Partial<WizardData>)[idKey]       = patch.idecoKF;
    if ("salaryGrowthRate" in patch) (p as Partial<WizardData>)[growthKey]  = patch.salaryGrowthRate;
    if ("hasFurusato"     in patch) (p as Partial<WizardData>)[furusatoKey] = patch.hasFurusato;
    if ("dcReceiveMethod" in patch) (p as Partial<WizardData>)[dcRxKey]     = patch.dcReceiveMethod;
    if ("careerHistory"   in patch) (p as Partial<WizardData>)[careerKey]   = patch.careerHistory;
    u(p);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-gray-800">{isSelf ? "本人" : "配偶者"}の情報</h2>

      <div className="flex flex-wrap gap-3 items-end">
        <Inp label="年齢" value={currentAge} onChange={v => u({ [ageKey]: v, ...(isSelf ? { retirementTouched: false } : {}) } as Partial<WizardData>)} unit="歳" w="w-12" step={1} min={18} max={70} />
        {isSelf && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">性別</span>
            <Btns options={[{ value: "male" as const, label: "男" }, { value: "female" as const, label: "女" }]} value={data.gender} onChange={v => u({ gender: v })} />
          </div>
        )}
        <Inp label="退職予定" value={retirementAge} onChange={v => u({ [retKey]: v, ...(isSelf ? { retirementTouched: true } : {}) } as Partial<WizardData>)} unit="歳" w="w-12" step={1} min={50} max={80} />
        {isSelf && <Inp label="試算終了" value={data.simEndAge} onChange={v => u({ simEndAge: v, simEndTouched: true })} unit="歳" w="w-12" step={1} min={retirementAge + 10} max={100} />}
      </div>

      {isSelf && (
        <div className="flex gap-1 items-stretch h-5 rounded overflow-hidden text-[9px] font-bold text-white">
          <div className="bg-blue-400 flex items-center justify-center" style={{ flex: retirementAge - currentAge }}>就労{retirementAge - currentAge}年</div>
          <div className="bg-amber-400 flex items-center justify-center" style={{ flex: data.simEndAge - retirementAge }}>老後{data.simEndAge - retirementAge}年</div>
        </div>
      )}

      {currentIncome > 0 && (
        <div className="text-[10px] text-green-700 bg-green-50 rounded px-2 py-1">
          手取り約{calcTakeHome(currentIncome)}万円/年 ／ 年金（{data[penKey]}歳〜）約{pensionAnnual}万円/年
        </div>
      )}

      <MemberEditor
        label={isSelf ? "本人" : "配偶者"}
        color={isSelf ? "#374151" : "#be185d"}
        data={memberData}
        onUpdate={handleUpdate}
        currentAge={currentAge}
        retirementAge={retirementAge}
        excludeTracks={isSelf ? [] : ["expenseKF"]}
        linked={false}
        open={memberOpen}
        onToggle={() => setMemberOpen(o => !o)}
        extraFields={<>
          <Btns
            options={[{ value: "employee" as const, label: "会社員・公務員" }, { value: "self_employed" as const, label: "自営業・その他" }]}
            value={data[typeKey]} onChange={v => u({ [typeKey]: v } as Partial<WizardData>)}
          />
          <Inp label="退職" value={retirementAge} onChange={v => u({ [retKey]: v, ...(isSelf ? { retirementTouched: true } : {}) } as Partial<WizardData>)} unit="歳" w="w-12" step={1} min={50} max={80} />
          <Inp label="年金開始" value={data[penKey]} onChange={v => u({ [penKey]: v } as Partial<WizardData>)} unit="歳" w="w-12" step={1} min={60} max={75} />
          <Inp label="就職" value={data[workKey]} onChange={v => u({ [workKey]: v } as Partial<WizardData>)} unit="歳" w="w-12" step={1} min={18} max={30} />
          {isSelf && <Inp label="結婚" value={data.marriageAge} onChange={v => u({ marriageAge: v })} unit="歳(0=未設定)" w="w-12" step={1} min={0} max={60} />}
          <CareerHistoryEditor
            history={data[careerKey] || []}
            onChange={h => u({ [careerKey]: h.length > 0 ? h : undefined } as Partial<WizardData>)}
            workStartAge={data[workKey]}
            retirementAge={retirementAge}
          />
        </>}
      />
    </div>
  );
}

export function StepSelf({ data, onChange }: StepProps) {
  return <MemberStep data={data} onChange={onChange} isSelf={true} />;
}

export function StepSpouse({ data, onChange }: StepProps) {
  return <MemberStep data={data} onChange={onChange} isSelf={false} />;
}
