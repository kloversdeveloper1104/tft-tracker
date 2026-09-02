import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { COST_COLORS } from "@/data/odds";
import { EmptyState, SearchInput } from "@/components/ui";
import { ChampionIcon, CostChip, ItemIcon } from "@/components/tft";
import { useLookup } from "@/stores/staticData";
import type { UnitStat } from "@/lib/types";
import { SortableTable, type Column } from "./SortableTable";
import { Drawer } from "./Drawer";
import { PlacementBarChart, type PlacementRow } from "./charts";
import { Chips, MiniBar, PlacementText, Pct, SectionLabel } from "./shared";
import { matchesQuery, useDebouncedValue } from "./lib";

interface UnitRow extends UnitStat {
  name: string;
  cost: number;
  topItems: string[];
}

const COST_CHIPS = [
  { value: 0, label: "すべて" },
  ...[1, 2, 3, 4, 5].map((c) => ({ value: c, label: `${c}コスト`, color: COST_COLORS[c] })),
];

export function UnitsTab({ units }: { units: UnitStat[] }) {
  const lookup = useLookup();
  const [cost, setCost] = useState(0);
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 200);
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo<UnitRow[]>(
    () =>
      units.map((u) => {
        const c = lookup.champion(u.characterId);
        return {
          ...u,
          name: c?.name ?? u.characterId,
          cost: c?.cost ?? 0,
          topItems: [...u.items].sort((a, b) => b.games - a.games).slice(0, 3).map((i) => i.name),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, lookup.data],
  );

  const filtered = useMemo(
    () => rows.filter((r) => (cost === 0 || r.cost === cost) && matchesQuery(q, r.name, r.characterId)),
    [rows, cost, q],
  );

  const maxPick = useMemo(() => Math.max(0, ...rows.map((r) => r.pickRate)), [rows]);

  const columns = useMemo<Column<UnitRow>[]>(
    () => [
      {
        key: "unit", header: "ユニット", sortValue: (r) => r.name, defaultDir: "asc", width: 240,
        render: (r) => (
          <div className="flex items-center gap-2.5">
            <ChampionIcon id={r.characterId} size={32} showTooltip={false} />
            <span className="text-sm text-fg font-medium truncate">{r.name}</span>
            {r.cost > 0 && <CostChip cost={r.cost} />}
          </div>
        ),
      },
      { key: "cost", header: "コスト", align: "center", sortValue: (r) => r.cost, width: 70, render: (r) => <span className="text-fg-muted">{r.cost || "–"}</span> },
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
      { key: "avgStars", header: "平均★", align: "right", sortValue: (r) => r.avgStars, width: 80, render: (r) => <span className="text-fg">{r.avgStars.toFixed(2)}</span> },
      {
        key: "threeStar", header: "★3 試合数 / 平均順位", align: "right", sortValue: (r) => r.threeStarGames, width: 150,
        render: (r) => (
          <span className="text-fg-muted">
            {r.threeStarGames.toLocaleString()}
            <span className="text-fg-subtle mx-1">/</span>
            {r.threeStarGames > 0 ? <PlacementText value={r.threeStarAvgPlacement} /> : "–"}
          </span>
        ),
      },
      {
        key: "items", header: "おすすめアイテム", width: 110,
        render: (r) => (
          <div className="flex items-center gap-1">
            {r.topItems.length ? r.topItems.map((it, i) => <ItemIcon key={`${it}-${i}`} id={it} size={24} />) : <span className="text-fg-subtle text-xs">–</span>}
          </div>
        ),
      },
      { key: "games", header: "試合数", align: "right", sortValue: (r) => r.games, width: 90, render: (r) => <span className="text-fg-muted">{r.games.toLocaleString()}</span> },
    ],
    [maxPick],
  );

  const selectedRow = useMemo(() => rows.find((r) => r.characterId === selected) ?? null, [rows, selected]);

  if (units.length === 0) {
    return <EmptyState icon={<Users />} title="ユニットデータがありません" description="条件に合う試合がありません。フィルターを調整してください。" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Chips items={COST_CHIPS} value={cost} onChange={setCost} />
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ユニット名で検索..." className="w-60 ml-auto" />
      </div>
      <SortableTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.characterId}
        defaultSort={{ key: "pickRate", dir: "desc" }}
        onRowClick={(r) => setSelected(r.characterId)}
        selectedKey={selected}
        emptyMessage="該当するユニットがありません"
      />
      <UnitDrawer row={selectedRow} onClose={() => setSelected(null)} />
    </div>
  );
}

