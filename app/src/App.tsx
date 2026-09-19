import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Scenario } from "./lib/types";
import { computeBase, computeScenario } from "./lib/calc";
import type { SavedState } from "./lib/storage";
import { loadFromStorage, saveToStorage } from "./lib/storage";
import { initialScenarios, createAdditionalScenario, duplicateScenario, isPristineScenario, MAX_SCENARIOS } from "./lib/scenarioFactory";
import type { ScenarioWithUIHints } from "./lib/scenarioFactory";
import { useGlobalSettings } from "./hooks/useGlobalSettings";
import { useUrlHistorySync } from "./hooks/useUrlHistorySync";
import { NumIn, Tog } from "./components/ui";
import { KeyframeEditor } from "./components/KeyframeEditor";
import { TimelineChart } from "./components/TimelineChart";
import { TaxDetailModal, TaxDetailPanel, MiniLineChart } from "./components/TaxDetailModal";
import type { GraphFn } from "./components/TaxDetailModal";
import { TaxRateCharts } from "./components/TaxRateChart";
import { IncomeExpenseCharts } from "./components/IncomeExpenseChart";
import { SetupWizard } from "./components/SetupWizard";
import { ScenarioBar } from "./components/ScenarioBar";
import { PanelContainer } from "./components/PanelContainer";
import { ShareModal, type ShareModalMode } from "./components/ShareModal";

type PinnedGraph = { label: string; fn: GraphFn };

const URL_LIMIT = 4096;

