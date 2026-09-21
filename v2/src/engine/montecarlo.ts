/** モンテカルロ: リスク資産のリターンを正規乱数で揺らし、純資産のパーセンタイル帯と枯渇確率を求める。 */
import type { Plan } from "@/domain/model";
import { simulate } from "./simulate";

/** bands は純資産（netWorth）のパーセンタイル、depletionProb は流動資産がマイナスになる経路の割合 */
export interface McBand { age: number; p10: number; p25: number; p50: number; p75: number; p90: number }
export interface McResult { bands: McBand[]; depletionProb: number; paths: number }

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gaussian(rnd: () => number): number {
  let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function monteCarlo(plan: Plan, paths = 300, seed = 42): McResult {
  const rnd = mulberry32(seed);
  const sigma = plan.invest.volatilityPct / 100;
  const r = plan.invest.returns;
  const base = simulate(plan);
  const n = base.rows.length;
  const series: number[][] = Array.from({ length: n }, () => []);
  let depleted = 0;
  for (let p = 0; p < paths; p++) {
    const shocks: number[] = Array.from({ length: n }, () => gaussian(rnd));
    const res = simulate(plan, {
      riskReturnOverride: (i) => {
        const z = shocks[i] ?? 0;
        // 幾何ブラウン近似: 期待値が算術平均になるようドリフト調整
        const f = (mu: number) => Math.max(0.05, Math.exp(Math.log(1 + mu) - sigma * sigma / 2 + sigma * z));
        return { nisa: f(r.nisaPct / 100), taxable: f(r.taxablePct / 100), dc: f(r.dcPct / 100 * 0.8) };
      },
    });
    let dep = false;
    res.rows.forEach((row, i) => { if (i < n) series[i].push(row.balances.netWorth); if (row.balances.liquid < 0) dep = true; });
    if (dep) depleted++;
  }
  const q = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
  const bands: McBand[] = base.rows.map((row, i) => ({ age: row.age, p10: q(series[i], 0.1), p25: q(series[i], 0.25), p50: q(series[i], 0.5), p75: q(series[i], 0.75), p90: q(series[i], 0.9) }));
  return { bands, depletionProb: depleted / paths, paths };
}
