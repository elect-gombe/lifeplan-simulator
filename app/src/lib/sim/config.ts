/**
 * Resolve a Scenario (plus optional linked base scenario) into a fully
 * resolved SimConfig: settings inheritance, keyframes, events (incl. housing
 * timeline synthesis), spouse/NISA/balance-policy merging and rates.
 */
import type { Scenario, Keyframe, LifeEvent, SpouseConfig, NISAConfig, BalancePolicy, SocialInsuranceParams } from "../types";
import { DEFAULT_DC_RECEIVE_METHOD } from "../types";
import type { CalcParams, SimConfig } from "./types";

function getEffective(s: Scenario, key: string, baseScenario: Scenario | null | undefined): any {
  if (s.linkedToBase && baseScenario && !s.overrideTracks.includes(key as any)) {
    return (baseScenario as any)[key];
  }
  return (s as any)[key];
}

/**
 * Resolve a Scenario field for display purposes, inheriting from base when:
 * - the scenario is linked to base (linkedToBase: true)
 * - the own field is null/undefined
 * This mirrors the inheritance logic used in resolveSimConfig for calculation.
 */
export function resolveScenarioField<K extends keyof Scenario>(
  s: Scenario,
  base: Scenario | null | undefined,
  key: K,
): Scenario[K] {
  if (s.linkedToBase && base != null && s[key] == null) return base[key];
  return s[key];
}

// ===== resolveEvents: Merge base/own events + housing timeline synthesis =====
export function resolveEvents(
  s: Scenario, linked: boolean, base_: Scenario, baseScenario: Scenario | null | undefined,
  settingLinked: (key: string) => boolean,
): LifeEvent[] {
  const disabledBaseIds = s.disabledBaseEventIds || [];
  const baseEvents = (linked) ? (baseScenario!.events || []).filter(e => !(s.excludedBaseEventIds || []).includes(e.id))
    .map(e => disabledBaseIds.includes(e.id) ? { ...e, disabled: true } : e) : [];
  const ownEvents = s.events || [];
  let events = [...baseEvents, ...ownEvents].sort((a, b) => a.age - b.age);

  // 住居タイムライン: housingTimelineが有効なら既存の住居系イベントを除外し、合成イベントに置換
  const housingTimeline = s.housingTimeline || (linked ? base_.housingTimeline : undefined);
  if (housingTimeline && housingTimeline.length > 0) {
    // 既存の rent/property/relocation イベントを除外
    events = events.filter(e => e.type !== "rent" && e.type !== "property" && e.type !== "relocation");
    // フェーズから合成イベントを生成
    const simEnd = (settingLinked("simEndAge") ? base_.simEndAge : s.simEndAge) ?? 85;
    for (let pi = 0; pi < housingTimeline.length; pi++) {
      const phase = housingTimeline[pi];
      const nextPhase = pi < housingTimeline.length - 1 ? housingTimeline[pi + 1] : null;
      const endAge = nextPhase ? nextPhase.startAge : simEnd;
      const syntheticId = -(pi + 1) * 1000; // 負のIDで合成イベントを識別

      if (phase.type === "rent") {
        events.push({
          id: syntheticId, age: phase.startAge, type: "rent",
          label: `家賃(${phase.rentMonthlyMan ?? 0}万/月)`,
          oneTimeCostMan: 0, annualCostMan: (phase.rentMonthlyMan ?? 0) * 12,
          durationYears: endAge - phase.startAge,
        });
      } else if (phase.type === "own" && phase.propertyParams) {
        const pp = { ...phase.propertyParams };
        // 次フェーズがあれば売却年齢を設定
        if (nextPhase) pp.saleAge = endAge;
        events.push({
          id: syntheticId, age: phase.startAge, type: "property",
          label: `住宅(${pp.priceMan}万)`,
          oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
          propertyParams: pp,
        });
      }
      // フェーズ遷移時の引越費用（2フェーズ目以降）
      if (pi > 0) {
        events.push({
          id: syntheticId - 500, age: phase.startAge, type: "custom",
          label: "引越費用", oneTimeCostMan: 50, annualCostMan: 0, durationYears: 0,
        });
      }
    }
    events.sort((a, b) => a.age - b.age);
  }

  return events;
}

