import React, { useEffect, useRef, useState } from "react";

/** Sticky side panel (ultra-wide screens only) that reports its width to children. */
export function PanelContainer({ children }: { children: (width: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="hidden 2xl:block min-w-[1000px] flex-1 shrink-0 ml-3 sticky top-3 max-h-[calc(100vh-24px)] rounded-lg border bg-white shadow-lg overflow-auto">
      {children(w)}
    </div>
  );
}
