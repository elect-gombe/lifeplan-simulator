import { useMemo } from "react";
import type { Plan } from "@/domain/model";
import { simulate, type SimResult } from "@/engine/simulate";
import { summarize, type Summary } from "@/engine/summary";

export interface SimBundle { res: SimResult; summary: Summary }

/**
 * シミュレーション結果のキャッシュ（2 段）:
 *  1. プランオブジェクトの同一性（WeakMap）— 再レンダーで同じ plan が渡されたとき
 *  2. 計算に影響する内容のハッシュ（LRU）— 名前・色・リンク情報だけが変わった、Undo/Redo で以前の状態に戻った、など
 * 名称変更やプラン切替では一切再計算しない。
 */
const byIdentity = new WeakMap<Plan, SimBundle>();
const byContent = new Map<string, SimBundle>();
const MAX_CONTENT = 48;

/** 計算結果に影響しないメタ情報を除いたキー */
export function simKey(plan: Plan): string {
  const { id: _id, name: _name, color: _color, link: _link, ...rest } = plan;
  return JSON.stringify(rest);
}

export function runSim(plan: Plan): SimBundle {
  const fast = byIdentity.get(plan);
  if (fast) return fast;
  const key = simKey(plan);
  let hit = byContent.get(key);
  if (hit) {
    // LRU: 末尾に移動
    byContent.delete(key); byContent.set(key, hit);
  } else {
    const res = simulate(plan);
    hit = { res, summary: summarize(res) };
    byContent.set(key, hit);
    if (byContent.size > MAX_CONTENT) byContent.delete(byContent.keys().next().value!);
  }
  byIdentity.set(plan, hit);
  return hit;
}

export function useSim(plan: Plan): SimBundle {
  return useMemo(() => runSim(plan), [plan]);
}
