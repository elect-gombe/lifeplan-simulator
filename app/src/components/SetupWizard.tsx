import React, { useState, useMemo } from "react";
import type { Keyframe, LifeEvent, Scenario, SpouseConfig, DCReceiveMethod, CareerPeriod, BalancePolicy } from "../lib/types";
import { DEFAULT_DC_RECEIVE_METHOD, sortKF } from "../lib/types";
import { empDed, iTx, rTx, estimatePublicPension } from "../lib/tax";
import { computeScenario } from "../lib/calc";
import type { CalcParams } from "../lib/calc";
import type { BaseResult } from "../lib/types";
import { Inp, Btns } from "./ui";
import { mkScenario } from "../App";
import { ChildEventModal } from "./ChildEventModal";
import { TrackRow, type TrackDef, MemberEditor, CareerHistoryEditor, type MemberData } from "./KeyframeEditor";
import { HousingSection } from "./HousingSection";
import { InsuranceModal } from "./InsuranceModal";
import { CarModal } from "./CarModal";
import { NISASection } from "./NISASection";
import type { HousingPhase } from "../lib/types";

// ============================================================
// Types
// ============================================================

interface WizardData {
  // Step 1
  currentAge: number;
  gender: "male" | "female";
  retirementAge: number;
  simEndAge: number;
  retirementTouched: boolean;
  simEndTouched: boolean;
  // Step 2
  hasSpouse: boolean;
  spouseAge: number;
  spouseRetirementAge: number;
  spouseIncomeMan: number;
  spousePensionStartAge: number;
  marriageAge: number;
  childEvents: LifeEvent[];   // flat list: parent "child" events + education/custom sub-events
  // Step 3
  incomeKF: Keyframe[];
  incomeType: "employee" | "self_employed";
  salaryGrowthRate: number;
  hasFurusato: boolean;
  pensionWorkStartAge: number;
  pensionStartAge: number;
  // Step 3 — DC（本人）
  dcTotalKF: Keyframe[];
  companyDCKF: Keyframe[];
  idecoKF: Keyframe[];
  dcReceiveMethod: DCReceiveMethod;
  careerHistory?: CareerPeriod[];
  // Step 4 — 配偶者
  spouseIncomeKF: Keyframe[];
  spouseIncomeType: "employee" | "self_employed";
  spouseSalaryGrowthRate: number;
  spouseHasFurusato: boolean;
  spouseDcTotalKF: Keyframe[];
  spouseCompanyDCKF: Keyframe[];
  spouseIdecoKF: Keyframe[];
  spouseDcReceiveMethod: DCReceiveMethod;
  spousePensionWorkStartAge: number;
  spouseCareerHistory?: CareerPeriod[];
  // Step 4
  currentAssetsMan: number;
  expenseKF: Keyframe[];
  housingTimeline: HousingPhase[];
  insuranceEvents: LifeEvent[];
  carEvents: LifeEvent[];
  // Step 6 — NISA・投資
  balancePolicy: BalancePolicy;
  nisaEnabled: boolean;
  nisaAccounts: 1 | 2;
  nisaAnnualLimitMan: number;
  nisaLifetimeLimitMan: number;
  nisaReturnRate?: number;
  dcReturnRate?: number;
  taxableReturnRate?: number;
  cashInterestRate?: number;
}

const DEFAULT_WIZARD: WizardData = {
  currentAge: 30,
  gender: "male",
  retirementAge: 65,
  simEndAge: 90,
  retirementTouched: false,
  simEndTouched: false,
  hasSpouse: true,
  spouseAge: 28,
  spouseRetirementAge: 65,
  spouseIncomeMan: 500,
  spousePensionStartAge: 65,
  marriageAge: 0,
  childEvents: [],
  incomeKF: [{ age: 30, value: 700 }],
  incomeType: "employee",
  salaryGrowthRate: 0,
  hasFurusato: false,
  pensionWorkStartAge: 22,
  pensionStartAge: 65,
  dcTotalKF: [],
  companyDCKF: [],
  idecoKF: [],
  dcReceiveMethod: { type: "lump_sum", annuityStartAge: 65, annuityYears: 20, combinedLumpSumRatio: 50 },
  careerHistory: undefined,
  spouseIncomeKF: [{ age: 28, value: 500 }],
  spouseIncomeType: "employee",
  spouseSalaryGrowthRate: 0,
  spouseHasFurusato: false,
  spouseDcTotalKF: [],
  spouseCompanyDCKF: [],
  spouseIdecoKF: [],
  spouseDcReceiveMethod: { type: "lump_sum", annuityStartAge: 65, annuityYears: 20, combinedLumpSumRatio: 50 },
  spousePensionWorkStartAge: 22,
  spouseCareerHistory: undefined,
  currentAssetsMan: 0,
  expenseKF: [{ age: 30, value: 15 }],
  housingTimeline: [{ startAge: 30, type: "rent" as const, rentMonthlyMan: 10 }],
  insuranceEvents: [],
  carEvents: [],
  balancePolicy: { cashReserveMonths: 6, nisaPriority: true, withdrawalOrder: ["taxable", "selfNisa", "spouseNisa"] },
  nisaEnabled: false,
  nisaAccounts: 1,
  nisaAnnualLimitMan: 360,
  nisaLifetimeLimitMan: 1800,
  nisaReturnRate: undefined,
  dcReturnRate: undefined,
  taxableReturnRate: undefined,
  cashInterestRate: undefined,
};

