import type { OddsTable } from "@/lib/types";

// ---------------------------------------------------------------------------
// Exact hit-probability model (no Monte Carlo).
//
// Per shop slot: tier is chosen with shopOdds[level][cost]; if the tier matches
// the target's cost, a copy is drawn uniformly from that tier's remaining pool.
// Within a single shop the 5 slots draw without replacement; after the shop is
// rerolled, the unbought cards return to the pool, while bought target copies
// stay removed. A DP over shops tracks the distribution of copies found so far.
// ---------------------------------------------------------------------------

export interface HitInput {
  level: number;
  gold: number;
  cost: number;
  /** Total copies required (e.g. 3 for 2★, 9 for 3★). */
  needed: number;
  /** Copies already owned. */
  owned: number;
  /** Copies of the target held by other players. */
  takenByOthers: number;
  /** Other same-cost copies (any champion) removed from the pool. */
  otherRemoved: number;
  odds: OddsTable;
  championsPerCost: Record<number, number>;
}

export interface CurvePoint {
  shop: number;
  gold: number;
  /** P(≥ needed copies) after this shop. */
  p: number;
  /** P(≥ 1 copy) after this shop. */
  pOne: number;
}

export interface HitResult {
  /** Copies still needed (needed - owned, min 0). */
  need: number;
  alreadyDone: boolean;
  impossible: boolean;
  remainingTarget: number;
  remainingPool: number;
  /** Probability that a single slot shows the target (fresh shop). */
  pSlot: number;
  /** Number of shops seen within the budget (current shop included). */
  shops: number;
  pSuccess: number;
  expectedCopies: number;
  /** Expected gold to reach `needed`; null when unreachable. */
  expectedGold: number | null;
  /** True when the distribution did not converge within the horizon (expectedGold is a lower bound). */
  expectedGoldIsLowerBound: boolean;
  curve: CurvePoint[];
  perShop: CurvePoint[];
  /** Distribution of hits in the first (fresh) shop: index = hits. */
  firstShopDist: number[];
}

const HORIZON = 250;

/** Distribution of target hits within one shop of `slots` draws without replacement. */
export function shopHitDist(T: number, P: number, pTier: number, slots: number): number[] {
  // state[h][n]: h target hits, n same-tier non-target draws
  let cur: number[][] = Array.from({ length: slots + 1 }, () => new Array<number>(slots + 1).fill(0));
  cur[0][0] = 1;
  for (let s = 0; s < slots; s++) {
    const next: number[][] = Array.from({ length: slots + 1 }, () => new Array<number>(slots + 1).fill(0));
    for (let h = 0; h <= s; h++) {
      for (let n = 0; n + h <= s; n++) {
        const p = cur[h][n];
        if (p === 0) continue;
        const rem = P - h - n;
        const remT = Math.max(0, T - h);
        if (rem <= 0 || pTier <= 0) {
          next[h][n] += p;
          continue;
        }
        const pHit = pTier * (Math.min(remT, rem) / rem);
        const pMiss = pTier - pHit;
        const pOther = 1 - pTier;
        next[h + 1][n] += p * pHit;
        next[h][n + 1] += p * pMiss;
        next[h][n] += p * pOther;
      }
    }
    cur = next;
  }
  const out = new Array<number>(slots + 1).fill(0);
  for (let h = 0; h <= slots; h++) for (let n = 0; n <= slots; n++) out[h] += cur[h][n];
  return out;
}