export default function App() {
  const saved = useRef(loadFromStorage()).current;
  const { settings, update: updateSetting, applySavedState } = useGlobalSettings(saved);
  const { rr, hasRet, retAmt, PY, sirPct, inflationRate } = settings;
  const [scenarios, setScenarios] = useState<Scenario[]>(() => saved?.scenarios?.length ? saved.scenarios : initialScenarios());

  // View state
  const [modalAge, setModalAge] = useState<number | null>(null);
  const [panelAge, setPanelAge] = useState<number | null>(() => saved?.scenarios?.[0]?.currentAge ?? 30);
  const handleHoverAge = useCallback((age: number | null) => { if (age != null) setPanelAge(age); }, []);
  const [hoveredGraph, setHoveredGraph] = useState<PinnedGraph | null>(null);
  const [pinnedGraphs, setPinnedGraphs] = useState<PinnedGraph[]>([]);
  const [shareMode, setShareMode] = useState<ShareModalMode | null>(null);
  const [showWizard, setShowWizard] = useState(() => !saved && !window.location.hash);

  // Persistence: localStorage + URL hash (with Back/Forward support)
  const currentState: SavedState = useMemo(() => ({ ...settings, scenarios }), [settings, scenarios]);
  useEffect(() => { saveToStorage(currentState); }, [currentState]);

  const restoreState = useCallback((data: SavedState) => {
    applySavedState(data);
    if (data.scenarios.length) setScenarios(data.scenarios);
  }, [applySavedState]);
  const urlLength = useUrlHistorySync(currentState, restoreState);

  // Scenario list operations
  const updS = useCallback((i: number, s: Scenario) => setScenarios(p => p.map((x, j) => j === i ? s : x)), []);
  const rmS = useCallback((i: number) => setScenarios(p => p.filter((_, j) => j !== i)), []);
  const addS = useCallback(() => setScenarios(p => p.length >= MAX_SCENARIOS ? p : [...p, createAdditionalScenario(p)]), []);
  const dupS = useCallback((i: number) => setScenarios(p => {
    if (p.length >= MAX_SCENARIOS || !p[i]) return p;
    return [...p.slice(0, i + 1), duplicateScenario(p, i), ...p.slice(i + 1)];
  }), []);

  // Scenario A drives the shared axis (age range) and defaults
  const s0 = scenarios[0];
  const currentAge = s0?.currentAge ?? 30;
  const simEndAge = s0?.simEndAge ?? 85;
  const effectiveRR = s0?.rr ?? rr;
  const effectiveInflation = s0?.inflationRate ?? inflationRate;

  const calcParams = useMemo(() => ({
    currentAge, retirementAge: simEndAge, defaultGrossMan: 0, rr: effectiveRR, sirPct, hasRet, retAmt, PY,
    taxOpts: { dependentsCount: 0, lifeInsuranceDeduction: 0, sirPct }, housingLoanDed: 0, inflationRate: effectiveInflation,
  }), [currentAge, simEndAge, effectiveRR, sirPct, hasRet, retAmt, PY, effectiveInflation]);

  const { base, res } = useMemo(() => {
    const base = computeBase(calcParams);
    const baseScenario = scenarios[0] || null;
    const res = scenarios.map((s, i) => computeScenario(s, base, calcParams, i === 0 ? null : baseScenario));
    return { base, res };
  }, [scenarios, calcParams]);

  const scenarioGridClass = scenarios.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";
  const isInitialState = isPristineScenario(s0);
  const togglePin = (g: PinnedGraph) => setPinnedGraphs(prev => prev.some(p => p.label === g.label) ? prev.filter(p => p.label !== g.label) : [...prev, g]);

  const openHousingEditor = (phaseIdx: number) => {
    const hinted: ScenarioWithUIHints = { ...scenarios[0], sectionOpen: { ...scenarios[0].sectionOpen, housing: true }, _housingEditIdx: phaseIdx };
    updS(0, hinted);
    setTimeout(() => document.getElementById("housing-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  return (
    <div className="flex p-3 text-gray-900">
      {showWizard && (
        <SetupWizard
          onComplete={(s) => { updS(0, s); setShowWizard(false); }}
          onClose={() => setShowWizard(false)}
          calcParams={calcParams}
          base={base}
          initialScenario={s0}
        />
      )}
      <div className="flex flex-col gap-3 max-w-6xl w-full shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">FP計算</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowWizard(true)}
              className={`rounded px-3 py-1 text-xs font-bold text-white ${isInitialState ? "bg-green-600 hover:bg-green-700" : "bg-gray-400 hover:bg-gray-500"}`}>
              {isInitialState ? "はじめる" : "ウィザード"}
            </button>
            <UrlLengthBadge length={urlLength} />
            <button onClick={() => setShareMode("export")}
              className="rounded border px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">共有・エクスポート</button>
            <button onClick={() => setShareMode("import")}
              className="rounded border px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">インポート</button>
            <button onClick={() => setShareMode("report")}
              className="rounded border px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">📋レポート</button>
          </div>
        </div>

        {/* Global settings — 全シナリオ共通 */}
        <details className="rounded bg-blue-50 p-3" open>
          <summary className="cursor-pointer text-xs font-bold text-blue-700 mb-2">共通設定</summary>
          <div className="mt-1 flex flex-wrap items-center gap-4">
            <Tog label="会社退職金あり" checked={hasRet} onChange={v => updateSetting("hasRet", v)} />
            {hasRet && <NumIn label="" value={retAmt} onChange={v => updateSetting("retAmt", v)} step={1000000} unit="円" small />}
          </div>
        </details>

        <ScenarioBar scenarios={scenarios} onUpdate={updS} onAdd={addS} onDup={dupS} onRemove={rmS} />

        {/* Keyframe editors */}
        <details className="rounded border bg-white p-3" open>
          <summary className="cursor-pointer text-sm font-bold mb-2">タイムライン設定（キーフレーム）</summary>
          <div className={`grid gap-3 items-start ${scenarioGridClass}`}>
            {scenarios.map((s, i) => (
              <KeyframeEditor key={s.id ?? i} s={s} idx={i}
                onChange={(ns) => updS(i, ns)}
                currentAge={s.currentAge} retirementAge={s.simEndAge}
                baseScenario={i === 0 ? null : scenarios[0]}
                sirPct={sirPct} defaultRR={rr} defaultInflation={inflationRate}
                onChangeBase={i > 0 ? (ns) => updS(0, ns) : undefined} />
            ))}
          </div>
        </details>

        {/* Timeline chart */}
        <details className="rounded-lg border bg-white" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-gray-700">タイムライン</summary>
          <div className="px-3 pb-3">
            <TimelineChart results={res} currentAge={currentAge} retirementAge={simEndAge} onYearClick={(age) => setModalAge(age)}
              hoverAge={panelAge} onHoverAge={handleHoverAge} onHousingClick={openHousingEditor} />
          </div>
        </details>

        {/* Age slider */}
        {res.length > 0 && res[0].yearResults.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-gray-600 whitespace-nowrap">{panelAge ?? currentAge}歳</span>
            <input type="range" min={currentAge} max={simEndAge - 1} value={panelAge ?? currentAge}
              onChange={e => setPanelAge(Number(e.target.value))}
              className="flex-1 h-1.5 accent-blue-600" />
            <span className="text-gray-400 whitespace-nowrap">{currentAge}〜{simEndAge - 1}歳</span>
          </div>
        )}

        {/* Pinned graphs + hovered graph */}
        {(pinnedGraphs.length > 0 || hoveredGraph) && res.length > 0 && (
          <div className="rounded-lg border bg-white p-2 space-y-1">
            {pinnedGraphs.length > 0 && (
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-400">クリックで追加/削除</span>
                <button onClick={() => setPinnedGraphs([])} className="text-[10px] text-gray-400 hover:text-red-500">全削除</button>
              </div>
            )}
            {pinnedGraphs.map((g, i) => (
              <div key={g.label} className="relative group">
                <MiniLineChart results={res} label={g.label} graphFn={g.fn} selectedAge={panelAge ?? currentAge} hoverAge={panelAge} onHoverAge={handleHoverAge} />
                <button onClick={() => setPinnedGraphs(prev => prev.filter((_, j) => j !== i))}
                  className="absolute top-0 right-0 text-[10px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 px-1">×</button>
              </div>
            ))}
            {hoveredGraph && !pinnedGraphs.some(p => p.label === hoveredGraph.label) && (
              <div className="opacity-60">
                <MiniLineChart results={res} label={hoveredGraph.label} graphFn={hoveredGraph.fn} selectedAge={panelAge ?? currentAge} hoverAge={panelAge} onHoverAge={handleHoverAge} />
              </div>
            )}
          </div>
        )}

        <IncomeExpenseCharts results={res} hoverAge={panelAge} onHoverAge={handleHoverAge} />

        <TaxRateCharts results={res} hoverAge={panelAge} onHoverAge={handleHoverAge} />

        <div className="text-xs text-gray-400 space-y-0.5">
          <p>※ 節税額はふるさと納税込みベースとの累進差分。社保は概算。</p>
          <p>※ 貯蓄＝手取り−生活費−イベント支出。マイナスの年は貯蓄取り崩し。タイムラインの年をクリックで詳細表示。</p>
        </div>
      </div>

      {/* Side panel: hover detail on ultra-wide screens */}
      {panelAge != null && (
        <PanelContainer>
          {(w) => <TaxDetailPanel age={panelAge} results={res} base={base} sirPct={sirPct} containerWidth={w} onHoverGraph={setHoveredGraph} onPinGraph={togglePin} />}
        </PanelContainer>
      )}

      <TaxDetailModal isOpen={modalAge != null} onClose={() => setModalAge(null)} age={modalAge}
        results={res} base={base} sirPct={sirPct} />

      {shareMode && (
        <ShareModal mode={shareMode} onClose={() => setShareMode(null)} state={currentState} results={res} onImport={restoreState} />
      )}
    </div>
  );
}

function UrlLengthBadge({ length }: { length: number }) {
  const tone = length > URL_LIMIT ? "text-red-600 font-bold" : length > URL_LIMIT * 0.75 ? "text-amber-600" : "text-gray-400";
  return (
    <span className={`text-[10px] tabular-nums ${tone}`}>
      URL {length.toLocaleString()}/{URL_LIMIT.toLocaleString()} ({Math.round(length / URL_LIMIT * 100)}%){length > URL_LIMIT ? " ⚠️超過" : ""}
    </span>
  );
}
