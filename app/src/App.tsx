import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Scenario } from "./lib/types";
import { computeBase, computeScenario } from "./lib/calc";
import type { SavedState } from "./lib/storage";
import { loadFromStorage, saveToStorage } from "./lib/storage";
import { initialScenarios, createAdditionalScenario, duplicateScenario, isPristineScenario, MAX_SCENARIOS } from "./lib/scenarioFactory";
import type { ScenarioWithUIHints } from "./lib/scenarioFactory";
import { useGlobalSettings } from "./hooks/useGlobalSettings";
import { useUrlHistorySync } from "./hooks/useUrlHistorySync";
import { useLayoutPrefs, useElementWidth, useMediaQuery, LAYOUT_DEFAULTS, INPUTS_WIDTH_RANGE, DETAIL_WIDTH_RANGE, MIN_CHARTS_WIDTH } from "./hooks/useLayoutPrefs";
import { Inp, Check } from "./components/ui";
import { KeyframeEditor } from "./components/KeyframeEditor";
import { TimelineChart } from "./components/TimelineChart";
import { TaxDetailModal, TaxDetailPanel, MiniLineChart } from "./components/TaxDetailModal";
import type { GraphFn } from "./components/TaxDetailModal";
import { TaxRateCharts } from "./components/TaxRateChart";
import { IncomeExpenseCharts } from "./components/IncomeExpenseChart";
import { SetupWizard } from "./components/SetupWizard";
import { ScenarioBar } from "./components/ScenarioBar";
import { ShareModal, type ShareModalMode } from "./components/ShareModal";

type PinnedGraph = { label: string; fn: GraphFn };

const URL_LIMIT = 4096;
/** Header height (px) — sticky columns start right below it. */
const HEADER_H = 46;

