// ---------------------------------------------------------------------------
// Shared types between the Rust backend (src-tauri) and the React frontend.
// Rust structs serialize with camelCase field names (serde rename_all).
// ---------------------------------------------------------------------------

// ----- Platforms / routing -------------------------------------------------
export type Platform =
  | "jp1" | "kr" | "na1" | "br1" | "la1" | "la2" | "oc1"
  | "euw1" | "eun1" | "tr1" | "ru" | "sg2" | "tw2" | "vn2" | "me1";

export const PLATFORMS: { id: Platform; label: string; region: string }[] = [
  { id: "jp1", label: "Japan (JP)", region: "asia" },
  { id: "kr", label: "Korea (KR)", region: "asia" },
  { id: "na1", label: "North America (NA)", region: "americas" },
  { id: "br1", label: "Brazil (BR)", region: "americas" },
  { id: "la1", label: "LAN", region: "americas" },
  { id: "la2", label: "LAS", region: "americas" },
  { id: "euw1", label: "Europe West (EUW)", region: "europe" },
  { id: "eun1", label: "Europe Nordic & East (EUNE)", region: "europe" },
  { id: "tr1", label: "Turkey (TR)", region: "europe" },
  { id: "ru", label: "Russia (RU)", region: "europe" },
  { id: "me1", label: "Middle East (ME)", region: "europe" },
  { id: "oc1", label: "Oceania (OCE)", region: "sea" },
  { id: "sg2", label: "Southeast Asia (SEA)", region: "sea" },
  { id: "tw2", label: "Taiwan (TW)", region: "sea" },
  { id: "vn2", label: "Vietnam (VN)", region: "sea" },
];

export type Locale = "ja_jp" | "en_us";

