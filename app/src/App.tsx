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
function fmtMan(n) { return Math.round(n / 10000).toLocaleString("ja-JP") + "万"; }

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
  for (const b of BRACKETS) { if (ti <= b.hi) return b.r; }
  return 45;
}
function rTx(ti) { return Math.floor(Math.max(ti, 0) * 0.1); }
function txInc(g, opts?) {
  const o = opts || {};
  const depDed = Math.max(Number(o.dependentsCount) || 0, 0) * 380000;
  const spouseDed = o.hasSpouseDeduction ? 380000 : 0;
  const lifeDed = Math.max(Number(o.lifeInsuranceDeduction) || 0, 0);
  return Math.max(g - empDed(g) - g * 0.15 - 480000 - depDed - spouseDed - lifeDed, 0);
}
function hlResidentCap(ti) { return Math.min(Math.floor(Math.max(ti, 0) * 0.05), 97500); }
function apTxCr(it, rt, cr, ti) {
  const credit = Math.max(Number(cr) || 0, 0);
  const residentCap = hlResidentCap(ti);
  const itUsed = Math.min(Math.max(it, 0), credit);
  const rest = Math.max(credit - itUsed, 0);
  const rtUsed = Math.min(Math.max(rt, 0), rest, residentCap);
  return { it: Math.max(it - itUsed, 0), rt: Math.max(rt - rtUsed, 0), used: itUsed + rtUsed, itUsed, rtUsed, residentCap };
}
function fLm(ti, mr) {
  const d = 0.9 - (mr / 100) * 1.021;
  return d > 0 ? Math.floor((Math.max(ti, 0) * 0.1 * 0.2) / d + 2000) : 0;
}
function calcFurusatoDonation(limit) { return Math.max(Math.floor(Math.max(limit, 0) / 1000) * 1000, 0); }
function fvA(a, r, n) { return r === 0 ? a * n : a * ((Math.pow(1 + r, n) - 1) / r); }
function rDed(y) { return y <= 20 ? Math.max(400000 * y, 800000) : 8000000 + 700000 * (y - 20); }
function rTxC(amt, ded) {
  const h = Math.max(Math.floor((amt - ded) / 2), 0);
  return iTx(h) + Math.floor(h * 0.1);
}

function mkScenario(id, currentAge = 30, retirementAge = 65) {
  return {
    id,
    name: id === 0 ? "シナリオA" : "シナリオB",
    phases: [{
      untilAge: retirementAge,
      dcTotal: id === 0 ? 55000 : 35000,
      companyDC: 1000,
      idecoMonthly: id === 0 ? 0 : 20000,
      idecoFee: id === 0 ? 0 : 171,
    }],
    years: retirementAge - currentAge,
    hasFurusato: true,
  };
}

