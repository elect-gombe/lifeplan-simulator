import type { TaxOpts } from "./types";

export const BRACKETS = [
  { lo: 0, hi: 1950000, r: 5 },
  { lo: 1950000, hi: 3300000, r: 10 },
  { lo: 3300000, hi: 6950000, r: 20 },
  { lo: 6950000, hi: 9000000, r: 23 },
  { lo: 9000000, hi: 18000000, r: 33 },
  { lo: 18000000, hi: 40000000, r: 40 },
  { lo: 40000000, hi: 9e15, r: 45 },
];

export function empDed(g: number): number {
  if (g <= 1625000) return 550000;
  if (g <= 1800000) return g * 0.4 - 100000;
  if (g <= 3600000) return g * 0.3 + 80000;
  if (g <= 6600000) return g * 0.2 + 440000;
  if (g <= 8500000) return g * 0.1 + 1100000;
  return 1950000;
}

export function iTx(ti: number): number {
  if (ti <= 0) return 0;
  let t = 0;
  for (const b of BRACKETS) {
    if (ti <= b.lo) break;
    t += ((Math.min(ti, b.hi) - b.lo) * b.r) / 100;
  }
  return Math.floor(t);
}

export function mR(ti: number): number {
  for (const b of BRACKETS) {
    if (ti <= b.hi) return b.r;
  }
  return 45;
}

export function rTx(ti: number): number {
  return Math.floor(Math.max(ti, 0) * 0.1);
}

export function txInc(g: number, opts?: TaxOpts & { dependentDeductionTotal?: number }): number {
  const o = opts || {} as TaxOpts;
  // Use precise dependent deduction if provided, otherwise fallback to count * 380000
  const depDed = o.dependentDeductionTotal != null
    ? o.dependentDeductionTotal
    : Math.max(Number(o.dependentsCount) || 0, 0) * 380000;
  const spouseDed = o.hasSpouseDeduction ? 380000 : 0;
  const lifeDed = Math.max(Number(o.lifeInsuranceDeduction) || 0, 0);
  return Math.max(g - empDed(g) - g * 0.15 - 480000 - depDed - spouseDed - lifeDed, 0);
}

export function hlResidentCap(ti: number): number {
  return Math.min(Math.floor(Math.max(ti, 0) * 0.05), 97500);
}

export function apTxCr(it: number, rt: number, cr: number, ti: number) {
  const credit = Math.max(Number(cr) || 0, 0);
  const residentCap = hlResidentCap(ti);
  const itUsed = Math.min(Math.max(it, 0), credit);
  const rest = Math.max(credit - itUsed, 0);
  const rtUsed = Math.min(Math.max(rt, 0), rest, residentCap);
  return { it: Math.max(it - itUsed, 0), rt: Math.max(rt - rtUsed, 0), used: itUsed + rtUsed, itUsed, rtUsed, residentCap };
}

export function fLm(ti: number, mr: number): number {
  const d = 0.9 - (mr / 100) * 1.021;
  return d > 0 ? Math.floor((Math.max(ti, 0) * 0.1 * 0.2) / d + 2000) : 0;
}

export function calcFurusatoDonation(limit: number): number {
  return Math.max(Math.floor(Math.max(limit, 0) / 1000) * 1000, 0);
}

export function fvA(a: number, r: number, n: number): number {
  return r === 0 ? a * n : a * ((Math.pow(1 + r, n) - 1) / r);
}

export function rDed(y: number): number {
  return y <= 20 ? Math.max(400000 * y, 800000) : 8000000 + 700000 * (y - 20);
}

export function rTxC(amt: number, ded: number): number {
  const h = Math.max(Math.floor((amt - ded) / 2), 0);
  return iTx(h) + Math.floor(h * 0.1);
}
