/**
 * 入力ウィザード（詳細版）: 入力パネルの全セクションを順番にたどって、下書きプランを組み立てる。
 * セクションのフォームは入力パネルと同じコンポーネント（DraftPlanProvider で下書きに向ける）。
 * 各ステップの下に結果のプレビューを出し、最後に「このプランに適用」でストアへ反映（Undo 可）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Wand2, X } from "lucide-react";
import type { Plan } from "@/domain/model";
import { useActivePlan, DraftPlanProvider } from "@/state/store";
import { runSim } from "@/state/useSim";
import { cx, hasTransientOverlay, isTopmostDialog } from "@/ui/primitives";
import { fmtMan } from "@/lib/format";
import { SECTIONS } from "@/features/editor/Editor";
import { FamilySection } from "@/features/editor/sections/FamilySection";
import { IncomeSection } from "@/features/editor/sections/IncomeSection";
import { LivingSection } from "@/features/editor/sections/LivingSection";
import { HousingSection } from "@/features/editor/sections/HousingSection";
import { ChildrenSection } from "@/features/editor/sections/ChildrenSection";
import { InvestSection } from "@/features/editor/sections/InvestSection";
import { EventsSection } from "@/features/editor/sections/EventsSection";
import { RiskSection } from "@/features/editor/sections/RiskSection";
import { SettingsSection } from "@/features/editor/sections/SettingsSection";

const BODY: Record<string, () => React.JSX.Element> = {
  family: FamilySection, income: IncomeSection, living: LivingSection, housing: HousingSection, children: ChildrenSection,
  invest: InvestSection, events: EventsSection, risk: RiskSection, settings: SettingsSection,
};

export function PlanWizard({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const { plan: current, replace, isLinked } = useActivePlan();
  const [draft, setDraft] = useState<Plan>(() => structuredClone(current));
  const [step, setStep] = useState(initialStep);
  const [dirty, setDirty] = useState(false);
  const update = useCallback((fn: (d: Plan) => void) => { setDraft(prev => { const next = structuredClone(prev); fn(next); return next; }); setDirty(true); }, []);
  const sim = useMemo(() => runSim(draft), [draft]);
  const before = useMemo(() => runSim(current), [current]);
  const section = SECTIONS[step];
  const Body = BODY[section.key];

  const cancel = () => { if (!dirty || confirm("入力した内容を破棄して閉じますか？")) onClose(); };

  // Modal と同じキーボード挙動にそろえる: Escape で閉じる（未入力破棄は cancel 側で確認）、
  // Tab はダイアログ内で循環、閉じたら元のボタンへフォーカスを戻す。
  const boxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(boxRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(el => !el.hasAttribute("disabled"));
    requestAnimationFrame(() => { const f = focusables(); (f.find(el => el.tagName === "INPUT") ?? f[0])?.focus(); });
    const onKey = (e: KeyboardEvent) => {
      // ウィザードの中から子ども・住まいのモーダルを開いている間は、そちらに任せる
      if (!isTopmostDialog(boxRef.current)) return;
      if (e.key === "Escape") { if (hasTransientOverlay()) return; e.preventDefault(); cancelRef.current(); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement;
      if (!boxRef.current?.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; previouslyFocused?.focus?.(); };
  }, []);
  const apply = () => {
    if (isLinked && !confirm("このプランはベースプランに連動しています。適用すると独立したプランになります。続けますか？")) return;
    replace(isLinked ? { ...draft, link: null } : draft);
    onClose();
  };

  const delta = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && a !== b ? <span className={cx("ml-1 text-[11px]", a > b ? "text-[var(--good)]" : "text-[var(--critical)]")}>({a > b ? "+" : "−"}{fmtMan(Math.abs(a - b))})</span> : null);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="ウィザードで入力" style={{ background: "color-mix(in oklab, var(--surface-0) 85%, transparent)", backdropFilter: "blur(6px)" }}>
      <div ref={boxRef} className="card w-full max-w-5xl h-[94vh] shadow-2xl flex flex-col overflow-hidden fade-in">
        {/* ヘッダー */}
        <div className="px-5 pt-4 pb-3 border-b line flex items-center gap-3">
          <h1 className="text-base font-semibold ink flex items-center gap-2 min-w-0"><Wand2 size={16} className="text-[var(--accent)]" /><span className="truncate">ウィザードで入力（{current.name}）</span></h1>
          <span className="hint hidden sm:inline">{step + 1} / {SECTIONS.length}　入力パネルと同じ項目を順番に。適用するまでプランは変わりません。{isLinked && <span className="text-[var(--warning)]">　このプランはベースに連動中です。適用すると独立したプランになります。</span>}</span>
          <button onClick={cancel} className="ml-auto btn btn-ghost px-2" aria-label="閉じる"><X size={18} /></button>
        </div>
        <div className="flex flex-1 min-h-0">
          {/* ステップ一覧 */}
          <ol className="hidden md:flex flex-col gap-0.5 w-48 shrink-0 border-r line p-2 overflow-y-auto surface-2" aria-label="ステップ">
            {SECTIONS.map((s, i) => (
              <li key={s.key}>
                <button onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}
                  className={cx("w-full text-left btn justify-start px-2.5 py-1.5 text-[13px]", i === step ? "bg-[var(--accent)] text-[var(--on-fill-strong)]" : "btn-ghost")}>
                  <span className={cx("inline-grid place-items-center h-5 w-5 rounded-full text-[11px] shrink-0", i === step ? "bg-[var(--on-fill-strong)] text-[var(--accent)] font-semibold" : i < step ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "surface-3 ink-3")}>{i < step ? <Check size={12} /> : i + 1}</span>
                  {s.icon}{s.label}
                </button>
              </li>
            ))}
          </ol>
          {/* 本文: 入力パネルのセクションをそのまま */}
          <div className="flex-1 min-w-0 overflow-y-auto scroll-thin">
            <div className="md:hidden flex gap-1 px-3 pt-3 overflow-x-auto scroll-thin">
              {SECTIONS.map((s, i) => <button key={s.key} onClick={() => setStep(i)} className={cx("btn px-2.5 py-1 text-xs whitespace-nowrap", i === step ? "bg-[var(--accent)] text-[var(--on-fill-strong)]" : "btn-ghost")}>{s.icon}{s.label}</button>)}
            </div>
            <div className="p-4 sm:p-5 max-w-2xl space-y-3" key={section.key}>
              <DraftPlanProvider plan={draft} update={update}>
                <Body />
              </DraftPlanProvider>
            </div>
          </div>
        </div>
        {/* フッター: プレビュー + ナビ */}
        <div className="border-t line px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 surface-1">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span><span className="ink-3">{draft.self.retireAge}歳の純資産</span> <b className="tabular ink">{sim.summary.retirementNetWorth != null ? fmtMan(sim.summary.retirementNetWorth) : "–"}</b>{delta(sim.summary.retirementNetWorth, before.summary.retirementNetWorth)}</span>
            <span><span className="ink-3">底をつく年齢</span> <b className={cx("tabular", sim.summary.depletionAge != null ? "text-[var(--critical)]" : "ink")}>{sim.summary.depletionAge != null ? `${sim.summary.depletionAge}歳` : "なし"}</b></span>
            <span><span className="ink-3">スコア</span> <b className="tabular ink">{sim.summary.healthScore}</b></span>
            <span><span className="ink-3">今年の貯蓄</span> <b className={cx("tabular", sim.summary.currentYear.net < 0 ? "text-[var(--critical)]" : "ink")}>{fmtMan(sim.summary.currentYear.net, { sign: true })}</b></span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setStep(s => s - 1)} disabled={step === 0} className="btn btn-ghost"><ArrowLeft size={15} />戻る</button>
            {step < SECTIONS.length - 1 && <button onClick={() => setStep(s => s + 1)} className="btn btn-outline">次へ<ArrowRight size={15} /></button>}
            <button onClick={apply} disabled={!dirty} className="btn btn-primary" title={dirty ? "変更を反映（⌘Z で戻せます）" : "まだ変更がありません"}><Check size={15} />このプランに適用</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
