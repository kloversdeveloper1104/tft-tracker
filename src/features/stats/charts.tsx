// Charts for the stats page. Built per the dataviz method:
// one hue per single-series chart (validated on the dark surface), thin bars with a rounded
// data-end, hairline solid grid, per-mark hover tooltip, table twin always rendered beside it.
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtPct, fmtPlacement } from "@/lib/utils";

/** Categorical slot 1 (dark) from the dataviz reference palette; passes all six checks on #161d2f. */
export const SERIES_1 = "#3987e5";
export const SERIES_1_ACTIVE = "#5598e7";
export const SERIES_2 = "#d95926";
export const SERIES_3 = "#199e70";

export interface PlacementRow {
  key: string;
  label: string;
  /** average placement 1..8 */
  value: number;
  games?: number;
  top4Rate?: number;
  winRate?: number;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function PlacementTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: PlacementRow }> }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs shadow-pop min-w-40">
      <div className="text-fg-muted mb-1 truncate">{row.label}</div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 text-fg-muted"><span className="inline-block w-3 h-0.5 rounded" style={{ background: SERIES_1 }} />平均順位</span>
        <span className="font-semibold text-fg tabular-nums">{fmtPlacement(row.value)}</span>
      </div>
      {row.games !== undefined && (
        <div className="flex items-baseline justify-between gap-4"><span className="text-fg-muted">試合数</span><span className="text-fg tabular-nums">{row.games.toLocaleString()}</span></div>
      )}
      {row.top4Rate !== undefined && (
        <div className="flex items-baseline justify-between gap-4"><span className="text-fg-muted">Top4率</span><span className="text-fg tabular-nums">{fmtPct(row.top4Rate)}</span></div>
      )}
      {row.winRate !== undefined && (
        <div className="flex items-baseline justify-between gap-4"><span className="text-fg-muted">1位率</span><span className="text-fg tabular-nums">{fmtPct(row.winRate)}</span></div>
      )}
    </div>
  );
}

/**
 * Horizontal bar chart of average placement per category. Placement axis runs 1 (best) -> 8;
 * bars grow from 1 so a shorter bar is better. Rows are expected to be sorted best-first so
 * the best entry sits at the top. An optional reference line marks the overall average.
 */
export function PlacementBarChart({ rows, reference, referenceLabel = "全体平均", labelWidth = 132 }: {
  rows: PlacementRow[]; reference?: number; referenceLabel?: string; labelWidth?: number;
}) {
  if (rows.length === 0) return null;
  const height = rows.length * 30 + 44; // plot + x-axis band
  let bestIdx = 0;
  rows.forEach((r, i) => { if (r.value < rows[bestIdx].value) bestIdx = i; });
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeWidth={1} />
          <XAxis
            type="number"
            domain={[1, 8]}
            ticks={[1, 2, 3, 4, 5, 6, 7, 8]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--color-fg-subtle)", fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            interval={0}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => truncate(v, 12)}
            tick={{ fill: "var(--color-fg-muted)", fontSize: 11 }}
          />
          <Tooltip content={<PlacementTip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} isAnimationActive={false} />
          {reference !== undefined && (
            <ReferenceLine
              x={reference}
              stroke="var(--color-fg-subtle)"
              strokeDasharray="4 3"
              label={{ value: `${referenceLabel} ${fmtPlacement(reference)}`, position: "insideTopRight", fill: "var(--color-fg-subtle)", fontSize: 10 }}
            />
          )}
          <Bar
            dataKey="value"
            fill={SERIES_1}
            barSize={16}
            radius={[0, 4, 4, 0]}
            activeBar={{ fill: SERIES_1_ACTIVE }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="value"
              content={(p: object) => {
                const q = p as { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number };
                if (q.index !== bestIdx) return null;
                const x = Number(q.x) + Number(q.width) + 6;
                const y = Number(q.y) + Number(q.height) / 2;
                return (
                  <text x={x} y={y} dy={4} fontSize={11} fontWeight={600} fill="var(--color-fg)" className="tabular-nums">
                    {fmtPlacement(rows[bestIdx].value)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
