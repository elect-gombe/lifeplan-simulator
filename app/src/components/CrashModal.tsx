import React, { useState, useEffect, useMemo } from "react";
import type { LifeEvent, MarketCrashParams } from "../lib/types";
import { Modal } from "./ui";

const DEFAULTS: MarketCrashParams = {
  dropRate: 40,
  target: "all",
  recoveryYears: 15,
};

/**
 * 回復ボーナス利回りを算出:
 * 暴落含めた(recoveryYears+1)年間の幾何平均がtargetRRになるように
 * (1-drop/100) × (1+bonus)^N = (1+target)^(N+1)
 * bonus = ((1+target)^(N+1) / (1-drop/100))^(1/N) - 1
 */
function calcBonusRate(dropRate: number, recoveryYears: number, targetRR: number): number {
  const target = targetRR / 100;
  const drop = dropRate / 100;
  const totalGrowth = Math.pow(1 + target, recoveryYears + 1);
  const afterDrop = 1 - drop;
  if (afterDrop <= 0 || recoveryYears <= 0) return targetRR;
  const bonus = Math.pow(totalGrowth / afterDrop, 1 / recoveryYears) - 1;
  return Math.round(bonus * 1000) / 10; // %表記、小数1桁
}

/** 回復レート配列を生成（全年同一ボーナス or カスタム） */
export function generateRecoveryRates(dropRate: number, recoveryYears: number, targetRR: number): number[] {
  const bonus = calcBonusRate(dropRate, recoveryYears, targetRR);
  return Array(recoveryYears).fill(bonus);
}

/** 実効幾何平均利回りを計算（暴落年+回復期間） */
function calcEffectiveCAGR(dropRate: number, rates: number[]): number {
  let product = 1 - dropRate / 100; // 暴落年
  for (const r of rates) product *= (1 + r / 100);
  const n = rates.length + 1;
  return (Math.pow(product, 1 / n) - 1) * 100;
}

interface SimPoint { value: number; cost: number; gain: number; }

/** プレビュー用: 資産推移を計算（時価・元本・含み益） */
function simulateAsset(initial: number, contrib: number, years: number, normalRR: number, crashAt: number, dropRate: number, recoveryRates: number[]): SimPoint[] {
  const result: SimPoint[] = [];
  let asset = initial;
  let cost = initial; // 投入額累計
  for (let y = 0; y <= years; y++) {
    result.push({ value: asset, cost, gain: asset - cost });
    if (y === crashAt) {
      asset *= (1 - dropRate / 100);
    } else if (y > crashAt && y - crashAt - 1 < recoveryRates.length) {
      asset *= (1 + recoveryRates[y - crashAt - 1] / 100);
    } else {
      asset *= (1 + normalRR / 100);
    }
    asset += contrib;
    cost += contrib;
  }
  return result;
}

