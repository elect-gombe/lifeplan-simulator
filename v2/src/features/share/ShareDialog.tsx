/** 共有・保存: URL 共有、JSON エクスポート/インポート（旧形式の取り込みにも対応）。 */
import { useEffect, useState } from "react";
import { Link2, Download, Upload, Check, ClipboardPaste } from "lucide-react";
import { useStore } from "@/state/store";
import { Modal, cx } from "@/ui/primitives";
import { encodeShared, downloadJSON, readJSONFile, parseState } from "@/lib/persist";

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    encodeShared(state.plans, state.activeId).then(h => setUrl(`${location.origin}${location.pathname}#p=${h}`));
  }, [open, state.plans, state.activeId]);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const importText = () => {
    try {
      const st = parseState(JSON.parse(paste));
      if (!st) { setMsg("読み込めませんでした。形式を確認してください。"); return; }
      dispatch({ type: "import", state: st }); setMsg(`${st.plans.length} プランを読み込みました。`); setPaste("");
    } catch { setMsg("JSON として解釈できませんでした。"); }
  };
  return (
    <Modal open={open} onClose={onClose} title="共有・保存" width="max-w-xl">
      <div className="space-y-5">
        <section>
          <h3 className="text-sm font-medium ink flex items-center gap-2"><Link2 size={15} />URL で共有</h3>
          <p className="hint mt-0.5">すべてのプランが URL に圧縮して埋め込まれます（サーバーには送信されません）。アドレスバーの URL も常に最新の状態に同期しています。</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={url} className="field flex-1 text-xs" onFocus={e => e.target.select()} />
            <button onClick={copy} className={cx("btn", copied ? "btn-outline" : "btn-primary")}>{copied ? <><Check size={14} />コピー済</> : "コピー"}</button>
          </div>
          <p className="hint mt-1">{url.length.toLocaleString()} 文字{url.length > 8000 && "（長いURLはメッセンジャー等で切れることがあります。JSON での共有も検討してください）"}</p>
        </section>
        <section>
          <h3 className="text-sm font-medium ink flex items-center gap-2"><Download size={15} />ファイルに保存</h3>
          <button className="btn btn-outline mt-2" onClick={() => downloadJSON({ version: 2, plans: state.plans, activeId: state.activeId, compareIds: state.compareIds, onboarded: true })}><Download size={14} />JSON をダウンロード</button>
        </section>
        <section>
          <h3 className="text-sm font-medium ink flex items-center gap-2"><Upload size={15} />読み込み</h3>
          <p className="hint mt-0.5">このアプリの JSON、または旧バージョン（FP計算）の JSON を取り込めます。現在のプランは置き換えられます（⌘Z で戻せます）。</p>
          <div className="mt-2 flex flex-wrap gap-2 items-start">
            <label className="btn btn-outline cursor-pointer"><Upload size={14} />ファイルを選択<input type="file" accept="application/json,.json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const st = await readJSONFile(f); if (st) { dispatch({ type: "import", state: st }); setMsg(`${st.plans.length} プランを読み込みました。`); } else setMsg("読み込めませんでした。"); e.target.value = ""; }} /></label>
          </div>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder="ここに JSON を貼り付け" className="field mt-2 h-24 text-xs font-mono" />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={importText} disabled={!paste.trim()} className="btn btn-outline"><ClipboardPaste size={14} />貼り付けた JSON を読み込む</button>
            {msg && <span className="hint">{msg}</span>}
          </div>
        </section>
      </div>
    </Modal>
  );
}
