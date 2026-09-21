/**
 * 1年分の詳細な収支表（FP のキャッシュフロー表の 1 列を縦に展開したもの）。
 * 収入（額面→控除→手取り）、非課税の収入、支出（カテゴリ別）、運用フロー、年末残高。
 */
import { ChevronLeft, ChevronRight, ClipboardCopy, Check } from "lucide-react";
import { useState } from "react";
import type { Plan } from "@/domain/model";
import type { YearRow, MemberYear, CostCategory } from "@/engine/simulate";
import { fmtYen, fmtMan } from "@/lib/format";
import { cx } from "@/ui/primitives";

type Line = { label: string; value: number | null; kind?: "head" | "sub" | "total" | "note"; note?: string; indent?: number };

const CAT_LABEL: Record<CostCategory, string> = { living: "基本生活費", housing: "住居", education: "教育", childcare: "養育・出産", insurance: "保険", car: "車", other: "その他", tax: "税（一時）" };
const CAT_ORDER: CostCategory[] = ["living", "housing", "education", "childcare", "insurance", "car", "other", "tax"];

function memberLines(m: MemberYear, name: string): Line[] {
  if (!m.alive) return [{ label: `${name}`, value: null, kind: "head", note: "—" }];
  const t = m.tax;
  const out: Line[] = [{ label: `${name}（${m.age}歳）`, value: null, kind: "head" }];
  if (!t || t.gross <= 0) {
    if (m.survivorPension) out.push({ label: "遺族年金（非課税）", value: m.survivorPension, indent: 1 });
    if (t && t.takeHome < 0) out.push({ label: "社会保険料（国保・年金）", value: null, kind: "note", indent: 1, note: `${fmtMan(-t.takeHome)} を支出「その他」に計上` });
    if (out.length === 1) out.push({ label: "課税所得なし", value: null, kind: "note", indent: 1 });
    return out;
  }
  if (m.salary > 0) out.push({ label: "給与（額面）", value: m.salary, indent: 1, note: m.leaveMonths ? `育休 ${m.leaveMonths}ヶ月` : undefined });
  if (m.matching > 0) out.push({ label: "選択制DC 拠出（給与から）", value: -m.matching, indent: 1 });
  if (m.publicPension > 0) out.push({ label: "公的年金（額面）", value: m.publicPension, indent: 1, note: m.pensionReduction ? `在職老齢年金 −${fmtMan(m.pensionReduction)}` : undefined });
  if (m.dcAnnuity > 0) out.push({ label: "DC/iDeCo 年金受取", value: m.dcAnnuity, indent: 1 });
  if (m.otherTaxable > 0) out.push({ label: "その他の課税収入", value: m.otherTaxable, indent: 1 });
  out.push({ label: "所得税", value: -t.incomeTax, indent: 1, note: `課税所得 ${fmtMan(t.taxableIt)}・限界税率 ${Math.round(t.marginalRate * 100)}%` });
  out.push({ label: "住民税", value: -t.residentTax, indent: 1 });
  const si = t.socialInsurance;
  if (si.health + si.nursing) out.push({ label: "健康保険・介護保険", value: -(si.health + si.nursing), indent: 1 });
  if (si.pension) out.push({ label: "厚生年金・国民年金", value: -si.pension, indent: 1 });
  if (si.employment + si.childSupport) out.push({ label: "雇用保険・子育て支援金", value: -(si.employment + si.childSupport), indent: 1 });
  if (t.furusatoDonation) out.push({ label: "ふるさと納税（寄附）", value: -t.furusatoDonation, indent: 1, note: "税は寄附控除後" });
  if (t.housingLoanCreditUsed) out.push({ label: "住宅ローン控除（税額控除）", value: null, kind: "note", indent: 1, note: `${fmtMan(t.housingLoanCreditUsed)} を税額から控除済み` });
  out.push({ label: "手取り", value: t.takeHome, kind: "sub", indent: 1 });
  if (m.ideco) out.push({ label: "iDeCo 拠出", value: null, kind: "note", indent: 1, note: `${fmtMan(m.ideco)} を支出「その他」に計上` });
  if (m.survivorPension) out.push({ label: "遺族年金（非課税）", value: m.survivorPension, indent: 1 });
  if (m.companyDc) out.push({ label: "企業型DC 事業主掛金", value: null, kind: "note", indent: 1, note: `${fmtMan(m.companyDc)}/年（給与外・DC残高へ）` });
  return out;
}

