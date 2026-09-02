import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, KeyRound, LayoutDashboard, RefreshCw, Sparkles, Swords, TrendingUp, UserRound } from "lucide-react";
import { Badge, Button, Card, EmptyState, Page, PageHeader, ProgressBar, Skeleton, Stat, Tabs } from "@/components/ui";
import { PlacementStrip } from "@/components/tft";
import { riot } from "@/lib/api";
import { avgPlacementColor, fmtPct, fmtPlacement } from "@/lib/utils";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import type { SyncProgress } from "@/lib/types";
import { aggregateMatches, useRecentMatches, useSetLookup } from "@/features/matches/hooks";
import { MatchRow } from "@/features/matches/MatchRow";
import { ErrorState } from "@/features/matches/shared";
import { RankCards } from "./RankCards";
import { LpChart, PlacementChart } from "./charts";
import { TopComps, TopUnits } from "./insights";

const PROFILE_ICON = (id: number) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;

type StatsWindow = "20" | "50" | "all";
const WINDOW_TABS: { id: StatsWindow; label: string }[] = [
  { id: "20", label: "直近20" },
  { id: "50", label: "直近50" },
  { id: "all", label: "すべて" },
];
type SyncCount = "20" | "50" | "100";
const SYNC_TABS: { id: SyncCount; label: string }[] = [
  { id: "20", label: "20" },
  { id: "50", label: "50" },
  { id: "100", label: "100" },
];

export function DashboardPage() {
  const { settings, loaded } = useSettings();
  if (!loaded) {
    return (
      <Page>
        <Skeleton className="h-8 w-48 mb-5" />
        <Skeleton className="h-[120px] rounded-xl mb-4" />
        <Skeleton className="h-[96px] rounded-xl mb-4" />
        <div className="grid grid-cols-2 gap-4"><Skeleton className="h-[260px] rounded-xl" /><Skeleton className="h-[260px] rounded-xl" /></div>
      </Page>
    );
  }
  if (!settings.puuid) return <Onboarding hasKey={!!settings.apiKey} />;
  return <Dashboard puuid={settings.puuid} />;
}

// ----- Onboarding -------------------------------------------------------------------------
function Onboarding({ hasKey }: { hasKey: boolean }) {
  const navigate = useNavigate();
  const steps = [
    { icon: <KeyRound />, title: "Riot API キーを取得", desc: "developer.riotgames.com で Development API Key を発行して設定画面に貼り付けます（24時間で失効）。", done: hasKey },
    { icon: <UserRound />, title: "Riot ID を登録", desc: "ゲーム名 と タグライン（例: Player#JP1）とプラットフォームを設定して、アカウントを解決します。", done: false },
    { icon: <RefreshCw />, title: "試合を同期", desc: "ダッシュボードの「同期」で直近の試合を取り込み、戦績・統計・ランク推移を表示します。", done: false },
  ];
  return (
    <Page>
      <PageHeader title="ダッシュボード" subtitle="ようこそ" icon={<LayoutDashboard />} />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card animate-slide-up">
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-gold/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-16 size-64 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="relative p-8">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-gold font-semibold mb-3"><Sparkles className="size-3.5" />はじめに</div>
          <h2 className="text-2xl font-bold tracking-tight">3ステップでセットアップ</h2>
          <p className="text-sm text-fg-muted mt-1 max-w-xl">Riot Games API から自分の試合データを取り込み、順位の推移や得意な構成を分析します。</p>
          <ol className="grid grid-cols-3 gap-4 mt-7">
            {steps.map((s, i) => (
              <li key={i} className="relative rounded-xl border border-border bg-bg-elev/70 p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="size-10 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-gold [&>svg]:size-5">{s.icon}</div>
                  <span className="text-[11px] font-semibold tabular-nums text-fg-subtle">STEP {i + 1}</span>
                </div>
                <div className="text-sm font-semibold">{s.title}</div>
                <p className="text-xs text-fg-muted leading-relaxed">{s.desc}</p>
                {s.done && <Badge size="xs" color="var(--color-success)" className="self-start">設定済み</Badge>}
              </li>
            ))}
          </ol>
          <div className="mt-7 flex items-center gap-3">
            <Button variant="gold" size="lg" icon={<KeyRound className="size-4" />} onClick={() => navigate("/settings")}>設定を開く</Button>
            <span className="text-xs text-fg-subtle">API キーと Riot ID はローカルにのみ保存されます。</span>
          </div>
        </div>
      </div>
    </Page>
  );
}

