/**
 * 年表: FP のキャッシュフロー表。
 * 収入（項目別 → 収入合計）→ 支出（項目別 → 支出合計）→ 収支（収入合計 − 支出合計 → 運用への振替 → 現金増減）→ 残高（年間収支・各残高 → 流動資産・純資産）
 * が列として連続し、各グループの合計列は太字。グループ単位でも全列でも表示できる。
 */
import { useMemo, useState, useDeferredValue } from "react";
import { Download, X } from "lucide-react";
import { useActivePlan, useStore } from "@/state/store";
import { useSim } from "@/state/useSim";
import type { YearRow } from "@/engine/simulate";
import type { Plan } from "@/domain/model";
import { Card, Segmented, cx } from "@/ui/primitives";
import { fmtMan } from "@/lib/format";
import { MAN } from "@/engine/constants";
import { YearStatement } from "@/features/dashboard/YearStatement";

type GroupKey = "income" | "expense" | "cashflow" | "balance" | "gross";
type Col = { key: string; label: string; get: (r: YearRow, prev: YearRow | undefined, plan: Plan) => number; total?: boolean; note?: string };
type Group = { key: GroupKey; label: string; cols: Col[] };

const sumIn = (r: YearRow, pred: (f: YearRow["inflows"][number]) => boolean) => r.inflows.filter(pred).reduce((a, f) => a + f.amount, 0);
const isSalaryOf = (member: "self" | "spouse") => (f: YearRow["inflows"][number]) => f.category === "salary" && f.member === member;
const isSeverance = (f: YearRow["inflows"][number]) => f.category === "salary" && f.label.includes("退職金");

const GROUPS: Group[] = [
  {
    key: "income", label: "収入（手取り）", cols: [
      { key: "inSelf", label: "本人 給与", get: r => sumIn(r, isSalaryOf("self")) },
      { key: "inSpouse", label: "配偶者 給与", get: r => sumIn(r, isSalaryOf("spouse")) },
      { key: "inPension", label: "年金", get: r => sumIn(r, f => f.category === "pension"), note: "公的年金・DC年金・遺族年金（手取り）" },
      { key: "inPublic", label: "手当・給付", get: r => sumIn(r, f => f.category === "public"), note: "児童手当・育児休業給付金" },
      { key: "inInsurance", label: "保険金", get: r => sumIn(r, f => f.category === "insurance") },
      { key: "inAsset", label: "資産の受取", get: r => sumIn(r, f => f.category === "asset" || isSeverance(f)), note: "退職金・DC一時金・住宅売却・死亡一時金など" },
      { key: "inOther", label: "その他", get: r => sumIn(r, f => f.category === "other") },
      { key: "inTotal", label: "収入合計", get: r => r.totalIn, total: true },
    ],
  },
  {
    key: "expense", label: "支出", cols: [
      { key: "living", label: "基本生活費", get: r => r.byCategory.living },
      { key: "housing", label: "住居", get: r => r.byCategory.housing },
      { key: "education", label: "教育", get: r => r.byCategory.education },
      { key: "childcare", label: "養育・出産", get: r => r.byCategory.childcare },
      { key: "insurance", label: "保険料", get: r => r.byCategory.insurance },
      { key: "car", label: "車", get: r => r.byCategory.car },
      { key: "other", label: "その他", get: r => r.byCategory.other, note: "イベント・iDeCo 拠出・葬儀など" },
      { key: "tax", label: "税（一時）", get: r => r.byCategory.tax, note: "相続税・譲渡税・特定口座の譲渡益税" },
      { key: "outTotal", label: "支出合計", get: r => r.totalOut, total: true },
    ],
  },
  {
    key: "cashflow", label: "収支", cols: [
      { key: "cfIn", label: "収入合計", get: r => r.totalIn },
      { key: "cfOut", label: "支出合計", get: r => -r.totalOut },
      { key: "net", label: "年間収支", get: r => r.net, total: true },
      { key: "invest", label: "運用への振替", get: r => -(r.flows.nisaIn + r.flows.taxableIn) + r.flows.nisaOut + r.flows.taxableOut, note: "NISA・特定口座への積立（−）／取り崩し（＋、計画的な取り崩しを含む）。取り崩し時の譲渡益税は支出の「税（一時）」に含む" },
      { key: "cashDelta", label: "現金の増減", get: (r, p, plan) => r.balances.cash - (p ? p.balances.cash : plan.assets.cash * MAN), total: true, note: "年間収支 ＋ 運用への振替 ＋ 預金利息" },
    ],
  },
  {
    key: "balance", label: "年末残高", cols: [
      { key: "bNet", label: "年間収支", get: r => r.net },
      { key: "cash", label: "現金・預金", get: r => r.balances.cash },
      { key: "nisa", label: "NISA", get: r => r.balances.nisa },
      { key: "taxable", label: "特定口座", get: r => r.balances.taxable },
      { key: "liquid", label: "流動資産", get: r => r.balances.liquid, total: true, note: "現金 ＋ NISA ＋ 特定口座（税引後）" },
      { key: "dc", label: "DC・iDeCo", get: r => r.balances.dc },
      { key: "home", label: "住宅（時価）", get: r => r.balances.home },
      { key: "loan", label: "住宅ローン", get: r => -r.balances.loan },
      { key: "nw", label: "純資産", get: r => r.balances.netWorth, total: true, note: "流動資産 ＋ DC ＋ 住宅 − ローン" },
    ],
  },
  {
    key: "gross", label: "額面と税・社会保険", cols: [
      { key: "sSal", label: "本人 額面", get: r => r.self.salary + r.self.publicPension + r.self.dcAnnuity },
      { key: "sTax", label: "本人 税・社保", get: r => -(r.self.tax ? r.self.tax.incomeTax + r.self.tax.residentTax + r.self.tax.socialInsurance.total : 0) },
      { key: "sTake", label: "本人 手取り", get: r => r.self.tax?.takeHome ?? 0, total: true },
      { key: "pSal", label: "配偶者 額面", get: r => (r.spouse ? r.spouse.salary + r.spouse.publicPension + r.spouse.dcAnnuity : 0) },
      { key: "pTax", label: "配偶者 税・社保", get: r => -(r.spouse?.tax ? r.spouse.tax.incomeTax + r.spouse.tax.residentTax + r.spouse.tax.socialInsurance.total : 0) },
      { key: "pTake", label: "配偶者 手取り", get: r => r.spouse?.tax?.takeHome ?? 0, total: true },
      { key: "dcIn", label: "DC 拠出", get: r => r.flows.dcIn, note: "事業主掛金・選択制・iDeCo の合計" },
    ],
  },
];

