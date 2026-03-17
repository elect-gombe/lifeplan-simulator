import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Scenario } from "./lib/types";
import { DEFAULT_OVERRIDE_TRACKS } from "./lib/types";
import { fmt } from "./lib/format";
import { computeBase, computeScenario } from "./lib/calc";
import { Slider, NumIn, Tog } from "./components/ui";
import { Chart } from "./components/Chart";
// ScenarioCard removed — settings unified into global panel
import { KeyframeEditor } from "./components/KeyframeEditor";
import { TimelineChart } from "./components/TimelineChart";
import { TotalAssetBar } from "./components/TotalAssetBar";
import { SummaryCard } from "./components/SummaryCard";
import { TaxDetailModal } from "./components/TaxDetailModal";

// ===== Save/Load =====
// NOTE: 互換性について - 現時点ではスキーマバージョン管理は行わない。
// 今後フィールドの追加・変更を行う場合は、ロード時にデフォルト値でfallbackする方式で対応する。
// 破壊的変更が必要になった場合はバージョンフィールドを追加してマイグレーションを実装する。
const STORAGE_KEY = "asset-sim-state-v1";

interface SavedState {
  currentAge: number;
  retirementAge: number;
  grossMan: number;
  rr: number;
  hasRet: boolean;
  retAmt: number;
  PY: number;
  sirPct: number;
  inflationRate: number;
  dependentsCount: number;
  hasSpouseDeduction: boolean;
  lifeInsuranceDeduction: number;
  useHousingLoanDeduction: boolean;
  housingLoanDeductionAmount: number;
  currentAssetsMan: number;
  salaryGrowthRate: number;
  dcYears: number;
  hasFurusato: boolean;
  scenarios: Scenario[];
}

function saveToStorage(state: SavedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function loadFromStorage(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // fallback for missing fields (forward compatibility)
    return {
      currentAge: parsed.currentAge ?? 30,
      retirementAge: parsed.retirementAge ?? 65,
      grossMan: parsed.grossMan ?? 700,
      rr: parsed.rr ?? 4,
      hasRet: parsed.hasRet ?? false,
      retAmt: parsed.retAmt ?? 0,
      PY: parsed.PY ?? 20,
      sirPct: parsed.sirPct ?? 15.75,
      inflationRate: parsed.inflationRate ?? 1.5,
      dependentsCount: parsed.dependentsCount ?? 0,
      hasSpouseDeduction: parsed.hasSpouseDeduction ?? false,
      lifeInsuranceDeduction: parsed.lifeInsuranceDeduction ?? 0,
      useHousingLoanDeduction: parsed.useHousingLoanDeduction ?? false,
      housingLoanDeductionAmount: parsed.housingLoanDeductionAmount ?? 0,
      currentAssetsMan: parsed.currentAssetsMan ?? 500,
      salaryGrowthRate: parsed.salaryGrowthRate ?? 2,
      dcYears: parsed.dcYears ?? 35,
      hasFurusato: parsed.hasFurusato ?? true,
      scenarios: parsed.scenarios ?? [],
    };
  } catch { return null; }
}

