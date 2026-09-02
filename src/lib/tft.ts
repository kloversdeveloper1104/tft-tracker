import type { Champion, Item, MatchTrait, PlannerUnit, Trait } from "./types";

/** Compute active trait style (0..4/5) for a trait given a unit count. */
export function traitStyleFor(trait: Trait, count: number): { style: number; tierIndex: number; next: number | null } {
  let style = 0;
  let tierIndex = -1;
  let next: number | null = null;
  const effects = [...trait.effects].sort((a, b) => a.minUnits - b.minUnits);
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (count >= e.minUnits && count <= e.maxUnits) {
      style = e.style;
      tierIndex = i;
    }
  }
  for (const e of effects) {
    if (e.minUnits > count) {
      next = e.minUnits;
      break;
    }
  }
  return { style, tierIndex, next };
}

export interface ActiveTrait {
  trait: Trait;
  count: number;
  style: number;
  tierIndex: number;
  next: number | null;
  breakpoints: number[];
}

/** Aggregate active traits for a planner board (unique champions count once). */
export function computeBoardTraits(
  units: PlannerUnit[],
  championsById: Map<string, Champion>,
  traitsByName: Map<string, Trait>,
  traitsById: Map<string, Trait>,
  itemsById: Map<string, Item>,
  emblems: string[] = [],
): ActiveTrait[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const add = (traitKey: string) => {
    const t = traitsById.get(traitKey) ?? traitsByName.get(traitKey);
    if (!t) return;
    counts.set(t.apiName, (counts.get(t.apiName) ?? 0) + 1);
  };
  for (const u of units) {
    const c = championsById.get(u.championId);
    if (!c) continue;
    const unitTraits = new Set<string>();
    if (!seen.has(c.apiName)) {
      seen.add(c.apiName);
      for (const t of c.traitApiNames.length ? c.traitApiNames : c.traits) unitTraits.add(t);
    }
    // emblem items on this unit grant traits
    for (const it of u.items) {
      const item = itemsById.get(it);
      if (item?.kind === "emblem") for (const t of item.associatedTraits) unitTraits.add(t);
    }
    for (const t of unitTraits) add(t);
  }
  for (const e of emblems) add(e);
  const out: ActiveTrait[] = [];
  for (const [id, count] of counts) {
    const trait = traitsById.get(id);
    if (!trait) continue;
    const { style, tierIndex, next } = traitStyleFor(trait, count);
    out.push({ trait, count, style, tierIndex, next, breakpoints: trait.effects.map((e) => e.minUnits) });
  }
  return out.sort((a, b) => b.style - a.style || b.count - a.count || a.trait.name.localeCompare(b.trait.name));
}

/** Sort match traits by style desc, count desc. */
export function sortMatchTraits(traits: MatchTrait[]): MatchTrait[] {
  return [...traits].filter((t) => t.style > 0).sort((a, b) => b.style - a.style || b.num_units - a.num_units);
}

/** Item recipe map: "A|B" (sorted) -> completed item */
export function buildRecipeMap(items: Item[]): Map<string, Item> {
  const m = new Map<string, Item>();
  for (const it of items) {
    if (it.composition.length === 2) {
      const key = [...it.composition].sort().join("|");
      if (!m.has(key)) m.set(key, it);
    }
  }
  return m;
}

export const COMPONENT_ORDER = [
  "TFT_Item_BFSword",
  "TFT_Item_RecurveBow",
  "TFT_Item_NeedlesslyLargeRod",
  "TFT_Item_TearOfTheGoddess",
  "TFT_Item_ChainVest",
  "TFT_Item_NegatronCloak",
  "TFT_Item_GiantsBelt",
  "TFT_Item_SparringGloves",
  "TFT_Item_Spatula",
  "TFT_Item_FryingPan",
];

export function rarityToCost(rarity: number): number {
  // Riot match API rarity: 0=1cost,1=2cost,2=3cost,4=4cost,6=5cost (varies by set); fallback map
  const map: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 4, 5: 5, 6: 5, 7: 6, 8: 6, 9: 6 };
  return map[rarity] ?? Math.min(rarity + 1, 6);
}

export const HEX_ROWS = 4;
export const HEX_COLS = 7;
