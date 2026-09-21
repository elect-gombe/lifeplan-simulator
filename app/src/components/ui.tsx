import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt } from "../lib/format";
import { parseNumericText, clampNumber, stepValue, formatNumericDisplay } from "../lib/numInput";

// ============================================================
// Help icon
// ============================================================

export function Help({ text }: { text?: string }) {
  if (!text) return null;
  return <span className="ml-1 cursor-help text-gray-400" title={text}>ⓘ</span>;
}

// ============================================================
// NumField — the numeric input core
// ============================================================

export interface NumFieldProps {
  /** `null` is only meaningful together with `onClear` (empty = "auto"). */
  value: number | null;
  /** Live update: fired while typing whenever the text is a complete number within [min,max], and on step/commit. */
  onChange: (v: number) => void;
  /** When provided, an empty field is allowed and commits as a "clear" instead of reverting. */
  onClear?: () => void;
  /** Stretch to the parent's width (block layout) instead of the fixed `w` class. */
  fill?: boolean;
  /** Fired once when editing ends (blur / Enter / arrow step) with the final clamped value. */
  onCommit?: (v: number) => void;
  step?: number; min?: number; max?: number;
  unit?: string;
  disabled?: boolean;
  /** Tailwind width class for the input, e.g. "w-16". */
  w?: string;
  size?: "xs" | "sm";
  placeholder?: string;
  /** Quick-pick values rendered as chips under the field. */
  presets?: number[];
  presetFormat?: (v: number) => string;
  title?: string;
  autoFocus?: boolean;
  id?: string;
  /** Extra class for the outer wrapper. */
  className?: string;
  /** Right-align the text (default true). */
  alignRight?: boolean;
}

const NUMFIELD_ATTR = "data-numfield";

/** Focus the next NumField in DOM order (Enter-to-advance). Returns true if one was found. */
function focusNextNumField(current: HTMLInputElement): boolean {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>(`input[${NUMFIELD_ATTR}]:not([disabled])`));
  const i = all.indexOf(current);
  const next = all[i + 1];
  if (!next) return false;
  next.focus();
  return true;
}

export function NumField({
  value: valueProp, onChange, onCommit, onClear, fill, step = 1, min, max, unit, disabled, w, size = "xs", placeholder,
  presets, presetFormat, title, autoFocus, id, className, alignRight = true,
}: NumFieldProps) {
  const value = valueProp ?? 0;
  const isEmpty = valueProp == null;
  // `text === null` → not editing, show the formatted committed value.
  const [text, setText] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const lastCommitted = useRef(value);
  useEffect(() => { if (text === null) lastCommitted.current = value; }, [value, text]);

  const commit = useCallback((raw: string | null) => {
    const parsed = raw == null ? null : parseNumericText(raw);
    if (parsed == null && onClear && (raw ?? "").trim() === "") {
      onClear(); onCommit?.(value); setText(null); return;
    }
    const v = parsed == null ? lastCommitted.current : clampNumber(parsed, min, max);
    if (v !== value || isEmpty) onChange(v);
    onCommit?.(v);
    lastCommitted.current = v;
    setText(null);
  }, [min, max, onChange, onCommit, onClear, value, isEmpty]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    const parsed = parseNumericText(raw);
    // Only push live values that are already in range; out-of-range partials wait for blur.
    if (parsed != null && (min == null || parsed >= min) && (max == null || parsed <= max) && parsed !== value) onChange(parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const cur = (text != null ? parseNumericText(text) : null) ?? value;
      const next = stepValue(cur, e.key === "ArrowUp" ? 1 : -1, step, e.shiftKey ? 10 : 1, min, max);
      setText(String(next));
      if (next !== value) onChange(next);
      onCommit?.(next);
      lastCommitted.current = next;
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(text);
      const el = e.currentTarget;
      if (!focusNextNumField(el)) el.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setText(null);
      e.currentTarget.blur();
    }
  };

  const display = text ?? (isEmpty ? "" : formatNumericDisplay(value));
  const pad = size === "sm" ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-xs";
  const widthClass = fill ? "w-full flex-1" : (w || "w-16");
  return (
    <span className={`${fill ? "flex w-full" : "inline-flex"} flex-col ${className || ""}`}>
      <span className={`${fill ? "flex w-full" : "inline-flex"} items-center rounded border bg-white transition-shadow focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 ${disabled ? "bg-gray-50 opacity-60" : "hover:border-gray-400"}`}>
        <input
          ref={ref} id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
          {...{ [NUMFIELD_ATTR]: "" }}
          value={display}
          placeholder={placeholder}
          disabled={disabled} title={title} autoFocus={autoFocus}
          onFocus={(e) => { if (disabled) return; setText(isEmpty ? "" : String(value)); requestAnimationFrame(() => e.target.select()); }}
          onChange={handleChange}
          onBlur={() => commit(text)}
          onKeyDown={handleKeyDown}
          className={`${widthClass} min-w-0 bg-transparent outline-none tabular-nums ${alignRight ? "text-right" : ""} ${pad} ${disabled ? "cursor-not-allowed" : ""}`}
        />
        {unit && <span className={`pr-1.5 whitespace-nowrap text-gray-400 ${size === "sm" ? "text-xs" : "text-[10px]"}`}>{unit}</span>}
      </span>
      {presets && presets.length > 0 && !disabled && (
        <Presets values={presets} current={value} onPick={(v) => { onChange(v); onCommit?.(v); lastCommitted.current = v; }} format={presetFormat} />
      )}
    </span>
  );
}

