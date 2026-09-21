import { useCallback, useEffect, useState } from "react";

/**
 * Top-view layout preferences (persisted UI state, not part of the scenario JSON).
 *  - showInputs: left input column visible (false = charts take the full width)
 *  - showDetail: right-hand "年齢別の詳細" panel visible (only rendered on ≥2xl screens)
 *  - inputsWidth / detailWidth: column widths in px, set by dragging the splitters
 */
export interface LayoutPrefs {
  showInputs: boolean;
  showDetail: boolean;
  inputsWidth: number;
  detailWidth: number;
  /** Show every scenario's editor side by side instead of one tab at a time. */
  sideBySide: boolean;
}

const KEY = "asset-sim-layout";
export const LAYOUT_DEFAULTS: LayoutPrefs = { showInputs: true, showDetail: false, inputsWidth: 460, detailWidth: 720, sideBySide: false };
export const INPUTS_WIDTH_RANGE: [number, number] = [320, 1800];
/** Charts column never gets narrower than this when dragging splitters. */
export const MIN_CHARTS_WIDTH = 420;
export const DETAIL_WIDTH_RANGE: [number, number] = [420, 1200];

function load(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return LAYOUT_DEFAULTS;
    const p = JSON.parse(raw) as Partial<LayoutPrefs>;
    return { ...LAYOUT_DEFAULTS, ...p };
  } catch { return LAYOUT_DEFAULTS; }
}

export function useLayoutPrefs() {
  const [prefs, setPrefs] = useState<LayoutPrefs>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } }, [prefs]);
  const set = useCallback(<K extends keyof LayoutPrefs>(k: K, v: LayoutPrefs[K]) => setPrefs(p => ({ ...p, [k]: v })), []);
  const toggle = useCallback((k: "showInputs" | "showDetail" | "sideBySide") => setPrefs(p => ({ ...p, [k]: !p[k] })), []);
  return { prefs, set, toggle };
}

/** Width of an element, tracked with ResizeObserver (0 until mounted). */
export function useElementWidth<T extends HTMLElement>(ref: React.RefObject<T>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Reactive `matchMedia` (e.g. "(min-width: 1024px)"). */
export function useMediaQuery(query: string): boolean {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}
