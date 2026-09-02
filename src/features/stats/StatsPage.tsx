import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Database, Hexagon, Layers, Package, RefreshCw, Sparkles, Users } from "lucide-react";
import { stats as statsApi } from "@/lib/api";
import { cn, avgPlacementColor, fmtPct, fmtPlacement } from "@/lib/utils";
import { QUEUES } from "@/data/odds";
import { Button, EmptyState, Page, PageHeader, Select, Skeleton, Tabs } from "@/components/ui";
import { ChampionIcon, TraitIcon } from "@/components/tft";
import { useSettings } from "@/stores/settings";
import { useLookup, useStaticData } from "@/stores/staticData";
import type { CompStat, StatsResult } from "@/lib/types";
import {
  DAY_OPTIONS, MIN_GAMES_OPTIONS, filterKey, loadFilter, loadTab, saveFilter, saveTab, starsFromAvg, toApiFilter,
  type FilterState, type Source, type StatsTab,
} from "./lib";
import { Segmented, StatTile } from "./shared";
import { CompsTab, compDisplayName } from "./CompsTab";
import { UnitsTab } from "./UnitsTab";
import { ItemsTab } from "./ItemsTab";
import { TraitsTab } from "./TraitsTab";
import { AugmentsTab } from "./AugmentsTab";

const TAB_ITEMS: { id: StatsTab; label: string; icon: ReactNode }[] = [
  { id: "comps", label: "構成", icon: <Layers className="size-3.5" /> },
  { id: "units", label: "ユニット", icon: <Users className="size-3.5" /> },
  { id: "items", label: "アイテム", icon: <Package className="size-3.5" /> },
  { id: "traits", label: "特性", icon: <Hexagon className="size-3.5" /> },
  { id: "augments", label: "オーグメント", icon: <Sparkles className="size-3.5" /> },
];

const LOW_DATA_THRESHOLD = 50;

