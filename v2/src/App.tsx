import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "./ui/useMediaQuery";
import { Moon, Sun, Undo2, Redo2, Share2, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, LayoutDashboard, Table2, GitCompareArrows, ShieldAlert, FileText, Wand2 } from "lucide-react";
import { useStore, type View } from "./state/store";
import { cx } from "./ui/primitives";
import { PlanTabs } from "./features/plans/PlanTabs";
import { Editor } from "./features/editor/Editor";
import { Dashboard } from "./features/dashboard/Dashboard";
import { YearTable } from "./features/table/YearTable";
import { CompareView } from "./features/compare/CompareView";
import { RiskView } from "./features/risk/RiskView";
import { ReportView } from "./features/report/ReportView";
import { ShareDialog } from "./features/share/ShareDialog";
import { Onboarding } from "./features/onboarding/Onboarding";
import { PlanWizard } from "./features/wizard/PlanWizard";

const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "ダッシュボード", icon: <LayoutDashboard size={16} /> },
  { key: "table", label: "年表", icon: <Table2 size={16} /> },
  { key: "compare", label: "比較", icon: <GitCompareArrows size={16} /> },
  { key: "risk", label: "万一の分析", icon: <ShieldAlert size={16} /> },
  { key: "report", label: "レポート", icon: <FileText size={16} /> },
];

export default function App() {
  const { state, dispatch } = useStore();
  const [share, setShare] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? "light");
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("lifeplan-theme", theme); }, [theme]);

  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(88);
  useEffect(() => { const el = headerRef.current; if (!el) return; const ro = new ResizeObserver(([e]) => setHeaderH(Math.round(e.contentRect.height) + 1)); ro.observe(el); return () => ro.disconnect(); }, []);
  const editorOpen = state.editorOpen;
  const setView = useCallback((v: View) => dispatch({ type: "ui/view", view: v }), [dispatch]);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  return (
    <div className="min-h-full flex flex-col">
      {!state.onboarded && <Onboarding onDetailed={() => setWizard(true)} />}
      {state.onboarded && wizard && <PlanWizard onClose={() => setWizard(false)} />}
      {/* ── Header ── */}
      <header ref={headerRef} className="no-print sticky top-0 z-30 border-b line surface-1/95 backdrop-blur" style={{ background: "color-mix(in oklab, var(--surface-1) 92%, transparent)" }}>
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={() => dispatch({ type: "ui/editor", open: !editorOpen })} className="btn btn-ghost px-2 hidden lg:inline-flex" aria-label={editorOpen ? "入力パネルを閉じる" : "入力パネルを開く"}>
            {editorOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <div className="flex items-center gap-2 mr-2">
            <span className="inline-grid place-items-center h-7 w-7 rounded-lg text-xs font-bold" style={{ background: "var(--accent)", color: "var(--on-fill-strong)" }}>LP</span>
            <span className="font-semibold text-sm tracking-tight hidden sm:inline">ライフプラン</span>
          </div>
          <PlanTabs />
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => dispatch({ type: "undo" })} disabled={!state.past.length} className="btn btn-ghost px-2" aria-label="元に戻す" title="元に戻す (⌘Z)"><Undo2 size={16} /></button>
            <button onClick={() => dispatch({ type: "redo" })} disabled={!state.future.length} className="btn btn-ghost px-2" aria-label="やり直す" title="やり直す (⇧⌘Z)"><Redo2 size={16} /></button>
            <button onClick={() => setWizard(true)} className="btn btn-ghost px-2" aria-label="ウィザードで入力" title="ウィザードで入力（家族〜前提まで全項目を順番に入力。適用するまでプランは変わりません）"><Wand2 size={16} /><span className="hidden md:inline text-[13px]">ウィザード</span></button>
            <button onClick={() => setTheme(t => (t === "dark" ? "light" : "dark"))} className="btn btn-ghost px-2" aria-label="テーマ切替">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button onClick={() => setShare(true)} className="btn btn-outline"><Share2 size={15} /><span className="hidden sm:inline">共有・保存</span></button>
          </div>
        </div>
        {/* View tabs */}
        <ViewNav view={state.view} onChange={setView} />
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex min-h-0">
        {/* Editor: desktop = 左固定列 / mobile = フルスクリーンシート */}
        {editorOpen && (
          <aside style={isDesktop ? { top: headerH, height: `calc(100vh - ${headerH}px)` } : undefined} className={cx("no-print", isDesktop ? "w-[420px] shrink-0 border-r line surface-1 sticky overflow-y-auto scroll-thin" : "fixed inset-0 z-40 surface-1 overflow-y-auto pt-2")}>
            <Editor onClose={() => dispatch({ type: "ui/editor", open: false })} mobile={!isDesktop} />
          </aside>
        )}
        <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6 pb-24 lg:pb-6">
          <div className="mx-auto w-full max-w-[1500px] space-y-4">
          {state.view === "dashboard" && <Dashboard />}
          {state.view === "table" && <YearTable />}
          {state.view === "compare" && <CompareView />}
          {state.view === "risk" && <RiskView />}
          {state.view === "report" && <ReportView />}
          </div>
        </main>
      </div>

      {/* Mobile FAB */}
      {!isDesktop && !editorOpen && (
        <button onClick={() => dispatch({ type: "ui/editor", open: true })} className="no-print fixed bottom-5 right-5 z-30 btn btn-primary rounded-full px-4 py-3 shadow-xl">
          <SlidersHorizontal size={18} />入力を編集
        </button>
      )}
      <ShareDialog open={share} onClose={() => setShare(false)} />
    </div>
  );
}

/** 表示切替タブ。プラン編集のたびに再描画されないよう memo。 */
const ViewNav = memo(function ViewNav({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <nav className="flex items-center gap-1 px-3 pb-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="表示">
      {VIEWS.map(v => (
        <button key={v.key} onClick={() => onChange(v.key)} className={cx("btn px-3 py-1 text-[13px] whitespace-nowrap", view === v.key ? "surface-3 ink" : "btn-ghost")}>
          {v.icon}{v.label}
        </button>
      ))}
    </nav>
  );
});