export function YearTable() {
  const { plan: livePlan } = useActivePlan();
  const plan = useDeferredValue(livePlan);
  const { state, dispatch } = useStore();
  const { res } = useSim(plan);
  const [view, setView] = useState<GroupKey | "all">("cashflow");
  const groups = useMemo(() => (view === "all" ? GROUPS : GROUPS.filter(g => g.key === view)), [view]);
  const rows = res.rows;
  const selected = state.selectedAge != null ? rows.find(r => r.age === state.selectedAge) : null;

  const csv = () => {
    const cols = GROUPS.flatMap(g => g.cols.map(c => ({ ...c, label: `${g.label} ${c.label}` })));
    const head = ["年齢", "年", ...cols.map(c => c.label), "イベント"].join(",");
    const lines = rows.map((r, i) => [r.age, r.year, ...cols.map(c => Math.round(c.get(r, rows[i - 1], plan) / 10000)), `"${r.markers.join("・")}"`].join(","));
    const blob = new Blob(["﻿" + [head, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${plan.name}-年表.csv`; a.click();
  };

  // 合計行（生涯）
  const lifetime = (c: Col) => rows.reduce((a, r, i) => a + c.get(r, rows[i - 1], plan), 0);
  const isFlowGroup = (g: Group) => g.key === "income" || g.key === "expense" || g.key === "cashflow" || g.key === "gross";

  return (
    <div className="space-y-4 fade-in">
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b line">
          <h2 className="text-sm font-semibold ink mr-2">年表（万円・名目）</h2>
          <Segmented size="sm" value={view} onChange={setView} options={[...GROUPS.map(g => ({ value: g.key as GroupKey | "all", label: g.label })), { value: "all", label: "すべて" }]} />
          <span className="hint hidden lg:inline">行をクリックで、その年の収支表を下に表示</span>
          <button onClick={csv} className="btn btn-outline text-xs ml-auto"><Download size={14} />CSV（全列）</button>
        </div>
        <div className={cx("overflow-auto scroll-thin", selected ? "lg:max-h-[45vh]" : "lg:max-h-[calc(100vh-230px)]")}>
          <table className="text-xs tabular border-collapse min-w-full">
            <thead className="sticky top-0 z-10 surface-2">
              <tr>
                <th rowSpan={2} className="text-left px-3 py-1.5 font-medium ink-2 sticky left-0 surface-2 z-20 border-b line whitespace-nowrap">年齢</th>
                <th rowSpan={2} className="text-left px-2 py-1.5 font-medium ink-2 border-b line">年</th>
                {groups.map(g => <th key={g.key} colSpan={g.cols.length} className="text-left px-2 py-1 font-semibold ink border-b border-l line whitespace-nowrap">{g.label}</th>)}
                <th rowSpan={2} className="text-left px-3 py-1.5 font-medium ink-2 border-b border-l line">できごと</th>
              </tr>
              <tr>
                {groups.flatMap(g => g.cols.map((c, i) => (
                  <th key={`${g.key}.${c.key}`} title={c.note} className={cx("text-right px-2 py-1.5 whitespace-nowrap border-b line", i === 0 && "border-l", c.total ? "font-semibold ink" : "font-medium ink-2", c.note && "underline decoration-dotted decoration-[var(--ink-3)] cursor-help")}>{c.label}</th>
                )))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sel = state.selectedAge === r.age;
                const prev = rows[i - 1];
                return (
                  <tr key={r.age} tabIndex={0} aria-selected={sel} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); dispatch({ type: "ui/selectAge", age: sel ? null : r.age }); } }} onClick={() => dispatch({ type: "ui/selectAge", age: sel ? null : r.age })}
                    className={cx("border-b line cursor-pointer hover:surface-2", sel && "bg-[var(--accent-soft)]", r.age === plan.self.retireAge && "font-semibold")}>
                    <td className="px-3 py-1.5 sticky left-0 surface-1 ink z-[1]">{r.age}</td>
                    <td className="px-2 py-1.5 ink-3">{r.year}</td>
                    {groups.flatMap(g => g.cols.map((c, ci) => {
                      const v = c.get(r, prev, plan);
                      return (
                        <td key={`${g.key}.${c.key}`} className={cx("px-2 py-1.5 text-right whitespace-nowrap", ci === 0 && "border-l line", c.total && "font-semibold surface-2/40", v < 0 ? "text-[var(--critical)]" : "ink")}>
                          {Math.abs(v) < 5000 ? <span className="ink-3">–</span> : fmtMan(v, { compact: false })}
                        </td>
                      );
                    }))}
                    <td className="px-3 py-1.5 ink-2 whitespace-nowrap border-l line">{r.markers.join("・")}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 surface-2 z-10">
              <tr className="border-t-2 line font-semibold">
                <td className="px-3 py-1.5 sticky left-0 surface-2 ink z-20 whitespace-nowrap">生涯合計</td>
                <td className="px-2 py-1.5 ink-3">{rows.length}年</td>
                {groups.flatMap(g => g.cols.map((c, ci) => {
                  if (!isFlowGroup(g)) return <td key={`${g.key}.${c.key}`} className={cx("px-2 py-1.5 text-right ink-3", ci === 0 && "border-l line")}>{ci === g.cols.length - 1 ? "最終年 " + fmtMan(c.get(rows[rows.length - 1], rows[rows.length - 2], plan)) : ""}</td>;
                  const v = lifetime(c);
                  return <td key={`${g.key}.${c.key}`} className={cx("px-2 py-1.5 text-right whitespace-nowrap", ci === 0 && "border-l line", v < 0 ? "text-[var(--critical)]" : "ink")}>{Math.abs(v) < 5000 ? "–" : fmtMan(v)}</td>;
                }))}
                <td className="border-l line" />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="hint px-4 py-2 border-t line">
          収入合計 ＝ 各収入列の合計（手取りベース）。年間収支 ＝ 収入合計 − 支出合計。現金の増減 ＝ 年間収支 ＋ 運用への振替 ＋ 預金利息。純資産 ＝ 流動資産 ＋ DC ＋ 住宅 − ローン。列見出しにカーソルを合わせると内訳の説明が出ます。
        </p>
      </Card>
      {selected && (
        <Card title={`${selected.age}歳（${selected.year}年）の収支表`} right={<button onClick={() => dispatch({ type: "ui/selectAge", age: null })} className="btn btn-ghost px-2" aria-label="閉じる"><X size={16} /></button>}>
          <YearStatement rows={rows} age={selected.age} onChangeAge={a => dispatch({ type: "ui/selectAge", age: a })} plan={plan} />
        </Card>
      )}
    </div>
  );
}
