import { useMemo, useState } from "react";
import { ChevronDown, Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRAIT_STYLE_COLORS, TRAIT_STYLE_LABELS } from "@/data/odds";
import { EmptyState, SearchInput } from "@/components/ui";
import { TraitIcon } from "@/components/tft";
import { useLookup } from "@/stores/staticData";
import type { TraitBucketStat, TraitStat } from "@/lib/types";
import { SortableTable, type Column } from "./SortableTable";
import { PlacementBarChart, type PlacementRow } from "./charts";
import { MiniBar, PlacementText, Pct, SectionLabel } from "./shared";
import { matchesQuery, useDebouncedValue } from "./lib";

interface TraitRow extends TraitStat { label: string; bestBucket: TraitBucketStat | null }

export function TraitsTab({ traits }: { traits: TraitStat[] }) {
  const lookup = useLookup();
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 200);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const rows = useMemo<TraitRow[]>(
    () =>
      traits.map((t) => {
        const activeBuckets = t.buckets.filter((b) => b.style > 0);
        const best = activeBuckets.length ? activeBuckets.reduce((a, b) => (b.avgPlacement < a.avgPlacement ? b : a)) : null;
        return { ...t, label: lookup.trait(t.name)?.name ?? t.name.replace(/^TFT\d+_/, ""), bestBucket: best };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [traits, lookup.data],
  );

  const filtered = useMemo(() => rows.filter((r) => matchesQuery(q, r.label, r.name)), [rows, q]);
  const maxPick = useMemo(() => Math.max(0, ...rows.map((r) => r.pickRate)), [rows]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const columns = useMemo<Column<TraitRow>[]>(
    () => [
      {
        key: "trait", header: "特性", sortValue: (r) => r.label, defaultDir: "asc",
        render: (r) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <ChevronDown className={cn("size-3.5 text-fg-subtle transition-transform shrink-0", expanded.has(r.name) && "rotate-180")} />
            <TraitIcon id={r.name} style={r.bestBucket?.style ?? 0} size={24} showTooltip={false} />
            <span className="text-sm text-fg font-medium truncate">{r.label}</span>
          </div>
        ),
      },
      {
        key: "best", header: "最良ブレイク", width: 130, sortValue: (r) => r.bestBucket?.numUnits ?? null,
        render: (r) => r.bestBucket ? <BucketChip bucket={r.bestBucket} /> : <span className="text-fg-subtle text-xs">–</span>,
      },
      { key: "games", header: "試合数", align: "right", sortValue: (r) => r.games, width: 100, render: (r) => <span className="text-fg-muted">{r.games.toLocaleString()}</span> },
      {
        key: "pickRate", header: "採用率", align: "right", sortValue: (r) => r.pickRate, width: 130,
        render: (r) => (
          <div className="flex flex-col items-end gap-1">
            <Pct value={r.pickRate} className="text-fg" />
            <MiniBar value={r.pickRate} max={maxPick} className="w-16" />
          </div>
        ),
      },
      { key: "avgPlacement", header: "平均順位", align: "right", sortValue: (r) => r.avgPlacement, defaultDir: "asc", width: 100, render: (r) => <PlacementText value={r.avgPlacement} bold /> },
    ],
    [maxPick, expanded],
  );

  if (traits.length === 0) {
    return <EmptyState icon={<Hexagon />} title="特性データがありません" description="条件に合う試合がありません。フィルターを調整してください。" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-fg-muted">行をクリックするとブレイクポイント別の成績を表示します</span>
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="特性名で検索..." className="w-60 ml-auto" />
      </div>
      <SortableTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.name}
        defaultSort={{ key: "pickRate", dir: "desc" }}
        onRowClick={(r) => toggle(r.name)}
        expandedKeys={expanded}
        renderDetail={(r) => <TraitDetail row={r} />}
        emptyMessage="該当する特性がありません"
      />
    </div>
  );
}

function BucketChip({ bucket }: { bucket: TraitBucketStat }) {
  const color = TRAIT_STYLE_COLORS[bucket.style] ?? TRAIT_STYLE_COLORS[0];
  return (
    <span
      className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-xs font-semibold tabular-nums"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 45%, transparent)` }}
      title={TRAIT_STYLE_LABELS[bucket.style]}
    >
      {bucket.numUnits}
      <span className="font-normal opacity-80">{TRAIT_STYLE_LABELS[bucket.style] ?? ""}</span>
    </span>
  );
}

function TraitDetail({ row }: { row: TraitRow }) {
  const buckets = useMemo(() => [...row.buckets].sort((a, b) => a.numUnits - b.numUnits), [row.buckets]);
  const chartRows = useMemo<PlacementRow[]>(
    () => buckets.map((b) => ({
      key: `${b.numUnits}-${b.style}`,
      label: `${b.numUnits}体 ${TRAIT_STYLE_LABELS[b.style] ?? ""}`.trim(),
      value: b.avgPlacement,
      games: b.games,
      top4Rate: b.top4Rate,
    })),
    [buckets],
  );

  if (buckets.length === 0) {
    return <div className="px-4 py-4 text-sm text-fg-subtle">ブレイクポイント別データがありません。</div>;
  }

  return (
    <div className="px-4 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
      <div className="flex flex-col gap-2">
        <SectionLabel>ブレイクポイント別 平均順位</SectionLabel>
        <div className="card p-3">
          <PlacementBarChart rows={chartRows} reference={row.avgPlacement} referenceLabel="特性平均" labelWidth={104} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <SectionLabel>ブレイクポイント</SectionLabel>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-fg-subtle">
              <th className="text-left py-1.5 font-semibold">体数</th>
              <th className="text-right py-1.5 font-semibold">試合数</th>
              <th className="text-right py-1.5 font-semibold">平均順位</th>
              <th className="text-right py-1.5 font-semibold">Top4率</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={`${b.numUnits}-${b.style}`} className="border-t border-border/60">
                <td className="py-1.5"><BucketChip bucket={b} /></td>
                <td className="py-1.5 text-right text-fg-muted">{b.games.toLocaleString()}</td>
                <td className="py-1.5 text-right"><PlacementText value={b.avgPlacement} bold /></td>
                <td className="py-1.5 text-right text-fg"><Pct value={b.top4Rate} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
