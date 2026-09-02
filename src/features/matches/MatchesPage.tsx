import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, Settings, Swords } from "lucide-react";
import { Button, Card, EmptyState, Page, PageHeader, SearchInput, Select, Skeleton, Stat, Tabs } from "@/components/ui";
import { useStaticData } from "@/stores/staticData";
import { avgPlacementColor, fmtPct, fmtPlacement } from "@/lib/utils";
import type { MatchSummary } from "@/lib/types";
import { aggregateMatches, useMatchCount, useMatchPages, usePuuid, useSetLookup, type SetLookup } from "./hooks";
import { MatchRow } from "./MatchRow";
import { ErrorState, RowsSkeleton } from "./shared";

type QueueTab = "all" | "1100" | "1090" | "1160" | "1130";
const QUEUE_TABS: { id: QueueTab; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "1100", label: "ランク" },
  { id: "1090", label: "ノーマル" },
  { id: "1160", label: "ダブルアップ" },
  { id: "1130", label: "ハイパーロール" },
];

function matchesSearch(m: MatchSummary, q: string, lookup: SetLookup): boolean {
  if (!q) return true;
  const p = m.participant;
  const hitUnit = p.units.some((u) => {
    const c = lookup.champion(u.character_id);
    return (c?.name ?? "").toLowerCase().includes(q) || u.character_id.toLowerCase().includes(q);
  });
  if (hitUnit) return true;
  return p.traits.some((t) => {
    if (t.style <= 0) return false;
    const tr = lookup.trait(t.name);
    return (tr?.name ?? "").toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
  });
}

export function MatchesPage() {
  const puuid = usePuuid();
  const meta = useStaticData((s) => s.meta);
  const lookup = useSetLookup();
  const [queue, setQueue] = useState<QueueTab>("all");
  const [setNumber, setSetNumber] = useState<string>("");
  const [search, setSearch] = useState("");

  const filters = useMemo(() => ({
    queueId: queue === "all" ? undefined : Number(queue),
    setNumber: setNumber ? Number(setNumber) : undefined,
  }), [queue, setNumber]);

  const pages = useMatchPages(puuid, filters);
  const count = useMatchCount(puuid);

  const loaded = useMemo(() => pages.data?.pages.flat() ?? [], [pages.data]);
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => loaded.filter((m) => matchesSearch(m, q, lookup)), [loaded, q, lookup]);
  const agg = useMemo(() => aggregateMatches(rows), [rows]);

  const setOptions = useMemo(() => [
    { value: "", label: "すべてのセット" },
    ...(meta?.availableSets ?? []).slice().sort((a, b) => b - a).map((s) => ({ value: String(s), label: `Set ${s}` })),
  ], [meta]);

  if (!puuid) {
    return (
      <Page>
        <PageHeader title="戦績" subtitle="自分の試合履歴" icon={<Swords />} />
        <Card>
          <EmptyState
            icon={<Settings />}
            title="Riot ID が未設定です"
            description="設定画面で API キーと Riot ID を登録すると、試合履歴を同期できます。"
            action={<Link to="/settings"><Button variant="gold">設定を開く</Button></Link>}
          />
        </Card>
      </Page>
    );
  }

  const total = count.data ?? null;

  return (
    <Page wide>
      <PageHeader
        title="戦績"
        subtitle={total !== null ? `保存済み ${total.toLocaleString("ja-JP")} 試合` : "自分の試合履歴"}
        icon={<Swords />}
      />

      {/* filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Tabs items={QUEUE_TABS} value={queue} onChange={setQueue} />
        <Select options={setOptions} value={setNumber} onChange={(e) => setSetNumber(e.target.value)} className="w-[160px]" />
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="チャンピオン・特性で絞り込み"
          className="w-[260px] ml-auto"
        />
      </div>

      {/* summary */}
      <Card className="mb-4" padded={false}>
        <div className="grid grid-cols-4 divide-x divide-border">
          <div className="px-5 py-3.5"><Stat label="試合数" value={agg.games} sub={q ? "絞り込み後" : "読み込み済み"} /></div>
          <div className="px-5 py-3.5"><Stat label="平均順位" value={agg.games ? fmtPlacement(agg.avgPlacement) : "–"} color={agg.games ? avgPlacementColor(agg.avgPlacement) : undefined} /></div>
          <div className="px-5 py-3.5"><Stat label="Top4率" value={agg.games ? fmtPct(agg.top4Rate, 0) : "–"} /></div>
          <div className="px-5 py-3.5"><Stat label="1位率" value={agg.games ? fmtPct(agg.winRate, 0) : "–"} color={agg.winRate > 0 ? "var(--color-place-1)" : undefined} /></div>
        </div>
      </Card>

      {/* list */}
      {pages.isPending ? (
        <RowsSkeleton rows={6} />
      ) : pages.isError ? (
        <Card><ErrorState message={pages.error.message} onRetry={() => pages.refetch()} retrying={pages.isFetching} /></Card>
      ) : loaded.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Swords />}
            title="試合がありません"
            description={queue !== "all" || setNumber ? "この条件に一致する試合はありません。フィルターを変更してください。" : "ダッシュボードの「同期」ボタンから Riot API の試合履歴を取り込んでください。"}
            action={queue === "all" && !setNumber ? <Link to="/"><Button variant="gold">ダッシュボードへ</Button></Link> : undefined}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Swords />}
            title="一致する試合がありません"
            description={`「${search}」を含む試合は読み込み済みの範囲にありません。さらに読み込むか、検索語を変更してください。`}
            action={pages.hasNextPage ? <Button onClick={() => pages.fetchNextPage()} loading={pages.isFetchingNextPage}>さらに読み込む</Button> : undefined}
          />
        </Card>
      ) : (
        <div className={pages.isFetching && !pages.isFetchingNextPage ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="flex flex-col gap-2.5">
            {rows.map((m) => <MatchRow key={m.matchId} m={m} lookup={lookup} />)}
          </div>
          <div className="flex items-center justify-center gap-3 mt-5 text-xs text-fg-subtle tabular-nums">
            <span>{rows.length} 件表示{total !== null && ` / 全 ${total.toLocaleString("ja-JP")} 件`}</span>
            {pages.hasNextPage && (
              <Button size="sm" variant="outline" onClick={() => pages.fetchNextPage()} loading={pages.isFetchingNextPage} icon={<ChevronDown className="size-4" />}>
                さらに読み込む
              </Button>
            )}
          </div>
          {pages.isFetchingNextPage && <div className="mt-3 flex flex-col gap-2.5"><Skeleton className="h-[92px] rounded-xl" /><Skeleton className="h-[92px] rounded-xl" /></div>}
        </div>
      )}
    </Page>
  );
}
