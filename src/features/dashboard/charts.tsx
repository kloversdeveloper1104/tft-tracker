import { useMemo } from "react";
import { format } from "date-fns";
import { TrendingUp } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { EmptyState } from "@/components/ui";
import { TIER_COLORS, TIER_LABELS_JA } from "@/data/odds";
import { fmtDate } from "@/lib/utils";
import type { MatchSummary, RankSnapshot } from "@/lib/types";
import { AXIS, CHART, ChartTip } from "@/features/matches/shared";

// ----- Placement over time -----------------------------------------------------------
interface PlacePt { date: number; placement: number }

function PlacementTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: PlacePt }> }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return <ChartTip title={fmtDate(d.date)} rows={[{ label: "順位", value: `${d.placement}位`, color: CHART.accent }]} />;
}

export function PlacementChart({ rows, height = 190 }: { rows: MatchSummary[]; height?: number }) {
  const data = useMemo<PlacePt[]>(
    () => rows.slice().reverse().map((m) => ({ date: m.gameDatetime, placement: m.participant.placement })),
    [rows],
  );
  const showDots = data.length <= 50;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
        <defs>
          <linearGradient id="placeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.02} />
            <stop offset="100%" stopColor={CHART.accent} stopOpacity={0.16} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="date" {...AXIS} tickFormatter={(v: number) => format(v, "M/d")} minTickGap={36} />
        <YAxis dataKey="placement" reversed domain={[1, 8]} ticks={[1, 2, 3, 4, 5, 6, 7, 8]} width={30} {...AXIS} />
        <ReferenceLine y={4.5} stroke={CHART.gold} strokeOpacity={0.45} label={{ value: "Top4", position: "insideTopRight", fill: CHART.gold, fontSize: 10, opacity: 0.8 }} />
        <RTooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={<PlacementTip />} />
        <Area
          type="monotone"
          dataKey="placement"
          baseValue={8}
          stroke={CHART.accent}
          strokeWidth={2}
          fill="url(#placeFill)"
          dot={showDots ? { r: 3.5, fill: CHART.accent, stroke: CHART.surface, strokeWidth: 2 } : false}
          activeDot={{ r: 5, fill: CHART.accent, stroke: CHART.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ----- LP history ------------------------------------------------------------------------
const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DIVISIONS = ["IV", "III", "II", "I"];
const APEX_BASE = 7 * 400;

export function rankScore(tier: string, rank: string, lp: number): number {
  const ti = TIER_ORDER.indexOf(tier);
  if (ti < 0) return lp;
  if (ti >= 7) return APEX_BASE + lp;
  const di = Math.max(0, DIVISIONS.indexOf(rank));
  return ti * 400 + di * 100 + lp;
}

function scoreLabel(v: number, withDivision: boolean): string {
  if (v >= APEX_BASE) return withDivision ? `マスター+ ${v - APEX_BASE}` : "マスター+";
  const ti = Math.max(0, Math.floor(v / 400));
  const tier = TIER_LABELS_JA[TIER_ORDER[ti]] ?? "";
  if (!withDivision) return tier;
  const di = Math.floor((v % 400) / 100);
  return `${tier} ${DIVISIONS[di]}`;
}

interface LpPt { date: number; score: number; tier: string; rank: string; lp: number; wins: number; losses: number }

function LpTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: LpPt }> }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  const apex = TIER_ORDER.indexOf(d.tier) >= 7;
  const label = `${TIER_LABELS_JA[d.tier] ?? d.tier}${apex ? "" : ` ${d.rank}`}`;
  return (
    <ChartTip
      title={fmtDate(d.date)}
      rows={[
        { label, value: `${d.lp} LP`, color: TIER_COLORS[d.tier] ?? CHART.gold },
        { label: "戦績", value: `${d.wins}勝 ${d.losses}敗` },
      ]}
    />
  );
}

export function LpChart({ snapshots, height = 190 }: { snapshots: RankSnapshot[]; height?: number }) {
  const data = useMemo<LpPt[]>(() => {
    const sorted = snapshots.slice().sort((a, b) => a.capturedAt - b.capturedAt);
    // collapse runs of identical rank (keep first and last of each run)
    return sorted
      .filter((s, i) => {
        if (i === 0 || i === sorted.length - 1) return true;
        const prev = sorted[i - 1];
        return !(prev.tier === s.tier && prev.rank === s.rank && prev.leaguePoints === s.leaguePoints);
      })
      .map((s) => ({ date: s.capturedAt, score: rankScore(s.tier, s.rank, s.leaguePoints), tier: s.tier, rank: s.rank, lp: s.leaguePoints, wins: s.wins, losses: s.losses }));
  }, [snapshots]);

  if (data.length < 2) {
    return (
      <EmptyState
        className="py-8"
        icon={<TrendingUp />}
        title="ランク履歴はまだありません"
        description="ダッシュボードを開く／同期するたびにランクを記録します。2回以上記録されるとグラフが表示されます。"
      />
    );
  }

  const scores = data.map((d) => d.score);
  const lo = Math.max(0, Math.floor((Math.min(...scores) - 60) / 100) * 100);
  const hi = Math.ceil((Math.max(...scores) + 60) / 100) * 100;
  const wide = hi - lo > 900;
  const step = wide ? 400 : 100;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const boundaries = TIER_ORDER.slice(0, 8)
    .map((t, i) => ({ tier: t, y: i * 400 }))
    .filter((b) => b.y > lo && b.y < hi);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="date" {...AXIS} tickFormatter={(v: number) => format(v, "M/d")} minTickGap={36} />
        <YAxis dataKey="score" domain={[lo, hi]} ticks={ticks} width={wide ? 74 : 92} {...AXIS} tickFormatter={(v: number) => scoreLabel(v, !wide)} />
        {boundaries.map((b) => (
          <ReferenceLine
            key={b.tier}
            y={b.y}
            stroke={TIER_COLORS[b.tier]}
            strokeOpacity={0.45}
            label={{ value: TIER_LABELS_JA[b.tier], position: "insideBottomRight", fill: TIER_COLORS[b.tier], fontSize: 10, opacity: 0.85 }}
          />
        ))}
        <RTooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={<LpTip />} />
        <Line
          type="linear"
          dataKey="score"
          stroke={CHART.gold}
          strokeWidth={2}
          dot={data.length <= 40 ? { r: 3.5, fill: CHART.gold, stroke: CHART.surface, strokeWidth: 2 } : false}
          activeDot={{ r: 5, fill: CHART.gold, stroke: CHART.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
