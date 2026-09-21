/** 入力パネル: セクションナビ + 各フォーム。 */
import { memo, useCallback, type ReactNode } from "react";
import { Users, Wallet, Home, Baby, TrendingUp, CalendarDays, ShieldAlert, Settings2, X, Utensils, Link2, Link2Off, Unlink } from "lucide-react";
import { useStore, useActivePlan, type SectionKey } from "@/state/store";
import { cx, Pill } from "@/ui/primitives";
import type { LinkGroup } from "@/domain/model";
import { LINK_GROUPS } from "@/domain/link";
import { FamilySection } from "./sections/FamilySection";
import { IncomeSection } from "./sections/IncomeSection";
import { LivingSection } from "./sections/LivingSection";
import { HousingSection } from "./sections/HousingSection";
import { ChildrenSection } from "./sections/ChildrenSection";
import { InvestSection } from "./sections/InvestSection";
import { EventsSection } from "./sections/EventsSection";
import { RiskSection } from "./sections/RiskSection";
import { SettingsSection } from "./sections/SettingsSection";

export const SECTIONS: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: "family", label: "家族", icon: <Users size={15} /> },
  { key: "income", label: "収入・年金", icon: <Wallet size={15} /> },
  { key: "living", label: "生活費・資産", icon: <Utensils size={15} /> },
  { key: "housing", label: "住まい", icon: <Home size={15} /> },
  { key: "children", label: "子ども", icon: <Baby size={15} /> },
  { key: "invest", label: "運用", icon: <TrendingUp size={15} /> },
  { key: "events", label: "イベント", icon: <CalendarDays size={15} /> },
  { key: "risk", label: "万一", icon: <ShieldAlert size={15} /> },
  { key: "settings", label: "前提", icon: <Settings2 size={15} /> },
];

export function Editor({ onClose, mobile }: { onClose: () => void; mobile: boolean }) {
  const { state, dispatch } = useStore();
  const active = state.plans.find(p => p.id === state.activeId) ?? state.plans[0];
  const section = state.section;
  const setSection = useCallback((k: SectionKey) => dispatch({ type: "ui/section", section: k }), [dispatch]);
  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 surface-1 border-b line">
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <span className="text-xs font-semibold ink-3 uppercase tracking-wider shrink-0">入力</span>
          {mobile && <span className="flex items-center gap-1.5 text-xs ink-2 min-w-0"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: active.color }} /><span className="truncate">{active.name}</span></span>}
          {mobile && <button onClick={onClose} className="btn btn-ghost px-2" aria-label="閉じる"><X size={18} /></button>}
        </div>
        <SectionNav section={section} onChange={setSection} />
      </div>
      <LinkStatus />
      <div className="p-3 space-y-3 fade-in" key={section}>
        {section === "family" && <FamilySection />}
        {section === "income" && <IncomeSection />}
        {section === "living" && <LivingSection />}
        {section === "housing" && <HousingSection />}
        {section === "children" && <ChildrenSection />}
        {section === "invest" && <InvestSection />}
        {section === "events" && <EventsSection />}
        {section === "risk" && <RiskSection />}
        {section === "settings" && <SettingsSection />}
      </div>
      {mobile && <div className="sticky bottom-0 p-3 surface-1 border-t line"><button onClick={onClose} className="btn btn-primary w-full">結果を見る</button></div>}
    </div>
  );
}

const SectionNav = memo(function SectionNav({ section, onChange }: { section: SectionKey; onChange: (k: SectionKey) => void }) {
  return (
    <nav className="flex flex-wrap gap-1 px-2 py-2" aria-label="入力セクション">
      {SECTIONS.map(s => (
        <button key={s.key} onClick={() => onChange(s.key)} className={cx("btn px-2.5 py-1 text-xs whitespace-nowrap", section === s.key ? "bg-[var(--accent)] text-[var(--on-fill-strong)]" : "btn-ghost")}>
          {s.icon}{s.label}
        </button>
      ))}
    </nav>
  );
});

export function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return <div className="mb-1"><h2 className="text-base font-semibold ink">{title}</h2>{desc && <p className="hint mt-0.5">{desc}</p>}</div>;
}

/** リンク中プランの状態表示（入力パネル上部） */
function LinkStatus() {
  const { raw, base, isLinked, unlink } = useActivePlan();
  if (!isLinked || !base) return null;
  const over = raw.link!.overrides;
  return (
    <div className="mx-3 mt-3 rounded-xl px-3 py-2 text-xs flex flex-wrap items-center gap-2" style={{ background: "var(--accent-soft)" }}>
      <Link2 size={14} className="text-[var(--accent)]" />
      <span className="ink"><b>{base.name}</b> に連動中</span>
      <span className="ink-3">{over.length ? `上書き: ${over.map(g => LINK_GROUPS.find(x => x.key === g)?.label).join("・")}` : "すべてのセクションがベースと同じ"}</span>
      <button onClick={() => { if (confirm("リンクを外して独立したプランにしますか？（現在の値で固定されます）")) unlink(); }} className="ml-auto btn btn-ghost text-[11px] px-1.5 py-0.5"><Unlink size={12} />独立させる</button>
    </div>
  );
}

/**
 * セクションの本体をラップし、リンク中（ベースに連動）なら入力を無効化して「このプランで変更」ボタンを出す。
 * 上書き中なら「ベースに再連動」ボタンを出す。独立プランでは何も表示しない。
 */
export function LinkedSection({ group, children }: { group: LinkGroup; children: ReactNode }) {
  const { isLinked, isGroupLinked, override, relink, base } = useActivePlan();
  if (!isLinked) return <>{children}</>;
  const linked = isGroupLinked(group);
  return (
    <div className="space-y-3">
      <div className={cx("rounded-xl border px-3 py-2 text-xs flex items-center gap-2", linked ? "line surface-2" : "border-[var(--accent)]")}>
        {linked ? <Link2 size={14} className="ink-3" /> : <Link2Off size={14} className="text-[var(--accent)]" />}
        <span className="ink">{linked ? <>このセクションは <b>{base?.name}</b> の値を使っています</> : <>このプランで上書き中</>}</span>
        {linked
          ? <button onClick={() => override(group)} className="ml-auto btn btn-primary text-[11px] px-2 py-0.5">このプランで変更する</button>
          : <button onClick={() => { if (confirm("上書きをやめてベースの値に戻しますか？")) relink(group); }} className="ml-auto btn btn-outline text-[11px] px-2 py-0.5">ベースに再連動</button>}
        {!linked && <Pill tone="accent">上書き</Pill>}
      </div>
      <div className={cx("min-w-0 space-y-3", linked && "linked-ro")} aria-readonly={linked || undefined}>
        {children}
      </div>
    </div>
  );
}
