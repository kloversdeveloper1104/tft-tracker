// Top-ladder comp clusters for the recommender. Plain useEffect/useState + a module-level cache
// (5 min TTL, in-flight dedupe) so it works in both the main window and the overlay window,
// which has no QueryClientProvider.
import { useCallback, useEffect, useState } from "react";
import { stats } from "@/lib/api";
import type { CompStat, StatsResult } from "@/lib/types";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; result: StatsResult }>();
const inflight = new Map<string, Promise<StatsResult>>();

const keyOf = (setNumber: number | undefined) => String(setNumber ?? 0);

function fetchLadder(setNumber: number | undefined, force: boolean): Promise<StatsResult> {
  const key = keyOf(setNumber);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.result);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = stats
    .get({ source: "ladder", queueId: 1100, minGames: 5, setNumber })
    .then((r) => {
      cache.set(key, { at: Date.now(), result: r });
      return r;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export interface LadderComps {
  comps: CompStat[];
  /** Participant entries behind the stats; 0 means no ladder data collected yet. */
  games: number;
  setNumber: number | null;
  loading: boolean;
  error: string | null;
  /** True once loaded without error and there is no ladder data. */
  empty: boolean;
  /** Bypass the cache and reload. */
  refresh: () => void;
}

/** `setNumber` 0/undefined = latest set with ladder data. */
export function useLadderComps(setNumber?: number): LadderComps {
  const set = setNumber || undefined;
  const [result, setResult] = useState<StatsResult | null>(() => {
    const hit = cache.get(keyOf(set));
    return hit && Date.now() - hit.at < TTL_MS ? hit.result : null;
  });
  const [loading, setLoading] = useState(result === null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    const force = tick > 0;
    const hit = cache.get(keyOf(set));
    const fresh = !force && hit && Date.now() - hit.at < TTL_MS;
    if (fresh) {
      setResult(hit.result);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchLadder(set, force)
      .then((r) => { if (active) { setResult(r); setLoading(false); } })
      .catch((e: unknown) => { if (active) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); } });
    return () => { active = false; };
  }, [set, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const games = result?.games ?? 0;
  return {
    comps: result?.comps ?? [],
    games,
    setNumber: result?.setNumber ?? null,
    loading,
    error,
    empty: !loading && !error && games === 0,
    refresh,
  };
}
