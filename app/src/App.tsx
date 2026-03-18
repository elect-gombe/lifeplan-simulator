import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Scenario } from "./lib/types";
import { DEFAULT_OVERRIDE_TRACKS } from "./lib/types";
import { fmt } from "./lib/format";
import { computeBase, computeScenario } from "./lib/calc";
import { Slider, NumIn, Tog } from "./components/ui";
import { Chart } from "./components/Chart";
import { KeyframeEditor } from "./components/KeyframeEditor";
import { TimelineChart } from "./components/TimelineChart";
import { TotalAssetBar } from "./components/TotalAssetBar";
import { SummaryCard } from "./components/SummaryCard";
import { TaxDetailModal, TaxDetailPanel } from "./components/TaxDetailModal";

const STORAGE_KEY = "asset-sim-state-v1";

interface SavedState {
  rr: number;
  hasRet: boolean;
  retAmt: number;
  PY: number;
  sirPct: number;
  inflationRate: number;
  scenarios: Scenario[];
}

function saveToStorage(state: SavedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function migrateScenario(s: any, oldFields?: any): Scenario {
  return {
    ...s,
    currentAge: s.currentAge ?? oldFields?.currentAge ?? 30,
    retirementAge: s.retirementAge ?? oldFields?.retirementAge ?? 65,
    simEndAge: s.simEndAge ?? 85,
    currentAssetsMan: s.currentAssetsMan ?? oldFields?.currentAssetsMan ?? 500,
    salaryGrowthRate: s.salaryGrowthRate ?? oldFields?.salaryGrowthRate ?? 2,
    years: s.years ?? oldFields?.dcYears ?? 35,
    hasFurusato: s.hasFurusato ?? oldFields?.hasFurusato ?? true,
    dependentDeductionHolder: s.dependentDeductionHolder ?? "self",
    pensionStartAge: s.pensionStartAge ?? 65,
    pensionWorkStartAge: s.pensionWorkStartAge ?? 22,
    dcReceiveMethod: s.dcReceiveMethod ?? { type: "lump_sum", annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 },
    spouse: s.spouse ? {
      retirementAge: 65,
      ...s.spouse,
    } : { enabled: false, currentAge: 30, retirementAge: 65, incomeKF: [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, sirPct: 15.75, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22 },
    nisa: s.nisa ?? { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800, returnRate: 5 },
    balancePolicy: s.balancePolicy ?? { cashReserveMonths: 6, nisaPriority: true },
    overrideTracks: s.overrideTracks ?? [],
    excludedBaseEventIds: s.excludedBaseEventIds ?? [],
    events: (s.events || []).map((e: any) => ({
      ...e,
      propertyParams: e.propertyParams ? {
        loanStructure: "single", pairRatio: 50, deductionTarget: "self", danshinTarget: "self",
        ...e.propertyParams,
      } : undefined,
    })),
  };
}

function loadFromStorage(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const oldFields = {
      currentAge: parsed.currentAge,
      retirementAge: parsed.retirementAge,
      currentAssetsMan: parsed.currentAssetsMan,
      salaryGrowthRate: parsed.salaryGrowthRate,
      dcYears: parsed.dcYears,
      hasFurusato: parsed.hasFurusato,
    };
    const scenarios = (parsed.scenarios || []).map((s: any) => migrateScenario(s, oldFields));
    return {
      rr: parsed.rr ?? 4,
      hasRet: parsed.hasRet ?? false,
      retAmt: parsed.retAmt ?? 0,
      PY: parsed.PY ?? 20,
      sirPct: parsed.sirPct ?? 15.75,
      inflationRate: parsed.inflationRate ?? 1.5,
      scenarios,
    };
  } catch { return null; }
}

function exportJSON(state: SavedState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `asset-sim-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}

// gzip + base64 encode/decode for URL sharing
async function encodeStateToURL(state: SavedState): Promise<string> {
  const json = JSON.stringify(state);
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = await new Response(stream).arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
  // URL-safe base64
  const urlSafe = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return urlSafe;
}

async function decodeStateFromURL(encoded: string): Promise<SavedState | null> {
  try {
    // Restore standard base64
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const json = await new Response(stream).text();
    const parsed = JSON.parse(json);
    const oldFields = { currentAge: parsed.currentAge, retirementAge: parsed.retirementAge, currentAssetsMan: parsed.currentAssetsMan, salaryGrowthRate: parsed.salaryGrowthRate, dcYears: parsed.dcYears, hasFurusato: parsed.hasFurusato };
    return { rr: parsed.rr ?? 4, hasRet: parsed.hasRet ?? false, retAmt: parsed.retAmt ?? 0, PY: parsed.PY ?? 20, sirPct: parsed.sirPct ?? 15.75, inflationRate: parsed.inflationRate ?? 1.5, scenarios: (parsed.scenarios || []).map((s: any) => migrateScenario(s, oldFields)) };
  } catch { return null; }
}

function importJSON(file: File): Promise<SavedState | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed || typeof parsed !== "object") { resolve(null); return; }
        const oldFields = { currentAge: parsed.currentAge, retirementAge: parsed.retirementAge, currentAssetsMan: parsed.currentAssetsMan, salaryGrowthRate: parsed.salaryGrowthRate, dcYears: parsed.dcYears, hasFurusato: parsed.hasFurusato };
        const scenarios = (parsed.scenarios || []).map((s: any) => migrateScenario(s, oldFields));
        resolve({ rr: parsed.rr ?? 4, hasRet: parsed.hasRet ?? false, retAmt: parsed.retAmt ?? 0, PY: parsed.PY ?? 20, sirPct: parsed.sirPct ?? 15.75, inflationRate: parsed.inflationRate ?? 1.5, scenarios });
      } catch { resolve(null); }
    };
    reader.readAsText(file);
  });
}

function mkScenario(id: number): Scenario {
  const isBase = id === 0;
  const isB = id === 1;
  return {
    id, name: `シナリオ${"ABCD"[id] || "X"}`,
    currentAge: 30, retirementAge: 65, simEndAge: 85,
    currentAssetsMan: 500,
    incomeKF: isBase ? [{ age: 30, value: 700 }] : [],
    expenseKF: isBase ? [{ age: 30, value: 15 }] : [],
    dcTotalKF: [{ age: 30, value: isB ? 35000 : 55000 }],
    companyDCKF: [{ age: 30, value: 1000 }],
    idecoKF: [{ age: 30, value: isB ? 20000 : 0 }],
    salaryGrowthRate: 2,
    events: [], excludedBaseEventIds: [],
    linkedToBase: !isBase,
    overrideTracks: isBase ? [] : [...DEFAULT_OVERRIDE_TRACKS],
    years: 35, hasFurusato: true,
    dependentDeductionHolder: "self",
    pensionStartAge: 65, pensionWorkStartAge: 22,
    dcReceiveMethod: { type: "lump_sum", annuityYears: 20, annuityStartAge: 65, combinedLumpSumRatio: 50 },
    spouse: { enabled: false, currentAge: 28, retirementAge: 65, incomeKF: [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, sirPct: 15.75, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22 },
    nisa: { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800, returnRate: 5 },
    balancePolicy: { cashReserveMonths: 6, nisaPriority: true },
  };
}

export default function App() {
  const saved = useRef(loadFromStorage()).current;
  const [rr, setRR] = useState(saved?.rr ?? 4);
  const [hasRet, setHasRet] = useState(saved?.hasRet ?? false);
  const [retAmt, setRetAmt] = useState(saved?.retAmt ?? 0);
  const [PY, setPY] = useState(saved?.PY ?? 20);
  const [sirPct, setSirPct] = useState(saved?.sirPct ?? 15.75);
  const [scenarios, setScenarios] = useState<Scenario[]>(() => saved?.scenarios?.length ? saved.scenarios : [mkScenario(0), mkScenario(1)]);
  const [modalAge, setModalAge] = useState<number | null>(null);
  const [panelAge, setPanelAge] = useState<number | null>(() => saved?.scenarios?.[0]?.currentAge ?? 30);
  const handleHoverAge = useCallback((age: number | null) => { if (age != null) setPanelAge(age); }, []);
  const [inflationRate, setInflationRate] = useState(saved?.inflationRate ?? 1.5);
  const [jsonModal, setJsonModal] = useState<"export" | "import" | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URLハッシュからデータを読み込む（初回のみ）
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    decodeStateFromURL(hash).then(data => {
      if (!data) return;
      setRR(data.rr); setHasRet(data.hasRet); setRetAmt(data.retAmt);
      setPY(data.PY); setSirPct(data.sirPct); setInflationRate(data.inflationRate);
      if (data.scenarios.length) setScenarios(data.scenarios);
    });
  }, []);

  const currentState: SavedState = useMemo(() => ({
    rr, hasRet, retAmt, PY, sirPct, inflationRate, scenarios,
  }), [rr, hasRet, retAmt, PY, sirPct, inflationRate, scenarios]);

  useEffect(() => { saveToStorage(currentState); }, [currentState]);

  // 設定変更時にURLハッシュも更新（共有リンクが常に最新を反映）
  useEffect(() => {
    encodeStateToURL(currentState).then(hash => {
      window.history.replaceState(null, "", `#${hash}`);
    });
  }, [currentState]);

  const handleImport = async (file: File) => {
    const data = await importJSON(file);
    if (!data) { alert("ファイルの読み込みに失敗しました"); return; }
    setRR(data.rr ?? 4);
    setHasRet(data.hasRet ?? false);
    setRetAmt(data.retAmt ?? 0);
    setPY(data.PY ?? 20);
    setSirPct(data.sirPct ?? 15.75);
    setInflationRate(data.inflationRate ?? 1.5);
    if (data.scenarios?.length) setScenarios(data.scenarios);
  };

  const updS = useCallback((i: number, s: Scenario) => setScenarios(p => p.map((x, j) => j === i ? s : x)), []);
  const rmS = useCallback((i: number) => setScenarios(p => p.filter((_, j) => j !== i)), []);
  const addS = useCallback(() => {
    setScenarios(p => p.length >= 4 ? p : [...p, { ...mkScenario(p.length), id: Date.now() + p.length }]);
  }, []);
  const dupS = useCallback((i: number) => {
    setScenarios(p => {
      if (p.length >= 4) return p;
      const src = p[i];
      return src ? [...p.slice(0, i + 1), { ...src, id: Date.now(), name: `${src.name} コピー` }, ...p.slice(i + 1)] : p;
    });
  }, []);

  // シナリオAの年齢を参照用に取得
  const s0 = scenarios[0];
  const currentAge = s0?.currentAge ?? 30;
  const simEndAge = s0?.simEndAge ?? 85;
  const taxOpts = { dependentsCount: 0, lifeInsuranceDeduction: 0, sirPct };

  const calcParams = useMemo(() => ({
    currentAge, retirementAge: simEndAge, defaultGrossMan: 0, rr, sirPct, hasRet, retAmt, PY, taxOpts, housingLoanDed: 0, inflationRate,
  }), [currentAge, simEndAge, rr, sirPct, hasRet, retAmt, PY, inflationRate]);

  const { base, res } = useMemo(() => {
    const base = computeBase(calcParams);
    const baseScenario = scenarios[0] || null;
    const res = scenarios.map((s, i) => computeScenario(s, base, calcParams, i === 0 ? null : baseScenario));
    return { base, res };
  }, [scenarios, calcParams]);

  const bestIdx = res.length > 0 ? res.reduce((bi, s, i, a) => s.finalWealth > a[bi].finalWealth ? i : bi, 0) : 0;
  const scenarioGridClass = scenarios.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

  return (
    <div className="flex p-3 text-gray-900">
      <div className="flex flex-col gap-3 max-w-5xl w-full shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">資産シミュレーター</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => { setJsonText(JSON.stringify(currentState, null, 2)); setCopied(false); setJsonModal("export"); }}
              className="rounded border px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">共有・エクスポート</button>
            <button onClick={() => { setJsonText(""); setJsonModal("import"); }}
              className="rounded border px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">インポート</button>
          </div>
        </div>

        {/* Global settings — 全シナリオ共通 */}
        <details className="rounded bg-blue-50 p-3" open>
          <summary className="cursor-pointer text-xs font-bold text-blue-700 mb-2">共通設定</summary>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Slider label="運用利回り" value={rr} onChange={setRR} min={0} max={10} step={0.5} unit="%" />
            <Slider label="社保料率" value={sirPct} onChange={setSirPct} min={10} max={20} step={0.25} unit="%" help="厚年+健保+介護+雇用" />
            <Slider label="年金受給期間" value={PY} onChange={setPY} min={10} max={30} step={1} unit="年" />
            <Slider label="インフレ率" value={inflationRate} onChange={setInflationRate} min={0} max={5} step={0.25} unit="%" help="生活費・イベント費に年次適用" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Tog label="会社退職金あり" checked={hasRet} onChange={setHasRet} />
            {hasRet && <NumIn label="" value={retAmt} onChange={setRetAmt} step={1000000} unit="円" small />}
          </div>
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
                currentAge={s.currentAge} retirementAge={s.simEndAge}
                baseScenario={i === 0 ? null : scenarios[0]}
                sirPct={sirPct} />
            ))}
          </div>
        </details>

        {/* Timeline chart */}
        <details className="rounded-lg border bg-white" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-gray-700">タイムライン</summary>
          <div className="px-3 pb-3">
            <TimelineChart results={res} currentAge={currentAge} retirementAge={simEndAge} onYearClick={(age) => setModalAge(age)} onHoverAge={handleHoverAge} />
          </div>
        </details>

        <TotalAssetBar res={res} bestIdx={bestIdx} />

        <div>
          <p className="mb-2 text-sm font-bold">サマリー</p>
          <div className={`grid gap-3 ${scenarioGridClass}`}>
            {res.map((s, i) => (
              <SummaryCard key={i} s={s} idx={i} isBest={i === bestIdx} rr={rr} />
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-0.5">
          <p>※ 節税額はふるさと納税込みベースとの累進差分。社保は概算。</p>
          <p>※ 貯蓄＝手取り−生活費−イベント支出。マイナスの年は貯蓄取り崩し。タイムラインの年をクリックで詳細表示。</p>
        </div>
      </div>

      {/* Side panel: hover detail on ultra-wide screens */}
      {panelAge != null && (
        <div className="hidden 2xl:block min-w-[1000px] flex-1 shrink-0 ml-3 sticky top-3 max-h-[calc(100vh-24px)] rounded-lg border bg-white shadow-lg overflow-auto">
          <TaxDetailPanel age={panelAge} results={res} base={base} sirPct={sirPct} />
        </div>
      )}

      <TaxDetailModal isOpen={modalAge != null} onClose={() => setModalAge(null)} age={modalAge}
        results={res} base={base} sirPct={sirPct} />

      {/* JSON共有モーダル */}
      {jsonModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 pt-8" onClick={() => setJsonModal(null)}>
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-bold">{jsonModal === "export" ? "シナリオ共有" : "シナリオ読込"}</p>
              <button onClick={() => setJsonModal(null)} className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100">閉じる</button>
            </div>
            <div className="p-4 space-y-3">
              {jsonModal === "export" ? (<>
                {/* 共有リンク */}
                <div className="rounded border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <div className="text-xs font-bold text-blue-700">共有リンク</div>
                  {shareUrl ? (
                    <div className="space-y-1">
                      <input value={shareUrl} readOnly className="w-full rounded border bg-white px-2 py-1.5 font-mono text-[10px] text-gray-600" onClick={e => (e.target as HTMLInputElement).select()} />
                      <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                          className="rounded bg-blue-600 px-3 py-1 text-xs text-white font-bold hover:bg-blue-700">
                          {copied ? "コピーしました!" : "リンクをコピー"}
                        </button>
                        <span className="text-[10px] text-gray-400 self-center">URLを共有するだけで同じシナリオを再現できます</span>
                      </div>
                    </div>
                  ) : (
                    <button onClick={async () => {
                      const encoded = await encodeStateToURL(currentState);
                      setShareUrl(`${window.location.origin}${window.location.pathname}#${encoded}`);
                    }} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white font-bold hover:bg-blue-700">共有リンクを生成</button>
                  )}
                </div>
                {/* JSON */}
                <details className="rounded border p-3">
                  <summary className="cursor-pointer text-xs text-gray-500">JSON（詳細）</summary>
                  <div className="mt-2 space-y-2">
                    <textarea value={jsonText} readOnly rows={12}
                      className="w-full rounded border bg-gray-50 p-2 font-mono text-[10px] leading-tight text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      onClick={e => (e.target as HTMLTextAreaElement).select()} />
                    <div className="flex gap-2">
                      <button onClick={() => { navigator.clipboard.writeText(jsonText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className="rounded border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">JSONをコピー</button>
                      <button onClick={() => exportJSON(currentState)}
                        className="rounded border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">ファイル保存</button>
                    </div>
                  </div>
                </details>
              </>) : (<>
                <div className="text-xs text-gray-500">共有されたJSONを貼り付けるか、ファイルを選択してください。</div>
                <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} rows={15} placeholder="JSONをここに貼り付け..."
                  className="w-full rounded border p-2 font-mono text-[10px] leading-tight text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <div className="flex gap-2">
                  <button onClick={() => {
                    try {
                      const parsed = JSON.parse(jsonText);
                      const oldFields = { currentAge: parsed.currentAge, retirementAge: parsed.retirementAge, currentAssetsMan: parsed.currentAssetsMan, salaryGrowthRate: parsed.salaryGrowthRate, dcYears: parsed.dcYears, hasFurusato: parsed.hasFurusato };
                      const data = { rr: parsed.rr ?? 4, hasRet: parsed.hasRet ?? false, retAmt: parsed.retAmt ?? 0, PY: parsed.PY ?? 20, sirPct: parsed.sirPct ?? 15.75, inflationRate: parsed.inflationRate ?? 1.5, scenarios: (parsed.scenarios || []).map((s: any) => migrateScenario(s, oldFields)) };
                      setRR(data.rr); setHasRet(data.hasRet); setRetAmt(data.retAmt); setPY(data.PY); setSirPct(data.sirPct); setInflationRate(data.inflationRate);
                      if (data.scenarios.length) setScenarios(data.scenarios);
                      setJsonModal(null);
                    } catch { alert("JSONの形式が正しくありません"); }
                  }} className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white font-bold hover:bg-blue-700" disabled={!jsonText.trim()}>
                    読み込む
                  </button>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="rounded border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">ファイルから読込</button>
                  <input ref={fileInputRef} type="file" accept=".json" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleImport(f); setJsonModal(null); } e.target.value = ""; }} />
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
