import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Clock, Copy, Swords, Users } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, Page, PageHeader, Skeleton, Tooltip } from "@/components/ui";
import { AugmentIcon, ChampionIcon, PlacementBadge, TraitIcon } from "@/components/tft";
import { sortMatchTraits } from "@/lib/tft";
import { cn, fmtDate, fmtDuration, fmtRelative, placementColor, stageLabel } from "@/lib/utils";
import { toast } from "@/stores/toast";
import type { MatchParticipant } from "@/lib/types";
import { useMatch, usePuuid, useSetLookup, type SetLookup } from "./hooks";
import { AXIS, CHART, ChartTip, ErrorState, fmtNum, patchLabel, queueLabel, sortUnits } from "./shared";

function playerName(p: MatchParticipant): string {
  if (p.riotIdGameName) return p.riotIdTagline ? `${p.riotIdGameName}#${p.riotIdTagline}` : p.riotIdGameName;
  return `${p.puuid.slice(0, 8)}…`;
}

async function copyRiotId(p: MatchParticipant) {
  const name = playerName(p);
  try {
    await navigator.clipboard.writeText(name);
    toast.success("コピーしました", name);
  } catch {
    toast.error("コピーに失敗しました");
  }
}

export function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const myPuuid = usePuuid();
  const match = useMatch(matchId);
  const setNumber = match.data?.info.tft_set_number;
  const lookup = useSetLookup(setNumber);

  const players = useMemo(
    () => (match.data ? [...match.data.info.participants].sort((a, b) => a.placement - b.placement) : []),
    [match.data],
  );
  const maxDamage = useMemo(() => Math.max(1, ...players.map((p) => p.total_damage_to_players)), [players]);
  const me = players.find((p) => p.puuid === myPuuid);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/matches"));

  if (match.isPending) {
    return (
      <Page wide>
        <div className="flex items-center gap-3 mb-5">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex flex-col gap-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-80" /></div>
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}
        </div>
      </Page>
    );
  }
  if (match.isError || !match.data) {
    return (
      <Page>
        <PageHeader title="試合詳細" actions={<Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={back}>戻る</Button>} />
        <Card><ErrorState message={match.error?.message ?? "試合が見つかりません"} onRetry={() => match.refetch()} retrying={match.isFetching} /></Card>
      </Page>
    );
  }

  const info = match.data.info;

  return (
    <Page wide>
      <PageHeader
        icon={<Swords />}
        title={
          <span className="flex items-center gap-3">
            試合詳細
            <span className="font-mono text-xs font-normal text-fg-subtle select-text">{match.data.metadata.match_id}</span>
          </span>
        }
        subtitle={
          <span className="flex items-center gap-2 flex-wrap tabular-nums">
            <span>{fmtDate(info.game_datetime)}</span>
            <span className="text-fg-subtle">({fmtRelative(info.game_datetime)})</span>
            <span className="text-border-strong">·</span>
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{fmtDuration(info.game_length)}</span>
            <Badge size="xs" className="border-border text-fg-muted bg-bg-elev">{queueLabel(info.queue_id, info.tft_game_type)}</Badge>
            <Badge size="xs" className="border-border text-fg-subtle bg-bg-elev">Set {info.tft_set_number}</Badge>
            <Badge size="xs" className="border-border text-fg-subtle bg-bg-elev">Patch {patchLabel(info.game_version)}</Badge>
            {lookup.loading && <span className="text-[11px] text-fg-subtle">Set {info.tft_set_number} のデータを読み込み中…</span>}
            {!lookup.loading && !lookup.exact && <span className="text-[11px] text-warning">Set {info.tft_set_number} のデータが取得できないため現在のセットで表示しています</span>}
          </span>
        }
        actions={
          <>
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={back}>戻る</Button>
            <Link to="/matches"><Button variant="outline">戦績一覧</Button></Link>
          </>
        }
      />

      {/* players */}
      <Card padded={false} className="mb-5">
        <div className="grid grid-cols-[52px_190px_230px_210px_1fr] gap-x-4 px-4 py-2 text-[11px] uppercase tracking-wider text-fg-subtle font-medium border-b border-border">
          <span>順位</span><span>プレイヤー</span><span>ステータス</span><span>特性</span><span>ボード / オーグメント</span>
        </div>
        <div className="divide-y divide-border">
          {players.map((p) => (
            <PlayerRow key={p.puuid} p={p} lookup={lookup} isMe={p.puuid === myPuuid} maxDamage={maxDamage} />
          ))}
        </div>
      </Card>

      {/* comparison */}
      {me ? (
        <div className="grid grid-cols-[1fr_360px] gap-5">
          <Card title="対戦相手との比較 — 与ダメージ">
            <DamageChart players={players} myPuuid={me.puuid} />
          </Card>
          <Card title="自分 vs ロビー平均">
            <CompareTable me={me} others={players.filter((p) => p.puuid !== me.puuid)} />
          </Card>
        </div>
      ) : (
        <Card title="対戦相手との比較">
          <div className="flex items-center gap-2 text-sm text-fg-muted"><Users className="size-4" />この試合には自分のアカウントが含まれていません。</div>
        </Card>
      )}
    </Page>
  );
}