/** Row of quick-pick chips. */
export function Presets({ values, current, onPick, format }: {
  values: number[]; current?: number; onPick: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <span className="mt-0.5 flex flex-wrap gap-0.5">
      {values.map((v) => (
        <button key={v} type="button" onClick={() => onPick(v)}
          className={`rounded px-1 py-px text-[9px] leading-tight ${current === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-700"}`}>
          {format ? format(v) : v.toLocaleString()}
        </button>
      ))}
    </span>
  );
}

// ============================================================
// Field wrappers (label + NumField)
// ============================================================

export interface NumInProps {
  label: React.ReactNode; value: number | null; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; unit?: string; help?: string; small?: boolean;
  presets?: number[]; fill?: boolean; disabled?: boolean; placeholder?: string; onClear?: () => void;
}

/** Stacked label above a numeric field (used in modals / forms). `fill` stretches to the grid cell. */
export function NumIn({ label, value, onChange, step, min, max, unit, help, small, presets, fill, disabled, placeholder, onClear }: NumInProps) {
  return (
    <div className={fill ? "min-w-0" : undefined}>
      {label !== "" && <label className="mb-1 block text-xs font-semibold text-gray-600">{label}<Help text={help} /></label>}
      <NumField value={value} onChange={onChange} onClear={onClear} step={step || 1} min={min ?? 0} max={max} unit={unit} size="sm"
        w={small ? "w-24" : "w-32"} fill={fill} presets={presets} disabled={disabled} placeholder={placeholder} />
    </div>
  );
}

/** Inline numeric field: label on the left, compact (dense settings rows). */
export function Inp({ label, value, onChange, onCommit, unit, w, step, min, max, disabled, help, presets, title, autoFocus }: {
  label?: React.ReactNode; value: number; onChange: (v: number) => void; onCommit?: (v: number) => void;
  unit?: string; w?: string; step?: number; min?: number; max?: number; disabled?: boolean;
  help?: string; presets?: number[]; title?: string; autoFocus?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 align-top">
      {label && <span className="whitespace-nowrap text-[10px] text-gray-500">{label}<Help text={help} /></span>}
      <NumField value={value} onChange={onChange} onCommit={onCommit} unit={unit} w={w} step={step} min={min} max={max}
        disabled={disabled} presets={presets} title={title} autoFocus={autoFocus} />
    </span>
  );
}

export interface TogProps { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; accent?: string }