// ===== resolveSimConfig: Resolve all configuration for a scenario simulation =====
export function resolveSimConfig(s: Scenario, params: CalcParams, baseScenario?: Scenario | null): SimConfig {
  const { defaultGrossMan, rr: globalRR, sirPct, hasRet, retAmt, PY, taxOpts, housingLoanDed } = params;

  // Linked settings resolution (must be before age resolution)
  const linked = !!(s.linkedToBase && baseScenario);
  const base_ = linked ? baseScenario! : s;
  const overSet = s.overrideSettings || [];
  const settingLinked = (key: string) => linked && !overSet.includes(key as any);

  // 年齢はシナリオから取得（retirementAgeはsimEndAgeの意味で使う）
  const currentAge = (settingLinked("currentAge") ? base_.currentAge : s.currentAge) ?? params.currentAge;
  const baseCalendarYear = new Date().getFullYear(); // 暦年基準（年齢→暦年変換用）
  const selfRetirementAge = (settingLinked("retirementAge") ? base_.retirementAge : s.retirementAge) ?? 65;
  const retirementAge = (settingLinked("simEndAge") ? base_.simEndAge : s.simEndAge) ?? params.retirementAge;
  // 利回り・インフレ: シナリオ値 → リンク時はA値 → 共通設定
  const rr = (settingLinked("rr") ? (base_.rr ?? globalRR) : (s.rr ?? globalRR));
  const r = rr / 100;
  const sir = sirPct / 100;
  const otherRet = hasRet ? retAmt : 0;

  const selfGender = (settingLinked("selfGender") ? base_.selfGender : s.selfGender) || "male";
  const hasFuru = !!(linked ? base_.hasFurusato : s.hasFurusato);
  const selfSIParams: SocialInsuranceParams | undefined = s.siParams || (linked ? base_.siParams : undefined);
  const effectiveCurrentAssets = settingLinked("currentAssetsMan") ? base_.currentAssetsMan : s.currentAssetsMan;
  const growthRate = linked && !s.overrideTracks.includes("incomeKF" as any)
    ? base_.salaryGrowthRate : s.salaryGrowthRate;
  const effectiveDCReceiveMethod = s.dcReceiveMethod || (linked ? base_.dcReceiveMethod : undefined);
  const effectiveYears = settingLinked("years") ? base_.years : s.years;
  const effectivePensionStartAge = settingLinked("pensionStartAge") ? (base_.pensionStartAge ?? s.pensionStartAge) : s.pensionStartAge;
  const effectivePensionWorkStartAge = settingLinked("pensionWorkStartAge") ? (base_.pensionWorkStartAge ?? s.pensionWorkStartAge) : s.pensionWorkStartAge;
  const effectiveDepHolder = settingLinked("dependentDeductionHolder") ? (base_.dependentDeductionHolder || s.dependentDeductionHolder) : s.dependentDeductionHolder;

  const incomeKF: Keyframe[] = getEffective(s, "incomeKF", baseScenario) || [];
  const expenseKF: Keyframe[] = getEffective(s, "expenseKF", baseScenario) || [];
  const dcTotalKF: Keyframe[] = getEffective(s, "dcTotalKF", baseScenario) || [];
  const companyDCKF: Keyframe[] = getEffective(s, "companyDCKF", baseScenario) || [];
  const idecoKF: Keyframe[] = getEffective(s, "idecoKF", baseScenario) || [];

  const events = resolveEvents(s, linked, base_, baseScenario, settingLinked);

  // Spouse: use own if enabled, else inherit from base (with per-track overrides)
  const rawSpouse: SpouseConfig | undefined =
    s.spouse?.enabled ? s.spouse
    : linked && base_.spouse?.enabled ? base_.spouse
    : undefined;
  // Apply per-track overrides: if spouseOverrideTracks has a track, use s.spouse's data for it
  const spouseOT = s.spouseOverrideTracks || [];
  const spouse: SpouseConfig | undefined = rawSpouse && linked && !s.spouse?.enabled && s.spouse && spouseOT.length > 0
    ? { ...rawSpouse, ...Object.fromEntries(spouseOT.map(k => [k, (s.spouse as any)?.[k] || []])),
        ...(s.spouse.dcReceiveMethod ? { dcReceiveMethod: s.spouse.dcReceiveMethod } : {}) }
    : rawSpouse;

  // NISA: use own if enabled, else inherit from base
  const nisaConfig: NISAConfig | undefined =
    s.nisa?.enabled ? s.nisa
    : linked && base_.nisa?.enabled ? base_.nisa
    : undefined;

  // Balance policy: merge own with base (own overrides, but inherit missing fields like cashAnchors)
  const baseBP = linked ? base_.balancePolicy : undefined;
  const bpConfig = s.balancePolicy
    ? { ...baseBP, ...s.balancePolicy, cashAnchors: s.balancePolicy.cashAnchors ?? baseBP?.cashAnchors, cashReserveMaxMonths: s.balancePolicy.cashReserveMaxMonths ?? baseBP?.cashReserveMaxMonths, withdrawalOrder: s.balancePolicy.withdrawalOrder ?? baseBP?.withdrawalOrder }
    : baseBP;

  // NISA config — 個人別に枠を管理
  const nisa: NISAConfig | undefined = nisaConfig;
  const nisaAccounts = nisa ? (nisa.accounts || 1) : 1;
  // Phase 3: 個別資産クラス利回り（リンク時はベースの値を参照）
  const dcRate = (s.dcReturnRate ?? (linked ? base_.dcReturnRate : undefined) ?? rr) / 100;
  const nisaReturnRate = (s.nisaReturnRate ?? (linked ? base_.nisaReturnRate : undefined) ?? rr) / 100;
  const taxableReturnRate = (s.taxableReturnRate ?? (linked ? base_.taxableReturnRate : undefined) ?? rr) / 100;
  const cashRate = (s.cashInterestRate ?? (linked ? base_.cashInterestRate : undefined) ?? 0) / 100;
  // 本人NISA枠
  const selfNISAAnnualLimit = nisa ? nisa.annualLimitMan * 10000 : 0;
  const selfNISALifetimeLimit = nisa ? nisa.lifetimeLimitMan * 10000 : 0;
  // 配偶者NISA枠（2口座の場合）
  const spouseNISAAnnualLimit = nisa && nisaAccounts === 2 ? (nisa.spouseAnnualLimitMan ?? nisa.annualLimitMan) * 10000 : 0;
  const spouseNISALifetimeLimit = nisa && nisaAccounts === 2 ? (nisa.spouseLifetimeLimitMan ?? nisa.lifetimeLimitMan) * 10000 : 0;

  // Balance policy
  const bp: BalancePolicy | undefined = bpConfig;
  const cashReserveMinMonths = bp ? bp.cashReserveMonths : 6;
  const cashReserveMaxMonths = bp?.cashReserveMaxMonths ?? cashReserveMinMonths;
  const nisaPriority = bp ? bp.nisaPriority : (nisa ? true : false);
  const cashAnchors = bp?.cashAnchors?.filter(a => a.amountMan > 0).sort((a, b) => a.age - b.age) || [];

  // 配偶者DC受取方法
  const spouseRM = spouse?.dcReceiveMethod || DEFAULT_DC_RECEIVE_METHOD;

  const effectiveInflation = settingLinked("inflationRate") ? (base_.inflationRate ?? params.inflationRate) : (s.inflationRate ?? params.inflationRate);
  const inflation = effectiveInflation / 100;
  const macroSlideRate = settingLinked("macroSlideRate") ? (base_.macroSlideRate ?? -0.8) : (s.macroSlideRate ?? -0.8);

  return {
    linked, base_, currentAge, baseCalendarYear, selfRetirementAge, retirementAge,
    rr, r, sir, otherRet, selfGender, hasFuru, selfSIParams,
    effectiveCurrentAssets, growthRate, effectiveDCReceiveMethod, effectiveYears,
    effectivePensionStartAge, effectivePensionWorkStartAge, effectiveDepHolder,
    incomeKF, expenseKF, dcTotalKF, companyDCKF, idecoKF,
    events, spouse, nisaConfig, bpConfig,
    selfNISAAnnualLimit, selfNISALifetimeLimit, spouseNISAAnnualLimit, spouseNISALifetimeLimit,
    dcRate, nisaReturnRate, taxableReturnRate, cashRate,
    cashReserveMinMonths, cashReserveMaxMonths, nisaPriority, cashAnchors,
    spouseRM, effectiveInflation, inflation, macroSlideRate,
    defaultGrossMan, taxOpts, housingLoanDed, PY, hasRet, retAmt,
    livingExpenseRules: s.livingExpenseRules,
    careerHistory: s.careerHistory,
    spouseCareerHistory: spouse?.careerHistory,
    returnRateKF: s.returnRateKF,
    nisaRateExplicit: s.nisaReturnRate != null,
    dcRateExplicit: s.dcReturnRate != null,
    taxableRateExplicit: s.taxableReturnRate != null,
    childAllowanceEnabled: s.childAllowanceEnabled !== false,
    tashiWaiverEnabled: s.tashiWaiverEnabled !== false,
    hsSupportEnabled: s.hsSupportEnabled !== false,
    retirementLivingExpenseMan: s.retirementLivingExpenseMan,
    afterSelfDeathSpouseIncome: s.afterSelfDeathSpouseIncome,
    nhsSettings: s.nhsSettings,
    marriageAge: s.marriageAge,
  };
}
