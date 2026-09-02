// User-maintained augment tier list (S/A/B/C/D).
// Riot's match API no longer exposes augment picks, so tiers cannot be derived from data;
// the user rates augments manually (e.g. while following a streamer / website tier list).
// Persisted via tauri-plugin-store `augment_tiers.json`; changes are broadcast to the other
// window with the "augment-tiers-updated" event.
import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";
import { staticData as staticApi } from "./api";
import type { Augment } from "./types";

// ----- Types -------------------------------------------------------------------
export type Tier = "S" | "A" | "B" | "C" | "D";

export interface AugmentRating {
  tier: Tier;
  note?: string;
  updatedAt: number;
}

export interface AugmentTierData {
  setNumber: number;
  ratings: Record<string, AugmentRating>; // key: Augment.apiName
  sourceLabel?: string;
  updatedAt: number;
}

export interface ImportResult {
  matched: number;
  unmatched: string[];
}

export const TIER_ORDER: Tier[] = ["S", "A", "B", "C", "D"];
export const TIER_COLORS: Record<Tier, string> = {
  S: "#ff7a7a",
  A: "#ffb86b",
  B: "#ffe27a",
  C: "#9be37a",
  D: "#8fb4ff",
};

export function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIER_ORDER as string[]).includes(v);
}

export function tierRank(t: Tier | null | undefined): number {
  return t ? TIER_ORDER.indexOf(t) : TIER_ORDER.length;
}

const EVENT = "augment-tiers-updated";
const KEY = "tiers";
const URL_KEY = "importUrl";
const ORIGIN = Math.random().toString(36).slice(2);

const store = new LazyStore("augment_tiers.json", { autoSave: true });

function emptyData(setNumber = 0): AugmentTierData {
  return { setNumber, ratings: {}, updatedAt: 0 };
}

// ----- Normalization / matching ----------------------------------------------------
/** Lowercase NFKC, whitespace + punctuation removed (keeps "+" which is part of some names). */
export function normFull(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, "");
}

/** Like normFull but also strips a trailing tier suffix ("I/II/III", "1..3", "+"). */
export function normBase(s: string): string {
  const t = s
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/(?:\s+(?:i{1,3}|[1-3])|\s*\+)+\s*$/i, "");
  return t.replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Strip CDragon markup tags / template tokens from a description for plain-text search. */
export function plainDesc(desc: string): string {
  return desc.replace(/<[^>]+>/g, " ").replace(/@[^@\s]+@/g, "").replace(/\{\{[^}]+\}\}/g, "").replace(/%i:\w+%/g, "").replace(/\s+/g, " ").trim();
}

