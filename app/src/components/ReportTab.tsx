import { useEffect, useState } from "react";
import type { ScenarioResult } from "../lib/types";
import { generateReport, generateAnalysisPrompt } from "../lib/report";

/** Plain-text report (for pasting into an LLM) with copy / download actions. */
export function ReportTab({ results, rr, inflationRate, hasRet, retAmt, stateJson }: {
  results: ScenarioResult[]; rr: number; inflationRate: number; hasRet: boolean; retAmt: number; stateJson: string;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [includeAnalysis, setIncludeAnalysis] = useState(true);
  useEffect(() => {
    if (results.length) {
      const baseS = results[0]?.scenario ?? null;
      const parts = results.map((r, i) => generateReport(r, { rr, inflationRate, hasRet, retAmt }, i === 0, i === 0 ? null : baseS));
      const report = parts.join("\n\n" + "=".repeat(60) + "\n\n");
      const fullText = report + "\n\n【設定JSON（シミュレーター再現用）】\n```json\n" + stateJson + "\n```"
        + (includeAnalysis ? "\n\n" + generateAnalysisPrompt() : "");
      setText(fullText);
    }
  }, [results, rr, inflationRate, hasRet, retAmt, stateJson, includeAnalysis]);
  const download = () => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `lifeplan-report-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">ChatGPT等のLLMに貼り付けて相談できるテキストレポートです。</div>
      <div className="flex gap-2">
        <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white font-bold hover:bg-blue-700">{copied ? "コピー済み!" : "📋コピー"}</button>
        <button onClick={download} className="rounded border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">💾TXT保存</button>
        <span className="text-[10px] text-gray-400 self-center">{text.length.toLocaleString()}文字</span>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
        <input type="checkbox" checked={includeAnalysis} onChange={e => setIncludeAnalysis(e.target.checked)} className="rounded" />
        LLM分析チェック指示を含める
      </label>
      <textarea value={text} readOnly rows={24}
        className="w-full rounded border bg-gray-50 p-2 font-mono text-[10px] leading-tight text-gray-700 focus:outline-none" onClick={e => (e.target as HTMLTextAreaElement).select()} />
    </div>
  );
}
