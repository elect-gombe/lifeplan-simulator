/**
 * 年齢ごとに値が変わる系列（Schedule）のエディタ。
 * 「現在の値」＋「○歳から △ に変わる」の行を追加するモデル。ミニチャートで階段と年齢を表示。
 */
import { Plus, Trash2 } from "lucide-react";
import type { Schedule } from "@/domain/model";
import { sortSchedule } from "@/domain/schedule";
import { useSize } from "@/charts/base";
import { NumField, cx } from "./primitives";

export function ScheduleEditor({ value, onChange, unit, step = 10, min = 0, max, startAge, endAge, label, help, color = "var(--accent)" }: {
  value: Schedule; onChange: (s: Schedule) => void; unit: string; step?: number; min?: number; max?: number;
  startAge: number; endAge: number; label?: string; help?: string; color?: string;
}) {
  const s = sortSchedule(value.length ? value : [{ age: startAge, value: 0 }]);
  const setAt = (i: number, patch: Partial<{ age: number; value: number }>) => {
    const next = s.map((p, j) => (j === i ? { ...p, ...patch } : p));
    onChange(sortSchedule(next));
  };
  const add = () => {
    const last = s[s.length - 1];
    const age = Math.min(endAge - 1, last.age + 5);
    if (s.some(p => p.age === age)) return;
    onChange(sortSchedule([...s, { age, value: last.value }]));
  };
  const remove = (i: number) => { if (s.length > 1) onChange(s.filter((_, j) => j !== i)); };

  return (
    <div>
      {label && <div className="label mb-1">{label}{help && <span className="hint ml-2 font-normal">{help}</span>}</div>}
      <MiniSteps s={s} startAge={startAge} endAge={endAge} color={color} unit={unit} />
      <div className="mt-2 space-y-1.5">
        {s.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            {i === 0 ? (
              <span className="text-xs ink-2 w-[116px] shrink-0 pl-1">現在（{p.age}歳）〜</span>
            ) : (
              <NumField value={p.age} onChange={v => setAt(i, { age: v })} unit="歳〜" step={1} min={startAge + 1} max={endAge} size="sm" className="w-[116px] shrink-0" />
            )}
            <NumField value={p.value} onChange={v => setAt(i, { value: v })} unit={unit} step={step} min={min} max={max} size="sm" className="flex-1" />
            <button type="button" onClick={() => remove(i)} disabled={s.length <= 1} aria-label="削除" className={cx("tap btn btn-ghost px-1.5 py-1", s.length <= 1 && "invisible")}><Trash2 size={14} /></button>
          </div>
        ))}
        <button type="button" onClick={add} className="btn btn-ghost text-xs px-2 py-1 -ml-1"><Plus size={14} />変化を追加</button>
      </div>
    </div>
  );
}

/** 階段グラフ。各キーフレームに値（上段）と年齢（下段）を出し、重なるラベルだけ間引く。 */
function MiniSteps({ s, startAge, endAge, color, unit }: { s: Schedule; startAge: number; endAge: number; color: string; unit: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const W = Math.max(size.width || 320, 160);
  const H = 64, TOP = 12, BOTTOM = 16, PAD = 6; // BOTTOM は年齢ラベルの帯
  const maxV = Math.max(...s.map(p => p.value), 1);
  const x = (age: number) => PAD + (W - PAD * 2) * (Math.min(Math.max(age, startAge), endAge) - startAge) / Math.max(endAge - startAge, 1);
  const y = (v: number) => H - BOTTOM - (H - TOP - BOTTOM) * (v / maxV);
  const base = H - BOTTOM;

  let d = `M ${x(startAge)} ${y(s[0].value)}`;
  for (let i = 0; i < s.length; i++) {
    const next = s[i + 1];
    d += ` H ${x(next ? next.age : endAge)}`;
    if (next) d += ` V ${y(next.value)}`;
  }

  const unitShort = unit.replace("万円", "万");
  const est = (txt: string) => txt.length * 5.4 + 6;
  let vRight = -Infinity, aRight = -Infinity;
  const labels = s.map(p => {
    const px = x(p.age);
    const vText = `${p.value.toLocaleString()}${unitShort}`;
    const vShow = px > vRight;
    if (vShow) vRight = px + est(vText);
    const aText = `${p.age}歳`;
    const aCenter = Math.min(Math.max(px, est(aText) / 2), W - est(aText) / 2);
    const aShow = aCenter - est(aText) / 2 > aRight;
    if (aShow) aRight = aCenter + est(aText) / 2;
    return { px, vText, vShow, aText, aCenter, aShow };
  });
  const endText = `${endAge}歳`;
  const showEnd = W - est(endText) > aRight;

  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full rounded-md surface-2"
        role="img" aria-label={`年齢ごとの推移: ${s.map(p => `${p.age}歳 ${p.value}${unitShort}`).join("、")}（${endAge}歳まで）`}>
        <path d={`${d} V ${base} H ${x(startAge)} Z`} fill={color} opacity={0.12} />
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <line x1={PAD} x2={W - PAD} y1={base} y2={base} stroke="var(--line-strong)" />
        {s.map((p, i) => {
          const L = labels[i];
          return (
            <g key={i}>
              {i > 0 && <line x1={L.px} x2={L.px} y1={TOP - 4} y2={base} stroke="var(--ink-3)" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.7} />}
              <circle cx={L.px} cy={y(p.value)} r={2.5} fill={color} />
              {L.vShow && <text x={Math.min(L.px + 4, Math.max(W - est(L.vText), 2))} y={Math.max(y(p.value) - 4, 9)} fontSize={9.5} fill="var(--ink-2)">{L.vText}</text>}
            </g>
          );
        })}
        {labels.map((L, i) => L.aShow && (
          <text key={i} x={L.aCenter} y={H - 4} fontSize={9.5} fill="var(--ink-3)" textAnchor="middle" className="tabular">{L.aText}</text>
        ))}
        {showEnd && <text x={W - 3} y={H - 4} fontSize={9.5} fill="var(--ink-3)" textAnchor="end" className="tabular">{endText}</text>}
      </svg>
    </div>
  );
}
