import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Scenario } from "./lib/types";
import { DEFAULT_OVERRIDE_TRACKS, DEFAULT_DC_RECEIVE_METHOD } from "./lib/types";
import { fmt } from "./lib/format";
import { computeBase, computeScenario } from "./lib/calc";
import { Slider, NumIn, Tog } from "./components/ui";
import { Chart } from "./components/Chart";
import { KeyframeEditor } from "./components/KeyframeEditor";
import { TimelineChart } from "./components/TimelineChart";
import { TaxDetailModal, TaxDetailPanel, MiniLineChart } from "./components/TaxDetailModal";
import type { GraphFn } from "./components/TaxDetailModal";
import { TaxRateCharts } from "./components/TaxRateChart";
import { IncomeExpenseCharts } from "./components/IncomeExpenseChart";

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
  const events = (s.events || []).map((e: any) => ({
    ...e,
    propertyParams: e.propertyParams ? {
      loanStructure: "single", pairRatio: 50, deductionTarget: "self", danshinTarget: "self",
      ...e.propertyParams,
    } : undefined,
  }));

  // housingTimeline自動構築: 既存イベントから住居フェーズをマイグレーション
  let housingTimeline = s.housingTimeline;
  if (!housingTimeline && !s.linkedToBase) {
    const currentAge = s.currentAge ?? oldFields?.currentAge ?? 30;
    const ht: any[] = [];
    for (const e of events) {
      if (e.disabled) continue;
      if (e.type === "rent" && !e.parentId) ht.push({ startAge: e.age, type: "rent", rentMonthlyMan: Math.round((e.annualCostMan || 120) / 12) });
      else if (e.type === "property" && e.propertyParams) ht.push({ startAge: e.age, type: "own", propertyParams: e.propertyParams });
      else if (e.type === "relocation" && e.relocationParams) {
        const rp = e.relocationParams;
        if (rp.newHousingType === "rent") ht.push({ startAge: e.age, type: "rent", rentMonthlyMan: Math.round((rp.newRentAnnualMan || 120) / 12) });
        else if (rp.newPropertyParams) ht.push({ startAge: e.age, type: "own", propertyParams: rp.newPropertyParams });
      }
    }
    if (ht.length > 0) housingTimeline = ht;
    else housingTimeline = [{ startAge: currentAge, type: "rent", rentMonthlyMan: 10 }];
  }

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
    dcReceiveMethod: s.dcReceiveMethod,
    housingTimeline,
    spouse: s.spouse ? {
      retirementAge: 65,
      ...s.spouse,
    } : { enabled: false, currentAge: 30, retirementAge: 65, incomeKF: [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, sirPct: 15.75, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22 },
    nisa: s.nisa ?? { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800, returnRate: 5 },
    balancePolicy: s.balancePolicy ?? { cashReserveMonths: 6, nisaPriority: true },
    overrideTracks: s.overrideTracks ?? [],
    excludedBaseEventIds: s.excludedBaseEventIds ?? [],
    events,
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
    housingTimeline: isBase ? [{ startAge: 30, type: "rent", rentMonthlyMan: 10 }] : undefined, // Bはundefined=Aにリンク
    linkedToBase: !isBase,
    overrideTracks: isBase ? [] : [...DEFAULT_OVERRIDE_TRACKS],
    years: 35, hasFurusato: true,
    dependentDeductionHolder: "self",
    pensionStartAge: 65, pensionWorkStartAge: 22,
    dcReceiveMethod: isBase ? DEFAULT_DC_RECEIVE_METHOD : undefined as any, // B: undefined=Aにリンク
    spouse: { enabled: false, currentAge: 28, retirementAge: 65, incomeKF: [], expenseKF: [], dcTotalKF: [], companyDCKF: [], idecoKF: [], salaryGrowthRate: 2, sirPct: 15.75, hasFurusato: true, pensionStartAge: 65, pensionWorkStartAge: 22 },
    nisa: { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800, returnRate: 5 },
    balancePolicy: { cashReserveMonths: 6, nisaPriority: true },
  };
}

const SCENARIO_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