function PlayerRow({ p, lookup, isMe, maxDamage }: { p: MatchParticipant; lookup: SetLookup; isMe: boolean; maxDamage: number }) {
  const traits = sortMatchTraits(p.traits);
  const units = sortUnits(p.units, lookup);
  const name = playerName(p);
  return (
    <div className={cn(
      "grid grid-cols-[52px_190px_230px_210px_1fr] gap-x-4 items-start px-4 py-3.5 transition-colors",
      isMe ? "bg-gold/[0.06] shadow-[inset_3px_0_0_var(--color-gold)]" : "hover:bg-surface-2/60",
    )}>
      <PlacementBadge placement={p.placement} size="lg" />
      <div className="min-w-0 pt-0.5">
        <button
          onClick={() => copyRiotId(p)}
          title="Riot ID をコピー"
          className={cn("group inline-flex items-center gap-1.5 max-w-full text-sm font-medium truncate focus-ring rounded", isMe ? "text-gold" : "text-fg hover:text-gold")}
        >
          <span className="truncate">{name}</span>
          <Copy className="size-3 shrink-0 opacity-0 group-hover:opacity-70 transition-opacity" />
        </button>
        {isMe && <div className="text-[10px] uppercase tracking-wider text-gold/80 font-semibold">自分</div>}
        <div className="text-[11px] text-fg-subtle tabular-nums mt-0.5">Lv {p.level} · {stageLabel(p.last_round)} で終了</div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-fg-muted tabular-nums pt-0.5">
        <span>残りゴールド <b className="text-fg font-medium">{p.gold_left}</b></span>
        <span>撃破 <b className="text-fg font-medium">{p.players_eliminated}</b></span>
        <div className="col-span-2">
          <div className="flex justify-between"><span>与ダメージ</span><b className="text-fg font-medium">{fmtNum(p.total_damage_to_players)}</b></div>
          <div className="h-1 mt-1 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(p.total_damage_to_players / maxDamage) * 100}%`, background: isMe ? CHART.gold : placementColor(p.placement) }} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1.5 content-start pt-0.5">
        {traits.length === 0 && <span className="text-xs text-fg-subtle">—</span>}
        {traits.map((t) => (
          <TraitIcon key={t.name} id={t.name} trait={lookup.trait(t.name)} style={t.style} size={22} count={t.num_units} />
        ))}
      </div>
      <div className="min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 flex-wrap pt-2 pb-1">
          {units.map((u, i) => (
            <ChampionIcon key={`${u.character_id}-${i}`} id={u.character_id} champion={lookup.champion(u.character_id)} size={48} stars={u.tier} items={u.itemNames} />
          ))}
          {units.length === 0 && <span className="text-xs text-fg-subtle">ユニット情報なし</span>}
        </div>
        {p.augments && p.augments.length > 0 && (
          <div className="flex items-center gap-2.5 flex-wrap">
            {p.augments.map((a, i) => (
              <AugmentIcon key={`${a}-${i}`} id={a} augment={lookup.augment(a)} size={24} label />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Comparison ---------------------------------------------------------------------
interface DamageDatum { name: string; damage: number; placement: number; me: boolean }

function DamageTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: DamageDatum }> }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return <ChartTip title={`${d.placement}位 ${d.name}`} rows={[{ label: "与ダメージ", value: fmtNum(d.damage), color: d.me ? CHART.gold : CHART.muted }]} />;
}

function DamageChart({ players, myPuuid }: { players: MatchParticipant[]; myPuuid: string }) {
  const data: DamageDatum[] = players.map((p) => ({
    name: p.riotIdGameName ?? p.puuid.slice(0, 6),
    damage: p.total_damage_to_players,
    placement: p.placement,
    me: p.puuid === myPuuid,
  }));
  return (
    <div>
      <div className="flex items-center gap-4 text-[11px] text-fg-subtle mb-2">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: CHART.gold }} />自分</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: CHART.muted }} />他プレイヤー</span>
        <span className="ml-auto">順位順</span>
      </div>
      <ResponsiveContainer width="100%" height={8 * 30 + 28}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" {...AXIS} tickFormatter={(v: number) => fmtNum(v)} />
          <YAxis type="category" dataKey="name" width={110} {...AXIS} tick={{ fill: CHART.axis, fontSize: 11 }} />
          <RTooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DamageTip />} />
          <Bar dataKey="damage" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fill: CHART.axis, fontSize: 11, formatter: (v: unknown) => fmtNum(Number(v)) }}>
            {data.map((d, i) => <Cell key={i} fill={d.me ? CHART.gold : CHART.muted} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompareTable({ me, others }: { me: MatchParticipant; others: MatchParticipant[] }) {
  const avg = (f: (p: MatchParticipant) => number) => (others.length ? others.reduce((a, p) => a + f(p), 0) / others.length : 0);
  const rows: { label: string; mine: number; lobby: number; fmt: (v: number) => string; higherIsBetter: boolean | null }[] = [
    { label: "順位", mine: me.placement, lobby: avg((p) => p.placement), fmt: (v) => v.toFixed(1), higherIsBetter: false },
    { label: "レベル", mine: me.level, lobby: avg((p) => p.level), fmt: (v) => v.toFixed(1), higherIsBetter: true },
    { label: "残りゴールド", mine: me.gold_left, lobby: avg((p) => p.gold_left), fmt: (v) => v.toFixed(1), higherIsBetter: null },
    { label: "与ダメージ", mine: me.total_damage_to_players, lobby: avg((p) => p.total_damage_to_players), fmt: fmtNum, higherIsBetter: true },
    { label: "撃破数", mine: me.players_eliminated, lobby: avg((p) => p.players_eliminated), fmt: (v) => v.toFixed(1), higherIsBetter: true },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wider text-fg-subtle">
          <th className="text-left font-medium pb-2">指標</th>
          <th className="text-right font-medium pb-2 text-gold">自分</th>
          <th className="text-right font-medium pb-2">ロビー平均</th>
          <th className="text-right font-medium pb-2">差</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((r) => {
          const diff = r.mine - r.lobby;
          const good = r.higherIsBetter === null ? null : r.higherIsBetter ? diff > 0 : diff < 0;
          const color = good === null || Math.abs(diff) < 0.05 ? "var(--color-fg-muted)" : good ? "var(--color-success)" : "var(--color-danger)";
          return (
            <tr key={r.label} className="border-t border-border">
              <td className="py-2 text-fg-muted">{r.label}</td>
              <td className="py-2 text-right font-semibold">{r.fmt(r.mine)}</td>
              <td className="py-2 text-right text-fg-muted">{r.fmt(r.lobby)}</td>
              <td className="py-2 text-right font-medium" style={{ color }}>
                <Tooltip content="自分 − ロビー平均（自分以外の7人）"><span>{diff > 0 ? "+" : ""}{r.fmt(diff)}</span></Tooltip>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
