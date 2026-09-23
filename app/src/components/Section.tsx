import React, { useState, useCallback } from "react";

export const LinkBadge = ({ linked }: { linked?: boolean }) =>
  linked ? <span className="text-[9px] bg-gray-200 text-gray-500 rounded px-1 py-px">🔗A</span> : null;

export function Section({ id, title, icon, borderColor, bgOpen, open, onToggle, badge, right, children, linked }: {
  id?: string; title: string; icon?: string; borderColor: string; bgOpen?: string;
  open: boolean; onToggle: () => void; badge?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
  linked?: boolean;
}) {
  return (
    <div id={id} className={`rounded-md border-l-[3px] transition-colors duration-150 ${open ? bgOpen || "bg-gray-50/50" : "hover:bg-gray-50/50"}`} style={{ borderLeftColor: borderColor }}>
      <div className={`flex items-center justify-between px-2 py-1.5 cursor-pointer select-none rounded-r-md ${!open ? "hover:bg-gray-100/60" : ""}`} onClick={onToggle}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`w-4 shrink-0 text-center text-[11px] transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`} style={{ color: borderColor }}>▼</span>
          {icon && <span className="shrink-0 text-xs">{icon}</span>}
          <span className="shrink-0 whitespace-nowrap text-xs font-bold" style={{ color: borderColor }}>{title}</span>
          <LinkBadge linked={linked} />
          {badge && <span className="min-w-0 truncate">{badge}</span>}
        </div>
        {right && <div className="ml-2 shrink-0" onClick={e => e.stopPropagation()}>{right}</div>}
      </div>
      <div className="grid transition-[grid-template-rows] duration-200 ease-in-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="px-2 pb-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function usePersistedSet(key: string): [Set<number>, (fn: (prev: Set<number>) => Set<number>) => void] {
  const [set, setSet] = useState<Set<number>>(() => {
    try { const v = localStorage.getItem(key); return v ? new Set(JSON.parse(v)) : new Set(); } catch { return new Set(); }
  });
  const update = useCallback((fn: (prev: Set<number>) => Set<number>) => {
    setSet(prev => {
      const next = fn(prev);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [key]);
  return [set, update];
}
