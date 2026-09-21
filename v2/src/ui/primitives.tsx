/** UI プリミティブ: 数値入力・セグメント・トグル・カード・モーダル など。 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent as RKeyboardEvent  } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, Minus, Plus, Info } from "lucide-react";

// 静的なアイコン要素は毎レンダーで作り直さない（入力欄が多いフォームの再描画コストを下げる）
const ICON_MINUS = <Minus size={14} />;
const ICON_PLUS = <Plus size={14} />;
const ICON_INFO = <Info size={12} />;

export function cx(...c: (string | false | null | undefined)[]): string { return c.filter(Boolean).join(" "); }

/**
 * この要素が属するダイアログが「最前面」か。ダイアログの中からさらにモーダルを開いたとき、
 * 外側もキー操作を処理してしまうと Escape 1 回で両方閉じてしまうため、外側は手を引く。
 * ポータルは body の末尾に積まれるので、DOM 順で最後の [role="dialog"] が最前面。
 */
export function isTopmostDialog(node: Element | null | undefined): boolean {
  const self = node?.closest('[role="dialog"]') ?? null;
  const all = document.querySelectorAll('[role="dialog"]');
  return all.length === 0 || all[all.length - 1] === self;
}

/**
 * Escape を先に消費すべき一時的な表示（ヘルプの吹き出し）が出ているか。
 * ダイアログ側がこれを見ずに Escape を処理すると、吹き出しを閉じるつもりの 1 回で
 * ダイアログまで閉じてしまう。
 */
export function hasTransientOverlay(): boolean {
  return !!document.querySelector('[role="tooltip"]');
}

// ── Card ──────────────────────────────────────────────────────
export function Card({ title, subtitle, right, children, className, padded = true }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("card", padded && "p-4", className)}>
      {(title || right) && (
        <header className={cx("flex items-start justify-between gap-3", padded ? "mb-3" : "px-4 pt-4 mb-2")}>
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold ink leading-tight">{title}</h3>}
            {subtitle && <p className="hint mt-0.5">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

// ── Number field ──────────────────────────────────────────────
export interface NumFieldProps {
  label?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  help?: string;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  placeholder?: string;
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９．－，]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/[，,]/g, "");
}

export function NumField({ label, value, onChange, unit, step = 1, min, max, help, className, size = "md", disabled, placeholder }: NumFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const skipBlur = useRef(false);
  const id = useId();
  const commit = (raw: string) => {
    const t = toHalfWidth(raw).trim();
    setText(null);
    if (t === "" || t === "-") return;
    const n = Number(t);
    if (!Number.isFinite(n)) return;
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
    v = Number(v.toFixed(Math.max(decimals, 2)));
    if (v !== value) onChange(v);
  };
  const bump = (dir: 1 | -1, mult = 1) => {
    let v = value + dir * step * mult;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
    onChange(Number(v.toFixed(decimals)));
  };
  const display = text ?? (Number.isFinite(value) ? String(value) : "");
  return (
    <div className={cx("min-w-0", className)}>
      {label && <div className="label mb-1 flex items-center"><label htmlFor={id}>{label}</label>{help && <HelpTip text={help} />}</div>}
      <div className={cx("field-box flex items-stretch rounded-lg border overflow-hidden", disabled && "opacity-50")} style={{ borderColor: "var(--line-strong)", background: "var(--surface-1)" }}>
        <button type="button" tabIndex={-1} aria-label="減らす" disabled={disabled} onClick={e => bump(-1, e.shiftKey ? 10 : 1)} className="px-1.5 ink-3 hover:ink hover:surface-3 transition-colors">{ICON_MINUS}</button>
        <input id={id} inputMode="decimal" disabled={disabled} placeholder={placeholder}
          className={cx("min-w-0 flex-1 bg-transparent text-right tabular outline-none", size === "sm" ? "py-1 text-[13px]" : "py-1.5 text-sm")}
          value={display}
          onChange={e => setText(e.target.value)}
          onFocus={e => { setText(String(value)); requestAnimationFrame(() => e.target.select()); }}
          onBlur={e => { if (skipBlur.current) { skipBlur.current = false; setText(null); return; } commit(e.target.value); }}
          onKeyDown={e => {
            if (e.key === "Enter") { commit((e.target as HTMLInputElement).value); skipBlur.current = true; (e.target as HTMLInputElement).blur(); }
            if (e.key === "ArrowUp") { e.preventDefault(); bump(1, e.shiftKey ? 10 : 1); setText(null); }
            if (e.key === "ArrowDown") { e.preventDefault(); bump(-1, e.shiftKey ? 10 : 1); setText(null); }
          }} />
        {unit && <span className={cx("flex items-center pr-2 pl-1 ink-3 whitespace-nowrap", size === "sm" ? "text-[11px]" : "text-xs")}>{unit}</span>}
        <button type="button" tabIndex={-1} aria-label="増やす" disabled={disabled} onClick={e => bump(1, e.shiftKey ? 10 : 1)} className="px-1.5 ink-3 hover:ink hover:surface-3 transition-colors">{ICON_PLUS}</button>
      </div>
    </div>
  );
}

// ── Text field（確定は blur / Enter。1文字ごとに履歴を作らない） ──────
export function TextField({ value, onChange, className, ariaLabel, placeholder }: { value: string; onChange: (v: string) => void; className?: string; ariaLabel?: string; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input className={className ?? "field"} aria-label={ariaLabel} placeholder={placeholder} value={text ?? value}
      onChange={e => setText(e.target.value)}
      onBlur={() => { if (text != null && text !== value) onChange(text); setText(null); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setText(null); (e.target as HTMLInputElement).blur(); } }} />
  );
}

