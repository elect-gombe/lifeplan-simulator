export function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  const r = Math.round(n);
  return (r < 0 ? "▲" : "") + Math.abs(r).toLocaleString("ja-JP");
}

export function fmtMan(n: number): string {
  return Math.round(n / 10000).toLocaleString("ja-JP") + "万";
}
