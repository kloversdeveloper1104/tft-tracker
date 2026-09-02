// Pure scoring for "which top-ladder comp should I pivot / progress toward?".
// Input: the units (and active traits) currently on the player's board plus the comp clusters
// produced by `stats.get` (CompStat). No side effects, no React — safe to reuse in both windows.
//
// Self-check (paste into a REPL / browser console after importing):
//   const comps = [{ key: "a", coreTraits: [{ name: "T", numUnits: 4, style: 3 }], games: 50, playRate: 0.06,
//     avgPlacement: 3.9, top4Rate: 0.6, winRate: 0.2, avgLevel: 8, units: [
//       { characterId: "X", frequency: 0.9, avgStars: 2, topItems: [] },
//       { characterId: "Y", frequency: 0.8, avgStars: 2, topItems: [] },
//       { characterId: "Z", frequency: 0.2, avgStars: 1, topItems: [] } ] }];
//   scoreComps({ championIds: ["X"], traitApiNames: ["T"] }, comps)[0]
//   → overlap ≈ 0.529 (0.9 / 1.7), matchedUnits ["X"], missingUnits [Y] (Z ignored: 0.2 < 0.35),
//     score ≈ 0.529 + 0.04 (trait) + 0.165 (placement) + 0.051 (popularity) ≈ 0.786,
//     reason "ユニット一致 1/2 · 平均順位 3.9 · 上位帯採用率 6%".
import type { CompStat, CompUnit } from "./types";

export interface CurrentBoard {
  /** Champion.apiName of the units the player already has. */
  championIds: string[];
  /** Trait.apiName of the traits currently active on the board (optional). */
  traitApiNames?: string[];
}

export interface Recommendation {
  comp: CompStat;
  /** Composite score used for ranking (higher is better). */
  score: number;
  /** Frequency-weighted share of the comp's core units the player already has (0..1). */
  overlap: number;
  /** characterIds of core units already owned. */
  matchedUnits: string[];
  /** Core units still missing, sorted by frequency desc. */
  missingUnits: CompUnit[];
  /** Human-readable summary (Japanese). */
  reason: string;
}

export interface ScoreOptions {
  /** Comp units below this frequency are treated as flex slots and ignored. */
  minFrequency: number;
  /** Comps with fewer games than this get `lowSamplePenalty` subtracted. */
  minGames: number;
  /** Bonus per core trait already active on the player's board. */
  traitBonusPer: number;
  /** Cap for the total trait bonus. */
  traitBonusCap: number;
  /** Weight of `(5 - avgPlacement)`. */
  placementWeight: number;
  /** Weight of `log10(games + 1)`. */
  popularityWeight: number;
  lowSamplePenalty: number;
}

export const DEFAULT_SCORE_OPTIONS: ScoreOptions = {
  minFrequency: 0.35,
  minGames: 8,
  traitBonusPer: 0.04,
  traitBonusCap: 0.12,
  placementWeight: 0.15,
  popularityWeight: 0.03,
  lowSamplePenalty: 0.3,
};

const norm = (id: string) => id.toLowerCase();

/** Core units of a comp cluster (frequency >= minFrequency), sorted by frequency desc. Falls back to all units. */
export function coreUnits(comp: CompStat, minFrequency = DEFAULT_SCORE_OPTIONS.minFrequency): CompUnit[] {
  const core = comp.units.filter((u) => u.frequency >= minFrequency);
  return (core.length ? core : [...comp.units]).sort((a, b) => b.frequency - a.frequency);
}

/** Display name of a comp cluster from its top core traits, e.g. 「6 Duelist · 4 Vanguard」. */
export function compName(comp: CompStat, traitName: (apiName: string) => string): string {
  const core = [...comp.coreTraits].sort((a, b) => b.style - a.style || b.numUnits - a.numUnits).slice(0, 3);
  if (core.length === 0) return `構成 ${comp.key.slice(0, 6)}`;
  return core.map((t) => `${t.numUnits} ${traitName(t.name)}`).join(" · ");
}

/** Japanese one-liner, e.g. 「ユニット一致 4/8 · 平均順位 3.9 · 上位帯採用率 6%」. */
export function reasonText(matched: number, total: number, avgPlacement: number, playRate: number): string {
  const pct = playRate * 100;
  const rate = pct >= 1 ? String(Math.round(pct)) : pct.toFixed(1);
  return `ユニット一致 ${matched}/${total} · 平均順位 ${avgPlacement.toFixed(1)} · 上位帯採用率 ${rate}%`;
}

export function scoreComp(current: CurrentBoard, comp: CompStat, opts?: Partial<ScoreOptions>): Recommendation {
  const o = { ...DEFAULT_SCORE_OPTIONS, ...opts };
  const owned = new Set(current.championIds.map(norm));
  const units = coreUnits(comp, o.minFrequency);

  let total = 0;
  let matched = 0;
  const matchedUnits: string[] = [];
  const missingUnits: CompUnit[] = [];
  for (const u of units) {
    total += u.frequency;
    if (owned.has(norm(u.characterId))) {
      matched += u.frequency;
      matchedUnits.push(u.characterId);
    } else {
      missingUnits.push(u);
    }
  }
  const overlap = total > 0 ? matched / total : 0;

  const activeTraits = new Set((current.traitApiNames ?? []).map(norm));
  const traitHits = comp.coreTraits.filter((t) => activeTraits.has(norm(t.name))).length;
  const traitBonus = Math.min(o.traitBonusCap, traitHits * o.traitBonusPer);

  const strength = (5 - comp.avgPlacement) * o.placementWeight;
  const popularity = Math.log10(comp.games + 1) * o.popularityWeight;
  const penalty = comp.games < o.minGames ? o.lowSamplePenalty : 0;

  const score = overlap + traitBonus + strength + popularity - penalty;
  return {
    comp,
    score,
    overlap,
    matchedUnits,
    missingUnits,
    reason: reasonText(matchedUnits.length, units.length, comp.avgPlacement, comp.playRate),
  };
}

/** Score every comp against the current board; sorted by score desc (ties: more games first). */
export function scoreComps(current: CurrentBoard, comps: CompStat[], opts?: Partial<ScoreOptions>): Recommendation[] {
  return comps
    .map((c) => scoreComp(current, c, opts))
    .sort((a, b) => b.score - a.score || b.comp.games - a.comp.games);
}

export function topRecommendations(current: CurrentBoard, comps: CompStat[], n = 3, opts?: Partial<ScoreOptions>): Recommendation[] {
  return scoreComps(current, comps, opts).slice(0, n);
}

export interface LoadoutUnit {
  championId: string;
  stars: 1 | 2 | 3;
  items: string[];
}

/**
 * Units to put on a planner board for a comp: frequency >= `minFrequency` (default 0.5), at most `max`
 * (default 9), stars from avgStars rounded, top 3 items. If fewer than 4 units clear the threshold the
 * top `max` units are used instead so a board is never nearly empty.
 */
export function loadoutUnits(comp: CompStat, opts?: { minFrequency?: number; max?: number }): LoadoutUnit[] {
  const minFrequency = opts?.minFrequency ?? 0.5;
  const max = opts?.max ?? 9;
  const sorted = [...comp.units].sort((a, b) => b.frequency - a.frequency);
  let picked = sorted.filter((u) => u.frequency >= minFrequency);
  if (picked.length < 4) picked = sorted;
  return picked.slice(0, max).map((u) => ({
    championId: u.characterId,
    stars: Math.min(3, Math.max(1, Math.round(u.avgStars))) as 1 | 2 | 3,
    items: u.topItems.slice(0, 3),
  }));
}