// ----- Riot account / summoner / league ------------------------------------
export interface Account {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface Summoner {
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
}

export interface LeagueEntry {
  queueType: string; // RANKED_TFT | RANKED_TFT_TURBO | RANKED_TFT_DOUBLE_UP
  tier?: string; // IRON..CHALLENGER
  rank?: string; // I..IV
  leaguePoints: number;
  wins: number;
  losses: number;
  ratedTier?: string; // hyper roll
  ratedRating?: number;
  hotStreak?: boolean;
  veteran?: boolean;
  freshBlood?: boolean;
  inactive?: boolean;
}

export interface RankSnapshot {
  id: number;
  puuid: string;
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  capturedAt: number; // unix ms
}

// ----- Match data (Riot tft-match-v1, passthrough) -------------------------
export interface MatchTrait {
  name: string;
  num_units: number;
  style: number; // 0 none,1 bronze,2 silver,3 gold,4 prismatic (5 unique in some sets)
  tier_current: number;
  tier_total: number;
}

export interface MatchUnit {
  character_id: string;
  itemNames: string[];
  name: string;
  rarity: number;
  tier: number; // star level
}

export interface MatchCompanion {
  content_ID: string;
  item_ID: number;
  skin_ID: number;
  species: string;
}

export interface MatchParticipant {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  placement: number;
  level: number;
  gold_left: number;
  last_round: number;
  players_eliminated: number;
  time_eliminated: number;
  total_damage_to_players: number;
  traits: MatchTrait[];
  units: MatchUnit[];
  augments?: string[];
  companion?: MatchCompanion;
  partner_group_id?: number;
  win?: boolean;
  missions?: Record<string, number>;
}

export interface MatchInfo {
  game_datetime: number;
  game_length: number;
  game_version: string;
  queue_id: number;
  tft_game_type: string; // standard | pairs | turbo
  tft_set_number: number;
  tft_set_core_name?: string;
  endOfGameResult?: string;
  participants: MatchParticipant[];
}

export interface MatchDto {
  metadata: { data_version: string; match_id: string; participants: string[] };
  info: MatchInfo;
}

/** Row returned by list_matches: the given player's participant + match meta. */
export interface MatchSummary {
  matchId: string;
  gameDatetime: number;
  gameLength: number;
  gameVersion: string;
  queueId: number;
  gameType: string;
  setNumber: number;
  participant: MatchParticipant;
}

export interface SyncResult {
  fetched: number;
  added: number;
  total: number;
}

export interface SyncProgress {
  done: number;
  total: number;
  message: string;
}

// ----- Ladder collection ---------------------------------------------------
export type LadderTier = "challenger" | "grandmaster" | "master";

export interface CollectOptions {
  tiers: LadderTier[];
  playersLimit: number; // max players to scan
  matchesPerPlayer: number; // recent matches per player
  queueId?: number; // 1100 ranked (default)
}

export interface CollectStatus {
  running: boolean;
  phase: string; // idle | ladder | matches | done | cancelled | error
  done: number;
  total: number;
  added: number;
  message: string;
}

// ----- Stats -----------------------------------------------------------------
export interface StatsFilter {
  setNumber?: number;
  source: "me" | "ladder" | "all";
  puuid?: string; // required when source === "me"
  queueId?: number; // 1100 ranked, 1090 normal, 1130 hyper roll, 1160 double up
  daysBack?: number;
  minGames?: number;
}

export interface ItemStat {
  name: string;
  games: number;
  avgPlacement: number;
  top4Rate: number;
  winRate: number;
}

export interface UnitStat {
  characterId: string;
  games: number;
  pickRate: number;
  avgPlacement: number;
  top4Rate: number;
  winRate: number;
  avgStars: number;
  threeStarGames: number;
  threeStarAvgPlacement: number;
  items: ItemStat[];
}

export interface TraitBucketStat {
  numUnits: number;
  style: number;
  games: number;
  avgPlacement: number;
  top4Rate: number;
}

export interface TraitStat {
  name: string;
  games: number;
  pickRate: number;
  avgPlacement: number;
  buckets: TraitBucketStat[];
}

export interface AugmentStat {
  name: string;
  games: number;
  pickRate: number;
  avgPlacement: number;
  top4Rate: number;
  winRate: number;
  stage: number; // 1 | 2 | 3 (index of augment slot + 1); 0 = unknown
}

export interface CompUnit {
  characterId: string;
  frequency: number; // 0..1
  avgStars: number;
  topItems: string[];
}

export interface CompStat {
  key: string; // stable cluster key
  coreTraits: { name: string; numUnits: number; style: number }[];
  games: number;
  playRate: number;
  avgPlacement: number;
  top4Rate: number;
  winRate: number;
  units: CompUnit[];
  avgLevel: number;
}

export interface StatsResult {
  games: number; // number of participant entries
  matches: number;
  setNumber: number;
  units: UnitStat[];
  traits: TraitStat[];
  items: ItemStat[];
  augments: AugmentStat[];
  comps: CompStat[];
}

// ----- Static data (Community Dragon, slimmed) -----------------------------
export interface ChampionAbility {
  name: string;
  desc: string;
  icon: string; // full URL
  variables: { name: string; value: number[] }[];
}

export interface Champion {
  apiName: string; // matches MatchUnit.character_id
  characterName: string;
  name: string;
  cost: number;
  traits: string[]; // display names
  traitApiNames: string[]; // resolved apiNames (best effort)
  icon: string; // splash (full URL)
  squareIcon: string; // square icon (full URL)
  tileIcon: string;
  role?: string;
  ability: ChampionAbility;
  stats: {
    hp: number; mana: number; initialMana: number; damage: number; armor: number;
    magicResist: number; attackSpeed: number; range: number; critChance: number; critMultiplier: number;
  };
}

export interface TraitEffect {
  minUnits: number;
  maxUnits: number;
  style: number;
  variables: Record<string, number | null>;
}

export interface Trait {
  apiName: string; // matches MatchTrait.name
  name: string;
  desc: string;
  icon: string; // full URL
  effects: TraitEffect[];
}

export type ItemKind = "component" | "completed" | "emblem" | "artifact" | "radiant" | "support" | "special" | "other";

export interface Item {
  apiName: string; // matches MatchUnit.itemNames[]
  name: string;
  desc: string;
  icon: string; // full URL
  composition: string[]; // component apiNames
  effects: Record<string, number | null>;
  unique: boolean;
  associatedTraits: string[];
  incompatibleTraits: string[];
  tags: string[];
  kind: ItemKind;
}

export interface Augment {
  apiName: string; // matches MatchParticipant.augments[]
  name: string;
  desc: string;
  icon: string; // full URL
  tier: 0 | 1 | 2 | 3; // 1 silver / 2 gold / 3 prismatic (best effort from icon naming) 0 = unknown
  associatedTraits: string[];
  effects: Record<string, number | null>;
}

export interface StaticData {
  setNumber: number;
  setName: string;
  mutator: string;
  locale: Locale;
  fetchedAt: number;
  champions: Champion[];
  traits: Trait[];
  items: Item[];
  augments: Augment[];
}

export interface StaticDataMeta {
  availableSets: number[];
  latestSet: number;
  cachedAt?: number;
}

// ----- Planner ---------------------------------------------------------------
export interface PlannerUnit {
  hex: number; // 0..27 (4 rows x 7 cols, row-major)
  championId: string; // Champion.apiName
  stars: 1 | 2 | 3;
  items: string[]; // up to 3 Item.apiName
}

export interface PlannerComp {
  id: string;
  name: string;
  setNumber: number;
  units: PlannerUnit[];
  emblems: string[]; // extra trait apiNames counted (e.g. from augments)
  notes: string;
  createdAt: number;
  updatedAt: number;
}

// ----- Odds ------------------------------------------------------------------
export interface OddsTable {
  /** shopOdds[level] = [cost1, cost2, cost3, cost4, cost5] percentages summing to 100 */
  shopOdds: Record<number, number[]>;
  /** poolSize[cost] = copies per champion in the shared pool */
  poolSize: Record<number, number>;
  rerollCost: number;
  shopSlots: number;
}

// ----- App settings (persisted via tauri-plugin-store) ------------------------
export interface AppSettings {
  apiKey: string;
  platform: Platform;
  locale: Locale;
  gameName: string;
  tagLine: string;
  puuid: string | null;
  overlayShortcut: string; // e.g. "CommandOrControl+Shift+O"
  overlayOpacity: number; // 0.4..1
  overlayScale: number; // 0.8..1.4
  odds: OddsTable | null; // null => defaults
  reduceMotion: boolean;
  autoSyncOnLaunch: boolean;
}
