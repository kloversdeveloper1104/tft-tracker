import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import { QUEUES } from "@/data/odds";
import { cn } from "@/lib/utils";
import type { MatchUnit } from "@/lib/types";
import type { SetLookup } from "./hooks";

// ----- Labels ----------------------------------------------------------------------
export function queueLabel(queueId: number, gameType?: string): string {
  const q = QUEUES.find((x) => x.id === queueId);
  if (q) return q.label;
  if (gameType === "pairs") return "ダブルアップ";
  if (gameType === "turbo") return "ハイパーロール";
  return `Queue ${queueId}`;
}

/** Extract "15.17" from "Version 15.17.703.1234 (...)" */
export function patchLabel(gameVersion: string): string {
  const m = gameVersion.match(/(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : gameVersion;
}

/** Board order: cost desc, then stars desc. */
export function sortUnits(units: MatchUnit[], lookup: SetLookup): MatchUnit[] {
  return [...units].sort((a, b) => lookup.unitCost(b) - lookup.unitCost(a) || b.tier - a.tier);
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

// ----- States ------------------------------------------------------------------------
export function ErrorState({ message, onRetry, retrying, className }: {
  message?: string; onRetry?: () => void; retrying?: boolean; className?: string;
}) {
  return (
    <EmptyState
      className={className}
      icon={<AlertTriangle />}
      title="読み込みに失敗しました"
      description={message}
      action={onRetry && (
        <Button onClick={onRetry} loading={retrying} icon={<RefreshCw className="size-4" />}>再試行</Button>
      )}
    />
  );
}

export function RowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[92px] rounded-xl" />
      ))}
    </div>
  );
}

// ----- Chart theme (dark surface) -------------------------------------------------------
export const CHART = {
  accent: "#7c9cff",
  gold: "#e8b84a",
  teal: "#5ee7d6",
  muted: "#3b4a6b",
  grid: "#263049",
  axis: "#6c7793",
  surface: "#161d2f",
} as const;

export const AXIS = {
  tick: { fill: CHART.axis, fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;

export function ChartTip({ title, rows }: {
  title: ReactNode;
  rows: { label: ReactNode; value: ReactNode; color?: string }[];
}) {
  return (
    <div className="glass rounded-lg px-3 py-2 shadow-pop text-xs min-w-[140px]">
      <div className="text-fg-subtle mb-1">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-fg-muted">
            {r.color && <span className="inline-block w-3 h-0.5 rounded" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-semibold tabular-nums text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