// ============================================================
// wizardToScenario / scenarioToWizardData
// ============================================================

function wizardToScenario(d: WizardData): Scenario {
  const base = mkScenario(0);

  const events: LifeEvent[] = [...d.childEvents, ...d.insuranceEvents, ...d.carEvents];

  const spouseHasIncome = d.spouseIncomeKF.length > 0
    ? (d.spouseIncomeKF[0]?.value ?? 0) > 0
    : d.spouseIncomeMan > 0;
  const spouseIncomeKF = d.spouseIncomeKF.length > 0
    ? d.spouseIncomeKF
    : [{ age: d.currentAge, value: d.spouseIncomeMan }];

  const spouse: SpouseConfig = d.hasSpouse
    ? {
        enabled: true,
        currentAge: d.spouseAge,
        retirementAge: d.spouseRetirementAge,
        incomeKF: spouseIncomeKF,
        expenseKF: [],
        dcTotalKF: d.spouseDcTotalKF,
        companyDCKF: d.spouseCompanyDCKF,
        idecoKF: d.spouseIdecoKF,
        salaryGrowthRate: d.spouseSalaryGrowthRate,
        sirPct: 15,
        hasFurusato: d.spouseHasFurusato,
        pensionStartAge: d.spousePensionStartAge,
        dcReceiveMethod: d.spouseDcReceiveMethod,
        careerHistory: d.spouseCareerHistory?.length ? d.spouseCareerHistory
          : d.spouseIncomeType === "self_employed"
            ? [{ id: 2, startAge: d.spousePensionWorkStartAge, endAge: d.spouseRetirementAge, pensionScheme: "national" as const }]
            : undefined,
        pensionWorkStartAge: spouseHasIncome ? d.spousePensionWorkStartAge : 999,
      }
    : base.spouse!;

  return {
    ...base,
    currentAge: d.currentAge,
    selfGender: d.gender,
    retirementAge: d.retirementAge,
    simEndAge: d.simEndAge,
    incomeKF: d.incomeKF,
    salaryGrowthRate: d.salaryGrowthRate,
    hasFurusato: d.hasFurusato,
    expenseKF: d.expenseKF,
    currentAssetsMan: d.currentAssetsMan,
    pensionStartAge: d.pensionStartAge,
    pensionWorkStartAge: d.pensionWorkStartAge,
    spouse,
    marriageAge: d.marriageAge > 0 ? d.marriageAge : undefined,
    events,
    housingTimeline: d.housingTimeline,
    dcTotalKF: d.dcTotalKF,
    companyDCKF: d.companyDCKF,
    idecoKF: d.idecoKF,
    dcReceiveMethod: d.dcReceiveMethod,
    nisa: {
      enabled: d.nisaEnabled,
      accounts: d.nisaAccounts,
      annualLimitMan: d.nisaAnnualLimitMan,
      lifetimeLimitMan: d.nisaLifetimeLimitMan,
    },
    nisaReturnRate: d.nisaReturnRate,
    dcReturnRate: d.dcReturnRate,
    taxableReturnRate: d.taxableReturnRate,
    cashInterestRate: d.cashInterestRate,
    balancePolicy: d.balancePolicy,
    careerHistory: d.careerHistory?.length ? d.careerHistory
      : d.incomeType === "self_employed"
        ? [{ id: 1, startAge: d.pensionWorkStartAge, endAge: d.retirementAge, pensionScheme: "national" as const }]
        : undefined,
  };
}

