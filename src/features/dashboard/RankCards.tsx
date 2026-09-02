import { Flame, Shield } from "lucide-react";
import { Skeleton, Tooltip } from "@/components/ui";
import { TIER_COLORS, TIER_LABELS_JA } from "@/data/odds";
import { cn, fmtPct } from "@/lib/utils";
import type { LeagueEntry } from "@/lib/types";

const QUEUE_ORDER = ["RANKED_TFT", "RANKED_TFT_DOUBLE_UP", "RANKED_TFT_TURBO"] as const;
const QUEUE_NAMES: Record<string, string> = {
  RANKED_TFT: "ランク",
  RANKED_TFT_DOUBLE_UP: "ダブルアップ",
  RANKED_TFT_TURBO: "ハイパーロール",
};
const RATED_TIERS: Record<string, { label: string; color: string }> = {
  ORANGE: { label: "オレンジ", color: "#ff9b3d" },
  PURPLE: { label: "パープル", color: "#b56cff" },
  BLUE: { label: "ブルー", color: "#4f8cff" },
  GREEN: { label: "グリーン", color: "#3fbf6f" },
  GRAY: { label: "グレー", color: "#8a8378" },
};
const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

function Emblem({ color, size = 44, dim }: { color: string; size?: number; dim?: boolean }) {
  return (
    <div
      className={cn("hex-clip flex items-center justify-center shrink-0", dim && "opacity-40")}
      style={{ width: size, height: size, background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 45%, #000))` }}
    >
      <Shield className="fill-current" style={{ width: size * 0.5, height: size * 0.5, color: "rgba(0,0,0,0.55)" }} />
    </div>
  );
}

export function RankCard({ queueType, entry }: { queueType: string; entry?: LeagueEntry }) {
  const name = QUEUE_NAMES[queueType] ?? queueType;
  if (!entry || (!entry.tier && !entry.ratedTier)) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-elev/60 px-3.5 py-3 min-w-[210px]">
        <Emblem color="#5b6478" dim />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium">{name}</div>
          <div className="text-sm font-semibold text-fg-muted">未ランク</div>
        </div>
      </div>
    );
  }
  const games = entry.wins + entry.losses;
  const top4 = games > 0 ? entry.wins / games : 0;
  const rated = entry.ratedTier ? RATED_TIERS[entry.ratedTier] : undefined;
  const tier = entry.tier ?? "";
  const color = rated?.color ?? TIER_COLORS[tier] ?? "#8a8378";
  const tierLabel = rated?.label ?? TIER_LABELS_JA[tier] ?? tier;
  const division = !rated && entry.rank && !APEX.has(tier) ? entry.rank : "";
  const points = rated ? entry.ratedRating ?? entry.leaguePoints : entry.leaguePoints;

  return (
    <div
      className="relative flex items-center gap-3 rounded-xl border px-3.5 py-3 min-w-[230px] overflow-hidden transition-transform duration-150 hover:-translate-y-px"
      style={{ borderColor: `color-mix(in srgb, ${color} 35%, var(--color-border))`, background: `linear-gradient(135deg, color-mix(in srgb, ${color} 10%, var(--color-bg-elev)), var(--color-bg-elev) 70%)` }}
    >
      <Emblem color={color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium">{name}</span>
          {entry.hotStreak && (
            <Tooltip content="連勝中">
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning bg-warning/10 border border-warning/30 rounded-full px-1.5"><Flame className="size-3" />HOT</span>
            </Tooltip>
          )}
        </div>
        <div className="flex items-baseline gap-1.5 leading-tight">
          <span className="text-sm font-bold" style={{ color }}>{tierLabel}{division && ` ${division}`}</span>
          <span className="text-xs font-semibold tabular-nums text-fg">{points}{rated ? "" : " LP"}</span>
        </div>
        <div className="text-[11px] text-fg-muted tabular-nums">
          <span className="text-fg">{entry.wins}</span>勝 <span className="text-fg">{entry.losses}</span>敗
          <span className="text-border-strong mx-1.5">·</span>
          Top4 <span className="text-fg">{fmtPct(top4, 0)}</span>
        </div>
      </div>
    </div>
  );
}

export function RankCards({ entries, loading }: { entries?: LeagueEntry[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="flex gap-3">
        {QUEUE_ORDER.map((q) => <Skeleton key={q} className="h-[70px] w-[230px] rounded-xl" />)}
      </div>
    );
  }
  return (
    <div className="flex gap-3 flex-wrap">
      {QUEUE_ORDER.map((q) => <RankCard key={q} queueType={q} entry={entries?.find((e) => e.queueType === q)} />)}
    </div>
  );
}
