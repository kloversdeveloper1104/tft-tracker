// Thin typed wrappers around Tauri commands (see src-tauri/src/commands.rs).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Account, Summoner, LeagueEntry, RankSnapshot, MatchDto, MatchSummary, SyncResult, SyncProgress,
  CollectOptions, CollectStatus, StatsFilter, StatsResult, StaticData, StaticDataMeta, Locale, Platform,
} from "./types";

export class ApiError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e: unknown) {
    if (typeof e === "string") throw new ApiError(e);
    if (e && typeof e === "object") {
      const o = e as { message?: string; code?: string; status?: number };
      throw new ApiError(o.message ?? JSON.stringify(e), o.code, o.status);
    }
    throw new ApiError(String(e));
  }
}

// ----- Riot ------------------------------------------------------------------
export const riot = {
  configure: (apiKey: string, platform: Platform) => call<void>("configure_riot", { apiKey, platform }),
  resolveAccount: (gameName: string, tagLine: string) => call<Account>("resolve_account", { gameName, tagLine }),
  getSummoner: (puuid: string) => call<Summoner>("get_summoner", { puuid }),
  /** Fetches league entries and records a rank snapshot. */
  getLeague: (puuid: string) => call<LeagueEntry[]>("get_league", { puuid }),
  listRankSnapshots: (puuid: string, queueType?: string) =>
    call<RankSnapshot[]>("list_rank_snapshots", { puuid, queueType: queueType ?? null }),
  /** Fetches recent match ids and stores any unseen matches. Emits "sync-progress". */
  syncMatches: (puuid: string, count = 20) => call<SyncResult>("sync_matches", { puuid, count }),
  listMatches: (puuid: string, limit = 50, offset = 0, opts?: { setNumber?: number; queueId?: number }) =>
    call<MatchSummary[]>("list_matches", {
      puuid, limit, offset, setNumber: opts?.setNumber ?? null, queueId: opts?.queueId ?? null,
    }),
  countMatches: (puuid: string) => call<number>("count_matches", { puuid }),
  getMatch: (matchId: string) => call<MatchDto>("get_match", { matchId }),
  onSyncProgress: (cb: (p: SyncProgress) => void): Promise<UnlistenFn> =>
    listen<SyncProgress>("sync-progress", (e) => cb(e.payload)),
};

// ----- Ladder collection -----------------------------------------------------
export const ladder = {
  start: (opts: CollectOptions) => call<void>("collect_ladder", { opts }),
  cancel: () => call<void>("cancel_collect"),
  status: () => call<CollectStatus>("get_collect_status"),
  onProgress: (cb: (s: CollectStatus) => void): Promise<UnlistenFn> =>
    listen<CollectStatus>("collect-progress", (e) => cb(e.payload)),
  /** Number of stored ladder matches for a set. */
  count: (setNumber?: number) => call<number>("count_ladder_matches", { setNumber: setNumber ?? null }),
  clear: () => call<void>("clear_ladder_matches"),
};

// ----- Stats -------------------------------------------------------------------
export const stats = {
  get: (filter: StatsFilter) => call<StatsResult>("get_stats", { filter }),
};

// ----- Static data ---------------------------------------------------------------
export const staticData = {
  meta: () => call<StaticDataMeta>("get_static_meta"),
  /** Returns slimmed CDragon data for the given set (default: latest). Cached on disk. */
  get: (locale: Locale, setNumber?: number) =>
    call<StaticData>("get_static_data", { locale, setNumber: setNumber ?? null }),
  refresh: (locale: Locale) => call<StaticDataMeta>("refresh_static_data", { locale }),
};

// ----- Overlay / window ----------------------------------------------------------
export const overlay = {
  toggle: () => call<boolean>("toggle_overlay"),
  open: () => call<void>("open_overlay"),
  close: () => call<void>("close_overlay"),
  isOpen: () => call<boolean>("is_overlay_open"),
  setClickThrough: (enabled: boolean) => call<void>("set_overlay_click_through", { enabled }),
};

export const app = {
  dataDir: () => call<string>("get_data_dir"),
  clearCache: () => call<void>("clear_cache"),
  dbStats: () => call<{ matches: number; ladderMatches: number; players: number; sizeBytes: number }>("db_stats"),
};
