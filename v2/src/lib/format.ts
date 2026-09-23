/** 表示用フォーマッタ。入力は円。 */
const MAN = 10_000;

/** 円 → "1,234万" / "1.6億" / "−350万" */
export function fmtMan(yen: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  if (!Number.isFinite(yen)) return "–";
  const man = Math.round(yen / MAN);
  const neg = man < 0;
  const abs = Math.abs(man);
  let body: string;
  if (opts.compact !== false && abs >= 10_000) {
    const oku = abs / 10_000;
    body = `${oku >= 100 ? Math.round(oku).toLocaleString("ja-JP") : oku.toFixed(oku >= 10 ? 1 : 2).replace(/\.?0+$/, "")}億`;
  } else body = `${abs.toLocaleString("ja-JP")}万`;
  const s = neg ? "−" : opts.sign && man > 0 ? "+" : "";
  return `${s}${body}`;
}

/** 円 → "12.3万" (月額などの小額用、小数1桁) */
export function fmtManFine(yen: number): string {
  if (!Number.isFinite(yen)) return "–";
  const man = yen / MAN;
  const neg = man < 0;
  const abs = Math.abs(man);
  const body = abs >= 100 ? Math.round(abs).toLocaleString("ja-JP") : abs.toFixed(1).replace(/\.0$/, "");
  return `${neg ? "−" : ""}${body}万`;
}

export function fmtYen(yen: number): string {
  if (!Number.isFinite(yen)) return "–";
  return `${yen < 0 ? "−" : ""}${Math.abs(Math.round(yen)).toLocaleString("ja-JP")}円`;
}

export function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** 軸ラベル用: 円 → 短い文字列 */
export function axisMan(yen: number): string {
  const man = Math.round(yen / MAN);
  if (man === 0) return "0";
  if (Math.abs(man) >= 10_000) return `${(man / 10_000).toFixed(Math.abs(man) % 10_000 === 0 ? 0 : 1)}億`;
  return `${man.toLocaleString("ja-JP")}万`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
