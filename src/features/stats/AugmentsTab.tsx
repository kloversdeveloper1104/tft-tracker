import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { EmptyState, SearchInput } from "@/components/ui";
import { AugmentIcon } from "@/components/tft";
import { useLookup } from "@/stores/staticData";
import type { AugmentStat } from "@/lib/types";
import { SortableTable, type Column } from "./SortableTable";
import { AUG_TIER_COLORS, AUG_TIER_LABELS, Chips, MiniBar, PlacementText, Pct, StageChip, TierBadge } from "./shared";
import { matchesQuery, useDebouncedValue } from "./lib";

interface AugRow extends AugmentStat { key: string; label: string; tier: number }

const STAGE_CHIPS = [
  { value: 0, label: "全ステージ" },
  { value: 1, label: "1つ目" },
  { value: 2, label: "2つ目" },
  { value: 3, label: "3つ目" },
];

const TIER_CHIPS = [
  { value: -1, label: "全ティア" },
  ...[1, 2, 3].map((t) => ({ value: t, label: AUG_TIER_LABELS[t], color: AUG_TIER_COLORS[t] })),
];

export function AugmentsTab({ augments }: { augments: AugmentStat[] }) {
  const lookup = useLookup();
  const [stage, setStage] = useState(0);
  const [tier, setTier] = useState(-1);
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 200);

  const rows = useMemo<AugRow[]>(
    () =>
      augments.map((a) => {
        const aug = lookup.augment(a.name);
        return { ...a, key: `${a.name}#${a.stage}`, label: aug?.name ?? a.name.replace(/^TFT\d*_Augment_/, ""), tier: aug?.tier ?? 0 };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [augments, lookup.data],
  );

  const filtered = useMemo(
    () => rows.filter((r) => (stage === 0 || r.stage === stage) && (tier === -1 || r.tier === tier) && matchesQuery(q, r.label, r.name)),
    [rows, stage, tier, q],
  );

  const maxPick = useMemo(() => Math.max(0, ...rows.map((r) => r.pickRate)), [rows]);

  const columns = useMemo<Column<AugRow>[]>(
    () => [
      {
        key: "aug", header: "オーグメント", sortValue: (r) => r.label, defaultDir: "asc",
        render: (r) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <AugmentIcon id={r.name} size={28} />
            <span className="text-sm text-fg font-medium truncate">{r.label}</span>
          </div>
        ),
      },
      { key: "tier", header: "ティア", width: 100, sortValue: (r) => r.tier, render: (r) => <TierBadge tier={r.tier} /> },
      { key: "stage", header: "ステージ", width: 80, align: "center", sortValue: (r) => r.stage, defaultDir: "asc", render: (r) => <StageChip stage={r.stage} /> },
      { key: "games", header: "試合数", align: "right", sortValue: (r) => r.games, width: 90, render: (r) => <span className="text-fg-muted">{r.games.toLocaleString()}</span> },
      {
        key: "pickRate", header: "採用率", align: "right", sortValue: (r) => r.pickRate, width: 120,
        render: (r) => (
          <div className="flex flex-col items-end gap-1">
            <Pct value={r.pickRate} className="text-fg" />
            <MiniBar value={r.pickRate} max={maxPick} className="w-16" />
          </div>
        ),
      },
      { key: "avgPlacement", header: "平均順位", align: "right", sortValue: (r) => r.avgPlacement, defaultDir: "asc", width: 90, render: (r) => <PlacementText value={r.avgPlacement} bold /> },
      { key: "top4Rate", header: "Top4率", align: "right", sortValue: (r) => r.top4Rate, width: 90, render: (r) => <Pct value={r.top4Rate} className="text-fg" /> },
      { key: "winRate", header: "1位率", align: "right", sortValue: (r) => r.winRate, width: 90, render: (r) => <Pct value={r.winRate} className="text-fg" /> },
    ],
    [maxPick],
  );

  if (augments.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="オーグメントデータがありません"
        description="Riot API は最近のセットではオーグメント情報を試合データに含めなくなったため、集計できません。古いセットの試合には含まれる場合があります。"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Chips items={STAGE_CHIPS} value={stage} onChange={setStage} />
        <span className="w-px h-5 bg-border" />
        <Chips items={TIER_CHIPS} value={tier} onChange={setTier} />
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="オーグメント名で検索..." className="w-60 ml-auto" />
      </div>
      <SortableTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.key}
        defaultSort={{ key: "games", dir: "desc" }}
        emptyMessage="該当するオーグメントがありません"
      />
    </div>
  );
}
