import type { Schedule } from "./model";

/** age 時点の値。空なら fallback。最初の点より前は最初の値。 */
export function resolveSchedule(s: Schedule, age: number, fallback = 0): number {
  if (!s.length) return fallback;
  let v = s[0].value;
  for (const p of s) {
    if (p.age <= age) v = p.value;
    else break;
  }
  return v;
}

/** age 時点で有効な区間の開始年齢（昇給の起点に使う）。 */
export function scheduleSegmentStart(s: Schedule, age: number): number {
  let start = s.length ? s[0].age : age;
  for (const p of s) {
    if (p.age <= age) start = p.age;
    else break;
  }
  return Math.min(start, age);
}

export function sortSchedule(s: Schedule): Schedule {
  return [...s].sort((a, b) => a.age - b.age);
}

/** 指定年齢に点を追加（既存なら上書き） */
export function upsertPoint(s: Schedule, age: number, value: number): Schedule {
  const rest = s.filter(p => p.age !== age);
  return sortSchedule([...rest, { age, value }]);
}

export function removePoint(s: Schedule, age: number): Schedule {
  const out = s.filter(p => p.age !== age);
  return out.length ? out : s; // 最後の1点は消せない
}
