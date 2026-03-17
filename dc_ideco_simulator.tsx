import React, { useState, useMemo, useCallback } from "react";

const BRACKETS = [
  { lo: 0, hi: 1950000, r: 5 },
  { lo: 1950000, hi: 3300000, r: 10 },
  { lo: 3300000, hi: 6950000, r: 20 },
  { lo: 6950000, hi: 9000000, r: 23 },
  { lo: 9000000, hi: 18000000, r: 33 },
  { lo: 18000000, hi: 40000000, r: 40 },
  { lo: 40000000, hi: 9e15, r: 45 },
];

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "-";
  const r = Math.round(n);
  return (r < 0 ? "▲" : "") + Math.abs(r).toLocaleString("ja-JP");
}

function fmtMan(n) {
  return Math.round(n / 10000).toLocaleString("ja-JP") + "万";
}

function empDed(g) {
  if (g <= 1625000) return 550000;
  if (g <= 1800000) return g * 0.4 - 100000;
  if (g <= 3600000) return g * 0.3 + 80000;
  if (g <= 6600000) return g * 0.2 + 440000;
  if (g <= 8500000) return g * 0.1 + 1100000;
  return 1950000;
}

function iTx(ti) {
  if (ti <= 0) return 0;
  let t = 0;
  for (const b of BRACKETS) {
    if (ti <= b.lo) break;
    t += ((Math.min(ti, b.hi) - b.lo) * b.r) / 100;
  }
  return Math.floor(t);
}

function mR(ti) {
  for (const b of BRACKETS) {
    if (ti <= b.hi) return b.r;
  }
  return 45;
}

function rTx(ti) {
  return Math.floor(Math.max(ti, 0) * 0.1);
}

function txInc(g) {
  return Math.max(g - empDed(g) - g * 0.15 - 480000, 0);
}

function fLm(ti, mr) {
  const d = 0.9 - (mr / 100) * 1.021;
  return d > 0 ? Math.floor((Math.max(ti, 0) * 0.1 * 0.2) / d + 2000) : 0;
}

function fvA(a, r, n) {
  return r === 0 ? a * n : a * ((Math.pow(1 + r, n) - 1) / r);
}

function rDed(y) {
  return y <= 20 ? Math.max(400000 * y, 800000) : 8000000 + 700000 * (y - 20);
}

function rTxC(amt, ded) {
  const h = Math.max(Math.floor((amt - ded) / 2), 0);
  return iTx(h) + Math.floor(h * 0.1);
}

function mkScenario(id) {
  return {
    id,
    name: id === 0 ? "シナリオA" : "シナリオB",
    dcTotal: id === 0 ? 55000 : 35000,
    idecoMonthly: id === 0 ? 0 : 20000,
    companyDC: 1000,
    idecoFee: id === 0 ? 0 : 171,
    years: id === 0 ? 35 : 38,
    hasFurusato: true,
    furusatoRatio: 95,
  };
}

function runSelfChecks() {
  const checks = [
    { name: "income tax zero floor", ok: iTx(0) === 0 },
    { name: "resident tax zero floor", ok: rTx(-1) === 0 },
    { name: "retirement deduction minimum", ok: rDed(1) === 800000 },
    { name: "retirement deduction over 20 years", ok: rDed(25) === 11500000 },
    { name: "future value zero rate", ok: fvA(10000, 0, 3) === 30000 },
    { name: "scenario defaults A", ok: mkScenario(0).dcTotal === 55000 && mkScenario(0).years === 35 },
    { name: "scenario defaults B", ok: mkScenario(1).idecoMonthly === 20000 && mkScenario(1).years === 38 },
    { name: "retirement tax zero when below deduction", ok: rTxC(5000000, 8000000) === 0 },
    { name: "furusato limit non negative", ok: fLm(0, 5) >= 0 },
  ];
  if (typeof window !== "undefined") {
    const failed = checks.filter((c) => !c.ok);
    if (failed.length > 0) console.error("Self checks failed:", failed);
  }
}
runSelfChecks();

function Slider({ label, value, onChange, min, max, step, unit, help }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between gap-2 text-xs">
        <span className="font-semibold">
          {label}
          {help && <span className="ml-1 cursor-help text-gray-400" title={help}>ⓘ</span>}
        </span>
        <span className="font-mono">{typeof value === "number" ? value.toLocaleString() : value}{unit || ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full accent-blue-600" />
    </div>
  );
}

