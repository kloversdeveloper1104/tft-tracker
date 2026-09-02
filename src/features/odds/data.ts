import type { Champion } from "@/lib/types";

/**
 * XP required to advance from (level-1) -> level.
 * NOTE: Set 18 standard values. These change between sets / patches; edit here.
 */
export const XP_PER_LEVEL: Record<number, number> = {
  2: 2,
  3: 6,
  4: 10,
  5: 20,
  6: 36,
  7: 48,
  8: 80,
  9: 84,
  10: 100,
};

/** Buying XP: 4 gold -> 4 XP. */
export const XP_BUY_COST = 4;
export const XP_PER_BUY = 4;
/** Natural XP gained per player-combat round. */
export const XP_PER_ROUND = 2;

/** Interest: 1 gold per 10 gold held, capped at 5. */
export const INTEREST_THRESHOLDS = [10, 20, 30, 40, 50];
export const MAX_INTEREST = 5;

export function interestFor(gold: number): number {
  return Math.max(0, Math.min(MAX_INTEREST, Math.floor(gold / 10)));
}

/** Fallback champion counts per cost when static data is unavailable. */
export const FALLBACK_CHAMPIONS_PER_COST: Record<number, number> = { 1: 13, 2: 13, 3: 13, 4: 12, 5: 8 };

/** Count champions per cost tier (1..5) from static data, with fallback. */
export function championsPerCostFrom(champions: Champion[] | undefined | null): Record<number, number> {
  if (!champions || champions.length === 0) return { ...FALLBACK_CHAMPIONS_PER_COST };
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const c of champions) {
    if (c.cost >= 1 && c.cost <= 5) out[c.cost] += 1;
  }
  for (let cost = 1; cost <= 5; cost++) {
    if (out[cost] === 0) out[cost] = FALLBACK_CHAMPIONS_PER_COST[cost];
  }
  return out;
}

export const COST_LABELS: Record<number, string> = {
  1: "1コスト",
  2: "2コスト",
  3: "3コスト",
  4: "4コスト",
  5: "5コスト",
};

export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const COSTS = [1, 2, 3, 4, 5];