interface ItemRow { name: string; label: string; games: number; avgPlacement: number; top4Rate: number; winRate: number }

function UnitDrawer({ row, onClose }: { row: UnitRow | null; onClose: () => void }) {
  const lookup = useLookup();

  const itemRows = useMemo<ItemRow[]>(
    () => (row ? row.items.map((i) => ({ ...i, label: lookup.item(i.name)?.name ?? i.name.replace(/^TFT\d*_Item_/, "") })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row, lookup.data],
  );

  const chartRows = useMemo<PlacementRow[]>(
    () =>
      [...itemRows]
        .sort((a, b) => b.games - a.games)
        .slice(0, 10)
        .sort((a, b) => a.avgPlacement - b.avgPlacement)
        .map((i) => ({ key: i.name, label: i.label, value: i.avgPlacement, games: i.games, top4Rate: i.top4Rate, winRate: i.winRate })),
    [itemRows],
  );

  const itemColumns = useMemo<Column<ItemRow>[]>(
    () => [
      {
        key: "item", header: "アイテム", sortValue: (r) => r.label, defaultDir: "asc",
        render: (r) => (
          <div className="flex items-center gap-2 min-w-0">
            <ItemIcon id={r.name} size={24} />
            <span className="text-sm text-fg truncate">{r.label}</span>
          </div>
        ),
      },
      { key: "games", header: "試合数", align: "right", sortValue: (r) => r.games, width: 80, render: (r) => <span className="text-fg-muted">{r.games.toLocaleString()}</span> },
      { key: "avgPlacement", header: "平均順位", align: "right", sortValue: (r) => r.avgPlacement, defaultDir: "asc", width: 90, render: (r) => <PlacementText value={r.avgPlacement} bold /> },
      { key: "top4Rate", header: "Top4率", align: "right", sortValue: (r) => r.top4Rate, width: 80, render: (r) => <Pct value={r.top4Rate} className="text-fg" /> },
      { key: "winRate", header: "1位率", align: "right", sortValue: (r) => r.winRate, width: 80, render: (r) => <Pct value={r.winRate} className="text-fg" /> },
    ],
    [],
  );

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      title={row && (
        <div className="flex items-center gap-3 min-w-0">
          <ChampionIcon id={row.characterId} size={40} showTooltip={false} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold truncate">{row.name}</span>
              {row.cost > 0 && <CostChip cost={row.cost} />}
            </div>
            <div className="text-xs text-fg-muted tabular-nums">
              採用率 {(row.pickRate * 100).toFixed(1)}% · 平均順位 <PlacementText value={row.avgPlacement} /> · {row.games.toLocaleString()} 試合
            </div>
          </div>
        </div>
      )}
    >
      {row && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-4 gap-2">
            <MiniStat label="Top4率" value={`${(row.top4Rate * 100).toFixed(1)}%`} />
            <MiniStat label="1位率" value={`${(row.winRate * 100).toFixed(1)}%`} />
            <MiniStat label="平均★" value={row.avgStars.toFixed(2)} />
            <MiniStat label="★3 平均順位" value={row.threeStarGames > 0 ? row.threeStarAvgPlacement.toFixed(2) : "–"} sub={`${row.threeStarGames.toLocaleString()} 試合`} />
          </div>

          <section className="flex flex-col gap-2">
            <SectionLabel>アイテム別 平均順位（採用数上位 10）</SectionLabel>
            {chartRows.length > 0 ? (
              <div className="card p-3">
                <PlacementBarChart rows={chartRows} reference={row.avgPlacement} referenceLabel="ユニット平均" />
              </div>
            ) : (
              <p className="text-sm text-fg-subtle">アイテムデータがありません。</p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>アイテム統計</SectionLabel>
            <SortableTable
              columns={itemColumns}
              rows={itemRows}
              rowKey={(r) => r.name}
              defaultSort={{ key: "games", dir: "desc" }}
              dense
              maxHeight="none"
              emptyMessage="アイテムデータがありません"
            />
          </section>
        </div>
      )}
    </Drawer>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 border border-border px-3 py-2 flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</span>
      <span className="text-base font-semibold text-fg tabular-nums">{value}</span>
      {sub && <span className="text-[11px] text-fg-muted tabular-nums">{sub}</span>}
    </div>
  );
}
