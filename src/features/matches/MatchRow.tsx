import { Link } from "react-router";
import { Clock, Coins, Skull, Swords, Trophy } from "lucide-react";
import { Badge, Tooltip } from "@/components/ui";
import { AugmentIcon, ChampionIcon, PlacementBadge, TraitIcon } from "@/components/tft";
import { sortMatchTraits } from "@/lib/tft";
import { cn, fmtDate, fmtDuration, fmtRelative, placementColor, stageLabel } from "@/lib/utils";
import type { MatchSummary } from "@/lib/types";
import type { SetLookup } from "./hooks";
import { fmtNum, queueLabel, sortUnits } from "./shared";

export function MatchRow({ m, lookup, compact }: { m: MatchSummary; lookup: SetLookup; compact?: boolean }) {
  const p = m.participant;
  const traits = sortMatchTraits(p.traits);
  const units = sortUnits(p.units, lookup);
  const top4 = p.placement <= 4;
  const accent = placementColor(p.placement);

  if (compact) {
    return (
      <Link
        to={`/matches/${m.matchId}`}
        className="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-surface-2 focus-ring no-underline text-fg"
      >
        {top4 && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: accent }} />}
        <PlacementBadge placement={p.placement} size="md" />
        <div className="w-[118px] shrink-0">
          <div className="text-xs text-fg truncate">{queueLabel(m.queueId, m.gameType)}</div>
          <div className="text-[11px] text-fg-subtle tabular-nums">{fmtRelative(m.gameDatetime)}</div>
        </div>
        <div className="w-10 shrink-0 text-xs tabular-nums text-fg-muted">Lv {p.level}</div>
        <div className="flex items-center gap-1.5 w-[120px] shrink-0 overflow-hidden">
          {traits.slice(0, 5).map((t) => (
            <TraitIcon key={t.name} id={t.name} trait={lookup.trait(t.name)} style={t.style} size={18} />
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden py-1">
          {units.map((u, i) => (
            <ChampionIcon key={`${u.character_id}-${i}`} id={u.character_id} champion={lookup.champion(u.character_id)} size={30} stars={u.tier} items={u.itemNames} />
          ))}
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/matches/${m.matchId}`}
      className={cn(
        "group relative block rounded-xl border border-border bg-surface px-4 py-3.5 no-underline text-fg",
        "transition-all duration-150 hover:bg-surface-2 hover:border-border-strong hover:-translate-y-px hover:shadow-card focus-ring",
      )}
    >
      {top4 && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: accent }} />}
      <div className="flex items-start gap-4">
        <PlacementBadge placement={p.placement} size="lg" />

        {/* meta */}
        <div className="w-[190px] shrink-0 flex flex-col gap-1.5">
          <div>
            <div className="text-sm font-medium tabular-nums">{fmtDate(m.gameDatetime)}</div>
            <div className="text-[11px] text-fg-subtle tabular-nums flex items-center gap-1.5">
              {fmtRelative(m.gameDatetime)}
              <span className="text-border-strong">·</span>
              <Clock className="size-3" /> {fmtDuration(m.gameLength)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge size="xs" className="border-border text-fg-muted bg-bg-elev">{queueLabel(m.queueId, m.gameType)}</Badge>
            <Badge size="xs" className="border-border text-fg-subtle bg-bg-elev">Set {m.setNumber}</Badge>
          </div>
          <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[11px] text-fg-muted tabular-nums">
            <Tooltip content="到達ステージ"><span className="inline-flex items-center gap-1"><Trophy className="size-3 text-fg-subtle" />{stageLabel(p.last_round)}</span></Tooltip>
            <span>Lv {p.level}</span>
            <Tooltip content="残りゴールド"><span className="inline-flex items-center gap-1"><Coins className="size-3 text-fg-subtle" />{p.gold_left}</span></Tooltip>
            <Tooltip content="与ダメージ"><span className="inline-flex items-center gap-1"><Swords className="size-3 text-fg-subtle" />{fmtNum(p.total_damage_to_players)}</span></Tooltip>
            <Tooltip content="撃破プレイヤー数"><span className="inline-flex items-center gap-1"><Skull className="size-3 text-fg-subtle" />{p.players_eliminated}</span></Tooltip>
          </div>
        </div>

        {/* traits */}
        <div className="w-[210px] shrink-0 flex flex-wrap gap-x-2.5 gap-y-1.5 content-start pt-0.5">
          {traits.length === 0 && <span className="text-xs text-fg-subtle">アクティブな特性なし</span>}
          {traits.map((t) => (
            <TraitIcon key={t.name} id={t.name} trait={lookup.trait(t.name)} style={t.style} size={22} count={t.num_units} />
          ))}
        </div>

        {/* units + augments */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-2.5 flex-wrap pt-2 pb-1">
            {units.map((u, i) => (
              <ChampionIcon key={`${u.character_id}-${i}`} id={u.character_id} champion={lookup.champion(u.character_id)} size={44} stars={u.tier} items={u.itemNames} />
            ))}
            {units.length === 0 && <span className="text-xs text-fg-subtle">ユニット情報なし</span>}
          </div>
          {p.augments && p.augments.length > 0 && (
            <div className="flex items-center gap-2">
              {p.augments.map((a, i) => (
                <AugmentIcon key={`${a}-${i}`} id={a} augment={lookup.augment(a)} size={24} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