export function Tog({ label, checked, onChange, disabled, accent }: TogProps) {
  return (
    <label className={`flex items-center gap-1.5 text-xs ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className={accent || "accent-blue-600"} />
      <span>{label}</span>
    </label>
  );
}

/** Small checkbox with muted label, for dense settings rows. */
export function Check({ label, checked, onChange, disabled, accent, help }: TogProps & { help?: string }) {
  return (
    <label className={`inline-flex items-center gap-1 text-[10px] ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className={accent || "accent-blue-600"} />
      <span className="text-gray-500">{label}<Help text={help} /></span>
    </label>
  );
}

/** Wraps a flex-wrap row of dense fields with consistent spacing. */
export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-start gap-x-3 gap-y-1.5 text-xs ${className || ""}`}>{children}</div>;
}

/** Sub-group with a muted caption, used inside sections to separate topics. */
export function SubGroup({ title, children, right, className }: { title?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`border-t border-gray-100 pt-1.5 first:border-t-0 first:pt-0 ${className || ""}`}>
      {(title || right) && (
        <div className="mb-1 flex items-center justify-between gap-2">
          {title && <span className="text-[10px] font-semibold text-gray-600">{title}</span>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

// ============================================================
// Table row helpers (tax detail tables)
// ============================================================

export interface RowProps {
  l: React.ReactNode;
  /** One cell per scenario: numbers are rendered as ¥, strings verbatim. */
  vs: (number | string)[];
  neg?: boolean; bold?: boolean; bg?: string; sub?: boolean; help?: string; formula?: React.ReactNode;
}

export function Row({ l, vs, neg, bold, bg, sub, help, formula }: RowProps) {
  return (
    <tr className={`${bold ? "font-bold " : ""}${bg || ""}`}>
      <td className={`break-words border border-gray-300 px-1.5 py-1 align-top text-[11px] leading-tight xl:text-xs ${sub ? "pl-3 text-gray-500" : ""}`}>
        {l}<Help text={help} />
        {formula && <div className="mt-0.5 text-[10px] font-normal leading-tight text-gray-400 xl:text-[11px]">{formula}</div>}
      </td>
      {vs.map((v, i) => (
        <td key={i} className={`border border-gray-300 px-1.5 py-1 text-right align-top text-[11px] leading-tight tabular-nums xl:text-xs ${neg && typeof v === "number" && v > 0 ? "text-red-600" : ""}`}>
          {typeof v === "string" ? v : `¥${fmt(v)}`}
        </td>
      ))}
    </tr>
  );
}

export interface SecProps { children: React.ReactNode; c?: string; colSpan?: number }

export function Sec({ children, c, colSpan }: SecProps) {
  return (
    <tr className={`${c || "bg-gray-100"} font-semibold`}>
      <td colSpan={colSpan} className="border border-gray-300 px-2 py-1 text-xs">{children}</td>
    </tr>
  );
}

// ============================================================
// Modal chrome
// ============================================================

/**
 * Bare modal chrome: dimmed backdrop (click = close) + centered white panel
 * (clicks inside don't propagate). Header/body/footer are up to the caller.
 */
export function ModalShell({ onClose, maxWidthClass = "max-w-lg", backdropClass, children }: {
  onClose: () => void;
  /** Tailwind max-width for the panel, e.g. "max-w-4xl". */
  maxWidthClass?: string;
  /** Override the backdrop classes when a caller needs a different scroll mode. */
  backdropClass?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Portal to <body>: callers may live inside a sticky/overflow column, whose stacking context
  // would otherwise let later siblings (charts) paint over the fixed overlay.
  return createPortal(
    <div className={backdropClass || "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8"} onClick={onClose}>
      <div className={`w-full rounded-lg bg-white shadow-xl ${maxWidthClass}`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Standard modal title bar; `right` renders on the far side (e.g. a close button). */
export function ModalHeader({ title, right }: { title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={`border-b px-4 py-3 ${right ? "flex items-center justify-between" : ""}`}>
      <p className="text-sm font-bold">{title}</p>
      {right}
    </div>
  );
}

/** Standard form modal: title bar, scrollable body, cancel/save footer. */
export function Modal({ isOpen, onClose, title, btnClass, onSave, saveLabel, wide, children }: {
  isOpen: boolean; onClose: () => void; title: string; btnClass?: string;
  onSave: () => void; saveLabel?: string; wide?: boolean; children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <ModalShell onClose={onClose} maxWidthClass={wide ? "max-w-4xl" : "max-w-lg"}>
      <ModalHeader title={title} />
      <div className="max-h-[75vh] overflow-y-auto p-4 space-y-4 text-xs">{children}</div>
      <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
        <button onClick={onClose} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">キャンセル</button>
        <button onClick={onSave} className={`rounded px-4 py-1.5 text-xs text-white font-bold ${btnClass || "bg-blue-600 hover:bg-blue-700"}`}>{saveLabel || "追加"}</button>
      </div>
    </ModalShell>
  );
}

// ============================================================
// Charts
// ============================================================

/** Bar chart wrapper with Y-axis labels (max / mid) */
export function BarChart({ height, maxValue, unit, children }: {
  height: number; maxValue: number; unit?: string; children: React.ReactNode;
}) {
  const label = unit || "万";
  const maxLabel = maxValue >= 10000 ? `${(maxValue / 10000).toFixed(maxValue >= 100000 ? 0 : 1)}${label}` : `${Math.round(maxValue)}${label}`;
  const midLabel = maxValue >= 10000 ? `${(maxValue / 2 / 10000).toFixed(maxValue >= 100000 ? 0 : 1)}` : `${Math.round(maxValue / 2)}`;
  return (
    <div className="flex">
      <div className="flex flex-col justify-between text-[8px] text-gray-400 pr-1 shrink-0 w-8 text-right" style={{ height }}>
        <span className="leading-none">{maxLabel}</span>
        <span className="leading-none">{midLabel}</span>
        <span className="leading-none">0</span>
      </div>
      <div className="flex-1 flex items-end gap-px border-l border-gray-200" style={{ height }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Segmented control / link toggle
// ============================================================

/** Toggle button group (2-N options) */
export function Btns<T extends string | number | boolean>({ options, value, onChange, color, disabled, label }: {
  options: { value: T; label: string; title?: string }[];
  value: T; onChange: (v: T) => void;
  color?: string; disabled?: boolean;
  /** Optional muted caption rendered to the left. */
  label?: React.ReactNode;
}) {
  const activeClass = color === "green" ? "bg-green-600 text-white"
    : color === "indigo" ? "bg-indigo-600 text-white"
    : color === "pink" ? "bg-pink-600 text-white"
    : color === "slate" ? "bg-slate-700 text-white"
    : "bg-blue-600 text-white";
  return (
    <span className="inline-flex items-center gap-1">
      {label && <span className="whitespace-nowrap text-[10px] text-gray-500">{label}</span>}
      <span className={`inline-flex gap-px rounded bg-gray-100 p-px ${disabled ? "opacity-50" : ""}`} role="group">
        {options.map(o => (
          <button key={String(o.value)} type="button" title={o.title} disabled={disabled} onClick={() => !disabled && onChange(o.value)}
            className={`rounded px-2 py-0.5 text-[10px] transition-colors ${value === o.value ? activeClass : "text-gray-600 hover:bg-white"}`}>
            {o.label}
          </button>
        ))}
      </span>
    </span>
  );
}

/** Link toggle button (🔗A / ✏️独自) */
export function Lnk({ linked, onToggle }: { linked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className={`text-[10px] rounded px-1.5 py-0.5 ${linked ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-600"}`}
      title={linked ? "Aにリンク中（独自設定に変更）" : "独自設定中（Aにリンク）"}>
      {linked ? "🔗A" : "✏️独自"}
    </button>
  );
}

/** Small text-style action button (＋追加 / クリア …). */
export function MiniBtn({ children, onClick, tone = "blue", disabled, title }: {
  children: React.ReactNode; onClick: () => void; tone?: "blue" | "gray" | "red" | "green"; disabled?: boolean; title?: string;
}) {
  const cls = tone === "red" ? "bg-red-50 text-red-400 hover:bg-red-100"
    : tone === "gray" ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
    : tone === "green" ? "bg-green-50 text-green-700 hover:bg-green-100"
    : "bg-blue-50 text-blue-600 hover:bg-blue-100";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`rounded px-1.5 py-0.5 text-[10px] ${cls} ${disabled ? "opacity-40" : ""}`}>
      {children}
    </button>
  );
}
