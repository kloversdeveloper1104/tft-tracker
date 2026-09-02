import type { ReactNode } from "react";

/** Glass tooltip shell used by recharts custom tooltips. */
export function ChartTip({ title, rows }: { title: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs shadow-pop min-w-[140px]">
      <div className="font-semibold text-fg mb-1">{title}</div>
      <div className="flex flex-col gap-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-fg-muted">
              {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="tabular-nums text-fg">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const CHART_AXIS = {
  tick: { fill: "var(--color-fg-subtle)", fontSize: 11 },
  axisLine: { stroke: "var(--color-border)" },
  tickLine: false as const,
};

export const CHART_GRID = { stroke: "var(--color-border)", strokeOpacity: 0.6 };

/** Sequential gold ramp: 0 -> surface, 100 -> gold. */
export function heatBg(pct: number): string {
  const p = Math.max(0, Math.min(100, pct));
  return `color-mix(in srgb, var(--color-gold) ${Math.round(p)}%, var(--color-surface-2))`;
}
export function heatFg(pct: number): string {
  return pct >= 50 ? "#1a1405" : "var(--color-fg)";
}