function scenarioToWizardData(s: Scenario): WizardData {
  // Detect income type
  const incomeType: WizardData["incomeType"] =
    s.careerHistory?.some(c => c.pensionScheme === "national") ? "self_employed" : "employee";

  // Expense
  const monthlyExpenseMan = s.expenseKF?.[0]?.value ?? 15;

  // Children: extract all events related to children
  const childEvents = s.events.filter(e =>
    e.type === "child" ||
    (e.parentId && (e.type === "education" || e.type === "custom"))
  );
  const insuranceEvents = s.events.filter(e => e.type === "insurance");
  const carEvents = s.events.filter(e => e.type === "car");

  const spouseIncomeKF = s.spouse?.incomeKF || [];

  return {
    currentAge: s.currentAge,
    gender: s.selfGender ?? "male",
    retirementAge: s.retirementAge,
    simEndAge: s.simEndAge,
    retirementTouched: true,
    simEndTouched: true,
    hasSpouse: s.spouse?.enabled ?? false,
    spouseAge: s.spouse?.currentAge ?? 28,
    spouseRetirementAge: s.spouse?.retirementAge ?? 60,
    spouseIncomeMan: spouseIncomeKF[0]?.value ?? 0,
    spousePensionStartAge: s.spouse?.pensionStartAge ?? 65,
    marriageAge: s.marriageAge ?? 0,
    childEvents,
    incomeKF: s.incomeKF?.length ? s.incomeKF : [{ age: s.currentAge, value: 500 }],
    incomeType,
    salaryGrowthRate: s.salaryGrowthRate ?? 0,
    hasFurusato: s.hasFurusato ?? false,
    pensionWorkStartAge: s.pensionWorkStartAge ?? 22,
    pensionStartAge: s.pensionStartAge ?? 65,
    dcTotalKF: s.dcTotalKF?.length ? s.dcTotalKF : [{ age: s.currentAge, value: 55000 }],
    companyDCKF: s.companyDCKF?.length ? s.companyDCKF : [{ age: s.currentAge, value: 0 }],
    idecoKF: s.idecoKF?.length ? s.idecoKF : [{ age: s.currentAge, value: 0 }],
    dcReceiveMethod: s.dcReceiveMethod ?? DEFAULT_DC_RECEIVE_METHOD,
    careerHistory: s.careerHistory,
    spouseIncomeKF,
    spouseIncomeType: s.spouse?.careerHistory?.some(c => c.pensionScheme === "national") ? "self_employed" : "employee",
    spouseSalaryGrowthRate: s.spouse?.salaryGrowthRate ?? 0,
    spouseHasFurusato: s.spouse?.hasFurusato ?? false,
    spouseDcTotalKF: s.spouse?.dcTotalKF || [],
    spouseCompanyDCKF: s.spouse?.companyDCKF || [],
    spouseIdecoKF: s.spouse?.idecoKF || [],
    spouseDcReceiveMethod: s.spouse?.dcReceiveMethod ?? DEFAULT_DC_RECEIVE_METHOD,
    spousePensionWorkStartAge: s.spouse?.pensionWorkStartAge ?? 22,
    spouseCareerHistory: s.spouse?.careerHistory,
    currentAssetsMan: s.currentAssetsMan,
    expenseKF: s.expenseKF?.length ? s.expenseKF : [{ age: s.currentAge, value: monthlyExpenseMan }],
    housingTimeline: s.housingTimeline?.length ? s.housingTimeline : [{ startAge: s.currentAge, type: "rent" as const, rentMonthlyMan: 10 }],
    insuranceEvents,
    carEvents,
    balancePolicy: s.balancePolicy ?? { cashReserveMonths: 6, nisaPriority: true, withdrawalOrder: ["taxable", "selfNisa", "spouseNisa"] },
    nisaEnabled: s.nisa?.enabled ?? false,
    nisaAccounts: (s.nisa?.accounts ?? 1) as 1 | 2,
    nisaAnnualLimitMan: s.nisa?.annualLimitMan ?? 360,
    nisaLifetimeLimitMan: s.nisa?.lifetimeLimitMan ?? 1800,
    nisaReturnRate: s.nisaReturnRate,
    dcReturnRate: s.dcReturnRate,
    taxableReturnRate: s.taxableReturnRate,
    cashInterestRate: s.cashInterestRate,
  };
}

// ============================================================
// Preview helpers
// ============================================================

function calcTakeHome(incomeMan: number): number {
  const gross = incomeMan * 10000;
  if (gross <= 0) return 0;
  const taxable = gross - empDed(gross);
  return Math.round((gross - iTx(taxable) - rTx(taxable) - gross * 0.15) / 10000);
}

function calcPensionEstimate(
  incomeMan: number,
  retirementAge: number,
  pensionWorkStartAge: number,
  pensionStartAge: number,
): number {
  const gross = incomeMan * 10000;
  const employeeMonths = Math.max(0, retirementAge - pensionWorkStartAge) * 12;
  const pen = estimatePublicPension(gross, employeeMonths, employeeMonths, pensionStartAge);
  return Math.round(pen.totalAnnual / 10000);
}

