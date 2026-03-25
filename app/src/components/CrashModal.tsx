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
function generateRecoveryRates(dropRate: number, recoveryYears: number, targetRR: number): number[] {
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

/** プレビュー用: 資産推移を計算 */
function simulateAsset(initial: number, contrib: number, years: number, normalRR: number, crashAt: number, dropRate: number, recoveryRates: number[]): number[] {
  const result: number[] = [];
  let asset = initial;
  for (let y = 0; y <= years; y++) {
    result.push(asset);
    if (y === crashAt) {
      asset *= (1 - dropRate / 100);
    } else if (y > crashAt && y - crashAt - 1 < recoveryRates.length) {
      asset *= (1 + recoveryRates[y - crashAt - 1] / 100);
    } else {
      asset *= (1 + normalRR / 100);
    }
    asset += contrib;
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
  const pvCrash = useMemo(() => simulateAsset(10000000, 1000000, pvYears, targetRR, crashAt, dropRate, effectiveRates), [targetRR, dropRate, effectiveRates, pvYears]);
  const pvNormal = useMemo(() => simulateAsset(10000000, 1000000, pvYears, targetRR, -1, 0, []), [targetRR, pvYears]);

  // Chart
  const cW = 520, cH = 180, pL = 55, pR = 10, pT = 15, pB = 22;
  const allVals = [...pvCrash, ...pvNormal];
  const maxV = Math.max(...allVals);
  const minV = Math.min(...allVals, 0);
  const x = (i: number) => pL + (i / pvYears) * (cW - pL - pR);
  const y = (v: number) => pT + (maxV === minV ? 0.5 : (1 - (v - minV) / (maxV - minV))) * (cH - pT - pB);
  const path = (data: number[]) => data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  const handleSave = () => {
    onSave({
      id: existingEvent?.id || Date.now(),
      age, type: "crash",
      label: `暴落 -${dropRate}%`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: 1,
      marketCrashParams: { dropRate, target, recoveryYears, recoveryRates: effectiveRates },
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
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-gray-600">年別利回り（編集可）</span>
            {customRates && <button onClick={() => setCustomRates(null)} className="text-[10px] text-blue-500 hover:underline">自動に戻す</button>}
          </div>
          <div className="flex items-end gap-0.5 overflow-x-auto pb-1">
            {/* 暴落年 */}
            <div className="flex flex-col items-center shrink-0">
              <span className="text-[9px] text-gray-400">暴落</span>
              <div className="w-10 h-8 rounded bg-red-100 flex items-center justify-center text-[10px] text-red-700 font-bold">-{dropRate}%</div>
            </div>
            {/* 回復期間 */}
            {effectiveRates.map((rate, i) => (
              <div key={i} className="flex flex-col items-center shrink-0">
                <span className="text-[8px] text-gray-400">+{i + 1}</span>
                <input type="number" value={rate} step={0.5} min={-50} max={50}
                  onChange={e => updateRate(i, Number(e.target.value))}
                  className={`w-10 h-8 rounded border text-[10px] text-center font-mono ${rate < 0 ? "text-red-600 bg-red-50" : rate > targetRR ? "text-green-700 bg-green-50" : "text-amber-600 bg-amber-50"}`} />
              </div>
            ))}
            {/* 通常に戻る */}
            <div className="flex flex-col items-center shrink-0">
              <span className="text-[8px] text-gray-400">以降</span>
              <div className="w-10 h-8 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-500">{targetRR}%</div>
            </div>
          </div>
        </div>

        {/* プレビューチャート */}
        <div className="rounded border p-3">
          <div className="text-xs font-bold text-gray-600 mb-1">資産推移イメージ（初期1,000万 + 毎年100万積立）</div>
          <svg viewBox={`0 0 ${cW} ${cH}`} className="w-full" style={{ maxHeight: 200 }}>
            {/* Yグリッド */}
            {[0, 0.25, 0.5, 0.75, 1].map(t => {
              const v = minV + t * (maxV - minV);
              return <g key={t}><line x1={pL} y1={y(v)} x2={cW - pR} y2={y(v)} stroke="#e5e7eb" strokeWidth={0.5} />
                <text x={pL - 4} y={y(v) + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{Math.round(v / 10000)}万</text></g>;
            })}
            {/* 暴落帯 */}
            <rect x={x(crashAt)} y={pT} width={Math.max(x(crashAt + 1) - x(crashAt), 2)} height={cH - pT - pB} fill="#dc2626" opacity={0.15} />
            {/* 回復帯 */}
            <rect x={x(crashAt + 1)} y={pT} width={x(crashAt + 1 + recoveryYears) - x(crashAt + 1)} height={cH - pT - pB} fill="#22c55e" opacity={0.08} />
            <text x={x(crashAt + 1 + recoveryYears / 2)} y={pT + 10} textAnchor="middle" fontSize={7} fill="#16a34a">回復ボーナス期間</text>
            {/* 暴落なし */}
            <path d={path(pvNormal)} fill="none" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4,3" />
            {/* 暴落あり */}
            <path d={path(pvCrash)} fill="none" stroke="#dc2626" strokeWidth={2} />
            {/* X軸 */}
            {[0, crashAt, crashAt + recoveryYears, pvYears].map(yr => (
              <text key={yr} x={x(yr)} y={cH - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">{yr}年</text>
            ))}
            {/* 凡例 */}
            <line x1={cW - 130} y1={pT + 3} x2={cW - 115} y2={pT + 3} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
            <text x={cW - 110} y={pT + 6} fontSize={7} fill="#94a3b8">暴落なし({targetRR}%)</text>
            <line x1={cW - 130} y1={pT + 14} x2={cW - 115} y2={pT + 14} stroke="#dc2626" strokeWidth={2} />
            <text x={cW - 110} y={pT + 17} fontSize={7} fill="#dc2626">暴落+回復</text>
          </svg>
          <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
            <span>{pvYears}年後 暴落なし: <b>{Math.round(pvNormal[pvYears] / 10000).toLocaleString()}万</b></span>
            <span>暴落+回復: <b className="text-red-600">{Math.round(pvCrash[pvYears] / 10000).toLocaleString()}万</b></span>
            <span>差額: <b className="text-red-600">-{Math.round((pvNormal[pvYears] - pvCrash[pvYears]) / 10000).toLocaleString()}万</b></span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
