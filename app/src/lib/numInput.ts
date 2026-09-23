/**
 * Pure helpers for the numeric input field (NumField).
 * Kept free of React so they can be unit-tested directly.
 */

/** Normalize full-width digits / punctuation and strip thousands separators. */
export function normalizeNumericText(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, ".")
    .replace(/[－ー−]/g, "-")
    .replace(/[,，、\s_]/g, "")
    .trim();
}

/** Parse user text into a finite number, or null when it is not (yet) a complete number. */
export function parseNumericText(raw: string): number | null {
  const t = normalizeNumericText(raw);
  if (t === "" || t === "-" || t === "." || t === "-.") return null;
  if (!/^-?\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function clampNumber(v: number, min?: number, max?: number): number {
  let r = v;
  if (min != null && r < min) r = min;
  if (max != null && r > max) r = max;
  return r;
}

/** Number of decimals implied by a step (0.25 → 2, 1000 → 0). */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

/** Round to the precision implied by `step` (avoids 0.1+0.2 artefacts when stepping). */
export function roundToStep(v: number, step: number): number {
  const d = stepDecimals(step);
  return Number(v.toFixed(Math.min(d, 10)));
}

/** Step `value` by `dir` * `step` (× `mult`), clamped to [min, max]. */
export function stepValue(value: number, dir: 1 | -1, step: number, mult = 1, min?: number, max?: number): number {
  const next = roundToStep(value + dir * step * mult, step);
  return clampNumber(next, min, max);
}

/** Display formatting for an unfocused field: thousands separators, up to 4 decimals. */
export function formatNumericDisplay(v: number): string {
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("ja-JP", { maximumFractionDigits: 4 });
}