export function computeHit(input: HitInput): HitResult {
  const { odds, championsPerCost } = input;
  const level = Math.max(1, Math.min(11, Math.round(input.level)));
  const cost = Math.max(1, Math.min(5, Math.round(input.cost)));
  const slots = Math.max(1, odds.shopSlots || 5);
  const reroll = Math.max(1, odds.rerollCost || 2);
  const row = odds.shopOdds[level] ?? [0, 0, 0, 0, 0];
  const pTier = Math.max(0, Math.min(100, row[cost - 1] ?? 0)) / 100;
  const poolPer = Math.max(0, odds.poolSize[cost] ?? 0);
  const champs = Math.max(1, championsPerCost[cost] ?? 1);

  const owned = Math.max(0, input.owned);
  const need = Math.max(0, input.needed - owned);
  const T0 = Math.max(0, poolPer - owned - Math.max(0, input.takenByOthers));
  const P0 = Math.max(T0, poolPer * champs - owned - Math.max(0, input.takenByOthers) - Math.max(0, input.otherRemoved));
  const shops = Math.floor(Math.max(0, input.gold) / reroll) + 1;

  const firstShopDist = shopHitDist(T0, P0, pTier, slots);
  const pSlot = P0 > 0 ? pTier * (T0 / P0) : 0;

  const base: Omit<HitResult, "pSuccess" | "expectedCopies" | "expectedGold" | "expectedGoldIsLowerBound" | "curve" | "perShop"> = {
    need,
    alreadyDone: need === 0,
    impossible: need > 0 && (T0 < need || pTier === 0),
    remainingTarget: T0,
    remainingPool: P0,
    pSlot,
    shops,
    firstShopDist,
  };

  if (need === 0) {
    const curve: CurvePoint[] = Array.from({ length: shops }, (_, i) => ({ shop: i + 1, gold: i * reroll, p: 1, pOne: 1 }));
    return { ...base, pSuccess: 1, expectedCopies: 0, expectedGold: 0, expectedGoldIsLowerBound: false, curve, perShop: curve.slice(0, 10) };
  }

  // Per-state shop distributions (state k = copies found so far).
  const distByK: number[][] = [];
  for (let k = 0; k < need; k++) distByK.push(shopHitDist(T0 - k, P0 - k, pTier, slots));

  let dist = new Array<number>(need + 1).fill(0);
  dist[0] = 1;
  const maxShops = Math.max(shops, HORIZON);
  const successBy: number[] = [0];
  const oneBy: number[] = [0];
  let pSuccess = 0;
  let expectedCopies = 0;

  for (let s = 1; s <= maxShops; s++) {
    const next = new Array<number>(need + 1).fill(0);
    for (let k = 0; k < need; k++) {
      const pk = dist[k];
      if (pk === 0) continue;
      const d = distByK[k];
      for (let h = 0; h <= slots; h++) {
        if (d[h] === 0) continue;
        next[Math.min(need, k + h)] += pk * d[h];
      }
    }
    next[need] += dist[need];
    dist = next;
    successBy.push(dist[need]);
    oneBy.push(1 - dist[0]);
    if (s === shops) {
      pSuccess = dist[need];
      expectedCopies = dist.reduce((acc, p, k) => acc + p * k, 0);
    }
  }

  // Expected gold to reach `need` from the cumulative distribution over shops.
  let expectedGold = 0;
  for (let s = 1; s <= maxShops; s++) expectedGold += (s - 1) * reroll * (successBy[s] - successBy[s - 1]);
  const tail = 1 - successBy[maxShops];
  const converged = tail < 0.01;
  if (!converged) expectedGold += tail * (maxShops - 1) * reroll;

  const curve: CurvePoint[] = [];
  for (let s = 1; s <= shops; s++) curve.push({ shop: s, gold: (s - 1) * reroll, p: successBy[s], pOne: oneBy[s] });
  const perShop: CurvePoint[] = [];
  for (let s = 1; s <= Math.min(10, maxShops); s++) perShop.push({ shop: s, gold: (s - 1) * reroll, p: successBy[s], pOne: oneBy[s] });

  return {
    ...base,
    pSuccess,
    expectedCopies,
    expectedGold: base.impossible ? null : expectedGold,
    expectedGoldIsLowerBound: !converged,
    curve,
    perShop,
  };
}

/** Deep-equality for odds tables (used to decide whether to persist null = defaults). */
export function oddsEqual(a: OddsTable, b: OddsTable): boolean {
  if (a.rerollCost !== b.rerollCost || a.shopSlots !== b.shopSlots) return false;
  for (let c = 1; c <= 5; c++) if ((a.poolSize[c] ?? 0) !== (b.poolSize[c] ?? 0)) return false;
  for (let l = 1; l <= 11; l++) {
    const ra = a.shopOdds[l] ?? [];
    const rb = b.shopOdds[l] ?? [];
    for (let i = 0; i < 5; i++) if ((ra[i] ?? 0) !== (rb[i] ?? 0)) return false;
  }
  return true;
}
