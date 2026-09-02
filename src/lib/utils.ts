import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ja } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtDate(ms: number): string {
  return format(ms, "yyyy/MM/dd HH:mm", { locale: ja });
}

export function fmtRelative(ms: number): string {
  return formatDistanceToNowStrict(ms, { addSuffix: true, locale: ja });
}

export function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtPlacement(v: number, digits = 2): string {
  return v.toFixed(digits);
}

export function ordinal(n: number): string {
  return `${n}位`;
}

/** Placement color token. */
export function placementColor(p: number): string {
  if (p === 1) return "var(--color-place-1)";
  if (p === 2) return "var(--color-place-2)";
  if (p === 3) return "var(--color-place-3)";
  if (p === 4) return "var(--color-place-4)";
  return "var(--color-place-bot)";
}

/** Average placement heat color (lower is better). 3.8 ~ neutral. */
export function avgPlacementColor(v: number): string {
  if (v <= 3.6) return "var(--color-success)";
  if (v <= 4.2) return "var(--color-teal)";
  if (v <= 4.7) return "var(--color-fg-muted)";
  if (v <= 5.2) return "var(--color-warning)";
  return "var(--color-danger)";
}

/** Stage.round label from last_round number (rounds: 1-1..1-4 = 1..4, then 7 per stage). */
export function stageLabel(lastRound: number): string {
  if (lastRound <= 4) return `1-${lastRound}`;
  const r = lastRound - 4;
  const stage = Math.floor((r - 1) / 7) + 2;
  const round = ((r - 1) % 7) + 1;
  return `${stage}-${round}`;
}

/** FNV-1a 32-bit hash used by CDragon for hashed variable keys (`{0412779a}` == fnv1a("adapgain")). */
export function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

type DescVars = Record<string, number | null | number[]>;

function lookupVar(vars: DescVars, name: string): number | null | number[] | undefined {
  if (name in vars) return vars[name];
  const hashed = `{${fnv1a32(name.toLowerCase())}}`;
  if (hashed in vars) return vars[hashed];
  return undefined;
}

const SCALE_LABELS: Record<string, string> = {
  scalead: "AD", scaleap: "AP", scaleas: "AS", scalearmor: "物理防御", scalemr: "魔法防御",
  scalehealth: "体力", scalemana: "マナ", scalemanaregen: "マナ回復", scalerange: "射程",
  scalecrit: "クリ率", scalecritmult: "クリダメ", scaledamageamp: "ダメージ増幅", scaledurability: "耐久",
  scaleomnivamp: "オムニヴァンプ", scalelifesteal: "ライフスティール", scalehealthregen: "体力回復",
  scaleattackrange: "射程", scaleutility: "ユーティリティ", star: "★",
};

/** Substitute a single token payload (`Name`, `Name*100`, `Name.2`) using vars. Returns null when unresolved. */
function substituteToken(token: string, vars: DescVars): string | null {
  const m = /^([^*.]+)(\*(\d+(?:\.\d+)?))?(?:\.\d+)?$/.exec(token);
  if (!m) return null;
  const name = m[1];
  const mult = m[3] ? Number(m[3]) : 1;
  const raw = lookupVar(vars, name);
  if (raw === undefined || raw === null) return null;
  const value = Array.isArray(raw) ? raw : [raw];
  const fmt = (n: number) => {
    const v = n * mult;
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  };
  // per-star arrays: [base, 1★, 2★, 3★, ...]
  if (value.length > 1) {
    const stars = value.slice(1, 4).filter((n) => typeof n === "number");
    const uniq = new Set(stars.map(fmt));
    if (uniq.size === 1) return fmt(stars[0]);
    return stars.map(fmt).join(" / ");
  }
  return fmt(value[0]);
}

function substituteAll(text: string, vars: DescVars): string {
  return text.replace(/@([^@\s]+?)@/g, (_m, token: string) => {
    const r = substituteToken(token, vars);
    if (r !== null) return r;
    // Unresolvable: drop long property references, keep a compact placeholder for plain names.
    if (/[.:]/.test(token)) return "";
    return `<span class="unresolved">?</span>`;
  });
}

/**
 * Substitute @Var@ / @Var*100@ tokens in CDragon descriptions.
 * `rows`: per-breakpoint variable sets; the n-th `<row>`/`<expandRow>` block is rendered with rows[n]
 * merged over `vars` (used for trait descriptions where each row is one breakpoint).
 */
export function renderDesc(desc: string, vars: DescVars = {}, rows?: DescVars[]): string {
  if (!desc) return "";
  let out = desc;
  if (rows && rows.length) {
    let i = 0;
    out = out.replace(/<(row|expandRow)>([\s\S]*?)<\/\1>/gi, (_m, tag: string, inner: string) => {
      const rv = rows[Math.min(i, rows.length - 1)];
      i++;
      return `<${tag}>${substituteAll(inner, { ...vars, ...rv })}</${tag}>`;
    });
  }
  out = substituteAll(out, vars);
  // strip keyword template placeholders like {{TFT_Keyword_Precision}}
  out = out.replace(/\{\{[^}]+\}\}/g, "");
  // %i:scaleAD% icons -> small labelled tags
  out = out.replace(/%i:(\w+)%/g, (_m, k: string) => {
    const key = k.toLowerCase();
    const label = SCALE_LABELS[key] ?? k.replace(/^scale/i, "");
    return `<span class="ico ico-${key}">${label}</span>`;
  });
  return out;
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function groupBy<T, K extends string | number>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const a of arr) {
    const k = key(a);
    const g = m.get(k);
    if (g) g.push(a);
    else m.set(k, [a]);
  }
  return m;
}

export function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

export function mean(arr: number[]) {
  return arr.length ? sum(arr) / arr.length : 0;
}