function ScenarioBar({ scenarios, onUpdate, onAdd, onDup, onRemove }: {
  scenarios: Scenario[]; onUpdate: (i: number, s: Scenario) => void;
  onAdd: () => void; onDup: (i: number) => void; onRemove: (i: number) => void;
}) {
  const [sticky, setSticky] = useState(false);
  return (
    <div className={`${sticky ? "sticky top-0 z-30 bg-white/95 backdrop-blur-sm shadow-sm py-1 -mx-3 px-3" : ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {scenarios.map((s, i) => (
          <div key={s.id ?? i} className="flex items-center gap-1 rounded-lg border-2 px-2 py-1" style={{ borderColor: SCENARIO_COLORS[i] }}>
            <input value={s.name} onChange={(e) => onUpdate(i, { ...s, name: e.target.value })}
              className="w-24 border-b border-transparent bg-transparent text-xs font-bold outline-none hover:border-gray-300 focus:border-blue-500"
              style={{ color: SCENARIO_COLORS[i] }} />
            {scenarios.length < 4 && <button onClick={() => onDup(i)} className="text-[10px] text-gray-400 hover:text-blue-500">複製</button>}
            {scenarios.length > 1 && <button onClick={() => onRemove(i)} className="text-[10px] text-gray-400 hover:text-red-500">×</button>}
          </div>
        ))}
        {scenarios.length < 4 && <button onClick={onAdd} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">+ シナリオ</button>}
        <button onClick={() => setSticky(v => !v)}
          className={`rounded px-2 py-1 text-[10px] ${sticky ? "bg-amber-100 text-amber-700" : "text-gray-400 hover:bg-gray-100"}`}>
          {sticky ? "📌 固定中" : "📌 固定"}
        </button>
      </div>
    </div>
  );
}

function PanelContainer({ children }: { children: (width: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="hidden 2xl:block min-w-[1000px] flex-1 shrink-0 ml-3 sticky top-3 max-h-[calc(100vh-24px)] rounded-lg border bg-white shadow-lg overflow-auto">
      {children(w)}
    </div>
  );
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
  const [hoveredGraph, setHoveredGraph] = useState<{ label: string; fn: GraphFn } | null>(null);
  const [pinnedGraphs, setPinnedGraphs] = useState<{ label: string; fn: GraphFn }[]>([]);
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
    skipPushRef.current = true; // 初回ロードでpushしない
    decodeStateFromURL(hash).then(data => {
      if (!data) return;
      setRR(data.rr); setHasRet(data.hasRet); setRetAmt(data.retAmt);
      setPY(data.PY); setSirPct(data.sirPct); setInflationRate(data.inflationRate);
      if (data.scenarios.length) setScenarios(data.scenarios);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentState: SavedState = useMemo(() => ({
    rr, hasRet, retAmt, PY, sirPct, inflationRate, scenarios,
  }), [rr, hasRet, retAmt, PY, sirPct, inflationRate, scenarios]);

  useEffect(() => { saveToStorage(currentState); }, [currentState]);

  // URL履歴管理:
  // 変更開始時にpushState(変更前)で戻り先を確保 → 以降はreplaceStateで現在を更新
  // Back → pushされた変更前のエントリに戻る
  const [urlLength, setUrlLength] = useState(0);
  const committedHashRef = useRef<string>(window.location.hash.slice(1));
  const dirtyRef = useRef(false); // 変更中フラグ（pushState済みか）
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipPushRef = useRef(true);

  useEffect(() => {
    const shouldPush = !skipPushRef.current;
    skipPushRef.current = false;
    encodeStateToURL(currentState).then(hash => {
      if (!shouldPush) {
        // 初回/popstate: replaceのみ、履歴追加しない
        window.history.replaceState(null, "", `#${hash}`);
        setUrlLength(window.location.href.length);
        committedHashRef.current = hash;
        dirtyRef.current = false;
        return;
      }
      if (hash === committedHashRef.current) return; // 変化なし
      // 変更開始: まだpushしていなければ、変更前の状態をpushして戻り先を確保
      if (!dirtyRef.current) {
        window.history.pushState(null, "", `#${committedHashRef.current}`);
        dirtyRef.current = true;
      }
      // 現在のエントリ（=push直後に移動した先）をreplaceで最新に
      window.history.replaceState(null, "", `#${hash}`);
      setUrlLength(window.location.href.length);
      // 400ms操作が落ち着いたら確定（次の変更でまたpushできるように）
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        committedHashRef.current = hash;
        dirtyRef.current = false;
      }, 400);
    });
  }, [currentState]);

  // Back/Forward（popstate）で状態復元
  useEffect(() => {
    const onPopState = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      skipPushRef.current = true;
      committedHashRef.current = hash;
      decodeStateFromURL(hash).then(data => {
        if (!data) return;
        setRR(data.rr); setHasRet(data.hasRet); setRetAmt(data.retAmt);
        setPY(data.PY); setSirPct(data.sirPct); setInflationRate(data.inflationRate);
        if (data.scenarios.length) setScenarios(data.scenarios);
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
      if (!src) return p;
      // リンク付き複製: ベースシナリオ(i=0)からの複製はリンク、それ以外はsrcのリンク設定を引き継ぎ
      const isFromBase = i === 0;
      const dup: Scenario = {
        ...mkScenario(p.length),
        id: Date.now(),
        name: `${src.name} コピー`,
        linkedToBase: isFromBase ? true : src.linkedToBase,
        overrideTracks: isFromBase ? [...DEFAULT_OVERRIDE_TRACKS] : [...(src.overrideTracks || [])],
        overrideSettings: src.overrideSettings ? [...src.overrideSettings] : undefined,
        spouseOverrideTracks: src.spouseOverrideTracks ? [...src.spouseOverrideTracks] : undefined,
        // リンク時: イベント・住居は空（ベースから継承）。非リンク時: コピー
        events: isFromBase ? [] : [...(src.events || []).map(e => ({ ...e, id: Date.now() + Math.round(Math.random() * 100000) }))],
        excludedBaseEventIds: isFromBase ? [] : [...(src.excludedBaseEventIds || [])],
        disabledBaseEventIds: src.disabledBaseEventIds ? [...src.disabledBaseEventIds] : undefined,
        housingTimeline: isFromBase ? undefined : src.housingTimeline ? [...src.housingTimeline] : undefined,
        // 非リンク設定をコピー
        ...(isFromBase ? {} : {
          currentAge: src.currentAge, retirementAge: src.retirementAge, simEndAge: src.simEndAge,
          currentAssetsMan: src.currentAssetsMan, selfGender: src.selfGender,
          salaryGrowthRate: src.salaryGrowthRate, years: src.years,
          hasFurusato: src.hasFurusato, dependentDeductionHolder: src.dependentDeductionHolder,
          pensionStartAge: src.pensionStartAge, pensionWorkStartAge: src.pensionWorkStartAge,
          incomeKF: [...src.incomeKF], expenseKF: [...src.expenseKF],
          dcTotalKF: [...src.dcTotalKF], companyDCKF: [...src.companyDCKF], idecoKF: [...src.idecoKF],
          dcReceiveMethod: src.dcReceiveMethod, siParams: src.siParams,
          spouse: src.spouse ? { ...src.spouse } : undefined,
          nisa: src.nisa ? { ...src.nisa } : undefined,
          balancePolicy: src.balancePolicy ? { ...src.balancePolicy } : undefined,
          dcReturnRate: src.dcReturnRate, nisaReturnRate: src.nisaReturnRate,
          taxableReturnRate: src.taxableReturnRate, cashInterestRate: src.cashInterestRate,
        }),
      };
      return [...p.slice(0, i + 1), dup, ...p.slice(i + 1)];
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

  const scenarioGridClass = scenarios.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

  return (
    <div className="flex p-3 text-gray-900">
      <div className="flex flex-col gap-3 max-w-6xl w-full shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">FP計算</h1>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] tabular-nums ${urlLength > 4096 ? "text-red-600 font-bold" : urlLength > 3072 ? "text-amber-600" : "text-gray-400"}`}>
              URL {urlLength.toLocaleString()}/4,096 ({Math.round(urlLength / 4096 * 100)}%){urlLength > 4096 ? " ⚠️超過" : ""}
            </span>
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
            <Slider label="運用利回り" value={rr} onChange={setRR} min={0} max={10} step={0.5} unit="%" help="DC/NISA/特定口座の年間期待リターン。控えめ3-4%、標準5%、積極7%+" />
            <Slider label="インフレ率" value={inflationRate} onChange={setInflationRate} min={0} max={5} step={0.25} unit="%" help="生活費・イベント費に年次適用" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Tog label="会社退職金あり" checked={hasRet} onChange={setHasRet} />
            {hasRet && <NumIn label="" value={retAmt} onChange={setRetAmt} step={1000000} unit="円" small />}
          </div>
        </details>

        {/* Scenario headers — sticky toggle */}
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
                sirPct={sirPct}
                onChangeBase={i > 0 ? (ns) => updS(0, ns) : undefined} />
            ))}
          </div>
        </details>

        {/* Timeline chart */}
        <details className="rounded-lg border bg-white" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-gray-700">タイムライン</summary>
          <div className="px-3 pb-3">
            <TimelineChart results={res} currentAge={currentAge} retirementAge={simEndAge} onYearClick={(age) => setModalAge(age)} hoverAge={panelAge} onHoverAge={handleHoverAge}
              onHousingClick={(phaseIdx) => {
                // Open housing section and scroll to it
                updS(0, { ...scenarios[0], sectionOpen: { ...scenarios[0].sectionOpen, housing: true }, _housingEditIdx: phaseIdx } as any);
                setTimeout(() => document.getElementById("housing-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
              }} />
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
          {(w) => <TaxDetailPanel age={panelAge} results={res} base={base} sirPct={sirPct} containerWidth={w} onHoverGraph={setHoveredGraph}
            onPinGraph={g => setPinnedGraphs(prev => prev.some(p => p.label === g.label) ? prev.filter(p => p.label !== g.label) : [...prev, g])} />}
        </PanelContainer>
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