export function StatsPage() {
  const puuid = useSettings((s) => s.settings.puuid);
  const meta = useStaticData((s) => s.meta);
  const staticError = useStaticData((s) => s.error);

  const [filter, setFilterState] = useState<FilterState>(() => loadFilter());
  const [tab, setTabState] = useState<StatsTab>(() => loadTab());

  // "自分の試合" requires a puuid; fall back when the persisted choice is no longer valid.
  useEffect(() => {
    if (filter.source === "me" && !puuid) setFilterState((f) => ({ ...f, source: "ladder" }));
  }, [filter.source, puuid]);

  const setFilter = useCallback((patch: Partial<FilterState>) => {
    setFilterState((prev) => {
      const next = { ...prev, ...patch };
      saveFilter(next);
      return next;
    });
  }, []);

  const setTab = useCallback((t: StatsTab) => { setTabState(t); saveTab(t); }, []);

  const latestSet = meta?.latestSet;
  const apiFilter = useMemo(() => toApiFilter(filter, puuid, latestSet), [filter, puuid, latestSet]);

  const query = useQuery({
    queryKey: ["stats", ...filterKey(apiFilter)],
    queryFn: () => statsApi.get(apiFilter),
    placeholderData: keepPreviousData,
    // wait for the set list (unless static data failed) so the first request targets the right set
    enabled: !!meta || !!staticError,
  });

  const result = query.data;
  const availableSets = useMemo(() => {
    const sets = new Set<number>(meta?.availableSets ?? []);
    if (result?.setNumber) sets.add(result.setNumber);
    if (latestSet) sets.add(latestSet);
    return [...sets].sort((a, b) => b - a);
  }, [meta, result?.setNumber, latestSet]);

  const setValue = filter.setNumber || latestSet || availableSets[0] || 0;

  return (
    <Page wide>
      <PageHeader
        icon={<BarChart3 />}
        title="メタ統計"
        subtitle="収集した試合データから構成・ユニット・アイテム・特性・オーグメントの成績を集計"
        actions={
          <Button size="sm" variant="ghost" icon={<RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} />} onClick={() => query.refetch()} disabled={query.isFetching}>
            更新
          </Button>
        }
      />

      {/* Sticky filter bar: one row that scopes everything below */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pb-3 pt-1 bg-bg/85 backdrop-blur-md">
        <div className="glass rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap">
          <Segmented<Source>
            value={filter.source}
            onChange={(source) => setFilter({ source })}
            items={[
              { id: "me", label: "自分の試合", disabled: !puuid, title: puuid ? undefined : "設定でRiot IDを連携すると利用できます" },
              { id: "ladder", label: "上位帯データ" },
              { id: "all", label: "すべて" },
            ]}
          />
          <FilterField label="キュー">
            <Select
              value={filter.queueId}
              onChange={(e) => setFilter({ queueId: Number(e.target.value) })}
              options={[{ value: 0, label: "すべて" }, ...QUEUES.map((q) => ({ value: q.id, label: q.label }))]}
              className="[&>select]:h-8"
            />
          </FilterField>
          <FilterField label="期間">
            <Segmented
              value={String(filter.days)}
              onChange={(v) => setFilter({ days: Number(v) })}
              items={DAY_OPTIONS.map((d) => ({ id: String(d.value), label: d.label }))}
            />
          </FilterField>
          <FilterField label="最低試合数">
            <Segmented
              value={String(filter.minGames)}
              onChange={(v) => setFilter({ minGames: Number(v) })}
              items={MIN_GAMES_OPTIONS.map((n) => ({ id: String(n), label: String(n) }))}
            />
          </FilterField>
          <FilterField label="セット">
            <Select
              value={setValue}
              onChange={(e) => setFilter({ setNumber: Number(e.target.value) === latestSet ? 0 : Number(e.target.value) })}
              options={availableSets.length ? availableSets.map((s) => ({ value: s, label: `Set ${s}${s === latestSet ? "（最新）" : ""}` })) : [{ value: 0, label: "—" }]}
              className="[&>select]:h-8"
            />
          </FilterField>
          <div className="ml-auto flex items-center gap-3 text-xs text-fg-muted tabular-nums">
            {result ? (
              <span>
                <span className="text-fg font-semibold">{result.games.toLocaleString()}</span> プレイヤー分 ·{" "}
                <span className="text-fg font-semibold">{result.matches.toLocaleString()}</span> 試合
              </span>
            ) : query.isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : null}
          </div>
        </div>
        {result && result.games < LOW_DATA_THRESHOLD && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>
              データが少ない場合は
              <Link to="/collector" className="underline underline-offset-2 mx-1 font-medium">データ収集ページ</Link>
              で上位帯の試合を収集してください。
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn("mt-4 flex flex-col gap-5 transition-opacity duration-200", query.isFetching && result && "opacity-60 pointer-events-none")}>
        {query.isError ? (
          <EmptyState
            icon={<AlertTriangle />}
            title="統計の取得に失敗しました"
            description={query.error instanceof Error ? query.error.message : String(query.error)}
            action={<Button variant="primary" onClick={() => query.refetch()} icon={<RefreshCw className="size-4" />}>再試行</Button>}
          />
        ) : !result ? (
          <StatsSkeleton />
        ) : result.games === 0 ? (
          <EmptyState
            icon={<Database />}
            title="集計対象の試合がありません"
            description={
              filter.source === "me"
                ? "戦績ページで自分の試合を同期するか、データソースを「上位帯データ」に切り替えてください。"
                : "データ収集ページで上位帯の試合を収集すると、ここに統計が表示されます。"
            }
            action={<Link to={filter.source === "me" ? "/matches" : "/collector"}><Button variant="gold">{filter.source === "me" ? "戦績ページへ" : "データ収集へ"}</Button></Link>}
          />
        ) : (
          <>
            <SummaryRow result={result} minGames={filter.minGames} onOpenComps={() => setTab("comps")} />
            <Tabs
              items={TAB_ITEMS.map((t) => ({
                ...t,
                badge: <span className="ml-0.5 text-[10px] tabular-nums text-fg-subtle">{countFor(result, t.id)}</span>,
              }))}
              value={tab}
              onChange={setTab}
            />
            <div key={tab} className="animate-fade-in">
              {tab === "comps" && <CompsTab comps={result.comps} minGames={filter.minGames} />}
              {tab === "units" && <UnitsTab units={result.units} />}
              {tab === "items" && <ItemsTab items={result.items} />}
              {tab === "traits" && <TraitsTab traits={result.traits} />}
              {tab === "augments" && <AugmentsTab augments={result.augments} />}
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

function countFor(r: StatsResult, tab: StatsTab): number {
  switch (tab) {
    case "comps": return r.comps.length;
    case "units": return r.units.length;
    case "items": return r.items.length;
    case "traits": return r.traits.length;
    case "augments": return r.augments.length;
  }
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-fg-subtle whitespace-nowrap">{label}</span>
      {children}
    </label>
  );
}

// ----- Summary row -------------------------------------------------------------
function pickBestComp(comps: CompStat[], minGames: number): CompStat | null {
  const eligible = comps.filter((c) => c.games >= minGames);
  const pool = eligible.length ? eligible : comps;
  if (pool.length === 0) return null;
  return pool.reduce((best, c) => (c.avgPlacement < best.avgPlacement ? c : best));
}

function SummaryRow({ result, minGames, onOpenComps }: { result: StatsResult; minGames: number; onOpenComps: () => void }) {
  const lookup = useLookup();
  const best = useMemo(() => pickBestComp(result.comps, minGames), [result.comps, minGames]);
  const bestUnit = useMemo(() => {
    const eligible = result.units.filter((u) => u.games >= minGames);
    const pool = eligible.length ? eligible : result.units;
    return pool.length ? pool.reduce((b, u) => (u.avgPlacement < b.avgPlacement ? u : b)) : null;
  }, [result.units, minGames]);
  const traitName = (id: string) => lookup.trait(id)?.name ?? id.replace(/^TFT\d+_/, "");

  return (
    <div className="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(0,180px))_minmax(0,1fr)] gap-3">
      <StatTile label="集計試合" value={result.matches.toLocaleString()} sub={`${result.games.toLocaleString()} プレイヤー分 · Set ${result.setNumber}`} />
      <StatTile label="ユニット種類" value={result.units.length.toLocaleString()} sub={`構成 ${result.comps.length} · 特性 ${result.traits.length}`} />
      <StatTile
        label="最良ユニット"
        value={bestUnit ? fmtPlacement(bestUnit.avgPlacement) : "–"}
        color={bestUnit ? avgPlacementColor(bestUnit.avgPlacement) : undefined}
        sub={bestUnit ? (
          <span className="inline-flex items-center gap-1.5">
            <ChampionIcon id={bestUnit.characterId} size={18} showTooltip={false} />
            <span className="truncate">{lookup.champion(bestUnit.characterId)?.name ?? bestUnit.characterId}</span>
            <span className="text-fg-subtle">· {bestUnit.games.toLocaleString()} 試合</span>
          </span>
        ) : "データ不足"}
      />
      <button
        type="button"
        onClick={onOpenComps}
        className="card text-left px-4 py-3 flex items-center gap-4 min-w-0 transition-colors hover:border-border-strong focus-ring"
      >
        <div className="flex flex-col gap-0.5 shrink-0">
          <span className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium">ベスト構成</span>
          {best ? (
            <>
              <span className="text-2xl font-semibold leading-tight" style={{ color: avgPlacementColor(best.avgPlacement) }}>{fmtPlacement(best.avgPlacement)}</span>
              <span className="text-xs text-fg-muted tabular-nums">Top4 {fmtPct(best.top4Rate)} · {best.games.toLocaleString()} 試合</span>
            </>
          ) : (
            <span className="text-sm text-fg-muted">データ不足</span>
          )}
        </div>
        {best && (
          <div className="min-w-0 flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {[...best.coreTraits].sort((a, b) => b.style - a.style).slice(0, 3).map((t) => (
                <TraitIcon key={t.name} id={t.name} style={t.style} count={t.numUnits} size={20} showTooltip={false} />
              ))}
              <span className="text-sm font-medium text-fg truncate">{compDisplayName(best, traitName)}</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-hidden">
              {[...best.units].sort((a, b) => b.frequency - a.frequency).slice(0, 8).map((u) => (
                <ChampionIcon key={u.characterId} id={u.characterId} size={30} stars={starsFromAvg(u.avgStars)} dim={u.frequency < 0.5} showTooltip={false} />
              ))}
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(0,180px))_minmax(0,1fr)] gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[84px]" />)}
      </div>
      <Skeleton className="h-9 w-[420px]" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[124px]" />)}
      </div>
    </div>
  );
}
