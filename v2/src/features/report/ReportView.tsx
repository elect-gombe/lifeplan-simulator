/** レポート: 印刷・PDF 向けの要約ページ。 */
import { useDeferredValue, useMemo, useState } from "react";
import { ClipboardCopy, Check, Download, FileText } from "lucide-react";
import { PrintReport } from "./PrintReport";
import { useActivePlan, useStore, useResolvedPlans } from "@/state/store";
import { useSim, runSim } from "@/state/useSim";
import { generateTextReport } from "@/lib/reportText";
import { Toggle, Segmented } from "@/ui/primitives";
import { Card } from "@/ui/primitives";

export function ReportView() {
  const { plan: livePlan } = useActivePlan();
  const plan = useDeferredValue(livePlan);
  const { res, summary } = useSim(plan);
  const { state } = useStore();
  const resolvedAll = useDeferredValue(useResolvedPlans());
  const comparePlans = resolvedAll.filter(p => state.compareIds.includes(p.id) || p.id === plan.id);
  return (
    <div className="space-y-4 fade-in max-w-5xl mx-auto">
      <TextReportCard />
      <PrintReport plan={plan} res={res} summary={summary} comparePlans={comparePlans} />
    </div>
  );
}

/** LLM 相談用のテキストレポート（旧版の「📋レポート」を継承・拡張） */
function TextReportCard() {
  const { state: liveState } = useStore();
  const state = useDeferredValue(liveState);
  const resolved = useDeferredValue(useResolvedPlans());
  const [scope, setScope] = useState<"active" | "compare">("compare");
  const [llm, setLlm] = useState(true);
  const [json, setJson] = useState(true);
  const [interval, setInterval] = useState(5);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const text = useMemo(() => {
    const ids = scope === "active" ? [state.activeId] : (state.compareIds.length ? state.compareIds : [state.activeId]);
    const items = resolved.filter(p => ids.includes(p.id)).map(p => ({ plan: p, raw: state.plans.find(r => r.id === p.id), ...runSim(p) }));
    return generateTextReport(items, resolved, { llmPrompt: llm, detailInterval: interval, json: json ? JSON.stringify({ version: 2, plans: state.plans.filter(p => ids.includes(p.id)), activeId: state.activeId }) : undefined });
  }, [scope, llm, json, interval, resolved, state.plans, state.activeId, state.compareIds]);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const download = () => { const blob = new Blob([text], { type: "text/markdown;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lifeplan-report-${new Date().toISOString().slice(0, 10)}.md`; a.click(); };
  return (
    <Card title={<span className="inline-flex items-center gap-2"><FileText size={16} />テキストレポート（ChatGPT 等に貼って相談）</span>}
      subtitle="前提サマリー・毎年の表（収入/税・支出/収支・残高）・5年ごとの計算根拠・総括を Markdown で出力。末尾に再現用 JSON と分析指示プロンプトを付けられます。" className="no-print">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented size="sm" value={scope} onChange={setScope} options={[{ value: "compare", label: `比較中の ${state.compareIds.length || 1} プラン` }, { value: "active", label: "このプランだけ" }]} />
        <Segmented size="sm" value={interval} onChange={setInterval} options={[{ value: 1, label: "根拠: 毎年" }, { value: 5, label: "5年ごと" }, { value: 10, label: "10年ごと" }]} />
        <Toggle checked={llm} onChange={setLlm} label="LLM 分析指示を付ける" help="旧版から継承した分析指示（事実整理→主因分解→重要論点→改善提案）。" />
        <Toggle checked={json} onChange={setJson} label="設定 JSON を付ける" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={copy} className="btn btn-primary">{copied ? <><Check size={15} />コピーしました</> : <><ClipboardCopy size={15} />レポートをコピー</>}</button>
        <button onClick={download} className="btn btn-outline"><Download size={15} />.md を保存</button>
        <button onClick={() => setOpen(o => !o)} className="btn btn-ghost text-xs">{open ? "プレビューを隠す" : "プレビューを表示"}</button>
        <span className="hint ml-auto">{text.length.toLocaleString()} 文字</span>
      </div>
      {open && <textarea readOnly value={text} rows={22} className="field mt-3 font-mono text-[11px] leading-snug" onClick={e => (e.target as HTMLTextAreaElement).select()} />}
    </Card>
  );
}