export function buildStatement(row: YearRow, prev: YearRow | undefined, plan: Plan): { title: string; lines: Line[] }[] {
  const sections: { title: string; lines: Line[] }[] = [];
  // 収入
  const inc: Line[] = [...memberLines(row.self, plan.self.name)];
  if (row.spouse && plan.spouse) inc.push(...memberLines(row.spouse, plan.spouse.name));
  const otherIn = row.inflows.filter(f => !["salary", "pension"].includes(f.category) || /退職金|一時金/.test(f.label));
  if (otherIn.length) {
    inc.push({ label: "その他の収入", value: null, kind: "head" });
    for (const f of otherIn) inc.push({ label: f.label, value: f.amount, indent: 1, note: f.note });
  }
  inc.push({ label: "収入合計（手取りベース）", value: row.totalIn, kind: "total" });
  sections.push({ title: "収入", lines: inc });
  // 支出
  const exp: Line[] = [];
  for (const cat of CAT_ORDER) {
    const items = row.outflows.filter(f => f.category === cat);
    if (!items.length) continue;
    exp.push({ label: CAT_LABEL[cat], value: -row.byCategory[cat], kind: "head" });
    for (const f of items) exp.push({ label: f.label, value: -f.amount, indent: 1, note: f.note ?? (f.oneOff ? "一時" : undefined) });
  }
  exp.push({ label: "支出合計", value: -row.totalOut, kind: "total" });
  sections.push({ title: "支出", lines: exp });
  // 収支・運用
  const fl: Line[] = [{ label: "年間収支（収入 − 支出）", value: row.net, kind: "total" }];
  const f = row.flows;
  if (f.nisaIn) fl.push({ label: "NISA 積立", value: -f.nisaIn, indent: 1 });
  if (f.nisaOut) fl.push({ label: f.planned ? "NISA 取り崩し（計画分を含む）" : "NISA 取り崩し", value: f.nisaOut, indent: 1 });
  if (f.taxableIn) fl.push({ label: "特定口座 積立", value: -f.taxableIn, indent: 1 });
  if (f.taxableOut) fl.push({ label: "特定口座 取り崩し", value: f.taxableOut, indent: 1, note: f.taxableTax ? `譲渡益税 ${fmtMan(f.taxableTax)}` : undefined });
  if (f.dcIn) fl.push({ label: "DC/iDeCo への拠出合計", value: null, kind: "note", indent: 1, note: fmtMan(f.dcIn) });
  const cashDelta = prev ? row.balances.cash - prev.balances.cash : null;
  if (cashDelta != null) fl.push({ label: "現金の増減", value: cashDelta, kind: "sub" });
  sections.push({ title: "収支と運用", lines: fl });
  // 残高
  const b = row.balances, pb = prev?.balances;
  const bal = (label: string, v: number, pv?: number): Line => ({ label, value: v, indent: 1, note: pv != null && v !== pv ? `前年比 ${fmtMan(v - pv, { sign: true })}` : undefined });
  sections.push({
    title: `年末残高（${row.year}年末）`, lines: [
      bal("現金・預金", b.cash, pb?.cash), bal("NISA", b.nisa, pb?.nisa), bal("特定口座", b.taxable, pb?.taxable), bal("DC・iDeCo", b.dc, pb?.dc),
      ...(b.home || pb?.home ? [bal("住宅（時価）", b.home, pb?.home)] : []), ...(b.loan || pb?.loan ? [bal("住宅ローン", -b.loan, pb ? -pb.loan : undefined)] : []),
      { label: "流動資産（現金＋NISA＋特定）", value: b.liquid, kind: "sub" },
      { label: "純資産", value: b.netWorth, kind: "total", note: pb ? `前年比 ${fmtMan(b.netWorth - pb.netWorth, { sign: true })}` : undefined },
    ],
  });
  return sections;
}

export function YearStatement({ rows, age, onChangeAge, plan }: { rows: YearRow[]; age: number; onChangeAge: (a: number) => void; plan: Plan }) {
  const idx = rows.findIndex(r => r.age === age);
  const row = rows[idx];
  const [copied, setCopied] = useState(false);
  if (!row) return null;
  const sections = buildStatement(row, rows[idx - 1], plan);
  const copy = async () => {
    const tsv = sections.flatMap(s => [s.title, ...s.lines.map(l => `${"  ".repeat(l.indent ?? 0)}${l.label}\t${l.value != null ? Math.round(l.value) : ""}\t${l.note ?? ""}`)]).join("\n");
    try { await navigator.clipboard.writeText(`${plan.name} ${row.age}歳（${row.year}年）収支表（円）\n${tsv}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => onChangeAge(age - 1)} disabled={idx <= 0} className="btn btn-ghost px-1.5" aria-label="前の年"><ChevronLeft size={16} /></button>
        <select value={age} onChange={e => onChangeAge(Number(e.target.value))} className="field w-auto py-1 text-sm">
          {rows.map(r => <option key={r.age} value={r.age}>{r.age}歳（{r.year}年）{r.markers.length ? ` — ${r.markers.join("・")}` : ""}</option>)}
        </select>
        <button onClick={() => onChangeAge(age + 1)} disabled={idx >= rows.length - 1} className="btn btn-ghost px-1.5" aria-label="次の年"><ChevronRight size={16} /></button>
        <span className="hint">単位: 円（名目）。子: {row.childAges.filter(a => a >= 0).map(a => `${a}歳`).join("・") || "—"}</span>
        <button onClick={copy} className="btn btn-outline text-xs ml-auto">{copied ? <><Check size={13} />コピー済</> : <><ClipboardCopy size={13} />表をコピー</>}</button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {sections.map(s => (
          <table key={s.title} className="w-full text-xs tabular border-collapse card overflow-hidden self-start">
            <thead><tr className="surface-2"><th colSpan={2} className="text-left px-3 py-1.5 font-semibold ink">{s.title}</th></tr></thead>
            <tbody>
              {s.lines.map((l, i) => (
                <tr key={i} className={cx("border-t line", l.kind === "head" && "surface-2/50", l.kind === "total" && "font-semibold surface-2", l.kind === "sub" && "font-medium")}>
                  <td className={cx("px-3 py-1", l.kind === "head" ? "ink font-medium" : l.kind === "note" ? "ink-3" : "ink-2")} style={{ paddingLeft: `${12 + (l.indent ?? 0) * 14}px` }}>
                    {l.label}{l.note && <span className="ink-3 ml-1.5 text-[10px]">{l.note}</span>}
                  </td>
                  <td className={cx("px-3 py-1 text-right whitespace-nowrap", l.value != null && l.value < 0 ? "text-[var(--critical)]" : "ink", l.kind === "head" && "ink-2")}>
                    {l.value != null ? (l.value < 0 ? `−${fmtYen(Math.abs(l.value))}` : fmtYen(l.value)) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
