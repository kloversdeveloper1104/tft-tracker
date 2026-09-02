import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { riot } from "@/lib/api";
import { rarityToCost } from "@/lib/tft";
import { useSettings } from "@/stores/settings";
import { useStaticData } from "@/stores/staticData";
import type { Augment, Champion, Item, MatchSummary, MatchUnit, StaticData, Trait } from "@/lib/types";

export const PAGE_SIZE = 30;

export function usePuuid(): string | null {
  return useSettings((s) => s.settings.puuid);
}

// ----- Static data lookup bound to a specific set ------------------------------
export interface SetLookup {
  /** Static data actually used for lookups (may be a fallback to the current set). */
  data: StaticData | null;
  /** True when `data` belongs to the requested set (or no specific set was requested). */
  exact: boolean;
  /** True while a different set is still being fetched. */
  loading: boolean;
  champion: (id: string) => Champion | undefined;
  item: (id: string) => Item | undefined;
  trait: (id: string) => Trait | undefined;
  augment: (id: string) => Augment | undefined;
  unitCost: (u: MatchUnit) => number;
}

/**
 * Lookup helpers for a given set. Defaults to the currently loaded static data;
 * when `setNumber` differs it loads that set through the store (`extraSets`) and
 * falls back to the current data until it arrives.
 */
export function useSetLookup(setNumber?: number): SetLookup {
  const current = useStaticData((s) => s.data);
  const extraSets = useStaticData((s) => s.extraSets);
  const loadSet = useStaticData((s) => s.loadSet);
  const locale = useSettings((s) => s.settings.locale);

  const wantsOther = setNumber !== undefined && current !== null && current.setNumber !== setNumber;
  const other = wantsOther ? extraSets.get(setNumber) ?? null : null;

  useEffect(() => {
    if (wantsOther && !other) loadSet(locale, setNumber);
  }, [wantsOther, other, loadSet, locale, setNumber]);

  const data = wantsOther ? other ?? current : current;
  const exact = !wantsOther || other !== null;

  return useMemo(() => {
    const champions = new Map<string, Champion>();
    const items = new Map<string, Item>();
    const traits = new Map<string, Trait>();
    const augments = new Map<string, Augment>();
    if (data) {
      for (const c of data.champions) {
        champions.set(c.apiName, c);
        champions.set(c.apiName.toLowerCase(), c);
      }
      for (const i of data.items) items.set(i.apiName, i);
      for (const t of data.traits) traits.set(t.apiName, t);
      for (const a of data.augments) augments.set(a.apiName, a);
    }
    const champion = (id: string) => champions.get(id) ?? champions.get(id.toLowerCase());
    return {
      data,
      exact,
      loading: wantsOther && other === null,
      champion,
      item: (id: string) => items.get(id),
      trait: (id: string) => traits.get(id),
      augment: (id: string) => augments.get(id),
      unitCost: (u: MatchUnit) => champion(u.character_id)?.cost ?? rarityToCost(u.rarity),
    };
  }, [data, exact, wantsOther, other]);
}

// ----- Queries -------------------------------------------------------------------
export interface MatchFilters {
  queueId?: number;
  setNumber?: number;
}

export function useMatchPages(puuid: string | null, filters: MatchFilters) {
  return useInfiniteQuery({
    queryKey: ["matches", "pages", puuid, filters.queueId ?? null, filters.setNumber ?? null],
    enabled: !!puuid,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      riot.listMatches(puuid!, PAGE_SIZE, pageParam, { queueId: filters.queueId, setNumber: filters.setNumber }),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE),
  });
}

export function useMatchCount(puuid: string | null) {
  return useQuery({
    queryKey: ["matches", "count", puuid],
    enabled: !!puuid,
    queryFn: () => riot.countMatches(puuid!),
  });
}

export function useRecentMatches(puuid: string | null, limit = 200) {
  return useQuery({
    queryKey: ["matches", "recent", puuid, limit],
    enabled: !!puuid,
    queryFn: () => riot.listMatches(puuid!, limit, 0),
  });
}

export function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: ["match", matchId],
    enabled: !!matchId,
    queryFn: () => riot.getMatch(matchId!),
    staleTime: Infinity,
  });
}

// ----- Aggregations ----------------------------------------------------------------
export interface MatchAggregate {
  games: number;
  avgPlacement: number;
  top4Rate: number;
  winRate: number;
  avgLevel: number;
  avgGold: number;
}

export function aggregateMatches(rows: MatchSummary[]): MatchAggregate {
  const n = rows.length;
  if (n === 0) return { games: 0, avgPlacement: 0, top4Rate: 0, winRate: 0, avgLevel: 0, avgGold: 0 };
  let place = 0, top4 = 0, wins = 0, level = 0, gold = 0;
  for (const r of rows) {
    const p = r.participant;
    place += p.placement;
    if (p.placement <= 4) top4++;
    if (p.placement === 1) wins++;
    level += p.level;
    gold += p.gold_left;
  }
  return { games: n, avgPlacement: place / n, top4Rate: top4 / n, winRate: wins / n, avgLevel: level / n, avgGold: gold / n };
}