function bigrams(s: string): string[] {
  if (s.length < 2) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Dice coefficient on character bigrams (0..1). */
export function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = new Map<string, number>();
  for (const g of bigrams(b)) gb.set(g, (gb.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of ga) {
    const n = gb.get(g);
    if (n) { hits++; gb.set(g, n - 1); }
  }
  return (2 * hits) / (ga.length + bigrams(b).length);
}

interface IndexEntry { apiName: string; full: string[]; base: string[] }

function buildIndex(augments: Augment[], enNames?: Map<string, string>): IndexEntry[] {
  return augments.map((a) => {
    const names = [a.name];
    const en = enNames?.get(a.apiName);
    if (en && en !== a.name) names.push(en);
    return {
      apiName: a.apiName,
      full: names.map(normFull).filter(Boolean),
      base: names.map(normBase).filter(Boolean),
    };
  });
}

/** Resolve one free-text token to augment apiNames (may be several for I/II/III variants). */
function resolveToken(token: string, index: IndexEntry[]): { ids: string[]; exact: boolean } {
  const full = normFull(token);
  const base = normBase(token);
  if (!full) return { ids: [], exact: false };
  // 1. exact (full)
  const exact = index.filter((e) => e.full.includes(full));
  if (exact.length) return { ids: exact.map((e) => e.apiName), exact: true };
  return { ids: resolveLoose(full, base, index), exact: false };
}

function resolveLoose(full: string, base: string, index: IndexEntry[]): string[] {
  // 2. exact (tier suffix stripped) -> all variants
  if (base) {
    const baseHits = index.filter((e) => e.base.includes(base));
    if (baseHits.length) return baseHits.map((e) => e.apiName);
  }
  // 3. prefix / substring (either direction), closest length wins; keep same-base variants together
  if (base.length >= 2) {
    let best: { e: IndexEntry; diff: number; key: string } | null = null;
    for (const e of index) {
      for (const n of e.base) {
        if (n.length < 2) continue;
        if (n.includes(base) || base.includes(n)) {
          const diff = Math.abs(n.length - base.length);
          if (!best || diff < best.diff) best = { e, diff, key: n };
        }
      }
    }
    if (best) {
      const key = best.key;
      return index.filter((e) => e.base.includes(key)).map((e) => e.apiName);
    }
  }
  // 4. fuzzy (Dice on bigrams)
  let bestScore = 0;
  let bestKey = "";
  for (const e of index) {
    for (const n of [...e.full, ...e.base]) {
      const s = Math.max(dice(full, n), dice(base, n));
      if (s > bestScore) { bestScore = s; bestKey = n; }
    }
  }
  if (bestScore >= 0.6 && bestKey) {
    return index.filter((e) => e.full.includes(bestKey) || e.base.includes(bestKey)).map((e) => e.apiName);
  }
  return [];
}

const TIER_WORD = "(?:ティア|tier|級|ランク|帯)";
const SEP = "[:：\\-－—–>＞=＝]";
// "S: a, b" / "Sティア a" / "S - a" / "S" (header only)
const LINE_PREFIX = new RegExp(`^([SABCDsabcd])\\s*[+\\-]?\\s*(${TIER_WORD})?\\s*(?:(${SEP})|\\s|$)\\s*(.*)$`, "u");
// "name S" / "name: S" / "name - Sティア"
const LINE_SUFFIX = new RegExp(`^(.*?\\S)\\s*(?:${SEP}\\s*|\\s+)([SABCD])\\s*[+\\-]?\\s*${TIER_WORD}?\\s*$`, "u");
const TOKEN_SPLIT = /[,、，\/／\t・;；|｜]+/;

export interface ParsedTiers {
  /** apiName -> tier */
  tiers: Map<string, Tier>;
  /** tokens that were recognised as names but could not be matched */
  unmatched: string[];
  /** number of name tokens matched */
  matched: number;
}

/** Parse free-form tier list text (see LINE_PREFIX / LINE_SUFFIX formats) into augment tiers. */
export function parseTierText(text: string, augments: Augment[], enNames?: Map<string, string>): ParsedTiers {
  const index = buildIndex(augments, enNames);
  const tiers = new Map<string, Tier>();
  const explicit = new Set<string>(); // set by an exact-name token; loose (variant-group) matches never override these
  const unmatched: string[] = [];
  let matched = 0;
  let current: Tier | null = null;

  const assign = (names: string, tier: Tier) => {
    for (const raw of names.split(TOKEN_SPLIT)) {
      const token = raw.trim().replace(/^[\s\-・*•●○◎]+|[\s。.]+$/g, "");
      if (!token || !/[\p{L}\p{N}]/u.test(token)) continue;
      const { ids, exact } = resolveToken(token, index);
      if (ids.length === 0) { unmatched.push(token); continue; }
      matched++;
      for (const id of ids) {
        if (exact) { tiers.set(id, tier); explicit.add(id); }
        else if (!explicit.has(id)) tiers.set(id, tier);
      }
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const pre = LINE_PREFIX.exec(line);
    if (pre) {
      const letter = pre[1].toUpperCase() as Tier;
      const hasWord = !!pre[2];
      const hasSep = !!pre[3];
      const rest = pre[4] ?? "";
      // Bare "S" line or "Sティア:" header
      if (!rest) { current = letter; continue; }
      // Without keyword/separator we need an uppercase letter to avoid eating e.g. "a name".
      if (hasWord || hasSep || pre[1] === letter) {
        current = letter;
        assign(rest, letter);
        continue;
      }
    }
    const suf = LINE_SUFFIX.exec(line);
    if (suf) {
      assign(suf[1], suf[2] as Tier);
      continue;
    }
    if (current) assign(line, current);
    else unmatched.push(line);
  }
  return { tiers, unmatched, matched };
}

// ----- English names (lazy, cached per set) -----------------------------------------
const enCache = new Map<number, Promise<Map<string, string>>>();

/** apiName -> English augment name for a set (cached; empty map on failure). */
export function loadEnglishAugmentNames(setNumber?: number): Promise<Map<string, string>> {
  const key = setNumber ?? -1;
  let p = enCache.get(key);
  if (!p) {
    p = staticApi.get("en_us", setNumber)
      .then((d) => new Map(d.augments.map((a) => [a.apiName, a.name] as const)))
      .catch(() => { enCache.delete(key); return new Map<string, string>(); });
    enCache.set(key, p);
  }
  return p;
}

// ----- JSON import / export -----------------------------------------------------------
export interface ExportShape extends AugmentTierData { version: 1 }

/** Accepts our export shape, a bare `{ ratings }` object, or a flat `{ apiName: "S" }` map. */
export function parseTierJson(json: string): { ratings: Record<string, AugmentRating>; setNumber?: number; sourceLabel?: string } {
  const raw: unknown = JSON.parse(json);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("JSON オブジェクトではありません");
  const obj = raw as Record<string, unknown>;
  const now = Date.now();
  const out: Record<string, AugmentRating> = {};
  const src = (obj.ratings && typeof obj.ratings === "object" ? obj.ratings : obj) as Record<string, unknown>;
  for (const [k, v] of Object.entries(src)) {
    if (isTier(v)) { out[k] = { tier: v, updatedAt: now }; continue; }
    if (v && typeof v === "object") {
      const r = v as { tier?: unknown; note?: unknown; updatedAt?: unknown };
      if (isTier(r.tier)) {
        out[k] = {
          tier: r.tier,
          note: typeof r.note === "string" && r.note ? r.note : undefined,
          updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
        };
      }
    }
  }
  if (Object.keys(out).length === 0) throw new Error("評価データが含まれていません");
  return {
    ratings: out,
    setNumber: typeof obj.setNumber === "number" ? obj.setNumber : undefined,
    sourceLabel: typeof obj.sourceLabel === "string" ? obj.sourceLabel : undefined,
  };
}

// ----- Store ---------------------------------------------------------------------------
interface AugmentTiersState {
  data: AugmentTierData;
  loaded: boolean;
  importUrl: string;
  load: () => Promise<void>;
  rate: (apiName: string, tier: Tier | null, setNumber?: number) => Promise<void>;
  setNote: (apiName: string, note: string) => Promise<void>;
  clearAll: () => Promise<void>;
  importText: (text: string, augments: Augment[], enNames?: Map<string, string>, setNumber?: number) => Promise<ImportResult>;
  exportJson: () => string;
  importJson: (json: string) => Promise<ImportResult>;
  /** Fetches a URL; JSON is imported as JSON, anything else is parsed as tier text (needs `augments`). */
  importFromUrl: (url: string, augments?: Augment[], enNames?: Map<string, string>, setNumber?: number) => Promise<ImportResult>;
  setImportUrl: (url: string) => Promise<void>;
}

let listening = false;

export const useAugmentTiers = create<AugmentTiersState>((set, get) => {
  const persist = async (data: AugmentTierData) => {
    set({ data });
    await store.set(KEY, data);
    await store.save();
    await emit(EVENT, { origin: ORIGIN }).catch(() => {});
  };
  const applyRatings = async (ratings: Record<string, AugmentRating>, extra?: { setNumber?: number; sourceLabel?: string }) => {
    const cur = get().data;
    const next: AugmentTierData = {
      setNumber: extra?.setNumber ?? cur.setNumber,
      ratings: { ...cur.ratings, ...ratings },
      sourceLabel: extra?.sourceLabel ?? cur.sourceLabel,
      updatedAt: Date.now(),
    };
    await persist(next);
  };

  return {
    data: emptyData(),
    loaded: false,
    importUrl: "",
    load: async () => {
      try {
        const [saved, url] = await Promise.all([store.get<AugmentTierData>(KEY), store.get<string>(URL_KEY)]);
        const data = saved && typeof saved === "object" && saved.ratings ? { ...emptyData(), ...saved } : emptyData();
        set({ data, loaded: true, importUrl: url ?? "" });
      } catch {
        set({ loaded: true });
      }
      if (!listening) {
        listening = true;
        listen<{ origin?: string }>(EVENT, (e) => {
          if (e.payload?.origin === ORIGIN) return;
          store.get<AugmentTierData>(KEY).then((saved) => {
            if (saved && typeof saved === "object" && saved.ratings) set({ data: { ...emptyData(), ...saved } });
            else set({ data: emptyData() });
          }).catch(() => {});
        }).catch(() => { listening = false; });
      }
    },
    rate: async (apiName, tier, setNumber) => {
      const cur = get().data;
      const ratings = { ...cur.ratings };
      if (tier) ratings[apiName] = { ...ratings[apiName], tier, updatedAt: Date.now() };
      else delete ratings[apiName];
      await persist({ ...cur, setNumber: setNumber ?? cur.setNumber, ratings, updatedAt: Date.now() });
    },
    setNote: async (apiName, note) => {
      const cur = get().data;
      const r = cur.ratings[apiName];
      if (!r) return;
      const ratings = { ...cur.ratings, [apiName]: { ...r, note: note || undefined, updatedAt: Date.now() } };
      await persist({ ...cur, ratings, updatedAt: Date.now() });
    },
    clearAll: async () => {
      await persist({ ...emptyData(get().data.setNumber), updatedAt: Date.now() });
    },
    importText: async (text, augments, enNames, setNumber) => {
      const parsed = parseTierText(text, augments, enNames);
      const now = Date.now();
      const ratings: Record<string, AugmentRating> = {};
      for (const [id, tier] of parsed.tiers) ratings[id] = { ...get().data.ratings[id], tier, updatedAt: now };
      if (parsed.tiers.size) await applyRatings(ratings, { setNumber });
      return { matched: parsed.matched, unmatched: parsed.unmatched };
    },
    exportJson: () => {
      const d = get().data;
      const shape: ExportShape = { version: 1, ...d };
      return JSON.stringify(shape, null, 2);
    },
    importJson: async (json) => {
      const parsed = parseTierJson(json);
      await applyRatings(parsed.ratings, { setNumber: parsed.setNumber, sourceLabel: parsed.sourceLabel });
      return { matched: Object.keys(parsed.ratings).length, unmatched: [] };
    },
    importFromUrl: async (url, augments, enNames, setNumber) => {
      const trimmed = url.trim();
      if (!/^https?:\/\//i.test(trimmed)) throw new Error("http(s) の URL を入力してください");
      let res: Response;
      try {
        res = await fetch(trimmed, { cache: "no-store" });
      } catch (e) {
        throw new Error(`取得に失敗しました (CORS または通信エラー): ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let label: string;
      try { label = new URL(trimmed).host; } catch { label = trimmed; }
      const looksJson = /^\s*[[{]/.test(text);
      if (looksJson) {
        const parsed = parseTierJson(text);
        await applyRatings(parsed.ratings, { setNumber: parsed.setNumber ?? setNumber, sourceLabel: parsed.sourceLabel ?? label });
        return { matched: Object.keys(parsed.ratings).length, unmatched: [] };
      }
      if (!augments) throw new Error("テキスト形式の取り込みにはオーグメントデータが必要です");
      const parsed = parseTierText(text, augments, enNames);
      if (parsed.tiers.size === 0) throw new Error("ティア情報を読み取れませんでした");
      const now = Date.now();
      const ratings: Record<string, AugmentRating> = {};
      for (const [id, tier] of parsed.tiers) ratings[id] = { ...get().data.ratings[id], tier, updatedAt: now };
      await applyRatings(ratings, { setNumber, sourceLabel: label });
      return { matched: parsed.matched, unmatched: parsed.unmatched };
    },
    setImportUrl: async (url) => {
      set({ importUrl: url });
      await store.set(URL_KEY, url);
      await store.save();
    },
  };
});

/** Count ratings per tier. */
export function countTiers(ratings: Record<string, AugmentRating>): Record<Tier, number> {
  const out: Record<Tier, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const r of Object.values(ratings)) out[r.tier]++;
  return out;
}
