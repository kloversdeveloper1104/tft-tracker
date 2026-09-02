import type { Champion, PlannerComp, PlannerUnit } from "@/lib/types";
import { HEX_COLS, HEX_ROWS } from "@/lib/tft";

export const HEX_COUNT = HEX_ROWS * HEX_COLS; // 28
export const MAX_ITEMS = 3;
export const MAX_LEVEL = 10;

export type Stars = PlannerUnit["stars"];

export function clampStars(n: number): Stars {
  return (n >= 3 ? 3 : n <= 1 ? 1 : 2) as Stars;
}

export function nextStars(s: Stars): Stars {
  return s >= 3 ? 1 : ((s + 1) as Stars);
}

/**
 * First empty hex for auto placement: melee (range <= 1) fill from the front row backwards
 * (index 27 downward), ranged fill from the back row (index 0 upward).
 */
export function firstEmptyHex(units: PlannerUnit[], champion?: Champion): number | null {
  const occupied = new Set(units.map((u) => u.hex));
  const melee = (champion?.stats.range ?? 1) <= 1;
  if (melee) {
    for (let i = HEX_COUNT - 1; i >= 0; i--) if (!occupied.has(i)) return i;
  } else {
    for (let i = 0; i < HEX_COUNT; i++) if (!occupied.has(i)) return i;
  }
  return null;
}

// ----- Share codes (base64url JSON) --------------------------------------------
export interface ShareUnit {
  hex?: number;
  championId: string;
  stars: Stars;
  items: string[];
}

export interface SharePayload {
  name: string;
  units: ShareUnit[];
  emblems: string[];
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b + "=".repeat((4 - (b.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(comp: PlannerComp): string {
  const payload: SharePayload = {
    name: comp.name,
    units: comp.units.map((u) => ({ hex: u.hex, championId: u.championId, stars: u.stars, items: u.items })),
    emblems: comp.emblems,
  };
  return b64urlEncode(JSON.stringify(payload));
}

/** Parses a share code. Throws on malformed input. */
export function decodeShare(code: string): SharePayload {
  const trimmed = code.trim();
  if (!trimmed) throw new Error("コードが空です");
  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(trimmed));
  } catch {
    throw new Error("コードの形式が正しくありません");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("コードの内容が不正です");
  const o = parsed as Record<string, unknown>;
  const rawUnits = Array.isArray(o.units) ? o.units : [];
  const units: ShareUnit[] = [];
  for (const raw of rawUnits) {
    if (!raw || typeof raw !== "object") continue;
    const u = raw as Record<string, unknown>;
    if (typeof u.championId !== "string" || !u.championId) continue;
    const hex = typeof u.hex === "number" && Number.isInteger(u.hex) && u.hex >= 0 && u.hex < HEX_COUNT ? u.hex : undefined;
    const stars = clampStars(typeof u.stars === "number" ? u.stars : 1);
    const items = Array.isArray(u.items) ? u.items.filter((x): x is string => typeof x === "string").slice(0, MAX_ITEMS) : [];
    units.push({ hex, championId: u.championId, stars, items });
  }
  const emblems = Array.isArray(o.emblems) ? o.emblems.filter((x): x is string => typeof x === "string") : [];
  const name = typeof o.name === "string" ? o.name : "";
  return { name, units, emblems };
}

/** Assigns hexes to shared units (respecting given hexes, auto-placing the rest). */
export function placeShareUnits(units: ShareUnit[], championsById: Map<string, Champion>): PlannerUnit[] {
  const out: PlannerUnit[] = [];
  const occupied = new Set<number>();
  const placed = new Set<number>();
  // first pass: explicit hexes
  units.forEach((u, i) => {
    if (u.hex !== undefined && !occupied.has(u.hex)) {
      occupied.add(u.hex);
      placed.add(i);
      out.push({ hex: u.hex, championId: u.championId, stars: u.stars, items: u.items });
    }
  });
  // second pass: auto placement for the rest
  units.forEach((u, i) => {
    if (placed.has(i)) return;
    const hex = firstEmptyHex(out, championsById.get(u.championId));
    if (hex === null) return;
    out.push({ hex, championId: u.championId, stars: u.stars, items: u.items });
  });
  return out;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