// ============================================================
// Step 1: 本人（プロフィール + 収入 + DC 統合）
// ============================================================

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
  const expKey      = "expenseKF" as const;
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

  const handleUpdate = (patch: Partial<MemberData & Record<string, any>>) => {
    const p: Partial<WizardData> = {};
    if ("incomeKF"        in patch) { (p as any)[incKey] = patch.incomeKF; if (!isSelf) p.spouseIncomeMan = patch.incomeKF?.[0]?.value ?? 0; }
    if ("expenseKF"       in patch && isSelf) p.expenseKF = patch.expenseKF;
    if ("dcTotalKF"       in patch) (p as any)[dcKey]       = patch.dcTotalKF;
    if ("companyDCKF"     in patch) (p as any)[coKey]       = patch.companyDCKF;
    if ("idecoKF"         in patch) (p as any)[idKey]       = patch.idecoKF;
    if ("salaryGrowthRate" in patch) (p as any)[growthKey]  = patch.salaryGrowthRate;
    if ("hasFurusato"     in patch) (p as any)[furusatoKey] = patch.hasFurusato;
    if ("dcReceiveMethod" in patch) (p as any)[dcRxKey]     = patch.dcReceiveMethod;
    if ("careerHistory"   in patch) (p as any)[careerKey]   = patch.careerHistory;
    u(p);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-gray-800">{isSelf ? "本人" : "配偶者"}の情報</h2>

      <div className="flex flex-wrap gap-3 items-end">
        <Inp label="年齢" value={currentAge} onChange={v => u({ [ageKey]: v, ...(isSelf ? { retirementTouched: false } : {}) } as any)} unit="歳" w="w-12" step={1} min={18} max={70} />
        {isSelf && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">性別</span>
            <Btns options={[{ value: "male" as const, label: "男" }, { value: "female" as const, label: "女" }]} value={data.gender} onChange={v => u({ gender: v })} />
          </div>
        )}
        <Inp label="退職予定" value={retirementAge} onChange={v => u({ [retKey]: v, ...(isSelf ? { retirementTouched: true } : {}) } as any)} unit="歳" w="w-12" step={1} min={50} max={80} />
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
            value={data[typeKey]} onChange={v => u({ [typeKey]: v } as any)}
          />
          <Inp label="退職" value={retirementAge} onChange={v => u({ [retKey]: v, ...(isSelf ? { retirementTouched: true } : {}) } as any)} unit="歳" w="w-12" step={1} min={50} max={80} />
          <Inp label="年金開始" value={data[penKey]} onChange={v => u({ [penKey]: v } as any)} unit="歳" w="w-12" step={1} min={60} max={75} />
          <Inp label="就職" value={data[workKey]} onChange={v => u({ [workKey]: v } as any)} unit="歳" w="w-12" step={1} min={18} max={30} />
          {isSelf && <Inp label="結婚" value={data.marriageAge} onChange={v => u({ marriageAge: v })} unit="歳(0=未設定)" w="w-12" step={1} min={0} max={60} />}
          <CareerHistoryEditor
            history={(data[careerKey] as any) || []}
            onChange={h => u({ [careerKey]: h.length > 0 ? h : undefined } as any)}
            workStartAge={data[workKey]}
            retirementAge={retirementAge}
          />
        </>}
      />
    </div>
  );
}

function Step1Self({ data, onChange }: { data: WizardData; onChange: (d: WizardData) => void }) {
  return <MemberStep data={data} onChange={onChange} isSelf={true} />;
}

// ============================================================
// Step 2: Family
// ============================================================

