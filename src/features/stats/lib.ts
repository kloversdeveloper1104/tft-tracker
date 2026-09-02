// Feature-local helpers for the meta stats page (filter persistence, encoding, hooks).
import { useEffect, useState } from "react";
import type { CompStat, StatsFilter } from "@/lib/types";

export type Source = "me" | "ladder" | "all";
export type StatsTab = "comps" | "units" | "items" | "traits" | "augments";

export interface FilterState {
  source: Source;
  /** 0 = all queues */
  queueId: number;
  /** 0 = all time */
  days: number;
  minGames: number;
  /** 0 = latest set */
  setNumber: number;
}

export const DEFAULT_FILTER: FilterState = { source: "ladder", queueId: 1100, days: 0, minGames: 5, setNumber: 0 };

export const DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7日" },
  { value: 14, label: "14日" },
  { value: 30, label: "30日" },
  { value: 0, label: "すべて" },
];

export const MIN_GAMES_OPTIONS = [3, 5, 10, 20];

const FILTER_KEY = "tft.stats.filter.v1";
const TAB_KEY = "tft.stats.tab.v1";

function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy errors */
  }
}

export function loadFilter(): FilterState {
  const saved = readSession<Partial<FilterState>>(FILTER_KEY);
  return { ...DEFAULT_FILTER, ...(saved ?? {}) };
}

export function saveFilter(f: FilterState) {
  writeSession(FILTER_KEY, f);
}

export function loadTab(): StatsTab {
  const t = readSession<StatsTab>(TAB_KEY);
  return t && ["comps", "units", "items", "traits", "augments"].includes(t) ? t : "comps";
}

export function saveTab(t: StatsTab) {
  writeSession(TAB_KEY, t);
}

export function toApiFilter(f: FilterState, puuid: string | null, latestSet: number | undefined): StatsFilter {
  const out: StatsFilter = { source: f.source, minGames: f.minGames };
  if (f.source === "me" && puuid) out.puuid = puuid;
  if (f.queueId) out.queueId = f.queueId;
  if (f.days) out.daysBack = f.days;
  const set = f.setNumber || latestSet;
  if (set) out.setNumber = set;
  return out;
}

/** Stable, order-independent key for react-query. */
export function filterKey(f: StatsFilter) {
  return [f.source, f.puuid ?? "", f.setNumber ?? 0, f.queueId ?? 0, f.daysBack ?? 0, f.minGames ?? 0] as const;
}

// ----- base64url ---------------------------------------------------------------
export function base64UrlEncode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface PlannerCompParam {
  name: string;
  units: { championId: string; stars: number; items: string[] }[];
}

/** Converts a comp cluster into the payload the planner accepts via `?comp=`. */
export function compToPlannerParam(comp: CompStat, name: string): PlannerCompParam {
  const sorted = [...comp.units].sort((a, b) => b.frequency - a.frequency);
  let picked = sorted.filter((u) => u.frequency >= 0.5);
  if (picked.length < 4) picked = sorted.slice(0, 8);
  picked = picked.slice(0, 10);
  return {
    name,
    units: picked.map((u) => ({
      championId: u.characterId,
      stars: Math.min(3, Math.max(1, Math.round(u.avgStars))) as 1 | 2 | 3,
      items: u.topItems.slice(0, 3),
    })),
  };
}

// ----- hooks --------------------------------------------------------------------
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Case-insensitive substring match across several candidate strings. */
export function matchesQuery(q: string, ...candidates: (string | undefined)[]) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return candidates.some((c) => c && c.toLowerCase().includes(needle));
}

export function starsFromAvg(avg: number): number {
  return Math.min(3, Math.max(1, Math.round(avg)));
}
