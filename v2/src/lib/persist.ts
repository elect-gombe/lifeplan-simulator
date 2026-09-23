/** localStorage / URL 共有 / JSON ファイルの入出力。 */
import type { Plan } from "@/domain/model";
import { normalizePlan } from "./normalize";
import { convertLegacy, isLegacyState } from "./legacyImport";

export const STORAGE_KEY = "lifeplan-v2";

export interface PersistedState {
  version: 2;
  plans: Plan[];
  activeId: string;
  compareIds?: string[];
  onboarded?: boolean;
}

export function parseState(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (isLegacyState(o)) {
    const plans = convertLegacy(o);
    return plans.length ? { version: 2, plans, activeId: plans[0].id, onboarded: true } : null;
  }
  const plans = Array.isArray(o.plans) ? (o.plans as unknown[]).map(normalizePlan).filter((p): p is Plan => !!p) : [];
  if (!plans.length) return null;
  return { version: 2, plans, activeId: String(o.activeId ?? plans[0].id), compareIds: Array.isArray(o.compareIds) ? (o.compareIds as string[]) : undefined, onboarded: o.onboarded === true };
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseState(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function saveState(s: PersistedState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

export function downloadJSON(s: PersistedState, filename = `lifeplan-${new Date().toISOString().slice(0, 10)}.json`): void {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function readJSONFile(file: File): Promise<PersistedState | null> {
  try { return parseState(JSON.parse(await file.text())); } catch { return null; }
}

// ── URL 共有（gzip + base64url） ────────────────────────────
function toBase64Url(bytes: Uint8Array): string {
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(s: string): Uint8Array {
  let b = s.replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "=";
  const bin = atob(b); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeShared(plans: Plan[], activeId: string): Promise<string> {
  const json = JSON.stringify({ version: 2, plans, activeId });
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return toBase64Url(new Uint8Array(buf));
}

export async function decodeShared(encoded: string): Promise<PersistedState | null> {
  try {
    const bytes = fromBase64Url(encoded);
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    const json = await new Response(stream).text();
    return parseState(JSON.parse(json));
  } catch { return null; }
}
