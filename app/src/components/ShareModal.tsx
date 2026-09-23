import { useRef, useState } from "react";
import type { ScenarioResult } from "../lib/types";
import type { SavedState } from "../lib/storage";
import { encodeStateToURL, exportJSON, importJSON, parseSavedStateText } from "../lib/storage";
import { ModalShell } from "./ui";
import { ReportTab } from "./ReportTab";

export type ShareModalMode = "export" | "import" | "report";

const TITLES: Record<ShareModalMode, string> = {
  export: "シナリオ共有", report: "📋 総合レポート", import: "シナリオ読込",
};

/** Share link / JSON export, JSON import (paste or file), and the text report. */
export function ShareModal({ mode, onClose, state, results, onImport }: {
  mode: ShareModalMode;
  onClose: () => void;
  state: SavedState;
  results: ScenarioResult[];
  onImport: (data: SavedState) => void;
}) {
  const stateJson = JSON.stringify(state, null, 2);
  return (
    <ModalShell onClose={onClose} maxWidthClass="max-w-2xl"
      backdropClass="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 pt-8">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-bold">{TITLES[mode]}</p>
        <button onClick={onClose} className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100">閉じる</button>
      </div>
      <div className="p-4 space-y-3">
        {mode === "export" && <ExportPane state={state} stateJson={stateJson} />}
        {mode === "report" && (
          <ReportTab results={results} rr={state.rr} inflationRate={state.inflationRate} hasRet={state.hasRet} retAmt={state.retAmt} stateJson={stateJson} />
        )}
        {mode === "import" && <ImportPane onImport={data => { onImport(data); onClose(); }} />}
      </div>
    </ModalShell>
  );
}

function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return [copied, copy];
}

function ExportPane({ state, stateJson }: { state: SavedState; stateJson: string }) {
  const [shareUrl, setShareUrl] = useState("");
  const [copied, copy] = useCopied();
  return (<>
    {/* 共有リンク */}
    <div className="rounded border border-blue-200 bg-blue-50 p-3 space-y-2">
      <div className="text-xs font-bold text-blue-700">共有リンク</div>
      {shareUrl ? (
        <div className="space-y-1">
          <input value={shareUrl} readOnly className="w-full rounded border bg-white px-2 py-1.5 font-mono text-[10px] text-gray-600" onClick={e => (e.target as HTMLInputElement).select()} />
          <div className="flex gap-2">
            <button onClick={() => copy(shareUrl)}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white font-bold hover:bg-blue-700">
              {copied ? "コピーしました!" : "リンクをコピー"}
            </button>
            <span className="text-[10px] text-gray-400 self-center">URLを共有するだけで同じシナリオを再現できます</span>
          </div>
        </div>
      ) : (
        <button onClick={async () => {
          const encoded = await encodeStateToURL(state);
          setShareUrl(`${window.location.origin}${window.location.pathname}#${encoded}`);
        }} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white font-bold hover:bg-blue-700">共有リンクを生成</button>
      )}
    </div>
    {/* JSON */}
    <details className="rounded border p-3">
      <summary className="cursor-pointer text-xs text-gray-500">JSON（詳細）</summary>
      <div className="mt-2 space-y-2">
        <textarea value={stateJson} readOnly rows={12}
          className="w-full rounded border bg-gray-50 p-2 font-mono text-[10px] leading-tight text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
          onClick={e => (e.target as HTMLTextAreaElement).select()} />
        <div className="flex gap-2">
          <button onClick={() => copy(stateJson)}
            className="rounded border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">JSONをコピー</button>
          <button onClick={() => exportJSON(state)}
            className="rounded border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">ファイル保存</button>
        </div>
      </div>
    </details>
  </>);
}

function ImportPane({ onImport }: { onImport: (data: SavedState) => void }) {
  const [jsonText, setJsonText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importText = () => {
    const data = parseSavedStateText(jsonText);
    if (!data) { alert("JSONの形式が正しくありません"); return; }
    onImport(data);
  };
  const importFile = async (f: File) => {
    const data = await importJSON(f);
    if (!data) { alert("ファイルの読み込みに失敗しました"); return; }
    onImport(data);
  };
  return (<>
    <div className="text-xs text-gray-500">共有されたJSONを貼り付けるか、ファイルを選択してください。</div>
    <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} rows={15} placeholder="JSONをここに貼り付け..."
      className="w-full rounded border p-2 font-mono text-[10px] leading-tight text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
    <div className="flex gap-2">
      <button onClick={importText} className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white font-bold hover:bg-blue-700" disabled={!jsonText.trim()}>
        読み込む
      </button>
      <button onClick={() => fileInputRef.current?.click()}
        className="rounded border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">ファイルから読込</button>
      <input ref={fileInputRef} type="file" accept=".json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
    </div>
  </>);
}
