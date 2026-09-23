/**
 * アプリ状態: 複数プラン・アクティブプラン・表示状態・Undo/Redo・永続化。
 */
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { clonePlan, defaultPlan, newId, PLAN_COLORS, type Plan, type LinkGroup } from "@/domain/model";
import { resolveAll, materialize, overrideGroup, relinkGroup } from "@/domain/link";
import { loadState, saveState, decodeShared, encodeShared, type PersistedState } from "@/lib/persist";

export type View = "dashboard" | "table" | "compare" | "risk" | "report";
export type SectionKey = "family" | "income" | "living" | "housing" | "children" | "invest" | "events" | "risk" | "settings";

export interface AppState {
  plans: Plan[];
  activeId: string;
  compareIds: string[];
  view: View;
  section: SectionKey;
  selectedAge: number | null;
  onboarded: boolean;
  editorOpen: boolean;
  past: Plan[][];
  future: Plan[][];
}

type Action =
  | { type: "plan/update"; id: string; plan: Plan; undoable?: boolean }
  | { type: "plan/add"; plan: Plan }
  | { type: "plan/remove"; id: string }
  | { type: "plan/setActive"; id: string }
  | { type: "compare/toggle"; id: string }
  | { type: "ui/view"; view: View }
  | { type: "ui/section"; section: SectionKey }
  | { type: "ui/selectAge"; age: number | null }
  | { type: "ui/editor"; open: boolean }
  | { type: "onboarded" }
  | { type: "undo" } | { type: "redo" }
  | { type: "import"; state: PersistedState }
  | { type: "reset" };

const MAX_HISTORY = 60;

function pushHistory(s: AppState): Pick<AppState, "past" | "future"> {
  return { past: [...s.past.slice(-MAX_HISTORY + 1), s.plans], future: [] };
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "plan/update": {
      const plans = s.plans.map(p => (p.id === a.id ? a.plan : p));
      return { ...s, plans, ...(a.undoable === false ? {} : pushHistory(s)) };
    }
    case "plan/add":
      return { ...s, plans: [...s.plans, a.plan], activeId: a.plan.id, compareIds: [...new Set([...s.compareIds, a.plan.id])], ...pushHistory(s) };
    case "plan/remove": {
      if (s.plans.length <= 1) return s;
      // 削除するプランにリンクしているプランは独立化する
      const plans = s.plans.filter(p => p.id !== a.id).map(p => (p.link?.baseId === a.id ? materialize(p, s.plans) : p));
      return { ...s, plans, activeId: s.activeId === a.id ? plans[0].id : s.activeId, compareIds: s.compareIds.filter(i => i !== a.id), ...pushHistory(s) };
    }
    case "plan/setActive": return { ...s, activeId: a.id };
    case "compare/toggle": return { ...s, compareIds: s.compareIds.includes(a.id) ? s.compareIds.filter(i => i !== a.id) : [...s.compareIds, a.id] };
    case "ui/view": return { ...s, view: a.view };
    case "ui/section": return { ...s, section: a.section, editorOpen: true };
    case "ui/selectAge": return { ...s, selectedAge: a.age };
    case "ui/editor": return { ...s, editorOpen: a.open };
    case "onboarded": return { ...s, onboarded: true };
    case "undo": {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { ...s, plans: prev, past: s.past.slice(0, -1), future: [s.plans, ...s.future], activeId: prev.some(p => p.id === s.activeId) ? s.activeId : prev[0].id, compareIds: syncCompare(s.compareIds, s.plans, prev) };
    }
    case "redo": {
      if (!s.future.length) return s;
      const next = s.future[0];
      return { ...s, plans: next, past: [...s.past, s.plans], future: s.future.slice(1), activeId: next.some(p => p.id === s.activeId) ? s.activeId : next[0].id, compareIds: syncCompare(s.compareIds, s.plans, next) };
    }
    case "import":
      return { ...s, plans: a.state.plans, activeId: a.state.activeId && a.state.plans.some(p => p.id === a.state.activeId) ? a.state.activeId : a.state.plans[0].id, compareIds: a.state.plans.map(p => p.id), onboarded: true, ...pushHistory(s) };
    case "reset": {
      const p = defaultPlan();
      return { ...initialState(null), plans: [p], activeId: p.id, compareIds: [p.id], onboarded: false };
    }
  }
}

/** undo/redo でプラン集合が変わったとき: 消えた id を除き、新たに現れたプランは比較対象に加える */
function syncCompare(ids: string[], before: Plan[], after: Plan[]): string[] {
  const appeared = after.filter(p => !before.some(b => b.id === p.id)).map(p => p.id);
  return [...new Set([...ids.filter(id => after.some(p => p.id === id)), ...appeared])];
}

function initialState(persisted: PersistedState | null): AppState {
  const plans = persisted?.plans?.length ? persisted.plans : [defaultPlan()];
  return {
    plans,
    activeId: persisted?.activeId && plans.some(p => p.id === persisted.activeId) ? persisted.activeId : plans[0].id,
    compareIds: persisted?.compareIds?.filter(id => plans.some(p => p.id === id)) ?? plans.map(p => p.id),
    view: "dashboard",
    section: "family",
    selectedAge: null,
    onboarded: persisted?.onboarded ?? false,
    editorOpen: typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
    past: [], future: [],
  };
}