// ── Slider + number ───────────────────────────────────────────
export function SliderField({ label, value, onChange, min, max, step = 1, unit, help, format }: { label: ReactNode; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; help?: string; format?: (v: number) => string }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="label"><label htmlFor={id}>{label}</label>{help && <HelpTip text={help} />}</span>
        <span className="text-sm font-semibold tabular ink">{format ? format(value) : `${value}${unit ?? ""}`}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </div>
  );
}

// ── Segmented control ─────────────────────────────────────────
export function Segmented<T extends string | number | boolean>({ value, onChange, options, size = "md", className, ariaLabel, wrap }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; size?: "sm" | "md"; className?: string; ariaLabel?: string; wrap?: boolean }) {
  const idx = Math.max(options.findIndex(o => o.value === value), 0);
  const onKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const n = options.length;
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (idx + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : n - 1)) % n;
    onChange(options[next].value);
    const el = (e.currentTarget.children[next] as HTMLElement | undefined); el?.focus();
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKey} className={cx("rounded-lg p-0.5 surface-3 max-w-full", wrap ? "inline-flex flex-wrap gap-0.5" : "inline-flex overflow-x-auto scroll-thin", className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} tabIndex={i === idx ? 0 : -1} title={o.title} onClick={() => onChange(o.value)}
            className={cx("tap whitespace-nowrap rounded-md font-medium transition-all focus-ring inline-flex items-center gap-1", size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm", on ? "seg-on font-semibold" : "ink-2 hover:ink")}>
            {on && <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label, help, className, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; help?: string; className?: string; ariaLabel?: string }) {
  const labelId = useId();
  return (
    <label className={cx("inline-flex items-center gap-2 cursor-pointer select-none", className)}>
      {/* ラベルを囲む <label> だけだとヘルプの文言まで読み上げ名に入るので、ラベル部分だけを名前にする */}
      <button type="button" role="switch" aria-checked={checked}
        aria-label={ariaLabel} aria-labelledby={!ariaLabel && label ? labelId : undefined}
        onClick={() => onChange(!checked)}
        className={cx("tap inline-block shrink-0 h-5 w-9 p-0 rounded-full transition-colors focus-ring", checked ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]")}>
        <span className={cx("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0")} />
      </button>
      {label && <span className="text-sm ink"><span id={labelId}>{label}</span>{help && <HelpTip text={help} />}</span>}
    </label>
  );
}

// ── Help tip ──────────────────────────────────────────────────
/**
 * 「ⓘ」のヘルプ。吹き出しは body へポータルで出し、画面内に収まるよう上下反転・左右クランプする。
 * （入力パネルは overflow 付きのスクロール領域なので、通常の absolute だと端で切れてしまう）
 */
export function HelpTip({ text }: { text: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const hovering = useRef(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const open = () => { const el = ref.current; if (el) setAnchor(el.getBoundingClientRect()); };
  const close = () => { setAnchor(null); setPos(null); };

  // 実際の高さを測ってから上下を決める（上が足りなければ下、下も足りなければ端に寄せる）
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!anchor || !el) return;
    const M = 8, GAP = 6;
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(240, vw - M * 2);
    const h = el.offsetHeight;
    let top = anchor.top - GAP - h;
    if (top < M) top = anchor.bottom + GAP;
    if (top + h > vh - M) top = Math.max(M, vh - M - h);
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, M), Math.max(M, vw - width - M));
    setPos({ top, left, width });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    // タップで開いた場合は、外側をタップしたら閉じる
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [anchor]);

  return (
    <>
      <button ref={ref} type="button"
        className="tap inline-flex align-middle ml-1 ink-3 hover:ink rounded-full focus-ring transition-colors"
        aria-label={`ヘルプ: ${text}`} aria-expanded={!!anchor}
        // マウスはホバー、タッチはタップ、キーボードは focus-visible で開く。
        // （タッチだと pointerenter → click が連続するため、ホバー扱いで開くと即閉じてしまう）
        onPointerEnter={e => { if (e.pointerType === "mouse") { hovering.current = true; open(); } }}
        onPointerLeave={e => { if (e.pointerType === "mouse") { hovering.current = false; close(); } }}
        onFocus={e => { if (e.currentTarget.matches(":focus-visible")) open(); }}
        onBlur={() => { if (!hovering.current) close(); }}
        onClick={e => { e.preventDefault(); if (hovering.current) return; anchor ? close() : open(); }}>{ICON_INFO}</button>
      {anchor && createPortal(
        <span ref={tipRef} role="tooltip" className="pointer-events-none fixed z-[60] rounded-md px-2.5 py-1.5 text-[11px] leading-snug font-normal shadow-xl fade-in"
          style={{
            top: pos?.top ?? 0, left: pos?.left ?? 0,
            width: pos?.width ?? Math.min(240, window.innerWidth - 16),
            visibility: pos ? undefined : "hidden",
            background: "var(--ink)", color: "var(--surface-1)",
          }}>
          {text}
        </span>, document.body)}
    </>
  );
}

// ── Collapsible ───────────────────────────────────────────────
export function Collapsible({ title, summary, defaultOpen = false, children, right }: { title: ReactNode; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border line surface-1">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="tap ro-ok flex flex-1 items-center gap-2 text-left min-w-0 focus-ring rounded">
          <ChevronDown size={16} className={cx("ink-3 transition-transform shrink-0", open && "rotate-180")} />
          <span className="text-sm font-medium ink truncate">{title}</span>
          {!open && summary && <span className="hint truncate ml-auto">{summary}</span>}
        </button>
        {right}
      </div>
      {open && <div className="px-3 pb-3 pt-1 fade-in">{children}</div>}
    </div>
  );
}

// ── Modal / Sheet ─────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = "max-w-lg", footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: string; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(el => !el.hasAttribute("disabled"));
    // 初期フォーカスは最初の入力（なければ閉じるボタン）
    requestAnimationFrame(() => { const f = focusables(); (f.find(el => el.tagName === "INPUT") ?? f[0])?.focus(); });
    const onKey = (e: KeyboardEvent) => {
      if (!isTopmostDialog(ref.current)) return;  // 上に別のモーダルが乗っているときは触らない
      if (e.key === "Escape") { if (hasTransientOverlay()) return; onClose(); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement;
      // フォーカスがダイアログの外にある状態から Tab すると素通りしてしまうので引き戻す
      if (!ref.current?.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; previouslyFocused?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  // sticky/fixed な祖先（入力パネル）のスタッキングコンテキストに閉じ込められないよう body 直下に描画
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} className={cx("w-full surface-1 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] slide-up", width)}>
        <div className="flex items-center justify-between px-5 py-3 border-b line">
          <h2 id={titleId} className="text-base font-semibold ink">{title}</h2>
          <button onClick={onClose} aria-label="閉じる" className="btn btn-ghost -mr-2 px-2"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto scroll-thin px-5 py-4 flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t line flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Misc ─────────────────────────────────────────────────────
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid gap-3 grid-cols-2", className)}>{children}</div>;
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "good" | "warning" | "critical" | "accent"; className?: string }) {
  const styles: Record<string, string> = {
    neutral: "surface-3 ink-2", good: "bg-[color-mix(in_oklab,var(--good)_15%,transparent)] text-[var(--good)]",
    warning: "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-[var(--warning)]",
    critical: "bg-[color-mix(in_oklab,var(--critical)_15%,transparent)] text-[var(--critical)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", styles[tone], className)}>{children}</span>;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-8 px-4 rounded-xl border border-dashed line">
      {icon && <div className="ink-3">{icon}</div>}
      <div className="text-sm font-medium ink">{title}</div>
      {body && <p className="hint max-w-xs">{body}</p>}
      {action}
    </div>
  );
}

export function IconButton({ onClick, label, children, className, danger }: { onClick: () => void; label: string; children: ReactNode; className?: string; danger?: boolean }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={cx("btn btn-ghost px-1.5 py-1", danger && "hover:text-[var(--critical)]", className)}>{children}</button>;
}