function Slider({ label, value, onChange, min, max, step, unit, help }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between gap-2 text-xs">
        <span className="font-semibold">{label}{help && <span className="ml-1 cursor-help text-gray-400" title={help}>ⓘ</span>}</span>
        <span className="font-mono">{typeof value === "number" ? value.toLocaleString() : value}{unit || ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full accent-blue-600" />
    </div>
  );
}
function NumIn({ label, value, onChange, step, min, max, unit, help, small }) {
  return (
    <div>
      <label className="mb-0.5 block text-xs font-semibold">{label}{help && <span className="ml-1 cursor-help text-gray-400" title={help}>ⓘ</span>}</label>
      <div className="flex items-center gap-1">
        <input type="number" step={step || 1} min={min ?? 0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`rounded border px-2 py-1 text-sm ${small ? "w-20" : "w-32"}`} />
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
            <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={m.color} strokeWidth={m.thick || 1.5} strokeDasharray={m.dash || ""} opacity={m.opacity || 1} /></svg>
            <span style={{ color: m.color, fontWeight: 600 }}>{m.label}</span>
            <span className="text-gray-400">¥{fmt(m.val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioCard({ s, onChange, onRemove, onDuplicate, idx, canRemove, canDuplicate, currentAge, retirementAge }) {
  const u = (k, v) => onChange({ ...s, [k]: v });

  const updatePhase = (pi, updated) => {
    u("phases", s.phases.map((p, j) => j === pi ? updated : p));
  };
  const removePhase = (pi) => {
    if (s.phases.length <= 1) return;
    u("phases", s.phases.filter((_, j) => j !== pi));
  };
  const addPhase = () => {
    if (s.phases.length >= 4) return;
    const last = s.phases[s.phases.length - 1];
    const prevBound = s.phases.length >= 2 ? s.phases[s.phases.length - 2].untilAge : currentAge;
    const splitAge = Math.round((prevBound + retirementAge) / 2);
    if (splitAge <= prevBound || splitAge >= retirementAge) return;
    u("phases", [...s.phases.slice(0, -1), { ...last, untilAge: splitAge }, { ...last }]);
  };

  return (
    <div className="min-w-0 space-y-3 rounded-lg border-2 p-3" style={{ borderColor: COLORS[idx] }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <input value={s.name} onChange={(e) => u("name", e.target.value)}
          className="min-w-0 flex-1 border-b border-transparent bg-transparent pr-2 text-sm font-bold outline-none hover:border-gray-300 focus:border-blue-500"
          style={{ color: COLORS[idx] }} />
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 self-end sm:self-auto">
          {canDuplicate && <button onClick={onDuplicate} className="rounded border px-2 py-1 text-[11px] leading-none text-gray-500 hover:border-blue-300 hover:text-blue-600">複製</button>}
          {canRemove && <button onClick={onRemove} className="rounded border px-2 py-1 text-[11px] leading-none text-gray-400 hover:border-red-300 hover:text-red-500">削除</button>}
        </div>
      </div>

      {/* フェーズ */}
      <div className="space-y-2">
        {s.phases.map((phase, pi) => {
          const fromAge = pi === 0 ? currentAge : s.phases[pi - 1].untilAge;
          const isLast = pi === s.phases.length - 1;
          const toAge = isLast ? retirementAge : phase.untilAge;
          const phaseYears = toAge - fromAge;
          return (
            <div key={pi} className="rounded border bg-gray-50 p-2 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700 flex items-center gap-1">
                  {fromAge}歳〜
                  {isLast
                    ? <span>{retirementAge}歳</span>
                    : <input
                        type="number"
                        value={phase.untilAge}
                        min={fromAge + 1}
                        max={retirementAge - 1}
                        step={1}
                        onChange={(e) => {
                          const v = Math.max(fromAge + 1, Math.min(retirementAge - 1, Number(e.target.value)));
                          updatePhase(pi, { ...phase, untilAge: v });
                        }}
                        className="w-12 rounded border px-1 py-0.5 text-center text-xs"
                      />
                  }
                  <span className="font-normal text-gray-400">（{phaseYears}年）</span>
                </span>
                {!isLast && (
                  <button onClick={() => removePhase(pi)} className="rounded border px-1.5 py-0.5 text-[10px] text-gray-400 hover:border-red-300 hover:text-red-500">削除</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <NumIn label="DC合計" value={phase.dcTotal} onChange={(v) => updatePhase(pi, { ...phase, dcTotal: v })} step={1000} unit="円/月" small />
                <NumIn label="会社拠出" value={phase.companyDC} onChange={(v) => updatePhase(pi, { ...phase, companyDC: v })} step={1000} unit="円/月" small />
                <NumIn label="iDeCo" value={phase.idecoMonthly} onChange={(v) => updatePhase(pi, { ...phase, idecoMonthly: v })} step={1000} unit="円/月" small />
                <NumIn label="手数料" value={phase.idecoFee} onChange={(v) => updatePhase(pi, { ...phase, idecoFee: v })} step={1} unit="円/月" small />
              </div>
            </div>
          );
        })}
        {s.phases.length < 4 && (
          <button onClick={addPhase} className="w-full rounded border border-dashed px-2 py-1.5 text-xs text-gray-400 hover:border-blue-400 hover:text-blue-500">
            + 変更を追加
          </button>
        )}
      </div>

      {/* 退職所得控除 */}
      <div className="border-t pt-2">
        <p className="mb-1 text-xs font-semibold">退職所得控除の加入年数</p>
        <NumIn label="通算期間" value={s.years} onChange={(v) => u("years", v)} unit="年" small help="重複を省いた加入期間（DC+iDeCo）" />
        <div className="mt-1 text-xs text-gray-500">
          通算: <b>{s.years}年</b> → 控除: <b>¥{fmt(rDed(s.years))}</b>
          <span className="ml-2 text-gray-400">（参考: {retirementAge - currentAge}年）</span>
        </div>
      </div>

      {/* ふるさと納税 */}
      <div className="border-t pt-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">ふるさと納税</p>
          <Tog label="利用する" checked={s.hasFurusato} onChange={(v) => u("hasFurusato", v)} />
        </div>
        {s.hasFurusato && <div className="mt-1 text-xs text-gray-500">上限いっぱいを1000円単位で切り捨てて計算</div>}
      </div>
    </div>
  );
}

function Row({ l, vs, neg, bold, bg, sub, help, formula }) {
  return (
    <tr className={`${bold ? "font-bold " : ""}${bg || ""}`}>
      <td className={`break-words border border-gray-300 px-1.5 py-1 align-top text-[11px] leading-tight xl:text-xs ${sub ? "pl-3 text-gray-500" : ""}`}>
        {l}{help && <span className="ml-1 cursor-help text-gray-400" title={help}>ⓘ</span>}
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

function TotalAssetBar({ res, bestTotalIdx }) {
  if (!res.length) return null;
  const maxVal = Math.max(...res.map((s) => s.totalAsset));
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="mb-2 text-sm font-bold text-gray-700">総資産の比較（DC資産＋再投資将来価値）</p>
      <div className="space-y-2">
        {res.map((s, i) => {
          const pct = maxVal > 0 ? (s.totalAsset / maxVal) * 100 : 0;
          return (
            <div key={i}>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="font-bold" style={{ color: COLORS[i] }}>{s.name}{i === bestTotalIdx ? " 🏆" : ""}</span>
                <span className="font-mono font-bold">¥{fmt(Math.round(s.totalAsset))}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <span>DC: ¥{fmt(Math.round(s.finalAssetNet))}</span>
                <span>＋</span>
                <span>再投資: ¥{fmt(Math.round(s.fvB))}</span>
              </div>
              <div className="mt-0.5 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: COLORS[i] }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [currentAge, setCurrentAgeRaw] = useState(30);
  const [retirementAge, setRetirementAgeRaw] = useState(65);
  const [gross, setGross] = useState(7000000);
  const [rr, setRR] = useState(4);
  const [hasRet, setHasRet] = useState(false);
  const [retAmt, setRetAmt] = useState(0);
  const [PY, setPY] = useState(20);
  const [sirPct, setSirPct] = useState(15.75);
  const [scenarios, setScenarios] = useState(() => [mkScenario(0, 30, 65), mkScenario(1, 30, 65)]);
  const [detail, setDetail] = useState(false);
  const [dependentsCount, setDependentsCount] = useState(0);
  const [hasSpouseDeduction, setHasSpouseDeduction] = useState(false);
  const [lifeInsuranceDeduction, setLifeInsuranceDeduction] = useState(0);
  const [useHousingLoanDeduction, setUseHousingLoanDeduction] = useState(false);
  const [housingLoanDeductionAmount, setHousingLoanDeductionAmount] = useState(0);

  const setCurrentAge = useCallback((newAge: number) => {
    setCurrentAgeRaw(newAge);
    setScenarios(prev => prev.map(s => {
      const filtered = s.phases.filter(p => p.untilAge > newAge);
      const phases = filtered.length ? filtered : [{ ...s.phases[s.phases.length - 1] }];
      return { ...s, phases };
    }));
  }, []);

  const setRetirementAge = useCallback((newAge: number) => {
    setRetirementAgeRaw(newAge);
    setScenarios(prev => prev.map(s => {
      const kept = s.phases.filter((p, i) => i === s.phases.length - 1 || p.untilAge < newAge);
      const phases = kept.map((p, i) => i === kept.length - 1 ? { ...p, untilAge: newAge } : p);
      return { ...s, phases };
    }));
  }, []);

  const updS = useCallback((i, s) => setScenarios((p) => p.map((x, j) => (j === i ? s : x))), []);
  const rmS = useCallback((i) => setScenarios((p) => p.filter((_, j) => j !== i)), []);
  const addS = useCallback(() => {
    setScenarios((p) => {
      if (p.length >= 4) return p;
      return [...p, { ...mkScenario(p.length, currentAge, retirementAge), id: Date.now() + p.length, name: `シナリオ${"ABCD"[p.length]}` }];
    });
  }, [currentAge, retirementAge]);
  const dupS = useCallback((i) => {
    setScenarios((p) => {
      if (p.length >= 4) return p;
      const src = p[i];
      if (!src) return p;
      const ni = p.length;
      return [...p.slice(0, i + 1), { ...src, id: Date.now() + ni, name: `${src.name} コピー` }, ...p.slice(i + 1)];
    });
  }, []);

  const totalYears = retirementAge - currentAge;

  const { base, res } = useMemo(() => {
    const r = rr / 100, sir = sirPct / 100, otherRet = hasRet ? retAmt : 0;
    const taxOpts = { dependentsCount, hasSpouseDeduction, lifeInsuranceDeduction };
    const depDed = Math.max(dependentsCount, 0) * 380000;
    const spouseDed = hasSpouseDeduction ? 380000 : 0;
    const lifeDed = Math.max(lifeInsuranceDeduction, 0);
    const housingLoanDed = useHousingLoanDeduction ? Math.max(housingLoanDeductionAmount, 0) : 0;
    const hasDepSetting = depDed > 0, hasSpouseSetting = spouseDed > 0;
    const hasLifeSetting = lifeDed > 0, hasHousingSetting = housingLoanDed > 0;
    const hasAnyTaxDetailSetting = hasDepSetting || hasSpouseSetting || hasLifeSetting || hasHousingSetting;

    const bTI = txInc(gross, taxOpts);
    const bMR = mR(bTI), bFL = fLm(bTI, bMR);
    const nextBase = { bTI, bMR, bFL, depDed, spouseDed, lifeDed, housingLoanDed, hasDepSetting, hasSpouseSetting, hasLifeSetting, hasHousingSetting, hasAnyTaxDetailSetting };

    const nextRes = scenarios.map((s) => {
      const hasFuru = !!s.hasFurusato;
      // Base tax (without DC/iDeCo) for this scenario's furusato setting
      const furuDonBase = hasFuru ? calcFurusatoDonation(bFL) : 0;
      const baseFDed = hasFuru ? Math.max(furuDonBase - 2000, 0) : 0;
      const bTIaF = Math.max(bTI - baseFDed, 0);
      const bITraw = iTx(bTIaF), bRTraw = rTx(bTIaF);
      const bTaxAdj = apTxCr(bITraw, bRTraw, housingLoanDed, bTIaF);

      // Per-phase computation
      const phaseResults: any[] = [];
      let fromAge = currentAge;

      for (const phase of s.phases) {
        const toAge = phase.untilAge;
        const n = toAge - fromAge;
        if (n <= 0) { fromAge = toAge; continue; }

        const ds = Math.max(phase.dcTotal - phase.companyDC, 0);
        const aDS = ds * 12;
        const aI = phase.idecoMonthly * 12;
        const aT = (phase.dcTotal + phase.idecoMonthly) * 12;
        const adjG = gross - aDS;
        const adjTI = Math.max(txInc(adjG, taxOpts) - aI, 0);
        const nMR = mR(adjTI);
        const nFL = fLm(adjTI, nMR);
        const furuDonNew = hasFuru ? calcFurusatoDonation(nFL) : 0;
        const nFDed = hasFuru ? Math.max(furuDonNew - 2000, 0) : 0;
        const adjTIaF = Math.max(adjTI - nFDed, 0);

        const nITraw = iTx(adjTIaF), nRTraw = rTx(adjTIaF);
        const nTaxAdj = apTxCr(nITraw, nRTraw, housingLoanDed, adjTIaF);
        const itSv = bTaxAdj.it - nTaxAdj.it;
        const rtSv = bTaxAdj.rt - nTaxAdj.rt;
        const rawTxSv = (bITraw + bRTraw) - (nITraw + nRTraw);
        const hlShrink = rawTxSv - (itSv + rtSv);
        const siSv = aDS * sir;
        const aBen = itSv + rtSv + siSv;
        const aNet = aBen - phase.idecoFee * 12;

        phaseResults.push({
          phase, fromAge, toAge, n,
          ds, aDS, aI, aT, adjTI, adjTIaF, nFL, furuDonNew, nFDed, nMR,
          itSv, rtSv, rawTxSv, hlShrink, siSv, aBen, aNet,
          nHLCrUsed: nTaxAdj.used, nHLResidentCap: nTaxAdj.residentCap,
        });
        fromAge = toAge;
      }

      // Chain FV across phases
      let assetFV = 0, fvB = 0, fvF = 0, totalLPL = 0, totalC = 0;
      for (const pr of phaseResults) {
        assetFV = assetFV * Math.pow(1 + r, pr.n) + fvA(pr.aT, r, pr.n);
        fvB = fvB * Math.pow(1 + r, pr.n) + fvA(pr.aNet, r, pr.n);
        fvF = fvF * Math.pow(1 + r, pr.n) + fvA(pr.phase.idecoFee * 12, r, pr.n);
        totalLPL += (pr.ds * 5.481) / 1000 * (pr.n * 12);
        totalC += pr.aT * pr.n;
      }

      const lPL = totalLPL * PY, pvPL = lPL;
      const Y = s.years;
      const dcRetDed = rDed(Y);
      const exitDelta = rTxC(assetFV + otherRet, dcRetDed) - rTxC(otherRet, dcRetDed);
      const finalAssetNet = Math.max(assetFV - exitDelta, 0);
      const totalAsset = finalAssetNet + fvB;
      const finalScore = fvB - fvF - pvPL - exitDelta;
      const tFee = phaseResults.reduce((sum, pr) => sum + pr.phase.idecoFee * 12 * pr.n, 0);

      // Last phase as representative annual display values
      const lp = phaseResults[phaseResults.length - 1] || {};
      const multiPhase = phaseResults.length > 1;

      return {
        ...s,
        phaseResults, multiPhase,
        Y, totalC, hasFuru, bTIaF,
        // Last-phase representative values for table rows
        ds: lp.ds || 0, aDS: lp.aDS || 0, aI: lp.aI || 0, aT: lp.aT || 0,
        adjTI: lp.adjTI || 0, adjTIaF: lp.adjTIaF || 0, nMR: lp.nMR || 0,
        nFL: lp.nFL || 0, furuDonNew: lp.furuDonNew || 0, nFDed: lp.nFDed || 0,
        flRed: bFL - (lp.nFL || 0),
        itSv: lp.itSv || 0, rtSv: lp.rtSv || 0, rawTxSv: lp.rawTxSv || 0,
        hlShrink: lp.hlShrink || 0, siSv: lp.siSv || 0, aBen: lp.aBen || 0, aNet: lp.aNet || 0,
        nHLCrUsed: lp.nHLCrUsed || 0, nHLResidentCap: lp.nHLResidentCap || 0,
        tFee, aPL: totalLPL, lPL, pvPL,
        assetFV, fvB, fvF, dcRetDed, retY: Y,
        exitDelta, finalAssetNet, totalAsset, finalScore, otherRet,
      };
    });

    return { base: nextBase, res: nextRes };
  }, [gross, rr, scenarios, hasRet, retAmt, PY, sirPct, currentAge, retirementAge, dependentsCount, hasSpouseDeduction, lifeInsuranceDeduction, useHousingLoanDeduction, housingLoanDeductionAmount]);

  const bestIdx = res.length > 0 ? res.reduce((bi, s, i, a) => (s.finalScore > a[bi].finalScore ? i : bi), 0) : 0;
  const bestTotalIdx = res.length > 0 ? res.reduce((bi, s, i, a) => (s.totalAsset > a[bi].totalAsset ? i : bi), 0) : 0;
  const anyFuru = res.some((s) => s.hasFuru);
  const colSpan = res.length + 1;
  const chartM = [
    { id: "raw", val: base.bTI, label: "控除前", color: "#1e293b", dash: "6,3", thick: 1, opacity: 0.4 },
    ...res.map((s, i) => ({ id: `s${i}`, val: s.adjTIaF, label: s.name + (s.hasFuru ? " (ふるさと込)" : ""), color: COLORS[i], thick: 2 })),
  ];
  const g = (fn) => res.map(fn);
  const scenarioGridClass = scenarios.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

  return (
    <div className="mx-auto max-w-7xl p-3 text-gray-900">
      <div className="flex flex-col gap-3">
        <h1 className="text-lg font-bold">DC・iDeCo シナリオ比較シミュレーター</h1>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] xl:items-start">
          {/* 左カラム */}
          <div className="space-y-3 xl:min-w-0 xl:pr-1">

            {/* 共通設定 */}
            <div className="rounded bg-blue-50 p-3">
              <p className="mb-2 text-xs font-bold text-blue-700">共通設定</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumIn label="現在の年齢" value={currentAge} onChange={setCurrentAge} step={1} unit="歳" min={18} max={70} />
                <NumIn label="退職予定年齢" value={retirementAge} onChange={setRetirementAge} step={1} unit="歳" min={currentAge + 1} max={80} />
                <NumIn label="年収（額面）" value={gross} onChange={setGross} step={500000} unit="円" />
                <Slider label="運用利回り" value={rr} onChange={setRR} min={0} max={10} step={0.5} unit="%" />
                <Slider label="社保料率（本人）" value={sirPct} onChange={setSirPct} min={10} max={20} step={0.25} unit="%" help="厚年+健保+介護+雇用" />
                <Slider label="年金受給期間" value={PY} onChange={setPY} min={10} max={30} step={1} unit="年" />
              </div>
              <div className="mt-2 text-xs text-gray-600">
                積立期間: <b>{totalYears}年</b>（{currentAge}〜{retirementAge}歳）
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-4">
                <Tog label="会社退職金あり" checked={hasRet} onChange={setHasRet} />
                {hasRet && <NumIn label="" value={retAmt} onChange={setRetAmt} step={1000000} unit="円" small />}
              </div>
              <details className="mt-3 rounded border border-blue-200 bg-white/70 p-3">
                <summary className="cursor-pointer text-xs font-bold text-blue-700">税務の詳細設定（任意）</summary>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <NumIn label="扶養人数" value={dependentsCount} onChange={setDependentsCount} step={1} unit="人" help="一般扶養として1人38万円で簡易反映" />
                  <div className="flex items-end"><Tog label="配偶者控除を反映" checked={hasSpouseDeduction} onChange={setHasSpouseDeduction} /></div>
                  <NumIn label="生命保険料控除" value={lifeInsuranceDeduction} onChange={setLifeInsuranceDeduction} step={1000} unit="円" help="保険料ではなく控除額をそのまま入力" />
                  <div className="space-y-2">
                    <Tog label="住宅ローン控除を反映" checked={useHousingLoanDeduction} onChange={setUseHousingLoanDeduction} />
                    {useHousingLoanDeduction && <NumIn label="住宅ローン控除額（年額）" value={housingLoanDeductionAmount} onChange={setHousingLoanDeductionAmount} step={10000} unit="円" help="税額控除として最後に適用" />}
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-gray-500">扶養は一般扶養1人38万円、配偶者控除は一律38万円の簡易計算。生命保険は控除額を直接入力、住宅ローン控除は税額控除として最後に差し引きます。</div>
              </details>
              <div className="mt-3 text-xs text-gray-600">
                課税所得: <b>¥{fmt(base.bTI)}</b> ／ 最高税率: <b>{base.bMR}%</b> ／ ふるさと上限: <b>¥{fmt(base.bFL)}</b>
              </div>
              {base.hasAnyTaxDetailSetting && (
                <div className="mt-1 text-xs text-gray-500">
                  詳細控除:
                  {base.hasDepSetting && <> 扶養 ¥{fmt(base.depDed)}</>}
                  {base.hasSpouseSetting && <> ／ 配偶者 ¥{fmt(base.spouseDed)}</>}
                  {base.hasLifeSetting && <> ／ 生保 ¥{fmt(base.lifeDed)}</>}
                  {base.hasHousingSetting && <> ／ 住宅ローン控除 ¥{fmt(base.housingLoanDed)}</>}
                </div>
              )}
            </div>

            {/* チャート */}
            <div className="rounded border bg-white p-3">
              <p className="mb-2 text-sm font-bold">課税所得の位置</p>
              <Chart markers={chartM} />
            </div>

            {/* シナリオ設定 */}
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
                    canRemove={scenarios.length > 1} canDuplicate={scenarios.length < 4}
                    currentAge={currentAge} retirementAge={retirementAge} />
                ))}
              </div>
            </div>

            {/* 総資産バー比較 */}
            <TotalAssetBar res={res} bestTotalIdx={bestTotalIdx} />

            {/* 総資産サマリー（計算式） */}
            <div>
              <p className="mb-2 text-sm font-bold">総資産サマリー</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {res.map((s, i) => {
                  const isBest = i === bestIdx;
                  return (
                    <div key={i} className={`min-w-0 rounded border-2 p-3 ${isBest ? "ring-2 ring-blue-600 bg-blue-50" : "bg-gray-50"}`} style={{ borderColor: COLORS[i] }}>
                      <div className="mb-2 text-sm font-bold" style={{ color: COLORS[i] }}>{s.name} {isBest && "⭐"}</div>
                      <div className="space-y-1 text-xs">
                        {/* 総資産の計算式ブロック */}
                        <div className="rounded bg-white p-2 space-y-1" style={{ borderLeft: `3px solid ${COLORS[i]}` }}>
                          <div className="text-gray-500">DC資産</div>
                          {s.multiPhase && (
                            <div className="ml-2 space-y-0.5 text-[10px] text-gray-400 border-l border-gray-200 pl-2">
                              {s.phaseResults.map((pr, pi) => (
                                <div key={pi}>{pr.fromAge}〜{pr.toAge}歳（{pr.n}年）: {(pr.phase.dcTotal + pr.phase.idecoMonthly).toLocaleString()}円/月</div>
                              ))}
                            </div>
                          )}
                          <div className="flex justify-between pl-2">
                            <span className="text-gray-600">運用後資産</span>
                            <span className="font-mono">¥{fmt(Math.round(s.assetFV))}</span>
                          </div>
                          <div className="flex justify-between pl-2">
                            <span className="text-red-500">－ 出口課税</span>
                            <span className="font-mono text-red-500">¥{fmt(s.exitDelta)}</span>
                          </div>
                          <div className="flex justify-between pl-2 font-semibold border-t pt-1">
                            <span>＝ DC資産（課税後）</span>
                            <span className="font-mono">¥{fmt(Math.round(s.finalAssetNet))}</span>
                          </div>
                          <div className="border-t my-1" />
                          <div className="text-gray-500">再投資将来価値</div>
                          {s.multiPhase && (
                            <div className="ml-2 space-y-0.5 text-[10px] text-gray-400 border-l border-gray-200 pl-2">
                              {s.phaseResults.map((pr, pi) => (
                                <div key={pi}>{pr.fromAge}〜{pr.toAge}歳: メリット ¥{fmt(Math.round(pr.aBen))}/年</div>
                              ))}
                            </div>
                          )}
                          {!s.multiPhase && (
                            <>
                              <div className="flex justify-between pl-2">
                                <span className="text-gray-600">節税＋社保メリット(年)</span>
                                <span className="font-mono">¥{fmt(s.aBen)}</span>
                              </div>
                              <div className="flex justify-between pl-2">
                                <span className="text-red-500">－ iDeCo手数料(年)</span>
                                <span className="font-mono text-red-500">¥{fmt((s.phases[0]?.idecoFee || 0) * 12)}</span>
                              </div>
                              <div className="flex justify-between pl-2 text-gray-500">
                                <span>× {rr}%複利 {totalYears}年</span>
                              </div>
                            </>
                          )}
                          <div className="flex justify-between pl-2 font-semibold border-t pt-1">
                            <span>＝ 再投資将来価値</span>
                            <span className="font-mono">¥{fmt(Math.round(s.fvB))}</span>
                          </div>
                          <div className="border-t my-1" />
                          <div className="flex justify-between font-bold text-sm pt-0.5">
                            <span>総資産合計</span>
                            <span className="font-mono">¥{fmt(Math.round(s.totalAsset))}{i === bestTotalIdx ? " 🏆" : ""}</span>
                          </div>
                        </div>
                        {/* 最終評価（参考） */}
                        <div className="rounded bg-white p-2 space-y-1" style={{ borderLeft: "3px solid #a3a3a3" }}>
                          <div className="text-gray-500">最終評価（参考）</div>
                          <div className="flex justify-between pl-2">
                            <span className="text-gray-600">再投資将来価値</span>
                            <span className="font-mono">¥{fmt(Math.round(s.fvB))}</span>
                          </div>
                          <div className="flex justify-between pl-2">
                            <span className="text-red-500">－ 手数料機会損失</span>
                            <span className="font-mono text-red-500">¥{fmt(Math.round(s.fvF))}</span>
                          </div>
                          <div className="flex justify-between pl-2">
                            <span className="text-red-500">－ 厚生年金損失</span>
                            <span className="font-mono text-red-500">¥{fmt(Math.round(s.pvPL))}</span>
                          </div>
                          <div className="flex justify-between pl-2">
                            <span className="text-red-500">－ 出口課税</span>
                            <span className="font-mono text-red-500">¥{fmt(s.exitDelta)}</span>
                          </div>
                          <div className="flex justify-between pl-2 font-semibold border-t pt-1">
                            <span>＝ 最終評価</span>
                            <span className="font-mono">¥{fmt(Math.round(s.finalScore))}</span>
                          </div>
                        </div>
                        {s.hasFuru && (
                          <div className="text-gray-400 text-[10px]">
                            ふるさと上限: ¥{fmt(s.nFL)}/年（寄付: ¥{fmt(s.furuDonNew)}）
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右カラム：結果表のみ */}
          <div className="space-y-3 xl:min-w-0 xl:pl-1">
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
                  <Sec c="bg-gray-100" colSpan={colSpan}>■ 拠出（最終フェーズ月額）</Sec>
                  {detail && <Row l="DC（会社+本人）" vs={g((s) => s.aT / 12 - s.aI / 12)} formula="最終フェーズの会社負担+本人給与減額分" />}
                  {detail && <Row l="本人DC負担" vs={g((s) => s.ds)} sub formula="DC合計−会社負担" />}
                  {detail && <Row l="iDeCo" vs={g((s) => s.aI / 12)} />}
                  <Row l="月額合計（DC+iDeCo）" vs={g((s) => s.aT / 12)} bold />
                  <Row l={`総拠出額（${currentAge}〜${retirementAge}歳）`} vs={g((s) => s.totalC)} bold bg="bg-gray-50" formula="全フェーズの実際の拠出総額" />

                  {detail && base.hasAnyTaxDetailSetting && <Sec c="bg-slate-100" colSpan={colSpan}>■ 税務の詳細設定（共通）</Sec>}
                  {detail && base.hasDepSetting && <Row l="扶養控除" vs={g(() => base.depDed)} formula={`38万円×${dependentsCount}人`} />}
                  {detail && base.hasSpouseSetting && <Row l="配偶者控除" vs={g(() => base.spouseDed)} formula="簡易計算: 一律38万円" />}
                  {detail && base.hasLifeSetting && <Row l="生命保険料控除" vs={g(() => base.lifeDed)} />}
                  {detail && base.hasHousingSetting && <Row l="住宅ローン控除" vs={g(() => base.housingLoanDed)} formula="税額控除として最後に適用" />}

                  {detail && <Sec c="bg-gray-100" colSpan={colSpan}>■ 年収影響・維持コスト（最終フェーズ）</Sec>}
                  {detail && <Row l="年間額面減少" vs={g((s) => s.aDS)} neg formula="DC本人負担×12" />}
                  {detail && <Row l={`維持コスト合計（手数料総額）`} vs={g((s) => s.tFee)} bold formula="全フェーズのiDeCo手数料合計" />}

                  {detail && base.hasHousingSetting && <Sec c="bg-blue-50" colSpan={colSpan}>■ 住宅ローン控除の反映（最終フェーズ）</Sec>}
                  {detail && base.hasHousingSetting && <Row l="住民税側の控除上限" vs={g((s) => s.nHLResidentCap)} formula="課税所得×5%（上限97,500円）" />}
                  {detail && base.hasHousingSetting && <Row l="住宅ローン控除 適用前の税メリット" vs={g((s) => s.rawTxSv)} formula="所得税+住民税の差分（控除適用前）" />}
                  {detail && base.hasHousingSetting && <Row l="住宅ローン控除で圧縮された税メリット" vs={g((s) => s.hlShrink)} neg formula="適用前税メリット−適用後税メリット" />}

                  <Sec c="bg-green-50" colSpan={colSpan}>■ 入口メリット（最終フェーズ年額）</Sec>
                  {detail && <Row l="所得税 節税" vs={g((s) => s.itSv)} formula="控除前税額−控除後税額（累進差分）" />}
                  {detail && <Row l="住民税 節税" vs={g((s) => s.rtSv)} formula="同上（税率10%）" />}
                  {detail && <Row l="社保 節約" vs={g((s) => s.siSv)} help="DC本人負担分のみ" formula={`DC本人負担×12×${sirPct}%`} />}
                  {detail && <Row l="年間メリット合計" vs={g((s) => s.aBen)} bold formula="所得税+住民税+社保" />}
                  <Row l="手数料差引後メリット（年額）" vs={g((s) => s.aNet)} bold bg="bg-green-100" formula="年間メリット合計−iDeCo手数料×12" help="再投資に回せる年額（最終フェーズ）" />

                  {anyFuru && (
                    <>
                      <Sec c="bg-amber-50" colSpan={colSpan}>■ ふるさと納税（最終フェーズ後）</Sec>
                      {detail && <Row l="控除前の上限" vs={g(() => base.bFL)} />}
                      {detail && <Row l="控除後の上限" vs={g((s) => s.nFL)} />}
                      {detail && <Row l="上限の減少" vs={g((s) => s.flRed)} neg />}
                      <Row l="寄付額（上限・1000円切捨）" vs={g((s) => (s.hasFuru ? s.furuDonNew : "-"))} />
                      {detail && <Row l="所得控除額" vs={g((s) => (s.hasFuru ? s.nFDed : 0))} formula="寄付額−2,000円" />}
                    </>
                  )}

                  <Sec c="bg-red-50" colSpan={colSpan}>{`■ 厚生年金減少（${PY}年受給）`}</Sec>
                  {detail && <Row l="厚生年金減少合計（年額換算）" vs={g((s) => s.aPL)} neg formula="全フェーズの等級変化による減少の合計" help="等級制のため上限値" />}
                  <Row l={`厚生年金生涯損失（名目${PY}年）`} vs={g((s) => s.lPL)} neg bold formula={`合計×${PY}年`} />

                  <Sec c="bg-red-50" colSpan={colSpan}>{`■ 出口課税（${rr}%運用後）`}</Sec>
                  {detail && <Row l="資産額（運用後）" vs={g((s) => Math.round(s.assetFV))} bold formula={`全フェーズをチェーン複利で${rr}%運用`} />}
                  {detail && <Row l="退職所得控除" vs={g((s) => s.dcRetDed)} formula="20年以下:40万×年, 超:800万+70万×(年−20)" />}
                  {detail && <Row l="退職所得（控除後×1/2）" vs={g((s) => Math.max(Math.floor((s.assetFV + s.otherRet - s.dcRetDed) / 2), 0))} formula="(DC/iDeCo資産+退職金−控除)×1/2" />}
                  <Row l="追加税負担" vs={g((s) => s.exitDelta)} neg bold bg="bg-red-100" formula="退職所得に累進課税（分離）" />

                  <Sec c="bg-teal-100" colSpan={colSpan}>■ 総資産（DC資産＋再投資将来価値）</Sec>
                  <Row l="DC資産（出口課税後）" vs={g((s) => Math.round(s.finalAssetNet))} bold bg="bg-blue-50" formula="資産額−追加税負担" />
                  <Row l="再投資将来価値" vs={g((s) => Math.round(s.fvB))} bold bg="bg-green-50" formula={`全フェーズの節税・社保メリットをチェーン複利${rr}%で運用`} help="節税+社保をNISA等で再投資" />
                  <Row l="総資産合計" vs={g((s) => Math.round(s.totalAsset))} bold bg="bg-teal-50" formula="DC資産（出口課税後）＋再投資将来価値" />

                  <Sec c="bg-indigo-100" colSpan={colSpan}>{`■ 最終評価（${rr}%運用込み）`}</Sec>
                  <Row l="A. メリット再投資の将来価値" vs={g((s) => Math.round(s.fvB))} bold bg="bg-green-100" formula={`全フェーズの手数料差引後メリットをチェーン複利${rr}%`} />
                  <Row l="B. 手数料の機会損失" vs={g((s) => Math.round(s.fvF))} neg formula={`全フェーズのiDeCo手数料を代わりに投資した場合`} />
                  <Row l={`C. 厚生年金生涯損失（名目${PY}年）`} vs={g((s) => Math.round(s.pvPL))} neg formula={`全フェーズ合計×${PY}年（割引なし名目値）`} />
                  <Row l="D. 出口課税" vs={g((s) => s.exitDelta)} neg />
                  <Row l="最終評価 (A−B−C−D)" vs={g((s) => Math.round(s.finalScore))} bold bg="bg-yellow-200" />
                </tbody>
              </table>
            </div>
            <div className="space-y-0.5 text-xs text-gray-400">
              <p>※ 節税額はシナリオごとのふるさと納税込みベースとの差分を累進で計算。社保は概算。厚生年金減少は等級制のため上限値。</p>
              <p>※ 出口課税は分離課税（退職所得）。課税所得は給与所得控除+社保+基礎控除48万に、扶養・配偶者・生命保険料控除を簡易反映。</p>
              <p>※ 住宅ローン控除は税額控除として最後に適用。住民税側は「課税所得×5%・上限97,500円」の簡易上限で所得税→住民税の順に差し引き。</p>
              <p>※ 総資産＝DC/iDeCo資産（出口課税後）＋節税・社保メリット再投資の将来価値。厚生年金損失は別途控除されないため参考値として確認してください。</p>
              <p>※ 入口メリット・ふるさと納税は「最終フェーズ」の拠出額ベースの年額表示。FV計算は全フェーズを正確にチェーン複利で算出。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
