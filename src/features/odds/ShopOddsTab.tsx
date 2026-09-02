import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Card, Tooltip } from "@/components/ui";
import { COST_COLORS } from "@/data/odds";
import { cn } from "@/lib/utils";
import type { OddsTable } from "@/lib/types";
import { COSTS, COST_LABELS, LEVELS } from "./data";
import { CHART_AXIS, CHART_GRID, ChartTip, heatBg, heatFg } from "./chartBits";

export function ShopOddsTab({ odds, championsPerCost }: { odds: OddsTable; championsPerCost: Record<number, number> }) {
  const [level, setLevel] = useState(8);
  const [hover, setHover] = useState<{ l: number; c: number } | null>(null);

  const chartData = useMemo(
    () => LEVELS.map((l) => {
      const row = odds.shopOdds[l] ?? [0, 0, 0, 0, 0];
      return { level: l, c1: row[0] ?? 0, c2: row[1] ?? 0, c3: row[2] ?? 0, c4: row[3] ?? 0, c5: row[4] ?? 0 };
    }),
    [odds],
  );
  const selectedRow = odds.shopOdds[level] ?? [0, 0, 0, 0, 0];
  const slots = odds.shopSlots || 5;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-5 animate-fade-in">
      <Card title="レベル別ショップ確率" action={<span className="text-xs text-fg-subtle">セルをクリックでレベル選択</span>} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-fg-subtle">
                <th className="text-left px-4 py-2 font-medium">Lv</th>
                {COSTS.map((c) => (
                  <th key={c} className="px-2 py-2 font-medium text-center">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: COST_COLORS[c] }} />
                      {COST_LABELS[c]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((l) => {
                const row = odds.shopOdds[l] ?? [0, 0, 0, 0, 0];
                const active = l === level;
                return (
                  <tr
                    key={l}
                    className={cn("transition-colors cursor-pointer", active ? "bg-accent/10" : "hover:bg-surface-2")}
                    onClick={() => setLevel(l)}
                  >
                    <td className={cn("px-4 py-1.5 font-semibold", active ? "text-accent" : "text-fg-muted")}>
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("w-1 h-4 rounded-full", active ? "bg-accent" : "bg-transparent")} />
                        {l}
                      </span>
                    </td>
                    {COSTS.map((c, i) => {
                      const v = row[i] ?? 0;
                      const hov = hover && hover.l === l && hover.c === c;
                      return (
                        <td key={c} className="px-1.5 py-1">
                          <Tooltip content={`Lv${l} ${COST_LABELS[c]}: ${v}% · 1ショップあたり期待 ${(v / 100 * slots).toFixed(2)}枚`}>
                            <div
                              onMouseEnter={() => setHover({ l, c })}
                              onMouseLeave={() => setHover(null)}
                              className={cn(
                                "h-8 w-full min-w-[64px] rounded-md flex items-center justify-center font-medium transition-transform duration-150",
                                hov && "scale-[1.04] ring-2 ring-white/40",
                                active && "ring-1 ring-accent/50",
                              )}
                              style={{ background: heatBg(v), color: heatFg(v) }}
                            >
                              {v > 0 ? `${v}%` : <span className="opacity-40">—</span>}
                            </div>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 border-t border-border text-[11px] text-fg-subtle">
          <span>低</span>
          <div className="h-2 flex-1 max-w-[180px] rounded-full" style={{ background: "linear-gradient(90deg, var(--color-surface-2), var(--color-gold))" }} />
          <span>高</span>
          <span className="ml-auto">ショップ枠 {slots} · リロール {odds.rerollCost}g</span>
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        <Card
          title="レベル選択"
          action={<span className="text-xs text-fg-subtle">選択中: Lv{level}</span>}
        >
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={cn(
                  "h-8 min-w-9 px-2.5 rounded-md text-sm font-medium tabular-nums transition-all focus-ring",
                  l === level ? "bg-accent text-white shadow-[0_4px_14px_-6px_rgba(124,156,255,0.8)]" : "bg-surface-2 text-fg-muted hover:text-fg hover:bg-surface-3",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {COSTS.map((c, i) => {
              const v = selectedRow[i] ?? 0;
              return (
                <div key={c} className="rounded-lg bg-bg-elev border border-border px-2 py-2 flex flex-col gap-0.5">
                  <span className="text-[10px] text-fg-subtle inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full" style={{ background: COST_COLORS[c] }} />{COST_LABELS[c]}
                  </span>
                  <span className="text-lg font-semibold tabular-nums leading-tight">{v}%</span>
                  <span className="text-[10px] text-fg-muted tabular-nums">
                    {(v / 100 * slots).toFixed(2)}枚/回 · プール{odds.poolSize[c] ?? 0}×{championsPerCost[c] ?? 0}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="コスト構成 (レベル比較)" action={<span className="text-xs text-fg-subtle">Lv{level} を強調</span>}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} {...CHART_GRID} />
                <XAxis dataKey="level" {...CHART_AXIS} tickFormatter={(v) => `Lv${v}`} />
                <YAxis {...CHART_AXIS} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} />
                <RTooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as Record<string, number>;
                    return (
                      <ChartTip
                        title={`レベル ${label}`}
                        rows={COSTS.map((c) => ({ label: COST_LABELS[c], value: `${d[`c${c}`]}%`, color: COST_COLORS[c] }))}
                      />
                    );
                  }}
                />
                {COSTS.map((c, idx) => (
                  <Bar
                    key={c}
                    dataKey={`c${c}`}
                    stackId="odds"
                    fill={COST_COLORS[c]}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                    isAnimationActive={false}
                    radius={idx === COSTS.length - 1 ? [4, 4, 0, 0] : 0}
                    onClick={(_d, i) => setLevel(LEVELS[i])}
                    cursor="pointer"
                  >
                    {chartData.map((d) => (
                      <Cell key={d.level} fillOpacity={d.level === level ? 1 : 0.3} />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted">
            {COSTS.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: COST_COLORS[c] }} />
                {COST_LABELS[c]}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