function exportJSON(state: SavedState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `asset-sim-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file: File): Promise<SavedState | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        resolve(loadFromStorage.call(null) !== null ? parsed : null); // reuse validation
        resolve(parsed as SavedState);
      } catch { resolve(null); }
    };
    reader.readAsText(file);
  });
}

function mkScenario(id: number, currentAge: number, retirementAge: number, grossMan: number): Scenario {
  const isBase = id === 0;
  const isB = id === 1;
  return {
    id, name: `シナリオ${"ABCD"[id] || "X"}`,
    currentAssetsMan: 500,
    incomeKF: isBase ? [{ age: currentAge, value: grossMan }] : [],
    expenseKF: isBase ? [{ age: currentAge, value: 15 }] : [],
    dcTotalKF: [{ age: currentAge, value: isB ? 35000 : 55000 }],
    companyDCKF: [{ age: currentAge, value: 1000 }],
    idecoKF: [{ age: currentAge, value: isB ? 20000 : 0 }],
    salaryGrowthRate: 2,
    events: [],
    excludedBaseEventIds: [],
    linkedToBase: !isBase,
    overrideTracks: isBase ? [] : [...DEFAULT_OVERRIDE_TRACKS],
    years: retirementAge - currentAge,
    hasFurusato: true,
  };
}

export default function App() {
  const saved = useRef(loadFromStorage()).current;
  const [currentAge, setCurrentAge] = useState(saved?.currentAge ?? 30);
  const [retirementAge, setRetirementAge] = useState(saved?.retirementAge ?? 65);
  const [grossMan, setGrossMan] = useState(saved?.grossMan ?? 700);
  const [rr, setRR] = useState(saved?.rr ?? 4);
  const [hasRet, setHasRet] = useState(saved?.hasRet ?? false);
  const [retAmt, setRetAmt] = useState(saved?.retAmt ?? 0);
  const [PY, setPY] = useState(saved?.PY ?? 20);
  const [sirPct, setSirPct] = useState(saved?.sirPct ?? 15.75);
  const [scenarios, setScenarios] = useState<Scenario[]>(() => saved?.scenarios?.length ? saved.scenarios : [mkScenario(0, 30, 65, 700), mkScenario(1, 30, 65, 700)]);
  const [dependentsCount, setDependentsCount] = useState(saved?.dependentsCount ?? 0);
  const [hasSpouseDeduction, setHasSpouseDeduction] = useState(saved?.hasSpouseDeduction ?? false);
  const [lifeInsuranceDeduction, setLifeInsuranceDeduction] = useState(saved?.lifeInsuranceDeduction ?? 0);
  const [useHousingLoanDeduction, setUseHousingLoanDeduction] = useState(saved?.useHousingLoanDeduction ?? false);
  const [housingLoanDeductionAmount, setHousingLoanDeductionAmount] = useState(saved?.housingLoanDeductionAmount ?? 0);
  const [modalAge, setModalAge] = useState<number | null>(null);
  const [inflationRate, setInflationRate] = useState(saved?.inflationRate ?? 1.5);
  const [currentAssetsMan, setCurrentAssetsMan] = useState(saved?.currentAssetsMan ?? 500);
  const [salaryGrowthRate, setSalaryGrowthRate] = useState(saved?.salaryGrowthRate ?? 2);
  const [dcYears, setDcYears] = useState(saved?.dcYears ?? 35);
  const [hasFurusato, setHasFurusato] = useState(saved?.hasFurusato ?? true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build state object for save/export
  const currentState: SavedState = useMemo(() => ({
    currentAge, retirementAge, grossMan, rr, hasRet, retAmt, PY, sirPct, inflationRate,
    dependentsCount, hasSpouseDeduction, lifeInsuranceDeduction, useHousingLoanDeduction, housingLoanDeductionAmount,
    currentAssetsMan, salaryGrowthRate, dcYears, hasFurusato, scenarios,
  }), [currentAge, retirementAge, grossMan, rr, hasRet, retAmt, PY, sirPct, inflationRate, dependentsCount, hasSpouseDeduction, lifeInsuranceDeduction, useHousingLoanDeduction, housingLoanDeductionAmount, currentAssetsMan, salaryGrowthRate, dcYears, hasFurusato, scenarios]);

  // Auto-save to localStorage on every change
  useEffect(() => { saveToStorage(currentState); }, [currentState]);

  const handleImport = async (file: File) => {
    const data = await importJSON(file);
    if (!data) { alert("ファイルの読み込みに失敗しました"); return; }
    setCurrentAge(data.currentAge ?? 30);
    setRetirementAge(data.retirementAge ?? 65);
    setGrossMan(data.grossMan ?? 700);
    setRR(data.rr ?? 4);
    setHasRet(data.hasRet ?? false);
    setRetAmt(data.retAmt ?? 0);
    setPY(data.PY ?? 20);
    setSirPct(data.sirPct ?? 15.75);
    setInflationRate(data.inflationRate ?? 1.5);
    setDependentsCount(data.dependentsCount ?? 0);
    setHasSpouseDeduction(data.hasSpouseDeduction ?? false);
    setLifeInsuranceDeduction(data.lifeInsuranceDeduction ?? 0);
    setUseHousingLoanDeduction(data.useHousingLoanDeduction ?? false);
    setHousingLoanDeductionAmount(data.housingLoanDeductionAmount ?? 0);
    setCurrentAssetsMan(data.currentAssetsMan ?? 500);
    setSalaryGrowthRate(data.salaryGrowthRate ?? 2);
    setDcYears(data.dcYears ?? 35);
    setHasFurusato(data.hasFurusato ?? true);
    if (data.scenarios?.length) setScenarios(data.scenarios);
  };

  const updS = useCallback((i: number, s: Scenario) => setScenarios(p => p.map((x, j) => j === i ? s : x)), []);
  const rmS = useCallback((i: number) => setScenarios(p => p.filter((_, j) => j !== i)), []);
  const addS = useCallback(() => {
    setScenarios(p => p.length >= 4 ? p : [...p, { ...mkScenario(p.length, currentAge, retirementAge, grossMan), id: Date.now() + p.length }]);
  }, [currentAge, retirementAge, grossMan]);
  const dupS = useCallback((i: number) => {
    setScenarios(p => {
      if (p.length >= 4) return p;
      const src = p[i];
      return src ? [...p.slice(0, i + 1), { ...src, id: Date.now(), name: `${src.name} コピー` }, ...p.slice(i + 1)] : p;
    });
  }, []);

  const totalYears = retirementAge - currentAge;
  const housingLoanDed = useHousingLoanDeduction ? Math.max(housingLoanDeductionAmount, 0) : 0;
  const taxOpts = { dependentsCount, hasSpouseDeduction, lifeInsuranceDeduction };

  const calcParams = useMemo(() => ({
    currentAge, retirementAge, defaultGrossMan: grossMan, rr, sirPct, hasRet, retAmt, PY, taxOpts, housingLoanDed, inflationRate,
  }), [currentAge, retirementAge, grossMan, rr, sirPct, hasRet, retAmt, PY, dependentsCount, hasSpouseDeduction, lifeInsuranceDeduction, housingLoanDed, inflationRate]);

  const { base, res } = useMemo(() => {
    const base = computeBase(calcParams);
    // Apply global settings to all scenarios
    const effectiveScenarios = scenarios.map(s => ({
      ...s, currentAssetsMan, salaryGrowthRate, years: dcYears, hasFurusato,
    }));
    const baseScenario = effectiveScenarios[0] || null;
    const res = effectiveScenarios.map((s, i) => computeScenario(s, base, calcParams, i === 0 ? null : baseScenario));
    return { base, res };
  }, [scenarios, calcParams, currentAssetsMan, salaryGrowthRate, dcYears, hasFurusato]);

  const bestIdx = res.length > 0 ? res.reduce((bi, s, i, a) => s.finalWealth > a[bi].finalWealth ? i : bi, 0) : 0;
  const scenarioGridClass = scenarios.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

  return (
    <div className="mx-auto max-w-5xl p-3 text-gray-900">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">資産シミュレーター</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => exportJSON(currentState)}
              className="rounded border px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">JSONエクスポート</button>
            <button onClick={() => fileInputRef.current?.click()}
              className="rounded border px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">インポート</button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
          </div>
        </div>

        {/* Global settings */}
        <details className="rounded bg-blue-50 p-3" open>
          <summary className="cursor-pointer text-xs font-bold text-blue-700 mb-2">共通設定</summary>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumIn label="現在の年齢" value={currentAge} onChange={setCurrentAge} step={1} unit="歳" min={18} max={70} />
            <NumIn label="退職予定年齢" value={retirementAge} onChange={setRetirementAge} step={1} unit="歳" min={currentAge + 1} max={80} />
            <NumIn label="初期年収" value={grossMan} onChange={setGrossMan} step={10} unit="万円" />
            <Slider label="運用利回り" value={rr} onChange={setRR} min={0} max={10} step={0.5} unit="%" />
            <Slider label="社保料率" value={sirPct} onChange={setSirPct} min={10} max={20} step={0.25} unit="%" help="厚年+健保+介護+雇用" />
            <Slider label="年金受給期間" value={PY} onChange={setPY} min={10} max={30} step={1} unit="年" />
            <Slider label="インフレ率" value={inflationRate} onChange={setInflationRate} min={0} max={5} step={0.25} unit="%" help="生活費・イベント費に年次適用" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumIn label="現在の資産" value={currentAssetsMan} onChange={setCurrentAssetsMan} step={100} unit="万円" />
            <Slider label="昇給率" value={salaryGrowthRate} onChange={setSalaryGrowthRate} min={-2} max={10} step={0.5} unit="%" />
            <NumIn label="退職所得控除の通算期間" value={dcYears} onChange={setDcYears} step={1} unit="年" help="DC/iDeCoの通算加入期間" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Tog label="ふるさと納税を利用" checked={hasFurusato} onChange={setHasFurusato} />
            <Tog label="会社退職金あり" checked={hasRet} onChange={setHasRet} />
            {hasRet && <NumIn label="" value={retAmt} onChange={setRetAmt} step={1000000} unit="円" small />}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            積立期間: <b>{totalYears}年</b>（{currentAge}〜{retirementAge}歳）／ 課税所得: <b>¥{fmt(base.bTI)}</b> ／ 最高税率: <b>{base.bMR}%</b>
          </div>
          <details className="mt-3 rounded border border-blue-200 bg-white/70 p-3">
            <summary className="cursor-pointer text-xs font-bold text-blue-700">税務の詳細設定</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumIn label="扶養人数" value={dependentsCount} onChange={setDependentsCount} step={1} unit="人" />
              <div className="flex items-end"><Tog label="配偶者控除" checked={hasSpouseDeduction} onChange={setHasSpouseDeduction} /></div>
              <NumIn label="生命保険料控除" value={lifeInsuranceDeduction} onChange={setLifeInsuranceDeduction} step={1000} unit="円" />
              <div className="space-y-2">
                <Tog label="住宅ローン控除" checked={useHousingLoanDeduction} onChange={setUseHousingLoanDeduction} />
                {useHousingLoanDeduction && <NumIn label="控除額" value={housingLoanDeductionAmount} onChange={setHousingLoanDeductionAmount} step={10000} unit="円" />}
              </div>
            </div>
          </details>
        </details>

        {/* Scenario headers */}
        <div className="flex items-center gap-2 flex-wrap">
          {scenarios.map((s, i) => (
            <div key={s.id ?? i} className="flex items-center gap-1 rounded-lg border-2 px-2 py-1" style={{ borderColor: ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"][i] }}>
              <input value={s.name} onChange={(e) => updS(i, { ...s, name: e.target.value })}
                className="w-24 border-b border-transparent bg-transparent text-xs font-bold outline-none hover:border-gray-300 focus:border-blue-500"
                style={{ color: ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"][i] }} />
              {scenarios.length < 4 && <button onClick={() => dupS(i)} className="text-[10px] text-gray-400 hover:text-blue-500">複製</button>}
              {scenarios.length > 1 && <button onClick={() => rmS(i)} className="text-[10px] text-gray-400 hover:text-red-500">×</button>}
            </div>
          ))}
          {scenarios.length < 4 && <button onClick={addS} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">+ シナリオ</button>}
        </div>

        {/* Keyframe editors */}
        <details className="rounded border bg-white p-3" open>
          <summary className="cursor-pointer text-sm font-bold mb-2">タイムライン設定（キーフレーム）</summary>
          <div className={`grid gap-3 items-start ${scenarioGridClass}`}>
            {scenarios.map((s, i) => (
              <KeyframeEditor key={s.id ?? i} s={s} idx={i}
                onChange={(ns) => updS(i, ns)}
                currentAge={currentAge} retirementAge={retirementAge}
                baseScenario={i === 0 ? null : scenarios[0]} />
            ))}
          </div>
        </details>

        {/* Timeline chart */}
        <details className="rounded-lg border bg-white" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-gray-700">タイムライン</summary>
          <div className="px-3 pb-3">
            <TimelineChart results={res} currentAge={currentAge} retirementAge={retirementAge} onYearClick={(age) => setModalAge(age)} />
          </div>
        </details>

        {/* Asset comparison */}
        <TotalAssetBar res={res} bestIdx={bestIdx} />

        {/* Summary cards */}
        <div>
          <p className="mb-2 text-sm font-bold">サマリー</p>
          <div className={`grid gap-3 ${scenarioGridClass}`}>
            {res.map((s, i) => (
              <SummaryCard key={i} s={s} idx={i} isBest={i === bestIdx} rr={rr} />
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-0.5">
          <p>※ 節税額はふるさと納税込みベースとの累進差分。社保は概算。年収は万円単位、キーフレーム間はステップ補間+昇給率。</p>
          <p>※ 貯蓄＝手取り−生活費−イベント支出。マイナスの年は貯蓄取り崩し。タイムラインの年をクリックで詳細表示。</p>
        </div>
      </div>

      <TaxDetailModal isOpen={modalAge != null} onClose={() => setModalAge(null)} age={modalAge}
        results={res} base={base} sirPct={sirPct} />
    </div>
  );
}
