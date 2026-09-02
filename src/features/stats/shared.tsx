// Small presentational pieces shared by the stats tabs.
import type { ReactNode } from "react";
import { cn, avgPlacementColor, fmtPct, fmtPlacement } from "@/lib/utils";
import { Badge } from "@/components/ui";
import type { ItemKind } from "@/lib/types";

export function PlacementText({ value, className, bold }: { value: number; className?: string; bold?: boolean }) {
  return (
    <span className={cn("tabular-nums", bold && "font-semibold", className)} style={{ color: avgPlacementColor(value) }}>
      {fmtPlacement(value)}
    </span>
  );
}

export function Pct({ value, digits = 1, className }: { value: number; digits?: number; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{fmtPct(value, digits)}</span>;
}

/** Tiny in-cell horizontal meter (rate vs max). */
export function MiniBar({ value, max, color = "var(--color-accent)", className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-1 w-full rounded-full bg-surface-3 overflow-hidden", className)}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Chips<T extends string | number>({ items, value, onChange, className }: {
  items: { value: T; label: ReactNode; color?: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} role="radiogroup">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={String(it.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            className={cn(
              "h-7 px-2.5 rounded-full text-xs font-medium border transition-colors focus-ring whitespace-nowrap",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              active ? "bg-surface-3 border-border-strong text-fg" : "bg-transparent border-border text-fg-muted hover:text-fg hover:bg-surface-2",
            )}
            style={active && it.color ? { color: it.color, borderColor: `color-mix(in srgb, ${it.color} 50%, transparent)`, background: `color-mix(in srgb, ${it.color} 14%, transparent)` } : undefined}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control with per-item disabled support. */
export function Segmented<T extends string>({ items, value, onChange, className }: {
  items: { id: T; label: ReactNode; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("inline-flex items-center gap-1 rounded-lg bg-bg-elev p-1 border border-border", className)}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={it.disabled}
            title={it.title}
            onClick={() => onChange(it.id)}
            className={cn(
              "h-7 px-2.5 rounded-md text-xs font-medium transition-all duration-150 focus-ring whitespace-nowrap",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              active ? "bg-surface-3 text-fg shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]" : "text-fg-muted hover:text-fg hover:bg-surface-2",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Stat tile: label / proportional-figure value / optional sub. */
export function StatTile({ label, value, sub, color, className, children }: {
  label: ReactNode; value?: ReactNode; sub?: ReactNode; color?: string; className?: string; children?: ReactNode;
}) {
  return (
    <div className={cn("card px-4 py-3 flex flex-col gap-1 min-w-0", className)}>
      <span className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium">{label}</span>
      {value !== undefined && (
        <span className="text-2xl font-semibold leading-tight" style={color ? { color } : undefined}>{value}</span>
      )}
      {sub && <span className="text-xs text-fg-muted">{sub}</span>}
      {children}
    </div>
  );
}

export const KIND_LABELS: Record<ItemKind, string> = {
  component: "素材",
  completed: "完成",
  emblem: "紋章",
  artifact: "遺物",
  radiant: "光輝",
  support: "サポート",
  special: "特殊",
  other: "その他",
};

const KIND_COLORS: Partial<Record<ItemKind, string>> = {
  completed: "var(--color-accent)",
  emblem: "var(--color-gold)",
  artifact: "var(--color-trait-unique)",
  radiant: "var(--color-trait-prismatic)",
  support: "var(--color-teal)",
  component: "var(--color-fg-subtle)",
};

export function KindBadge({ kind }: { kind: ItemKind | undefined }) {
  const k = kind ?? "other";
  return <Badge size="xs" color={KIND_COLORS[k] ?? "var(--color-fg-subtle)"}>{KIND_LABELS[k]}</Badge>;
}

export const AUG_TIER_LABELS: Record<number, string> = { 0: "不明", 1: "シルバー", 2: "ゴールド", 3: "プリズム" };
export const AUG_TIER_COLORS: Record<number, string> = { 0: "var(--color-fg-subtle)", 1: "#c0cad9", 2: "#f0c250", 3: "#a8f5ff" };

export function TierBadge({ tier }: { tier: number }) {
  return <Badge size="xs" color={AUG_TIER_COLORS[tier] ?? AUG_TIER_COLORS[0]}>{AUG_TIER_LABELS[tier] ?? AUG_TIER_LABELS[0]}</Badge>;
}

export function StageChip({ stage }: { stage: number }) {
  if (!stage) return <span className="text-fg-subtle text-xs">–</span>;
  return (
    <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded bg-surface-3 border border-border text-[11px] font-semibold tabular-nums text-fg-muted">
      {stage}
    </span>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11px] uppercase tracking-wider text-fg-subtle font-semibold", className)}>{children}</div>;
}
