import type { OddsTable } from "@/lib/types";

/**
 * Default shop odds (Set 18 era standard table). Editable in Settings.
 * shopOdds[level] = [1-cost, 2-cost, 3-cost, 4-cost, 5-cost] in percent.
 */
export const DEFAULT_ODDS: OddsTable = {
  shopOdds: {
    1: [100, 0, 0, 0, 0],
    2: [100, 0, 0, 0, 0],
    3: [75, 25, 0, 0, 0],
    4: [55, 30, 15, 0, 0],
    5: [45, 33, 20, 2, 0],
    6: [30, 40, 25, 5, 0],
    7: [19, 30, 35, 15, 1],
    8: [17, 24, 32, 24, 3],
    9: [15, 18, 25, 30, 12],
    10: [5, 10, 20, 40, 25],
    11: [1, 2, 12, 50, 35],
  },
  poolSize: { 1: 30, 2: 25, 3: 18, 4: 10, 5: 9 },
  rerollCost: 2,
  shopSlots: 5,
};

export const COST_COLORS: Record<number, string> = {
  1: "var(--color-cost-1)",
  2: "var(--color-cost-2)",
  3: "var(--color-cost-3)",
  4: "var(--color-cost-4)",
  5: "var(--color-cost-5)",
  6: "var(--color-cost-6)",
  7: "var(--color-cost-6)",
};

export const TRAIT_STYLE_COLORS: Record<number, string> = {
  0: "var(--color-fg-subtle)",
  1: "var(--color-trait-bronze)",
  2: "var(--color-trait-silver)",
  3: "var(--color-trait-gold)",
  4: "var(--color-trait-prismatic)",
  5: "var(--color-trait-unique)",
};

export const TRAIT_STYLE_LABELS: Record<number, string> = {
  0: "非アクティブ",
  1: "ブロンズ",
  2: "シルバー",
  3: "ゴールド",
  4: "プリズム",
  5: "ユニーク",
};

export const QUEUES: { id: number; label: string; short: string }[] = [
  { id: 1100, label: "ランク", short: "Ranked" },
  { id: 1090, label: "ノーマル", short: "Normal" },
  { id: 1130, label: "ハイパーロール", short: "Hyper" },
  { id: 1160, label: "ダブルアップ", short: "Double Up" },
  { id: 1170, label: "Fortune's Favor", short: "Fortune" },
  { id: 6120, label: "Tocker's Trials", short: "Trials" },
  { id: 1220, label: "Choncc's Treasure", short: "Choncc" },
];

export const TIER_COLORS: Record<string, string> = {
  IRON: "#8a8378",
  BRONZE: "#b0713d",
  SILVER: "#a9b4c2",
  GOLD: "#e6b95a",
  PLATINUM: "#4ec7b0",
  EMERALD: "#3fbf6f",
  DIAMOND: "#7fb2ff",
  MASTER: "#b56cff",
  GRANDMASTER: "#ff6464",
  CHALLENGER: "#ffd46b",
};

export const TIER_LABELS_JA: Record<string, string> = {
  IRON: "アイアン",
  BRONZE: "ブロンズ",
  SILVER: "シルバー",
  GOLD: "ゴールド",
  PLATINUM: "プラチナ",
  EMERALD: "エメラルド",
  DIAMOND: "ダイヤモンド",
  MASTER: "マスター",
  GRANDMASTER: "グランドマスター",
  CHALLENGER: "チャレンジャー",
};