// ----- Dashboard -----------------------------------------------------------------------------
function Dashboard({ puuid }: { puuid: string }) {
  const settings = useSettings((s) => s.settings);
  const qc = useQueryClient();
  const lookup = useSetLookup();
  const [win, setWin] = useState<StatsWindow>("20");
  const [syncCount, setSyncCount] = useState<SyncCount>("20");
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const summoner = useQuery({ queryKey: ["summoner", puuid], queryFn: () => riot.getSummoner(puuid) });
  const league = useQuery({ queryKey: ["league", puuid], queryFn: () => riot.getLeague(puuid) });
  const matches = useRecentMatches(puuid, 200);
  const snapshots = useQuery({
    queryKey: ["snapshots", puuid, "RANKED_TFT", league.dataUpdatedAt],
    queryFn: () => riot.listRankSnapshots(puuid, "RANKED_TFT"),
  });

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    riot.onSyncProgress((p) => { if (active) setProgress(p); }).then((u) => { if (active) unlisten = u; else u(); });
    return () => { active = false; unlisten?.(); };
  }, []);

  const sync = useMutation({
    mutationFn: (count: number) => riot.syncMatches(puuid, count),
    onMutate: () => setProgress({ done: 0, total: 0, message: "同期を開始しています…" }),
    onSuccess: (r) => {
      toast.success(r.added > 0 ? `${r.added} 試合を追加しました` : "新しい試合はありません", `取得 ${r.fetched} 件 · 保存済み ${r.total} 試合`);
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["league", puuid] });
      qc.invalidateQueries({ queryKey: ["summoner", puuid] });
    },
    onError: (e: Error) => toast.error("同期に失敗しました", e.message),
    onSettled: () => setProgress(null),
  });

  const all = matches.data ?? [];
  const rows = useMemo(() => (win === "all" ? all : all.slice(0, Number(win))), [all, win]);
  const agg = useMemo(() => aggregateMatches(rows), [rows]);
  const recent = all.slice(0, 8);
  const strip = useMemo(() => all.slice(0, 20).map((m) => m.participant.placement).reverse(), [all]);

  const refreshAll = () => {
    summoner.refetch();
    league.refetch();
    matches.refetch();
  };

  return (
    <Page wide>
      <PageHeader
        title="ダッシュボード"
        subtitle={`${settings.gameName || "プレイヤー"}#${settings.tagLine} · ${settings.platform.toUpperCase()}`}
        icon={<LayoutDashboard />}
        actions={
          <>
            <Tabs items={SYNC_TABS} value={syncCount} onChange={setSyncCount} size="sm" />
            <Button variant="gold" icon={<RefreshCw className="size-4" />} loading={sync.isPending} onClick={() => sync.mutate(Number(syncCount))}>
              同期
            </Button>
          </>
        }
      />

      {/* profile + ranks */}
      <Card padded={false} className="mb-4 animate-slide-up">
        <div className="flex items-center gap-5 p-5">
          <div className="flex items-center gap-4 min-w-[260px]">
            {summoner.isPending ? (
              <Skeleton className="size-16 rounded-xl" />
            ) : summoner.data ? (
              <img
                src={PROFILE_ICON(summoner.data.profileIconId)}
                alt=""
                className="size-16 rounded-xl object-cover bg-surface-2 shadow-glow-gold"
              />
            ) : (
              <div className="size-16 rounded-xl bg-gradient-to-br from-gold to-gold-dim flex items-center justify-center text-2xl font-bold text-[#2a1f05]">
                {(settings.gameName || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-lg font-bold leading-tight truncate">
                {settings.gameName || "プレイヤー"}<span className="text-fg-subtle font-medium">#{settings.tagLine}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge size="xs" className="border-border text-fg-muted bg-bg-elev">{settings.platform.toUpperCase()}</Badge>
                {summoner.data ? (
                  <Badge size="xs" className="border-border text-fg-muted bg-bg-elev tabular-nums">Lv {summoner.data.summonerLevel}</Badge>
                ) : summoner.isError ? (
                  <button className="text-[11px] text-danger hover:underline" onClick={() => summoner.refetch()}>プロフィール取得失敗 · 再試行</button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="w-px self-stretch bg-border" />
          <div className="flex-1 min-w-0 overflow-x-auto">
            {league.isError ? (
              <div className="flex items-center gap-3 text-sm text-danger">
                ランク情報の取得に失敗しました: {league.error.message}
                <Button size="xs" variant="danger" onClick={() => league.refetch()} loading={league.isFetching}>再試行</Button>
              </div>
            ) : (
              <RankCards entries={league.data} loading={league.isPending} />
            )}
          </div>
        </div>
        {(progress || sync.isPending) && (
          <div className="px-5 py-3 border-t border-border bg-bg-elev/60 animate-fade-in">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-fg-muted flex items-center gap-2"><RefreshCw className="size-3.5 animate-spin text-gold" />{progress?.message ?? "同期中…"}</span>
              {progress && progress.total > 0 && <span className="tabular-nums text-fg-subtle">{progress.done} / {progress.total}</span>}
            </div>
            <ProgressBar value={progress?.done ?? 0} max={progress?.total || 1} color="var(--color-gold)" />
          </div>
        )}
      </Card>

      {/* stats */}
      {matches.isError ? (
        <Card className="mb-4"><ErrorState message={matches.error.message} onRetry={refreshAll} retrying={matches.isFetching} /></Card>
      ) : matches.isPending ? (
        <Skeleton className="h-[96px] rounded-xl mb-4" />
      ) : all.length === 0 ? (
        <Card className="mb-4">
          <EmptyState
            icon={<Swords />}
            title="まだ試合データがありません"
            description="右上の「同期」で Riot API から直近の試合を取り込みます。"
            action={<Button variant="gold" icon={<RefreshCw className="size-4" />} loading={sync.isPending} onClick={() => sync.mutate(Number(syncCount))}>今すぐ同期</Button>}
          />
        </Card>
      ) : (
        <>
          <Card padded={false} className="mb-4">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <h3 className="text-sm font-semibold tracking-wide">成績サマリー</h3>
              <Tabs items={WINDOW_TABS} value={win} onChange={setWin} size="sm" />
            </div>
            <div className="grid grid-cols-6 divide-x divide-border">
              <div className="px-5 py-4"><Stat label="平均順位" value={fmtPlacement(agg.avgPlacement)} color={avgPlacementColor(agg.avgPlacement)} /></div>
              <div className="px-5 py-4"><Stat label="Top4率" value={fmtPct(agg.top4Rate, 0)} sub={`${Math.round(agg.top4Rate * agg.games)} / ${agg.games}`} /></div>
              <div className="px-5 py-4"><Stat label="1位率" value={fmtPct(agg.winRate, 0)} color={agg.winRate > 0 ? "var(--color-place-1)" : undefined} sub={`${Math.round(agg.winRate * agg.games)} 勝`} /></div>
              <div className="px-5 py-4"><Stat label="試合数" value={agg.games} /></div>
              <div className="px-5 py-4"><Stat label="平均レベル" value={agg.avgLevel.toFixed(1)} /></div>
              <div className="px-5 py-4"><Stat label="平均残りゴールド" value={agg.avgGold.toFixed(1)} /></div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <Card
              title="順位の推移"
              action={<div className="flex items-center gap-2 text-[11px] text-fg-subtle">直近20試合<PlacementStrip placements={strip} className="h-6" /></div>}
            >
              <PlacementChart rows={rows} />
            </Card>
            <Card title="LP の推移（ランク）" action={<TrendingUp className="size-4 text-fg-subtle" />}>
              {snapshots.isPending ? (
                <Skeleton className="h-[190px] rounded-lg" />
              ) : snapshots.isError ? (
                <ErrorState className="py-6" message={snapshots.error.message} onRetry={() => snapshots.refetch()} retrying={snapshots.isFetching} />
              ) : (
                <LpChart snapshots={snapshots.data} />
              )}
            </Card>
          </div>

          <div className="grid grid-cols-[1fr_360px] gap-4">
            <Card
              title="最近の試合"
              padded={false}
              action={<Link to="/matches" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg no-underline">すべて見る<ChevronRight className="size-3.5" /></Link>}
            >
              <div className="flex flex-col p-1.5">
                {recent.map((m) => <MatchRow key={m.matchId} m={m} lookup={lookup} compact />)}
              </div>
            </Card>
            <div className="flex flex-col gap-4">
              <Card title="よく使った構成" action={<span className="text-[11px] text-fg-subtle">{WINDOW_TABS.find((t) => t.id === win)?.label}</span>}>
                <TopComps rows={rows} lookup={lookup} />
              </Card>
              <Card title="よく使ったユニット" action={<span className="text-[11px] text-fg-subtle">{WINDOW_TABS.find((t) => t.id === win)?.label}</span>}>
                <TopUnits rows={rows} lookup={lookup} />
              </Card>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