export default function App() {
  const saved = useRef(loadFromStorage()).current;
  const { settings, update: updateSetting, applySavedState } = useGlobalSettings(saved);
  const { rr, hasRet, retAmt, PY, sirPct, inflationRate } = settings;
  const [scenarios, setScenarios] = useState<Scenario[]>(() => saved?.scenarios?.length ? saved.scenarios : initialScenarios());
  const { prefs: layout, toggle: toggleLayout, set: setLayout } = useLayoutPrefs();
  const isLg = useMediaQuery("(min-width: 1024px)");
  const is2xl = useMediaQuery("(min-width: 1536px)");

  // View state
  const [activeIdx, setActiveIdx] = useState(0);
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
  const rmS = useCallback((i: number) => {
    setScenarios(p => p.filter((_, j) => j !== i));
    setActiveIdx(a => (a >= i && a > 0 ? a - 1 : a));
  }, []);
  const addS = useCallback(() => setScenarios(p => {
    if (p.length >= MAX_SCENARIOS) return p;
    setActiveIdx(p.length);
    return [...p, createAdditionalScenario(p)];
  }), []);
  const dupS = useCallback((i: number) => setScenarios(p => {
    if (p.length >= MAX_SCENARIOS || !p[i]) return p;
    setActiveIdx(i + 1);
    return [...p.slice(0, i + 1), duplicateScenario(p, i), ...p.slice(i + 1)];
  }), []);
  const safeActive = Math.min(activeIdx, scenarios.length - 1);

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

  const isInitialState = isPristineScenario(s0);
  const togglePin = (g: PinnedGraph) => setPinnedGraphs(prev => prev.some(p => p.label === g.label) ? prev.filter(p => p.label !== g.label) : [...prev, g]);

  const openHousingEditor = (phaseIdx: number) => {
    const hinted: ScenarioWithUIHints = { ...scenarios[0], sectionOpen: { ...scenarios[0].sectionOpen, housing: true }, _housingEditIdx: phaseIdx };
    updS(0, hinted);
    setActiveIdx(0);
    setTimeout(() => document.getElementById("housing-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const active = scenarios[safeActive];
  const { showInputs, showDetail, inputsWidth, detailWidth, sideBySide } = layout;
  const compare = sideBySide && scenarios.length > 1;
  // Columns: [inputs] [splitter] charts [splitter] [detail]. Below lg everything stacks.
  const hasInputs = showInputs;
  const hasDetail = showDetail && is2xl;
  const gridTemplate = !isLg ? undefined
    : [hasInputs ? `${inputsWidth}px 6px` : "", "minmax(0,1fr)", hasDetail ? `6px ${detailWidth}px` : ""].join(" ").trim();
  // Splitter limits: keep the charts column at least MIN_CHARTS_WIDTH wide.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const inputsMax = Math.max(INPUTS_WIDTH_RANGE[0], Math.min(INPUTS_WIDTH_RANGE[1], vw - 24 - 12 - MIN_CHARTS_WIDTH - (hasDetail ? detailWidth + 6 : 0)));
  const detailMax = Math.max(DETAIL_WIDTH_RANGE[0], Math.min(DETAIL_WIDTH_RANGE[1], vw - 24 - 12 - MIN_CHARTS_WIDTH - (hasInputs ? inputsWidth + 6 : 0)));
  const stickyCol = `lg:sticky lg:top-[${HEADER_H}px] lg:max-h-[calc(100vh-${HEADER_H + 12}px)] lg:overflow-y-auto`;

  return (
    <div className="min-h-screen text-gray-900">
      {showWizard && (
        <SetupWizard
          onComplete={(s) => { updS(0, s); setShowWizard(false); }}
          onClose={() => setShowWizard(false)}
          calcParams={calcParams}
          base={base}
          initialScenario={s0}
        />
      )}

      {/* Header: title / view toggles / actions */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-white/95 px-3 py-1.5 backdrop-blur-sm" style={{ minHeight: HEADER_H - 6 }}>
        <h1 className="text-base font-bold">FP計算</h1>
        <ViewToggles showInputs={showInputs} showDetail={showDetail} onToggle={toggleLayout} />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button onClick={() => setShowWizard(true)}
            className={`rounded px-3 py-1 text-xs font-bold text-white ${isInitialState ? "bg-green-600 hover:bg-green-700" : "bg-gray-400 hover:bg-gray-500"}`}>
            {isInitialState ? "はじめる" : "ウィザード"}
          </button>
          <UrlLengthBadge length={urlLength} />
          <HeaderBtn onClick={() => setShareMode("export")}>共有・エクスポート</HeaderBtn>
          <HeaderBtn onClick={() => setShareMode("import")}>インポート</HeaderBtn>
          <HeaderBtn onClick={() => setShareMode("report")}>📋レポート</HeaderBtn>
        </div>
      </header>

      <div className={`grid p-3 ${isLg ? "gap-0" : "gap-3"}`} style={{ gridTemplateColumns: gridTemplate }}>
        {/* ── Inputs ── */}
        {showInputs && (
          <aside className={`min-w-0 space-y-2 ${stickyCol} lg:pr-1.5`}>
            <ScenarioBar scenarios={scenarios} activeIdx={safeActive} onSelect={setActiveIdx}
              onUpdate={updS} onAdd={addS} onDup={dupS} onRemove={rmS}
              sideBySide={compare} onToggleSideBySide={() => toggleLayout("sideBySide")} />
            {/* One editor (tab) or all of them side by side; columns follow the available width. */}
            <div className={compare ? "grid gap-2 items-start" : ""} style={compare ? { gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" } : undefined}>
              {(compare ? scenarios : active ? [active] : []).map((s) => {
                const i = scenarios.indexOf(s);
                return (
                  <KeyframeEditor key={s.id ?? i} s={s} idx={i}
                    onChange={(ns) => updS(i, ns)}
                    currentAge={s.currentAge} retirementAge={s.simEndAge}
                    baseScenario={i === 0 ? null : scenarios[0]}
                    sirPct={sirPct} defaultRR={rr} defaultInflation={inflationRate}
                    onChangeBase={i > 0 ? (ns) => updS(0, ns) : undefined} />
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded border border-blue-100 bg-blue-50/60 px-2 py-1.5 text-xs">
              <span className="text-[10px] font-bold text-blue-700">全シナリオ共通</span>
              <Check label="会社の退職金あり" checked={hasRet} onChange={v => updateSetting("hasRet", v)} />
              {hasRet && <Inp label="金額" value={retAmt} onChange={v => updateSetting("retAmt", v)} step={1000000} min={0} unit="円" w="w-24" />}
            </div>
            <p className="px-1 text-[10px] leading-snug text-gray-400">
              節税額はふるさと納税込みベースとの累進差分。社保は概算。貯蓄＝手取り−生活費−イベント支出。
            </p>
          </aside>
        )}
        {showInputs && isLg && (
          <Splitter value={inputsWidth} range={[INPUTS_WIDTH_RANGE[0], inputsMax]} onChange={v => setLayout("inputsWidth", v)}
            onReset={() => setLayout("inputsWidth", LAYOUT_DEFAULTS.inputsWidth)} title="ドラッグで入力列の幅を変更（ダブルクリックで初期値）" />
        )}

        {/* ── Charts ── */}
        <main className="min-w-0 space-y-3 lg:px-1.5">
          <section className="rounded-lg border bg-white">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-sm font-bold text-gray-700">タイムライン</span>
              <span className="flex items-center gap-2 text-[10px] text-gray-400">
                {!showInputs && <button onClick={() => toggleLayout("showInputs")} className="rounded border px-1.5 py-0.5 text-blue-600 hover:bg-blue-50">◀ 入力を表示</button>}
                年をクリックで詳細
              </span>
            </div>
            <div className="px-3 pb-3">
              <TimelineChart results={res} currentAge={currentAge} retirementAge={simEndAge} onYearClick={(age) => setModalAge(age)}
                hoverAge={panelAge} onHoverAge={handleHoverAge} onHousingClick={openHousingEditor} />
            </div>
            {res.length > 0 && res[0].yearResults.length > 0 && (
              <div className="flex items-center gap-2 px-3 pb-2 text-xs">
                <span className="whitespace-nowrap font-bold text-gray-600">{panelAge ?? currentAge}歳</span>
                <input type="range" min={currentAge} max={simEndAge - 1} value={panelAge ?? currentAge}
                  onChange={e => setPanelAge(Number(e.target.value))}
                  className="h-1.5 flex-1 accent-blue-600" />
                <span className="whitespace-nowrap text-gray-400">{currentAge}〜{simEndAge - 1}歳</span>
              </div>
            )}
          </section>

          {(pinnedGraphs.length > 0 || hoveredGraph) && res.length > 0 && (
            <div className="space-y-1 rounded-lg border bg-white p-2">
              {pinnedGraphs.length > 0 && (
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">クリックで追加/削除</span>
                  <button onClick={() => setPinnedGraphs([])} className="text-[10px] text-gray-400 hover:text-red-500">全削除</button>
                </div>
              )}
              {pinnedGraphs.map((g, i) => (
                <div key={g.label} className="group relative">
                  <MiniLineChart results={res} label={g.label} graphFn={g.fn} selectedAge={panelAge ?? currentAge} hoverAge={panelAge} onHoverAge={handleHoverAge} />
                  <button onClick={() => setPinnedGraphs(prev => prev.filter((_, j) => j !== i))}
                    className="absolute right-0 top-0 px-1 text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500">×</button>
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
        </main>

        {/* ── Detail (≥2xl only) ── */}
        {hasDetail && (
          <Splitter value={detailWidth} range={[DETAIL_WIDTH_RANGE[0], detailMax]} direction="rtl" onChange={v => setLayout("detailWidth", v)}
            onReset={() => setLayout("detailWidth", LAYOUT_DEFAULTS.detailWidth)} title="ドラッグで詳細列の幅を変更（ダブルクリックで初期値）" />
        )}
        {hasDetail && panelAge != null && (
          <DetailColumn className={stickyCol}>
            {(w) => <TaxDetailPanel age={panelAge} results={res} base={base} sirPct={sirPct} containerWidth={w} onHoverGraph={setHoveredGraph} onPinGraph={togglePin} />}
          </DetailColumn>
        )}
      </div>

      <TaxDetailModal isOpen={modalAge != null} onClose={() => setModalAge(null)} age={modalAge}
        results={res} base={base} sirPct={sirPct} />

      {shareMode && (
        <ShareModal mode={shareMode} onClose={() => setShareMode(null)} state={currentState} results={res} onImport={restoreState} />
      )}
    </div>
  );
}

/** 入力 / 詳細 column toggles. 詳細 is only meaningful on ≥2xl screens, so the button is hidden below that. */
function ViewToggles({ showInputs, showDetail, onToggle }: {
  showInputs: boolean; showDetail: boolean; onToggle: (k: "showInputs" | "showDetail") => void;
}) {
  const btn = (on: boolean, label: string, title: string, onClick: () => void, extra = "") => (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${on ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-800"} ${extra}`}>
      {label}
    </button>
  );
  return (
    <span className="inline-flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5" role="group" aria-label="表示する列">
      <span className="px-1 text-[10px] text-gray-400">表示</span>
      {btn(showInputs, "入力", showInputs ? "入力列を隠してグラフを全幅に" : "入力列を表示", () => onToggle("showInputs"))}
      {btn(showDetail, "年齢別の詳細", showDetail ? "詳細パネルを隠す" : "右側に選択年齢の詳細表を表示（広い画面のみ）", () => onToggle("showDetail"), "hidden 2xl:inline-block")}
    </span>
  );
}

/**
 * Draggable column divider. `direction="rtl"` means dragging left grows the column (right-hand panel).
 * Pointer capture keeps the drag alive even when the cursor leaves the 6px strip.
 */
function Splitter({ value, range, onChange, onReset, direction = "ltr", title }: {
  value: number; range: [number, number]; onChange: (v: number) => void; onReset: () => void;
  direction?: "ltr" | "rtl"; title?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, w: value };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events have no active pointer */ }
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = (e.clientX - start.current.x) * (direction === "rtl" ? -1 : 1);
    const next = Math.round(Math.min(range[1], Math.max(range[0], start.current.w + dx)));
    if (next !== value) onChange(next);
  };
  const end = () => {
    start.current = null; setDragging(false);
    document.body.style.cursor = ""; document.body.style.userSelect = "";
  };
  return (
    <div role="separator" aria-orientation="vertical" aria-valuenow={value} aria-valuemin={range[0]} aria-valuemax={range[1]} title={title}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end} onDoubleClick={onReset}
      className={`group relative z-10 mx-0 w-[6px] cursor-col-resize select-none touch-none ${dragging ? "bg-blue-400" : "bg-transparent hover:bg-blue-200"}`}>
      <span className={`absolute left-1/2 top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ${dragging ? "bg-blue-600" : "bg-gray-300 group-hover:bg-blue-500"}`} />
    </div>
  );
}

/** Right-hand detail column that reports its width to the table (it decides how many columns fit). */
function DetailColumn({ className, children }: { className?: string; children: (width: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useElementWidth(ref);
  return (
    <section ref={ref} className={`min-w-0 rounded-lg border bg-white shadow-sm ${className || ""}`}>
      {children(w)}
    </section>
  );
}

function HeaderBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="rounded border px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">{children}</button>;
}

function UrlLengthBadge({ length }: { length: number }) {
  const over = length > URL_LIMIT;
  const tone = over ? "text-red-600 font-bold" : length > URL_LIMIT * 0.75 ? "text-amber-600" : "text-gray-400";
  return (
    <span className={`text-[10px] tabular-nums ${tone}`} title={`共有URLの長さ ${length.toLocaleString()} / ${URL_LIMIT.toLocaleString()} 文字`}>
      URL {Math.round(length / URL_LIMIT * 100)}%{over ? " ⚠️超過" : ""}
    </span>
  );
}
