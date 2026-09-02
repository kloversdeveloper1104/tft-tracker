import { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { EmptyState, SearchInput } from "@/components/ui";
import { ItemIcon } from "@/components/tft";
import { useLookup } from "@/stores/staticData";
import type { ItemKind, ItemStat } from "@/lib/types";
import { SortableTable, type Column } from "./SortableTable";
import { Chips, KindBadge, PlacementText, Pct } from "./shared";
import { matchesQuery, useDebouncedValue } from "./lib";

type KindFilter = "all" | "completed" | "emblem" | "artifact" | "radiant" | "support" | "other";

const KIND_CHIPS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "completed", label: "完成" },
  { value: "emblem", label: "紋章" },
  { value: "artifact", label: "遺物" },
  { value: "radiant", label: "光輝" },
  { value: "support", label: "サポート" },
  { value: "other", label: "その他" },
];

const MAIN_KINDS: ItemKind[] = ["completed", "emblem", "artifact", "radiant", "support"];

interface ItemRow extends ItemStat { label: string; kind: ItemKind | undefined }

export function ItemsTab({ items }: { items: ItemStat[] }) {
  const lookup = useLookup();
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 200);

  const rows = useMemo<ItemRow[]>(
    () =>
      items.map((i) => {
        const it = lookup.item(i.name);
        return { ...i, label: it?.name ?? i.name.replace(/^TFT\d*_Item_/, ""), kind: it?.kind };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, lookup.data],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (kind === "other") { if (r.kind && MAIN_KINDS.includes(r.kind)) return false; }
        else if (kind !== "all" && r.kind !== kind) return false;
        return matchesQuery(q, r.label, r.name);
      }),
    [rows, kind, q],
  );

  const columns = useMemo<Column<ItemRow>[]>(
    () => [
      {
        key: "item", header: "アイテム", sortValue: (r) => r.label, defaultDir: "asc",
        render: (r) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <ItemIcon id={r.name} size={28} />
            <span className="text-sm text-fg font-medium truncate">{r.label}</span>
          </div>
        ),
      },
      { key: "kind", header: "種類", width: 100, sortValue: (r) => r.kind ?? "zzz", defaultDir: "asc", render: (r) => <KindBadge kind={r.kind} /> },
      { key: "games", header: "試合数", align: "right", sortValue: (r) => r.games, width: 100, render: (r) => <span className="text-fg-muted">{r.games.toLocaleString()}</span> },
      { key: "avgPlacement", header: "平均順位", align: "right", sortValue: (r) => r.avgPlacement, defaultDir: "asc", width: 100, render: (r) => <PlacementText value={r.avgPlacement} bold /> },
      { key: "top4Rate", header: "Top4率", align: "right", sortValue: (r) => r.top4Rate, width: 100, render: (r) => <Pct value={r.top4Rate} className="text-fg" /> },
      { key: "winRate", header: "1位率", align: "right", sortValue: (r) => r.winRate, width: 100, render: (r) => <Pct value={r.winRate} className="text-fg" /> },
    ],
    [],
  );

  if (items.length === 0) {
    return <EmptyState icon={<Package />} title="アイテムデータがありません" description="条件に合う試合がありません。フィルターを調整してください。" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Chips items={KIND_CHIPS} value={kind} onChange={setKind} />
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="アイテム名で検索..." className="w-60 ml-auto" />
      </div>
      <SortableTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.name}
        defaultSort={{ key: "games", dir: "desc" }}
        emptyMessage="該当するアイテムがありません"
      />
    </div>
  );
}
