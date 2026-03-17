import React from "react";
import { BRACKETS } from "../lib/tax";
import { fmt, fmtMan } from "../lib/format";

export function Chart({ markers }: any) {
  const vals = markers.map((m: any) => m.val).filter((v: number) => v > 0);
  if (!vals.length) return null;
  const mx = Math.max(...vals) * 1.15;
  const cW = 580, cH = 130, pL = 44, pR = 16, pT = 10, pB = 28;
  const w = cW - pL - pR, h = cH - pT - pB;
  const xp = (v: number) => pL + Math.min(v / mx, 1) * w;
  const ticks = [0, 1950000, 3300000, 6950000, 9000000].filter((v) => v < mx);
  return (
    <div>
      <svg viewBox={`0 0 ${cW} ${cH}`} className="block w-full">
        {BRACKETS.filter((b) => b.lo < mx).map((b) => {
          const x1 = xp(b.lo), x2 = xp(Math.min(b.hi, mx)), bh = (b.r / 50) * h;
          return (
            <g key={b.lo}>
              <rect x={x1} y={pT + h - bh} width={x2 - x1} height={bh} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.5} />
              <text x={(x1 + x2) / 2} y={pT + h - bh - 3} textAnchor="middle" fontSize={9} fill="#64748b" fontWeight="600">{b.r}%</text>
            </g>
          );
        })}
        <line x1={pL} y1={pT + h} x2={pL + w} y2={pT + h} stroke="#334155" strokeWidth={1} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={xp(v)} y1={pT + h} x2={xp(v)} y2={pT + h + 3} stroke="#94a3b8" />
            <text x={xp(v)} y={pT + h + 13} textAnchor="middle" fontSize={7} fill="#94a3b8">{fmtMan(v)}</text>
          </g>
        ))}
        {markers.map((m: any) => (
          <g key={m.id}>
            <line x1={xp(m.val)} y1={pT} x2={xp(m.val)} y2={pT + h} stroke={m.color} strokeWidth={m.thick || 1.5} strokeDasharray={m.dash || ""} opacity={m.opacity || 1} />
            <circle cx={xp(m.val)} cy={pT + h} r={2.5} fill={m.color} opacity={m.opacity || 1} />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {markers.map((m: any) => (
          <div key={m.id} className="flex items-center gap-1">
            <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={m.color} strokeWidth={m.thick || 1.5} strokeDasharray={m.dash || ""} opacity={m.opacity || 1} /></svg>
            <span style={{ color: m.color, fontWeight: 600 }}>{m.label}</span>
            <span className="text-gray-400">¥{fmt(m.val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