export function CrashModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent, defaultRR }: {
  isOpen: boolean; onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number; retirementAge: number;
  existingEvent?: LifeEvent | null;
  defaultRR?: number;
}) {
  const [age, setAge] = useState(currentAge + 5);
  const [dropRate, setDropRate] = useState(DEFAULTS.dropRate);
  const [target, setTarget] = useState<MarketCrashParams["target"]>(DEFAULTS.target);
  const [recoveryYears, setRecoveryYears] = useState(DEFAULTS.recoveryYears!);
  const [customRates, setCustomRates] = useState<number[] | null>(null);
  const [targetRR, setTargetRR] = useState(defaultRR ?? 4);

  useEffect(() => {
    if (existingEvent?.marketCrashParams) {
      const cp = existingEvent.marketCrashParams;
      setAge(existingEvent.age);
      setDropRate(cp.dropRate);
      setTarget(cp.target);
      setRecoveryYears(cp.recoveryYears ?? 15);
      setCustomRates(cp.recoveryRates ?? null);
      setTargetRR(cp.targetRR ?? defaultRR ?? 4);
    } else {
      setAge(currentAge + 5);
      setDropRate(DEFAULTS.dropRate);
      setTarget(DEFAULTS.target);
      setRecoveryYears(15);
      setCustomRates(null);
      setTargetRR(defaultRR ?? 4);
    }
  }, [existingEvent, currentAge, defaultRR, isOpen]);

  const effectiveRates = useMemo(() => {
    if (customRates && customRates.length === recoveryYears) return customRates;
    return generateRecoveryRates(dropRate, recoveryYears, targetRR);
  }, [customRates, recoveryYears, dropRate, targetRR]);

  const bonusRate = calcBonusRate(dropRate, recoveryYears, targetRR);
  const effectiveCAGR = calcEffectiveCAGR(dropRate, effectiveRates);

  const updateRate = (idx: number, val: number) => {
    const rates = [...effectiveRates];
    rates[idx] = val;
    setCustomRates(rates);
  };

  // プレビュー
  const pvYears = Math.max(recoveryYears + 8, 25);
  const crashAt = 3;
  const pvCrash = useMemo(() => simulateAsset(10000000, 400000, pvYears, targetRR, crashAt, dropRate, effectiveRates), [targetRR, dropRate, effectiveRates, pvYears]);
  const pvNormal = useMemo(() => simulateAsset(10000000, 400000, pvYears, targetRR, -1, 0, []), [targetRR, pvYears]);

  // Chart
  const cW = 520, cH = 220, pL = 55, pR = 10, pT = 15, pB = 22;
  const allVals = [...pvCrash.map(p => p.value), ...pvNormal.map(p => p.value)];
  const maxV = Math.max(...allVals);
  const minV = 0;
  const x = (i: number) => pL + (i / pvYears) * (cW - pL - pR);
  const yv = (v: number) => pT + (maxV === minV ? 0.5 : (1 - (v - minV) / (maxV - minV))) * (cH - pT - pB);
  const linePath = (data: SimPoint[], key: keyof SimPoint) => data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${yv(p[key])}`).join(" ");
  // 含み益/含み損の塗りつぶしエリア（時価と元本の間）
  const gainFill = (data: SimPoint[]) => {
    const top = data.map((p, i) => `${x(i)},${yv(p.value)}`).join(" L");
    const bot = data.map((p, i) => `${x(data.length - 1 - i)},${yv(data[data.length - 1 - i].cost)}`).join(" L");
    return `M${top} L${bot} Z`;
  };

  const handleSave = () => {
    // 保存時に最新の値で再生成（stale useMemo対策）
    const ratesToSave = customRates && customRates.length === recoveryYears
      ? customRates
      : generateRecoveryRates(dropRate, recoveryYears, targetRR);
    onSave({
      id: existingEvent?.id || Date.now(),
      age, type: "crash",
      label: `暴落 -${dropRate}%(${recoveryYears}年回復)`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: recoveryYears + 1,
      marketCrashParams: { dropRate, target, recoveryYears, recoveryRates: ratesToSave, targetRR },
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} title="📉 暴落シナリオ設定" onClose={onClose} onSave={handleSave} wide>
      <div className="space-y-3">
        {/* 基本設定 */}
        <div className="rounded bg-gray-50 p-3 space-y-2 text-xs">
          <div className="flex flex-wrap gap-3 items-center">
            <label className="flex items-center gap-1">
              <span className="text-gray-500">発生年齢</span>
              <input type="number" value={age} min={currentAge} max={retirementAge + 20} step={1}
                onChange={e => setAge(Number(e.target.value))} className="w-14 rounded border px-1 py-0.5" />
              <span className="text-gray-400">歳</span>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-gray-500">下落率</span>
              <input type="number" value={dropRate} min={5} max={90} step={5}
                onChange={e => { setDropRate(Number(e.target.value)); setCustomRates(null); }} className="w-14 rounded border px-1 py-0.5" />
              <span className="text-gray-400">%</span>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-gray-500">対象</span>
              <select value={target} onChange={e => setTarget(e.target.value as any)} className="rounded border px-1 py-0.5">
                <option value="all">全口座</option>
                <option value="nisa">NISAのみ</option>
                <option value="taxable">特定口座のみ</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <label className="flex items-center gap-1">
              <span className="text-gray-500">回復期間</span>
              <input type="number" value={recoveryYears} min={1} max={20} step={1}
                onChange={e => { setRecoveryYears(Number(e.target.value)); setCustomRates(null); }} className="w-14 rounded border px-1 py-0.5" />
              <span className="text-gray-400">年</span>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-gray-500">目標平均利回り</span>
              <input type="number" value={targetRR} min={0} max={15} step={0.5}
                onChange={e => { setTargetRR(Number(e.target.value)); setCustomRates(null); }} className="w-14 rounded border px-1 py-0.5" />
              <span className="text-gray-400">%</span>
            </label>
          </div>
          <div className="text-[10px] text-gray-500 bg-blue-50 rounded p-1.5">
            暴落(-{dropRate}%)後、<b className="text-green-700">{bonusRate}%/年</b>の回復ボーナスを{recoveryYears}年間適用 →
            幾何平均利回り <b className={Math.abs(effectiveCAGR - targetRR) < 0.1 ? "text-green-700" : "text-amber-600"}>{effectiveCAGR.toFixed(1)}%</b>
            {Math.abs(effectiveCAGR - targetRR) < 0.1 ? " ✓目標達成" : ` (目標${targetRR}%)`}
          </div>
        </div>

        {/* 年別利回り */}
        <div className="rounded border p-3">
          <div className="text-xs font-bold text-gray-600 mb-1">年別利回り</div>
          <div className="flex items-end gap-0.5 overflow-x-auto pb-1">
            <div className="flex flex-col items-center shrink-0">
              <span className="text-[9px] text-gray-400">暴落</span>
              <div className="w-10 h-7 rounded bg-red-100 flex items-center justify-center text-[10px] text-red-700 font-bold">-{dropRate}%</div>
            </div>
            {effectiveRates.map((rate, i) => (
              <div key={i} className="flex flex-col items-center shrink-0">
                <span className="text-[8px] text-gray-400">+{i + 1}</span>
                <div className={`w-10 h-7 rounded flex items-center justify-center text-[10px] font-mono ${rate < 0 ? "text-red-600 bg-red-50" : rate > targetRR ? "text-green-700 bg-green-50" : "text-amber-600 bg-amber-50"}`}>{rate}%</div>
              </div>
            ))}
            <div className="flex flex-col items-center shrink-0">
              <span className="text-[8px] text-gray-400">以降</span>
              <div className="w-10 h-7 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-500">{targetRR}%</div>
            </div>
          </div>
        </div>

        {/* グラフ1: 資産推移比較 */}
        <div className="rounded border p-3">
          <div className="text-xs font-bold text-gray-600 mb-1">資産推移（初期1,000万 + 毎年40万積立）</div>
          <svg viewBox={`0 0 ${cW} ${cH}`} className="w-full" style={{ maxHeight: 180 }}>
            {[0, 0.25, 0.5, 0.75, 1].map(t => {
              const v = minV + t * (maxV - minV);
              return <g key={t}><line x1={pL} y1={yv(v)} x2={cW - pR} y2={yv(v)} stroke="#e5e7eb" strokeWidth={0.5} />
                <text x={pL - 4} y={yv(v) + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{Math.round(v / 10000)}万</text></g>;
            })}
            <rect x={x(crashAt)} y={pT} width={Math.max(x(crashAt + 1) - x(crashAt), 2)} height={cH - pT - pB} fill="#dc2626" opacity={0.15} />
            <rect x={x(crashAt + 1)} y={pT} width={x(crashAt + 1 + recoveryYears) - x(crashAt + 1)} height={cH - pT - pB} fill="#22c55e" opacity={0.06} />
            <text x={x(crashAt + 1 + recoveryYears / 2)} y={pT + 10} textAnchor="middle" fontSize={7} fill="#16a34a">回復ボーナス期間</text>
            <path d={linePath(pvNormal, "value")} fill="none" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4,3" />
            <path d={linePath(pvCrash, "value")} fill="none" stroke="#dc2626" strokeWidth={2} />
            {[0, crashAt, crashAt + recoveryYears, pvYears].map(yr => (
              <text key={yr} x={x(yr)} y={cH - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">{yr}年</text>
            ))}
            <g fontSize={7}>
              <line x1={cW - 135} y1={pT + 3} x2={cW - 120} y2={pT + 3} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
              <text x={cW - 116} y={pT + 6} fill="#94a3b8">暴落なし({targetRR}%)</text>
              <line x1={cW - 135} y1={pT + 13} x2={cW - 120} y2={pT + 13} stroke="#dc2626" strokeWidth={2} />
              <text x={cW - 116} y={pT + 16} fill="#dc2626">暴落+回復</text>
            </g>
          </svg>
          <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-gray-500">
            <span>{pvYears}年後 暴落なし: <b>{Math.round(pvNormal[pvYears].value / 10000).toLocaleString()}万</b></span>
            <span>暴落+回復: <b className="text-red-600">{Math.round(pvCrash[pvYears].value / 10000).toLocaleString()}万</b></span>
            <span>差額: <b className="text-red-600">-{Math.round((pvNormal[pvYears].value - pvCrash[pvYears].value) / 10000).toLocaleString()}万</b></span>
          </div>
        </div>

        {/* グラフ2: 含み益/含み損 */}
        {(() => {
          const gH = 140;
          const gains = pvCrash.map(p => p.gain);
          const gMax = Math.max(...gains, 0);
          const gMin = Math.min(...gains, 0);
          const gy = (v: number) => pT + (gMax === gMin ? 0.5 : (1 - (v - gMin) / (gMax - gMin))) * (gH - pT - pB);
          const zeroY = gy(0);
          const gainPath = pvCrash.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${gy(p.gain)}`).join(" ");
          const fillAbove = gainPath + ` L${x(pvYears)},${zeroY} L${x(0)},${zeroY} Z`;
          // 含み益回復ポイント: 暴落後に初めてgain >= 0になる年
          let recoveryPoint = -1;
          for (let i = crashAt + 1; i <= pvYears; i++) {
            if (pvCrash[i].gain >= 0) { recoveryPoint = i; break; }
          }
          const recoveryFromCrash = recoveryPoint >= 0 ? recoveryPoint - crashAt : -1;
          return (
            <div className="rounded border p-3">
              <div className="text-xs font-bold text-gray-600 mb-1">含み益 / 含み損（暴落シナリオ）</div>
              <svg viewBox={`0 0 ${cW} ${gH}`} className="w-full" style={{ maxHeight: 140 }}>
                {/* 0ライン */}
                <line x1={pL} y1={zeroY} x2={cW - pR} y2={zeroY} stroke="#374151" strokeWidth={0.5} />
                <text x={pL - 4} y={zeroY + 3} textAnchor="end" fontSize={8} fill="#374151">0</text>
                {/* Yグリッド */}
                {[gMin, gMax].filter(v => v !== 0).map(v => (
                  <g key={v}><line x1={pL} y1={gy(v)} x2={cW - pR} y2={gy(v)} stroke="#e5e7eb" strokeWidth={0.5} />
                    <text x={pL - 4} y={gy(v) + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{Math.round(v / 10000)}万</text></g>
                ))}
                {/* 暴落帯 */}
                <rect x={x(crashAt)} y={pT} width={Math.max(x(crashAt + 1) - x(crashAt), 2)} height={gH - pT - pB} fill="#dc2626" opacity={0.1} />
                {/* 含み損期間の帯 */}
                {recoveryPoint > 0 && (
                  <rect x={x(crashAt)} y={pT} width={x(recoveryPoint) - x(crashAt)} height={gH - pT - pB} fill="#fbbf24" opacity={0.08} />
                )}
                {/* 塗りつぶし: 含み益=緑、含み損=赤 */}
                <clipPath id="aboveZero"><rect x={pL} y={pT} width={cW - pL - pR} height={zeroY - pT} /></clipPath>
                <clipPath id="belowZero"><rect x={pL} y={zeroY} width={cW - pL - pR} height={gH - pB - zeroY} /></clipPath>
                <path d={fillAbove} fill="#22c55e" opacity={0.2} clipPath="url(#aboveZero)" />
                <path d={fillAbove} fill="#dc2626" opacity={0.2} clipPath="url(#belowZero)" />
                {/* 含み益回復ポイント */}
                {recoveryPoint > 0 && <>
                  <line x1={x(recoveryPoint)} y1={pT} x2={x(recoveryPoint)} y2={gH - pB} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,2" />
                  <text x={x(recoveryPoint)} y={pT + 10} textAnchor="middle" fontSize={7} fill="#d97706">{recoveryFromCrash}年で回復</text>
                </>}
                {/* ライン */}
                <path d={gainPath} fill="none" stroke="#374151" strokeWidth={1.5} />
                {/* X軸 */}
                {[0, crashAt, ...(recoveryPoint > 0 && recoveryPoint !== crashAt + recoveryYears ? [recoveryPoint] : []), crashAt + recoveryYears, pvYears].map(yr => (
                  <text key={yr} x={x(yr)} y={gH - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">{yr}年</text>
                ))}
              </svg>
              <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-gray-500">
                <span>元本(累計): <b className="text-indigo-600">{Math.round(pvCrash[pvYears].cost / 10000).toLocaleString()}万</b></span>
                <span>最終含み益: <b className={pvCrash[pvYears].gain >= 0 ? "text-green-600" : "text-red-600"}>{pvCrash[pvYears].gain >= 0 ? "+" : ""}{Math.round(pvCrash[pvYears].gain / 10000).toLocaleString()}万</b></span>
                <span>最大含み損: <b className="text-red-600">{Math.round(Math.min(...gains) / 10000).toLocaleString()}万</b></span>
                {recoveryPoint > 0
                  ? <span>含み益回復: <b className="text-amber-600">暴落から{recoveryFromCrash}年後({recoveryPoint}年目)</b></span>
                  : <span>含み益回復: <b className="text-red-600">{pvYears}年以内に回復せず</b></span>}
              </div>
            </div>
          );
        })()}
      </div>
    </Modal>
  );
}
