import { useMemo } from "react";
import { EmptyState } from "@/components/ui";
import { ChampionIcon, StarRow, TraitIcon } from "@/components/tft";
import { sortMatchTraits } from "@/lib/tft";
import { avgPlacementColor, fmtPct, fmtPlacement } from "@/lib/utils";
import type { MatchSummary, MatchTrait } from "@/lib/types";
import type { SetLookup } from "@/features/matches/hooks";

interface CompAgg { key: string; traits: MatchTrait[]; games: number; placeSum: number; top4: number }

export function TopComps({ rows, lookup, limit = 3 }: { rows: MatchSummary[]; lookup: SetLookup; limit?: number }) {
  const comps = useMemo(() => {
    const map = new Map<string, CompAgg>();
    for (const m of rows) {
      const p = m.participant;
      const core = sortMatchTraits(p.traits).slice(0, 2);
      if (core.length === 0) continue;
      const key = core.map((t) => t.name).sort().join("|");
      const cur = map.get(key) ?? { key, traits: core, games: 0, placeSum: 0, top4: 0 };
      cur.games++;
      cur.placeSum += p.placement;
      if (p.placement <= 4) cur.top4++;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.games - a.games || a.placeSum / a.games - b.placeSum / b.games).slice(0, limit);
  }, [rows, limit]);

  if (comps.length === 0) return <EmptyState className="py-6" title="データがありません" description="試合を同期すると表示されます。" />;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {comps.map((c, i) => {
        const avg = c.placeSum / c.games;
        return (
          <li key={c.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="w-5 text-xs font-bold tabular-nums text-fg-subtle">{i + 1}</span>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {c.traits.map((t) => (
                <TraitIcon key={t.name} id={t.name} trait={lookup.trait(t.name)} style={t.style} size={20} count={t.num_units} label />
              ))}
            </div>
            <div className="text-right tabular-nums">
              <div className="text-sm font-semibold" style={{ color: avgPlacementColor(avg) }}>{fmtPlacement(avg)}<span className="text-[10px] text-fg-subtle ml-0.5">位</span></div>
              <div className="text-[11px] text-fg-muted">{c.games}戦 · Top4 {fmtPct(c.top4 / c.games, 0)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface UnitAgg { id: string; games: number; placeSum: number; stars: number }

export function TopUnits({ rows, lookup, limit = 8 }: { rows: MatchSummary[]; lookup: SetLookup; limit?: number }) {
  const units = useMemo(() => {
    const map = new Map<string, UnitAgg>();
    for (const m of rows) {
      const p = m.participant;
      const seen = new Set<string>();
      for (const u of p.units) {
        if (seen.has(u.character_id)) continue;
        seen.add(u.character_id);
        const cur = map.get(u.character_id) ?? { id: u.character_id, games: 0, placeSum: 0, stars: 0 };
        cur.games++;
        cur.placeSum += p.placement;
        cur.stars += u.tier;
        map.set(u.character_id, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.games - a.games || a.placeSum / a.games - b.placeSum / b.games).slice(0, limit);
  }, [rows, limit]);

  if (units.length === 0) return <EmptyState className="py-6" title="データがありません" description="試合を同期すると表示されます。" />;
  const total = rows.length || 1;

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
      {units.map((u) => {
        const avg = u.placeSum / u.games;
        const c = lookup.champion(u.id);
        return (
          <li key={u.id} className="flex items-center gap-2.5 py-1.5">
            <ChampionIcon id={u.id} champion={c} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{c?.name ?? u.id}</div>
              <div className="text-[11px] text-fg-muted flex items-center gap-1.5 tabular-nums">
                {fmtPct(u.games / total, 0)}
                <StarRow stars={Math.round(u.stars / u.games)} size={10} />
              </div>
            </div>
            <div className="text-sm font-semibold tabular-nums" style={{ color: avgPlacementColor(avg) }}>{fmtPlacement(avg)}</div>
          </li>
        );
      })}
    </ul>
  );
}