function NumIn({ label, value, onChange, step, min, max, unit, help, small }) {
  return (
    <div>
      <label className="mb-0.5 block text-xs font-semibold">
        {label}
        {help && <span className="ml-1 cursor-help text-gray-400" title={help}>ⓘ</span>}
      </label>
      <div className="flex items-center gap-1">
        <input type="number" step={step || 1} min={min || 0} max={max} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`rounded border px-2 py-1 text-sm ${small ? "w-20" : "w-32"}`} />
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
    </div>
  );
}

function Tog({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-blue-600" />
      <span>{label}</span>
    </label>
  );
}

function Chart({ markers }) {
  const vals = markers.map((m) => m.val).filter((v) => v > 0);
  if (!vals.length) return null;
  const mx = Math.max(...vals) * 1.15;
  const cW = 580, cH = 130, pL = 44, pR = 16, pT = 10, pB = 28;
  const w = cW - pL - pR, h = cH - pT - pB;
  const xp = (v) => pL + Math.min(v / mx, 1) * w;
  const ticks = [0, 1950000, 3300000, 6950000, 9000000].filter((v) => v < mx);
  return (
    <div>
      <svg viewBox={`0 0 ${cW} ${cH}`} className="block w-full">
        {BRACKETS.filter((b) => b.lo < mx).map((b) => {
          const x1 = xp(b.lo), x2 = xp(Math.min(b.hi, mx)), bh = (b.r / 50) * h;
          return (
            <g key={b.lo}>
              <rect x={x1} y={pT + h - bh} width={x2 - x1} height={bh} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.5} />
              <text x={(x1 + x2) / 2} y={pT + h - bh - 3} textAnchor="middle" fontSize={9} fill="#64748b" fontWeight="600">{b.r}%</text>
            </g>
          );
        })}
        <line x1={pL} y1={pT + h} x2={pL + w} y2={pT + h} stroke="#334155" strokeWidth={1} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={xp(v)} y1={pT + h} x2={xp(v)} y2={pT + h + 3} stroke="#94a3b8" />
            <text x={xp(v)} y={pT + h + 13} textAnchor="middle" fontSize={7} fill="#94a3b8">{fmtMan(v)}</text>
          </g>
        ))}
        {markers.map((m) => (
          <g key={m.id}>
            <line x1={xp(m.val)} y1={pT} x2={xp(m.val)} y2={pT + h} stroke={m.color} strokeWidth={m.thick || 1.5} strokeDasharray={m.dash || ""} opacity={m.opacity || 1} />
            <circle cx={xp(m.val)} cy={pT + h} r={2.5} fill={m.color} opacity={m.opacity || 1} />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {markers.map((m) => (
          <div key={m.id} className="flex items-center gap-1">
            <svg width="16" height="6">
              <line x1="0" y1="3" x2="16" y2="3" stroke={m.color} strokeWidth={m.thick || 1.5} strokeDasharray={m.dash || ""} opacity={m.opacity || 1} />
            </svg>
            <span style={{ color: m.color, fontWeight: 600 }}>{m.label}</span>
            <span className="text-gray-400">¥{fmt(m.val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioCard({ s, onChange, onRemove, onDuplicate, idx, canRemove, canDuplicate }) {
  const u = (k, v) => onChange({ ...s, [k]: v });
  const retY = s.years;
  return (
    <div className="min-w-0 space-y-3 rounded-lg border-2 p-3" style={{ borderColor: COLORS[idx] }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <input value={s.name} onChange={(e) => u("name", e.target.value)}
          className="min-w-0 flex-1 border-b border-transparent bg-transparent pr-2 text-sm font-bold outline-none hover:border-gray-300 focus:border-blue-500"
          style={{ color: COLORS[idx] }} />
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 self-end sm:self-auto">
          {canDuplicate && (
            <button onClick={onDuplicate} className="rounded border px-2 py-1 text-[11px] leading-none text-gray-500 hover:border-blue-300 hover:text-blue-600" title="このシナリオを複製">複製</button>
          )}
          {canRemove && (
            <button onClick={onRemove} className="rounded border px-2 py-1 text-[11px] leading-none text-gray-400 hover:border-red-300 hover:text-red-500" title="このシナリオを削除">削除</button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <NumIn label="DC合計" value={s.dcTotal} onChange={(v) => u("dcTotal", v)} step={1000} unit="円/月" small />
        <NumIn label="会社拠出" value={s.companyDC} onChange={(v) => u("companyDC", v)} step={1000} unit="円/月" small />
        <NumIn label="iDeCo" value={s.idecoMonthly} onChange={(v) => u("idecoMonthly", v)} step={1000} unit="円/月" small />
        <NumIn label="iDeCo手数料" value={s.idecoFee} onChange={(v) => u("idecoFee", v)} step={1} unit="円/月" small />
      </div>
      <div className="border-t pt-2">
        <p className="mb-1 text-xs font-semibold">退職所得控除の加入年数</p>
        <div className="grid grid-cols-1 gap-2">
          <NumIn label="通算期間" value={s.years} onChange={(v) => u("years", v)} unit="年" small help="重複を省いた加入期間" />
        </div>
        <div className="mt-1 text-xs text-gray-500">
          通算年数は重複を省いた加入期間。 通算: <b>{retY}年</b> → 控除: <b>¥{fmt(rDed(retY))}</b>
        </div>
      </div>
      <div className="border-t pt-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold">ふるさと納税</p>
          <Tog label="利用する" checked={s.hasFurusato} onChange={(v) => u("hasFurusato", v)} />
        </div>
        {s.hasFurusato && (
          <Slider label="利用率" value={s.furusatoRatio} onChange={(v) => u("furusatoRatio", v)} min={0} max={100} step={5} unit="%" />
        )}
      </div>
    </div>
  );
}

function Row({ l, vs, neg, bold, bg, sub, help, formula }) {
  return (
    <tr className={`${bold ? "font-bold " : ""}${bg || ""}`}>
      <td className={`break-words border border-gray-300 px-1.5 py-1 align-top text-[11px] leading-tight xl:text-xs ${sub ? "pl-3 text-gray-500" : ""}`}>
        {l}
        {help && <span className="ml-1 cursor-help text-gray-400" title={help}>ⓘ</span>}
        {formula && <div className="mt-0.5 text-[10px] font-normal leading-tight text-gray-400 xl:text-[11px]">{formula}</div>}
      </td>
      {vs.map((v, i) => (
        <td key={i} className={`border border-gray-300 px-1.5 py-1 text-right align-top text-[11px] leading-tight tabular-nums xl:text-xs ${neg && typeof v === "number" && v > 0 ? "text-red-600" : ""}`}>
          {typeof v === "string" ? v : `¥${fmt(v)}`}
        </td>
      ))}
    </tr>
  );
}

function Sec({ children, c, colSpan }) {
  return (
    <tr className={`${c || "bg-gray-100"} font-semibold`}>
      <td colSpan={colSpan} className="border border-gray-300 px-2 py-1 text-xs">{children}</td>
    </tr>
  );
}

export default function App() {
  const [gross, setGross] = useState(7000000);
  const [rr, setRR] = useState(4);
  const [hasRet, setHasRet] = useState(false);
  const [retAmt, setRetAmt] = useState(0);
  const [PY, setPY] = useState(20);
  const [sirPct, setSirPct] = useState(15.75);
  const [scenarios, setScenarios] = useState([mkScenario(0), mkScenario(1)]);
  const [detail, setDetail] = useState(false);

  const updS = useCallback((i, s) => {
    setScenarios((p) => p.map((x, j) => (j === i ? s : x)));
  }, []);
  const rmS = useCallback((i) => {
    setScenarios((p) => p.filter((_, j) => j !== i));
  }, []);
  const addS = useCallback(() => {
    setScenarios((p) => {
      if (p.length >= 4) return p;
      return [...p, { ...mkScenario(p.length), id: Date.now() + p.length, name: `シナリオ${"ABCD"[p.length]}` }];
    });
  }, []);
  const dupS = useCallback((i) => {
    setScenarios((p) => {
      if (p.length >= 4) return p;
      const src = p[i];
      if (!src) return p;
      const nextIndex = p.length;
      const copy = { ...src, id: Date.now() + nextIndex, name: `${src.name} コピー` };
      return [...p.slice(0, i + 1), copy, ...p.slice(i + 1)];
    });
  }, []);

  const { base, res } = useMemo(() => {
    const r = rr / 100;
    const sir = sirPct / 100;
    const otherRet = hasRet ? retAmt : 0;
    const bTI = txInc(gross);
    const bMR = mR(bTI);
    const bFL = fLm(bTI, bMR);
    const nextBase = { bTI, bMR, bFL };

    const nextRes = scenarios.map((s) => {
      const ds = Math.max(s.dcTotal - s.companyDC, 0);
      const Y = s.years;
      const aDS = ds * 12;
      const aI = s.idecoMonthly * 12;
      const aT = (s.dcTotal + s.idecoMonthly) * 12;
      const adjG = gross - aDS;
      const adjTI = Math.max(txInc(adjG) - aI, 0);
      const nMR = mR(adjTI);
      const nFL = fLm(adjTI, nMR);
      const flRed = bFL - nFL;
      const hasFuru = !!s.hasFurusato;
      const fRatio = hasFuru ? (s.furusatoRatio || 95) / 100 : 0;
      const baseFDed = hasFuru ? Math.max(Math.floor((bFL * fRatio) / 1000) * 1000 - 2000, 0) : 0;
      const nFDed = hasFuru ? Math.max(Math.floor((nFL * fRatio) / 1000) * 1000 - 2000, 0) : 0;
      const bTIaF = Math.max(bTI - baseFDed, 0);
      const adjTIaF = Math.max(adjTI - nFDed, 0);
      const furuDonNew = hasFuru ? Math.floor((nFL * fRatio) / 1000) * 1000 : 0;
      const bITwF = iTx(bTIaF);
      const bRTwF = rTx(bTIaF);
      const nITwF = iTx(adjTIaF);
      const nRTwF = rTx(adjTIaF);
      const itSv = bITwF - nITwF;
      const rtSv = bRTwF - nRTwF;
      const txSv = itSv + rtSv;
      const siSv = aDS * sir;
      const tFee = s.idecoFee * 12 * Y;
      const aPL = (ds * 5.481) / 1000 * (Y * 12);
      const lPL = aPL * PY;
      const aBen = txSv + siSv;
      const aNet = aBen - s.idecoFee * 12;
      const fvB = fvA(aNet, r, Y);
      const fvF = fvA(s.idecoFee * 12, r, Y);
      const pvPL = lPL;
      const retY = s.years;
      const dcRetDed = rDed(retY);
      const assetFV = fvA(aT, r, Y);
      const exitTax = rTxC(assetFV + otherRet, dcRetDed);
      const exitBase = rTxC(otherRet, dcRetDed);
      const exitDelta = exitTax - exitBase;
      const finalScore = fvB - fvF - pvPL - exitDelta;
      const finalAssetNet = Math.max(assetFV - exitDelta, 0);
      const totalAsset = finalAssetNet + fvB;

      return {
        ...s, ds, Y, aDS, aI, aT, totalC: aT * Y, adjG, adjTI, adjTIaF, bTIaF,
        nMR, nFL, flRed, hasFuru, furuDonNew, nFDed, itSv, rtSv, txSv, siSv,
        tFee, aPL, lPL, aBen, aNet, fvB, fvF, pvPL, retY, dcRetDed,
        assetFV, exitTax, exitDelta, finalScore, finalAssetNet, totalAsset, otherRet,
      };
    });

    return { base: nextBase, res: nextRes };
  }, [gross, rr, scenarios, hasRet, retAmt, PY, sirPct]);

  const bestIdx = res.reduce((bi, s, i, a) => (s.finalScore > a[bi].finalScore ? i : bi), 0);
  const bestTotalIdx = res.reduce((bi, s, i, a) => (s.totalAsset > a[bi].totalAsset ? i : bi), 0);
  const anyFuru = res.some((s) => s.hasFuru);
  const colSpan = res.length + 1;

  const chartM = [
    { id: "raw", val: base.bTI, label: "控除前", color: "#1e293b", dash: "6,3", thick: 1, opacity: 0.4 },
    ...res.map((s, i) => ({ id: `s${i}`, val: s.adjTIaF, label: s.name + (s.hasFuru ? " (ふるさと込)" : ""), color: COLORS[i], thick: 2 })),
  ];

  const g = (fn) => res.map(fn);

  const scenarioGridClass =
    scenarios.length === 1
      ? "grid-cols-1"
      : scenarios.length === 2
        ? "grid-cols-1 xl:grid-cols-2"
        : scenarios.length === 3
          ? "grid-cols-1 xl:grid-cols-2"
          : "grid-cols-1 xl:grid-cols-2";

  return (
    <div className="mx-auto max-w-7xl p-3 text-gray-900">
      <div className="flex flex-col gap-3">
        <div className="shrink-0">
          <h1 className="text-lg font-bold">DC・iDeCo シナリオ比較シミュレーター</h1>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)] xl:items-start">
          {/* 左カラム */}
          <div className="space-y-3 xl:min-w-0 xl:pr-1">
            <div className="rounded bg-blue-50 p-3">
              <p className="mb-2 text-xs font-bold text-blue-700">共通設定</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumIn label="年収（額面）" value={gross} onChange={setGross} step={500000} unit="円" />
                <Slider label="運用利回り" value={rr} onChange={setRR} min={0} max={10} step={0.5} unit="%" />
                <Slider label="社保料率（本人）" value={sirPct} onChange={setSirPct} min={10} max={20} step={0.25} unit="%" help="厚年+健保+介護+雇用" />
                <Slider label="年金受給期間" value={PY} onChange={setPY} min={10} max={30} step={1} unit="年" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <Tog label="会社退職金あり" checked={hasRet} onChange={setHasRet} />
                {hasRet && <NumIn label="" value={retAmt} onChange={setRetAmt} step={1000000} unit="円" small />}
              </div>
              <div className="mt-3 text-xs text-gray-600">
                課税所得: <b>¥{fmt(base.bTI)}</b> ／ 最高税率: <b>{base.bMR}%</b> ／ ふるさと上限: <b>¥{fmt(base.bFL)}</b>
              </div>
            </div>

            <div className="rounded border bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-bold">課税所得の位置</p>
              </div>
              <Chart markers={chartM} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-bold">シナリオ設定</p>
                {scenarios.length < 4 && (
                  <button onClick={addS} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">+ 追加</button>
                )}
              </div>
              <div className={`grid auto-rows-fr gap-3 items-start ${scenarioGridClass}`}>
                {scenarios.map((s, i) => (
                  <ScenarioCard key={s.id ?? i} s={s} idx={i}
                    onChange={(ns) => updS(i, ns)} onRemove={() => rmS(i)} onDuplicate={() => dupS(i)}
                    canRemove={scenarios.length > 1} canDuplicate={scenarios.length < 4} />
                ))}
              </div>
            </div>
          </div>

          {/* 右カラム */}
          <div className="space-y-3 xl:min-w-0 xl:pl-1">
            {/* サマリーカード */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {res.map((s, i) => {
                const isBest = i === bestIdx;
                return (
                  <div key={i} className={`min-w-0 rounded border-2 p-3 ${isBest ? "ring-2 ring-blue-600 bg-blue-50" : "bg-gray-50"}`} style={{ borderColor: COLORS[i] }}>
                    <div className="mb-1 text-sm font-bold" style={{ color: COLORS[i] }}>{s.name} {isBest && "⭐"}</div>
                    <div className="space-y-0.5 text-xs">
                      {/* 総資産（追加） */}
                      <div className="rounded bg-white px-2 py-1 font-bold" style={{ borderLeft: `3px solid ${COLORS[i]}` }}>
                        総資産（DC＋再投資）: ¥{fmt(Math.round(s.totalAsset))}
                        {i === bestTotalIdx && " 🏆"}
                      </div>
                      <div className="pt-0.5">DC資産（出口課税後）: <b>¥{fmt(Math.round(s.finalAssetNet))}</b></div>
                      <div>入口メリット(年): <b>¥{fmt(s.aBen)}</b></div>
                      <div>再投資将来価値: <b>¥{fmt(Math.round(s.fvB))}</b></div>
                      <div>厚生年金生涯損失: <span className="text-red-600">¥{fmt(Math.round(s.pvPL))}</span></div>
                      <div>出口課税: <span className="text-red-600">¥{fmt(s.exitDelta)}</span></div>
                      <div className="border-t pt-1 font-bold">最終評価: ¥{fmt(Math.round(s.finalScore))}</div>
                      <div className="text-gray-400">
                        {s.hasFuru ? `ふるさと上限: ¥${fmt(s.nFL)}/年（寄付: ¥${fmt(s.furuDonNew)}）` : "ふるさと納税なし"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 結果表 */}
            <div className="rounded border bg-white">
              <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                <p className="text-sm font-bold">結果表</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-600">表示:</span>
                  <button onClick={() => setDetail(false)} className={`rounded px-3 py-1 text-xs ${!detail ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>簡易</button>
                  <button onClick={() => setDetail(true)} className={`rounded px-3 py-1 text-xs ${detail ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>詳細</button>
                </div>
              </div>
              <table className="w-full table-fixed border-collapse border border-gray-400 text-[11px] leading-tight xl:text-xs">
                <thead className="sticky top-0 z-10 bg-gray-200">
                  <tr>
                    <th className="w-[50%] border border-gray-300 px-1.5 py-1 text-left md:w-[48%]">項目</th>
                    {res.map((s, i) => (
                      <th key={i} className="w-[25%] border border-gray-300 px-1.5 py-1 text-center md:w-[24%]" style={{ color: COLORS[i] }}>{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <Sec c="bg-gray-100" colSpan={colSpan}>■ 拠出（月額）</Sec>
                  {detail && <Row l="DC（会社+本人）" vs={g((s) => s.dcTotal)} formula="会社負担+本人給与減額分" />}
                  {detail && <Row l="本人負担" vs={g((s) => s.ds)} sub formula="DC合計−会社負担" />}
                  {detail && <Row l="iDeCo" vs={g((s) => s.idecoMonthly)} />}
                  <Row l="月額合計（DC+iDeCo）" vs={g((s) => s.dcTotal + s.idecoMonthly)} bold />
                  <Row l={`総拠出額（${res[0]?.Y ?? 0}年）`} vs={g((s) => s.totalC)} bold bg="bg-gray-50" formula="月額合計×12×年数" />

                  {detail && <Sec c="bg-gray-100" colSpan={colSpan}>■ 年収影響・維持コスト</Sec>}
                  {detail && <Row l="年間額面減少" vs={g((s) => s.aDS)} neg formula="DC本人負担×12" />}
                  {detail && <Row l="iDeCo手数料" vs={g((s) => (s.idecoFee > 0 ? `${s.idecoFee}円/月` : "なし"))} />}
                  {detail && <Row l={`維持コスト合計（iDeCo手数料×${res[0]?.Y ?? 0}年）`} vs={g((s) => s.tFee)} bold formula="iDeCo手数料×12×年数" />}

                  <Sec c="bg-green-50" colSpan={colSpan}>■ 入口メリット（年額）</Sec>
                  {detail && <Row l="所得税 節税" vs={g((s) => s.itSv)} formula="控除前税額−控除後税額（累進差分）" />}
                  {detail && <Row l="住民税 節税" vs={g((s) => s.rtSv)} formula="同上（税率10%）" />}
                  {detail && <Row l="社保 節約" vs={g((s) => s.siSv)} help="DC本人負担分のみ" formula={`DC本人負担×12×${sirPct}%`} />}
                  {detail && <Row l="年間メリット合計" vs={g((s) => s.aBen)} bold formula="所得税+住民税+社保" />}
                  <Row l="手数料差引後メリット（年額）" vs={g((s) => s.aNet)} bold bg="bg-green-100" formula="年間メリット合計−iDeCo手数料×12" help="再投資に回せる年額" />

                  {anyFuru && (
                    <>
                      <Sec c="bg-amber-50" colSpan={colSpan}>■ ふるさと納税</Sec>
                      {detail && <Row l="控除前の上限" vs={g(() => base.bFL)} />}
                      {detail && <Row l="控除後の上限" vs={g((s) => s.nFL)} />}
                      {detail && <Row l="上限の減少" vs={g((s) => s.flRed)} neg />}
                      <Row l="寄付額（利用率適用）" vs={g((s) => (s.hasFuru ? s.furuDonNew : "-"))} formula="上限×利用率（1000円切捨）" />
                      {detail && <Row l="所得控除額" vs={g((s) => (s.hasFuru ? s.nFDed : 0))} formula="寄付額−2,000円" />}
                    </>
                  )}

                  <Sec c="bg-red-50" colSpan={colSpan}>{`■ 厚生年金減少（${PY}年受給）`}</Sec>
                  {detail && <Row l="厚生年金減少（年額）" vs={g((s) => s.aPL)} neg formula={`DC本人負担×5.481‰×${(res[0]?.Y ?? 0) * 12}月`} help="等級制のため上限値" />}
                  <Row l={`厚生年金生涯損失（名目${PY}年）`} vs={g((s) => s.lPL)} neg bold formula={`年額×${PY}年`} />

                  <Sec c="bg-red-50" colSpan={colSpan}>{`■ 出口課税（${rr}%運用後）`}</Sec>
                  {detail && <Row l="資産額（運用後）" vs={g((s) => Math.round(s.assetFV))} bold formula={`月額拠出×12を${rr}%で${res[0]?.Y ?? 0}年複利`} help="受取時の金額" />}
                  {detail && <Row l="退職所得控除" vs={g((s) => s.dcRetDed)} formula="通算期間ベース。20年以下:40万×年, 超:800万+70万×(年−20)" />}
                  {detail && <Row l="退職所得（控除後×1/2）" vs={g((s) => Math.max(Math.floor((s.assetFV + s.otherRet - s.dcRetDed) / 2), 0))} formula="(DC/iDeCo資産+退職金−控除)×1/2" help="分離課税" />}
                  <Row l="追加税負担" vs={g((s) => s.exitDelta)} neg bold bg="bg-red-100" formula="退職所得に累進課税（分離）" />

                  {/* 総資産セクション（追加） */}
                  <Sec c="bg-teal-100" colSpan={colSpan}>■ 総資産（DC資産＋再投資将来価値）</Sec>
                  <Row l="DC資産（出口課税後）" vs={g((s) => Math.round(s.finalAssetNet))} bold bg="bg-blue-50" formula="資産額−追加税負担" />
                  <Row l="再投資将来価値" vs={g((s) => Math.round(s.fvB))} bold bg="bg-green-50" formula={`手数料差引後メリットを毎年${rr}%で複利運用`} help="節税+社保をNISA等で再投資" />
                  <Row l="総資産合計" vs={g((s) => Math.round(s.totalAsset))} bold bg="bg-teal-50" formula="DC資産（出口課税後）＋再投資将来価値" />

                  <Sec c="bg-indigo-100" colSpan={colSpan}>{`■ 最終評価（${rr}%運用込み）`}</Sec>
                  <Row l="A. メリット再投資の将来価値" vs={g((s) => Math.round(s.fvB))} bold bg="bg-green-100" formula={`手数料差引後を毎年${rr}%で${res[0]?.Y ?? 0}年複利`} help="節税+社保をNISA等で再投資" />
                  <Row l="B. 手数料の機会損失" vs={g((s) => Math.round(s.fvF))} neg formula={`iDeCo手数料を代わりに投資した場合の${res[0]?.Y ?? 0}年後`} />
                  <Row l={`C. 厚生年金生涯損失（名目${PY}年）`} vs={g((s) => Math.round(s.pvPL))} neg formula={`年額×${PY}年（割引なし名目値）`} help="将来の年金減少の名目合計" />
                  <Row l="D. 出口課税" vs={g((s) => s.exitDelta)} neg />
                  <Row l="最終評価 (A−B−C−D)" vs={g((s) => Math.round(s.finalScore))} bold bg="bg-yellow-200" />
                </tbody>
              </table>
            </div>

            <div className="space-y-0.5 text-xs text-gray-400">
              <p>※ 節税額はシナリオごとのふるさと納税込みベースとの差分を累進で計算。社保は概算。厚生年金減少は等級制のため上限値。</p>
              <p>※ 出口課税は分離課税（退職所得）。課税所得は給与所得控除+社保+基礎控除48万のみ。運用益非課税は全シナリオ共通。</p>
              <p>※ 総資産＝DC/iDeCo資産（出口課税後）＋節税・社保メリット再投資の将来価値。厚生年金損失は含まれないため参考値として確認してください。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