function Step2Family({ data, onChange }: { data: WizardData; onChange: (d: WizardData) => void }) {
  const u = (patch: Partial<WizardData>) => onChange({ ...data, ...patch });
  const [childModalOpen, setChildModalOpen] = useState(false);
  const [editingEvents, setEditingEvents] = useState<LifeEvent[] | undefined>();

  const childParents = data.childEvents.filter(e => e.type === "child" && !e.parentId);

  const handleAdd = (events: LifeEvent[]) => u({ childEvents: [...data.childEvents, ...events] });
  const handleUpdate = (oldIds: number[], newEvents: LifeEvent[]) => {
    const kept = data.childEvents.filter(e => !oldIds.includes(e.id));
    u({ childEvents: [...kept, ...newEvents] });
  };
  const handleRemove = (parentId: number) => {
    u({ childEvents: data.childEvents.filter(e => e.id !== parentId && e.parentId !== parentId) });
  };
  const handleEdit = (parent: LifeEvent) => {
    const related = data.childEvents.filter(e => e.id === parent.id || e.parentId === parent.id);
    setEditingEvents(related);
    setChildModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">家族構成を教えてください</h2>

      {/* 配偶者 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 w-16">配偶者</span>
          <Btns
            options={[{ value: true as const, label: "いる" }, { value: false as const, label: "いない" }]}
            value={data.hasSpouse}
            onChange={v => u({ hasSpouse: v })}
          />
        </div>
      </div>

      {/* 子供 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">子供</span>
          <button
            onClick={() => { setEditingEvents(undefined); setChildModalOpen(true); }}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            ＋ 追加
          </button>
        </div>
        {childParents.length === 0 && (
          <p className="text-xs text-gray-400">なし（後から追加可）</p>
        )}
        {childParents.map((parent) => {
          const subs = data.childEvents.filter(e => e.parentId === parent.id);
          const offset = parent.age - data.currentAge;
          const birthDesc = offset < 0 ? `現在${-offset}歳` : offset === 0 ? "今年" : `${offset}年後`;
          const eduTotal = subs.filter(e => e.type === "education")
            .reduce((s, e) => s + e.annualCostMan * e.durationYears, 0);
          return (
            <div key={parent.id} className="flex items-center justify-between rounded-lg border bg-gray-50 px-3 py-2 text-xs">
              <span className="text-gray-700">{parent.label} <span className="text-gray-400">{birthDesc}</span> <span className="text-blue-600 ml-1">教育費 {eduTotal}万</span></span>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(parent)} className="rounded border px-2 py-0.5 text-gray-500 hover:bg-white text-[10px]">編集</button>
                <button onClick={() => handleRemove(parent.id)} className="text-red-400 hover:text-red-600 px-1">✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {childModalOpen && (
        <ChildEventModal
          isOpen={childModalOpen}
          onClose={() => { setChildModalOpen(false); setEditingEvents(undefined); }}
          onAdd={handleAdd}
          currentAge={data.currentAge}
          retirementAge={data.retirementAge}
          existingEvents={editingEvents}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

// ============================================================
// Step 3: Spouse (配偶者がいる場合のみ)
// ============================================================

function Step4Spouse({ data, onChange }: { data: WizardData; onChange: (d: WizardData) => void }) {
  return <MemberStep data={data} onChange={onChange} isSelf={false} />;
}

// ============================================================
// Step 4: Assets
// ============================================================

function Step4Assets({ data, onChange }: { data: WizardData; onChange: (d: WizardData) => void }) {
  const u = (patch: Partial<WizardData>) => onChange({ ...data, ...patch });
  const [housingOpen, setHousingOpen] = useState(true);

  const monthlyExpenseMan = data.expenseKF[0]?.value ?? 15;
  const reserveTarget = Math.round(monthlyExpenseMan * 6);
  const monthlyTakeHome = Math.round(calcTakeHome(data.incomeKF[0]?.value ?? 500) / 12 * 10) / 10;
  const monthlySavings = Math.round((monthlyTakeHome - monthlyExpenseMan) * 10) / 10;
  const lowAssets = data.currentAssetsMan < reserveTarget && data.currentAssetsMan >= 0;

  const housingScenario = useMemo(() => ({
    ...mkScenario(0),
    currentAge: data.currentAge,
    retirementAge: data.retirementAge,
    simEndAge: data.simEndAge,
    housingTimeline: data.housingTimeline,
  }), [data.currentAge, data.retirementAge, data.simEndAge, data.housingTimeline]);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">資産・住居</h2>

      {/* 資産 */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600 w-28">現在の資産</span>
          <Inp label="" value={data.currentAssetsMan} onChange={v => u({ currentAssetsMan: v })} unit="万円" w="w-20" step={50} min={0} />
          <span className="text-[10px] text-gray-400">預貯金・投資口座・DC残高の合計</span>
        </div>
        {lowAssets && data.currentAssetsMan > 0 && (
          <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
            まずは生活防衛資金として生活費×6ヶ月 = {reserveTarget}万円を目標に
          </div>
        )}
        <div className="rounded-lg border bg-gray-50 p-2 text-xs flex gap-4">
          <span className="text-gray-500">手取り収入</span>
          <span className="text-green-700">+{monthlyTakeHome}万/月</span>
          <span className="text-gray-500">生活費</span>
          <span className="text-red-500">−{monthlyExpenseMan}万/月</span>
          <span className={`font-semibold ${monthlySavings >= 0 ? "text-blue-700" : "text-red-600"}`}>
            貯蓄{monthlySavings >= 0 ? "+" : ""}{monthlySavings}万/月
          </span>
        </div>
      </div>

      {/* 生活費 TrackRow */}
      <TrackRow
        track={{ key: "expenseKF", label: "基本生活費(世帯)", unit: "万円/月", defaultValue: 15, step: 1 }}
        keyframes={data.expenseKF}
        onChange={kfs => u({ expenseKF: kfs })}
        currentAge={data.currentAge}
        retirementAge={data.simEndAge}
        linked={false}
      />

      {/* 住居 */}
      <HousingSection
        s={housingScenario}
        onChange={s => u({ housingTimeline: s.housingTimeline })}
        currentAge={data.currentAge}
        retirementAge={data.simEndAge}
        open={housingOpen}
        onToggle={() => setHousingOpen(o => !o)}
        allEvents={[...data.childEvents, ...data.insuranceEvents, ...data.carEvents]}
      />
    </div>
  );
}

// ============================================================
// Step 5: 保険・車
// ============================================================

function EventList({ label, icon, events, onAdd, onEdit, onRemove }: {
  label: string; icon: string; events: LifeEvent[];
  onAdd: () => void; onEdit: (e: LifeEvent) => void; onRemove: (id: number) => void;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{icon} {label}</span>
        <button onClick={onAdd} className="rounded bg-gray-600 px-3 py-1 text-xs text-white hover:bg-gray-700">＋ 追加</button>
      </div>
      {events.length === 0 && <p className="text-xs text-gray-400">なし（後から追加可）</p>}
      {events.map(e => (
        <div key={e.id} className="flex items-center justify-between rounded border bg-gray-50 px-3 py-1.5 text-xs">
          <span className="text-gray-700">{e.label}</span>
          <div className="flex gap-1">
            <button onClick={() => onEdit(e)} className="rounded border px-2 py-0.5 text-gray-500 hover:bg-white text-[10px]">編集</button>
            <button onClick={() => onRemove(e.id)} className="text-red-400 hover:text-red-600 px-1">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Step5InsuranceCar({ data, onChange }: { data: WizardData; onChange: (d: WizardData) => void }) {
  const u = (patch: Partial<WizardData>) => onChange({ ...data, ...patch });
  const [insuranceModalOpen, setInsuranceModalOpen] = useState(false);
  const [editingInsurance, setEditingInsurance] = useState<LifeEvent | null>(null);
  const [carModalOpen, setCarModalOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<LifeEvent | null>(null);

  const handleInsuranceSave = (event: LifeEvent) => {
    const updated = editingInsurance
      ? data.insuranceEvents.map(e => e.id === editingInsurance.id ? event : e)
      : [...data.insuranceEvents, event];
    u({ insuranceEvents: updated });
    setEditingInsurance(null);
    setInsuranceModalOpen(false);
  };

  const handleCarSave = (event: LifeEvent) => {
    const updated = editingCar
      ? data.carEvents.map(e => e.id === editingCar.id ? event : e)
      : [...data.carEvents, event];
    u({ carEvents: updated });
    setEditingCar(null);
    setCarModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">保険・車</h2>

      <EventList
        label="保険" icon="🛡️"
        events={data.insuranceEvents}
        onAdd={() => { setEditingInsurance(null); setInsuranceModalOpen(true); }}
        onEdit={e => { setEditingInsurance(e); setInsuranceModalOpen(true); }}
        onRemove={id => u({ insuranceEvents: data.insuranceEvents.filter(e => e.id !== id) })}
      />

      <EventList
        label="車" icon="🚗"
        events={data.carEvents}
        onAdd={() => { setEditingCar(null); setCarModalOpen(true); }}
        onEdit={e => { setEditingCar(e); setCarModalOpen(true); }}
        onRemove={id => u({ carEvents: data.carEvents.filter(e => e.id !== id) })}
      />

      {insuranceModalOpen && (
        <InsuranceModal
          isOpen={true}
          onClose={() => { setInsuranceModalOpen(false); setEditingInsurance(null); }}
          onSave={handleInsuranceSave}
          currentAge={data.currentAge}
          retirementAge={data.retirementAge}
          existingEvent={editingInsurance}
        />
      )}
      {carModalOpen && (
        <CarModal
          isOpen={true}
          onClose={() => { setCarModalOpen(false); setEditingCar(null); }}
          onSave={handleCarSave}
          currentAge={data.currentAge}
          retirementAge={data.simEndAge}
          existingEvent={editingCar}
        />
      )}
    </div>
  );
}

// ============================================================
// Step 6: NISA・投資
// ============================================================

function Step5NISA({ data, onChange }: { data: WizardData; onChange: (d: WizardData) => void }) {
  const [open, setOpen] = useState(true);

  const nisaScenario = useMemo(() => ({
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
    spouse: { ...mkScenario(0).spouse, enabled: data.hasSpouse },
  }), [data.currentAge, data.nisaEnabled, data.nisaAccounts, data.nisaAnnualLimitMan, data.nisaLifetimeLimitMan,
      data.nisaReturnRate, data.dcReturnRate, data.taxableReturnRate, data.cashInterestRate,
      data.balancePolicy, data.hasSpouse]);

  const handleNisaChange = (s: typeof nisaScenario) => {
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
        s={nisaScenario as any}
        onChange={handleNisaChange as any}
        currentAge={data.currentAge}
        open={open}
        onToggle={() => setOpen(o => !o)}
      />
    </div>
  );
}

// ============================================================
// Step 6: Preview
// ============================================================

function Step5Preview({
  data,
  calcParams,
  base,
}: {
  data: WizardData;
  calcParams: CalcParams;
  base: BaseResult;
}) {
  const scenario = useMemo(() => wizardToScenario(data), [data]);
  const result = useMemo(() => computeScenario(scenario, base, calcParams, null), [scenario, base, calcParams]);

  const retireIdx = result.yearResults.findIndex(yr => yr.age >= data.retirementAge);
  const endIdx = result.yearResults.length - 1;
  const retireAssets = retireIdx >= 0
    ? Math.round((result.yearResults[retireIdx].cumulativeSavings + result.yearResults[retireIdx].cumulativeDCAsset + result.yearResults[retireIdx].nisaAsset) / 10000)
    : null;
  const endAssets = endIdx >= 0
    ? Math.round((result.yearResults[endIdx].cumulativeSavings + result.yearResults[endIdx].cumulativeDCAsset + result.yearResults[endIdx].nisaAsset) / 10000)
    : null;
  const currentIncomeMan = data.incomeKF[0]?.value ?? 500;
  const pensionAnnualMan = data.incomeType === "employee"
    ? calcPensionEstimate(currentIncomeMan, data.retirementAge, data.pensionWorkStartAge, data.pensionStartAge)
    : 81;

  const childParentsSummary = data.childEvents.filter(e => e.type === "child" && !e.parentId);
  const childSummary = childParentsSummary.map((p, i) => {
    const offset = p.age - data.currentAge;
    const desc = offset < 0 ? `現在${-offset}歳` : offset === 0 ? "今年生まれ予定" : `${offset}年後生まれ予定`;
    return `${i + 1}人目: ${desc}`;
  });

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">シミュレーションの準備ができました</h2>

      {/* サマリー */}
      <div className="rounded-lg border bg-gray-50 p-3 space-y-1.5 text-xs">
        <div className="font-semibold text-gray-700 mb-1">設定サマリー</div>
        <div className="text-gray-600">本人: {data.currentAge}歳、退職{data.retirementAge}歳（{data.gender === "male" ? "男性" : "女性"}）</div>
        {data.hasSpouse && (
          <div className="text-gray-600">
            配偶者: {data.spouseAge}歳、収入{data.spouseIncomeMan}万円/年
          </div>
        )}
        {childParentsSummary.length > 0 && (
          <div className="text-gray-600">子: {childParentsSummary.length}人（{childSummary.join("、")}）</div>
        )}
        <div className="text-gray-600">収入: {currentIncomeMan}万円/年（{data.incomeType === "employee" ? "会社員" : "自営業"}）</div>
        <div className="text-gray-600">資産: {data.currentAssetsMan}万円、生活費: {data.expenseKF[0]?.value ?? 15}万円/月</div>
        <div className="text-gray-600">
          住居: {data.housingTimeline.map((p, i) => {
            const next = data.housingTimeline[i + 1];
            const end = next ? next.startAge : data.simEndAge;
            return p.type === "rent"
              ? `賃貸${p.startAge}〜${end}歳(${p.rentMonthlyMan}万/月)`
              : `持ち家${p.startAge}〜${end}歳`;
          }).join("→")}
        </div>
        <div className="text-gray-600">年金: {data.pensionStartAge}歳〜 約{pensionAnnualMan}万円/年{data.hasSpouse ? `、配偶者${data.spousePensionStartAge}歳〜` : ""}</div>
        {(data.dcTotalKF[0]?.value > 0 || data.idecoKF[0]?.value > 0) && (
          <div className="text-gray-600">
            DC/iDeCo: {[
              data.dcTotalKF[0]?.value > 0 && `企業DC ${data.dcTotalKF[0].value.toLocaleString()}円/月`,
              data.idecoKF[0]?.value > 0 && `iDeCo ${data.idecoKF[0].value.toLocaleString()}円/月`,
            ].filter(Boolean).join("、")}（{data.dcReceiveMethod === "lump" ? "一括" : data.dcReceiveMethod === "annuity" ? "年金" : "併用"}受取）
          </div>
        )}
        {data.nisaEnabled && (
          <div className="text-gray-600">NISA: 年間{data.nisaAnnualLimitMan}万円×{data.nisaAccounts}口座</div>
        )}
        {(data.insuranceEvents.length > 0 || data.carEvents.length > 0) && (
          <div className="text-gray-600">
            {[
              data.insuranceEvents.length > 0 && `保険${data.insuranceEvents.length}件`,
              data.carEvents.length > 0 && `車${data.carEvents.length}台`,
            ].filter(Boolean).join("、")}
          </div>
        )}
        {(data.hasFurusato || data.spouseHasFurusato) && (
          <div className="text-gray-600">ふるさと納税: {[data.hasFurusato && "本人", data.hasSpouse && data.spouseHasFurusato && "配偶者"].filter(Boolean).join("・")}</div>
        )}
      </div>

      {/* プレビュー */}
      <div className="rounded-lg border bg-white p-3 space-y-2">
        <div className="font-semibold text-gray-700 text-xs">簡易プレビュー</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-blue-50 p-2">
            <div className="text-[10px] text-blue-600">退職時({data.retirementAge}歳)資産</div>
            <div className={`font-bold text-sm ${retireAssets !== null && retireAssets < 0 ? "text-red-600" : "text-blue-800"}`}>
              {retireAssets !== null ? `約${retireAssets.toLocaleString()}万円` : "計算中..."}
            </div>
          </div>
          <div className="rounded bg-green-50 p-2">
            <div className="text-[10px] text-green-600">{data.simEndAge}歳時資産</div>
            <div className={`font-bold text-sm ${endAssets !== null && endAssets < 0 ? "text-red-600" : "text-green-800"}`}>
              {endAssets !== null ? `約${endAssets.toLocaleString()}万円` : "計算中..."}
            </div>
          </div>
          <div className="rounded bg-amber-50 p-2">
            <div className="text-[10px] text-amber-600">年金収入({data.pensionStartAge}歳〜)</div>
            <div className="font-bold text-sm text-amber-800">約{pensionAnnualMan}万円/年</div>
          </div>
        </div>
        {endAssets !== null && endAssets < 0 && (
          <div className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1">
            ⚠️ 試算では{data.simEndAge}歳時点で資産が枯渇する可能性があります。収入・支出の見直しを検討してください。
          </div>
        )}
        <div className="text-[10px] text-gray-400">※ 詳細な分析はメイン画面でご確認ください</div>
      </div>

    </div>
  );
}

function Step5CompleteButton({ data, onComplete }: { data: WizardData; onComplete: (s: Scenario) => void }) {
  const scenario = useMemo(() => wizardToScenario(data), [data]);
  return (
    <button
      onClick={() => onComplete(scenario)}
      className="rounded-lg bg-green-600 px-8 py-2 text-sm font-bold text-white hover:bg-green-700"
    >
      完了してはじめる →
    </button>
  );
}

// ============================================================
// Main SetupWizard
// ============================================================

const STEPS = [
  { label: "本人" },
  { label: "家族" },
  { label: "配偶者" },
  { label: "住居" },
  { label: "保険・車" },
  { label: "NISA・投資" },
  { label: "確認" },
];

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

  const LAST_STEP = 7;
  // Step 3 is spouse — skip if no spouse
  const nextStep = (cur: number) => {
    const n = cur + 1;
    if (n === 3 && !data.hasSpouse) return 4;
    return n;
  };
  const prevStep = (cur: number) => {
    const n = cur - 1;
    if (n === 3 && !data.hasSpouse) return 2;
    return n;
  };
  const canGoTo = (n: number) => {
    if (n === step) return false;
    if (n === 3 && !data.hasSpouse) return false;
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
              const skipped = n === 3 && !data.hasSpouse;
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
          {step === 1 && <Step1Self data={data} onChange={setData} />}
          {step === 2 && <Step2Family data={data} onChange={setData} />}
          {step === 3 && <Step4Spouse data={data} onChange={setData} />}
          {step === 4 && <Step4Assets data={data} onChange={setData} />}
          {step === 5 && <Step5InsuranceCar data={data} onChange={setData} />}
          {step === 6 && <Step5NISA data={data} onChange={setData} />}
          {step === 7 && (
            <Step5Preview data={data} calcParams={calcParams} base={base} />
          )}
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
            <Step5CompleteButton data={data} onComplete={onComplete} />
          </div>
        )}
      </div>
    </div>
  );
}