const Ctx = createContext<{ state: AppState; dispatch: (a: Action) => void; resolved: Plan[] } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, () => initialState(loadState()));
  // URL 共有からの読み込み（初回のみ）
  const loadedShare = useRef(false);
  useEffect(() => {
    if (loadedShare.current) return; loadedShare.current = true;
    const hash = window.location.hash;
    if (!hash.startsWith("#p=")) return;
    decodeShared(hash.slice(3)).then(st => {
      if (st) dispatch({ type: "import", state: st });
    });
  }, []);
  // 永続化
  useEffect(() => {
    saveState({ version: 2, plans: state.plans, activeId: state.activeId, compareIds: state.compareIds, onboarded: state.onboarded });
  }, [state.plans, state.activeId, state.compareIds, state.onboarded]);
  // アドレスバーを常に共有 URL に（履歴は増やさない）
  useEffect(() => {
    if (!state.onboarded) return;
    const t = setTimeout(() => { encodeShared(state.plans, state.activeId).then(h => { try { history.replaceState(null, "", `${location.pathname}#p=${h}`); } catch { /* ignore */ } }); }, 600);
    return () => clearTimeout(t);
  }, [state.plans, state.activeId, state.onboarded]);
  // キーボード: Undo/Redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const resolved = useMemo(() => resolveAll(state.plans), [state.plans]);
  const value = useMemo(() => ({ state, dispatch, resolved }), [state, resolved]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

/**
 * アクティブプラン。`plan` はリンク解決後の完全な値（表示・計算用）、`raw` は自分自身のデータ。
 * update は raw を draft として mutate する。リンク中のグループへの編集は UI 側で無効化する。
 */
/**
 * 下書きコンテキスト: ウィザードなど「ストアに反映せずに編集したい」場面で、
 * 入力セクション（useActivePlan を使う）をそのまま下書きプランに向ける。
 */
const DraftCtx = createContext<{ plan: Plan; update: (fn: (d: Plan) => void) => void } | null>(null);
export function DraftPlanProvider({ plan, update, children }: { plan: Plan; update: (fn: (d: Plan) => void) => void; children: ReactNode }) {
  const value = useMemo(() => ({ plan, update }), [plan, update]);
  return <DraftCtx.Provider value={value}>{children}</DraftCtx.Provider>;
}

export function useActivePlan() {
  const { state, dispatch, resolved } = useStore();
  const draft = useContext(DraftCtx);
  if (draft) {
    const update = (fn: (d: Plan) => void) => draft.update(fn);
    return {
      plan: draft.plan, raw: draft.plan, base: null, update, replace: (next: Plan) => draft.update(d => Object.assign(d, next, { id: d.id })),
      isLinked: false, isGroupLinked: () => false, override: () => {}, relink: () => {}, unlink: () => {},
      /** 下書き編集中（ウィザード）。ストア全体に影響する操作はここでは出さない */
      isDraft: true,
    };
  }
  const raw = state.plans.find(p => p.id === state.activeId) ?? state.plans[0];
  const plan = resolved.find(p => p.id === raw.id) ?? raw;
  const base = raw.link ? resolved.find(p => p.id === raw.link!.baseId) ?? null : null;
  const update = (fn: (draft: Plan) => void, opts: { undoable?: boolean } = {}) => {
    const draft = clonePlan(raw);
    fn(draft);
    dispatch({ type: "plan/update", id: raw.id, plan: draft, undoable: opts.undoable });
  };
  const replace = (next: Plan) => dispatch({ type: "plan/update", id: raw.id, plan: { ...next, id: raw.id } });
  return {
    plan, raw, base, update, replace,
    isDraft: false,
    isLinked: !!raw.link && !!base,
    isGroupLinked: (g: LinkGroup) => !!raw.link && !!base && !raw.link.overrides.includes(g),
    override: (g: LinkGroup) => dispatch({ type: "plan/update", id: raw.id, plan: overrideGroup(raw, state.plans, g) }),
    relink: (g: LinkGroup) => dispatch({ type: "plan/update", id: raw.id, plan: relinkGroup(raw, g) }),
    unlink: () => dispatch({ type: "plan/update", id: raw.id, plan: materialize(raw, state.plans) }),
  };
}

/** 全プラン（リンク解決済み） */
export function useResolvedPlans(): Plan[] {
  return useStore().resolved;
}

export function usePlanActions() {
  const { state, dispatch } = useStore();
  return {
    /** 複製。linked=true ならベース（src がリンク中なら同じベース）に連動する別案を作る */
    duplicate(id: string, name?: string, linked = true) {
      const src = state.plans.find(p => p.id === id); if (!src) return;
      const copy = clonePlan(src);
      copy.id = newId("plan");
      copy.name = name ?? `${src.name} のコピー`;
      copy.color = PLAN_COLORS.find(c => !state.plans.some(p => p.color === c)) ?? PLAN_COLORS[state.plans.length % PLAN_COLORS.length];
      copy.link = linked ? { baseId: src.link?.baseId ?? src.id, overrides: src.link ? [...src.link.overrides] : [] } : null;
      if (!linked && src.link) Object.assign(copy, { ...materialize(src, state.plans), id: copy.id, name: copy.name, color: copy.color, link: null });
      dispatch({ type: "plan/add", plan: copy });
    },
    remove(id: string) { dispatch({ type: "plan/remove", id }); },
    setActive(id: string) { dispatch({ type: "plan/setActive", id }); },
    rename(id: string, name: string) {
      const p = state.plans.find(x => x.id === id); if (!p) return;
      dispatch({ type: "plan/update", id, plan: { ...p, name } });
    },
    toggleCompare(id: string) { dispatch({ type: "compare/toggle", id }); },
  };
}
