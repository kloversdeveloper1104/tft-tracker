import { type ReactNode, useState } from "react";
import { Star } from "lucide-react";
import { cn, placementColor, renderDesc } from "@/lib/utils";
import { COST_COLORS, TRAIT_STYLE_COLORS } from "@/data/odds";
import { useStaticData } from "@/stores/staticData";
import { Tooltip } from "@/components/ui";
import type { Augment, Champion, Item, Trait } from "@/lib/types";
import { TIER_COLORS, TIER_ORDER, type Tier } from "@/lib/augmentTiers";

// ----- Rich description -------------------------------------------------------
export function RichDesc({ desc, vars, rows, className }: {
  desc: string; vars?: Record<string, number | null | number[]>; rows?: Record<string, number | null | number[]>[]; className?: string;
}) {
  return <div className={cn("rich-desc text-xs leading-relaxed", className)} dangerouslySetInnerHTML={{ __html: renderDesc(desc, vars, rows) }} />;
}

/** Per-breakpoint variable rows for a trait (each includes MinUnits). */
export function traitRows(t: Trait): Record<string, number | null>[] {
  return t.effects.map((e) => ({ ...e.variables, MinUnits: e.minUnits, MaxUnits: e.maxUnits }));
}

// ----- Champion icon ------------------------------------------------------------
export function ChampionIcon({ id, champion, size = 40, stars, items, className, showTooltip = true, onClick, dim, badge }: {
  id?: string; champion?: Champion; size?: number; stars?: number; items?: string[]; className?: string;
  showTooltip?: boolean; onClick?: () => void; dim?: boolean; badge?: ReactNode;
}) {
  const lookup = useStaticData((s) => s.championsById);
  const c = champion ?? (id ? lookup.get(id) ?? lookup.get(id.toLowerCase()) : undefined);
  const cost = c?.cost ?? 1;
  const color = COST_COLORS[cost] ?? COST_COLORS[1];
  const body = (
    <div
      className={cn("relative shrink-0 select-none", onClick && "cursor-pointer", dim && "opacity-40", className)}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      <div
        className="w-full h-full rounded-md overflow-hidden bg-surface-2"
        style={{ boxShadow: `0 0 0 2px ${color}, 0 0 10px -2px ${color}80` }}
      >
        {c ? (
          <img src={c.squareIcon} alt={c.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-fg-subtle px-1 text-center break-all">{id?.replace(/^TFT\d+_|^[A-Z]+_\d+_?/, "") ?? "?"}</div>
        )}
      </div>
      {stars !== undefined && stars > 0 && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-[1px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {Array.from({ length: stars }).map((_, i) => (
            <Star key={i} className="fill-current" style={{ width: size * 0.26, height: size * 0.26, color: stars >= 3 ? "var(--color-gold-bright)" : stars === 2 ? "#d5deee" : "#b48a5a" }} />
          ))}
        </div>
      )}
      {badge}
      {items && items.length > 0 && (
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex gap-[1px]">
          {items.slice(0, 3).map((it, i) => (
            <ItemIcon key={i} id={it} size={Math.max(12, size * 0.32)} showTooltip={showTooltip} />
          ))}
        </div>
      )}
    </div>
  );
  if (!showTooltip || !c) return body;
  return (
    <Tooltip content={<ChampionTooltip champion={c} />} delay={150}>
      {body}
    </Tooltip>
  );
}

export function ChampionTooltip({ champion: c }: { champion: Champion }) {
  const traits = useStaticData((s) => s.traitsByName);
  const vars: Record<string, number[]> = {};
  for (const v of c.ability.variables) vars[v.name] = v.value;
  return (
    <div className="w-72 select-text">
      <div className="flex items-center gap-2.5">
        <ChampionIcon champion={c} size={40} showTooltip={false} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{c.name}</span>
            <CostChip cost={c.cost} />
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {c.traits.map((t) => {
              const tr = traits.get(t);
              return (
                <span key={t} className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
                  {tr && <img src={tr.icon} className="size-3 opacity-80" alt="" />}
                  {t}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-border">
        <div className="flex items-center gap-2 mb-1">
          {c.ability.icon && <img src={c.ability.icon} className="size-6 rounded" alt="" />}
          <span className="text-xs font-semibold text-gold">{c.ability.name}</span>
          <span className="ml-auto text-[11px] text-fg-subtle tabular-nums">{c.stats.initialMana}/{c.stats.mana}</span>
        </div>
        <RichDesc desc={c.ability.desc} vars={vars} />
      </div>
      <div className="mt-2 pt-2 border-t border-border grid grid-cols-4 gap-1 text-[11px] text-fg-muted tabular-nums">
        <span>HP {c.stats.hp}</span>
        <span>AD {c.stats.damage}</span>
        <span>AR {c.stats.armor}</span>
        <span>MR {c.stats.magicResist}</span>
        <span>AS {c.stats.attackSpeed.toFixed(2)}</span>
        <span>射程 {c.stats.range}</span>
        <span>クリ {Math.round(c.stats.critChance * 100)}%</span>
      </div>
    </div>
  );
}

export function CostChip({ cost, className }: { cost: number; className?: string }) {
  const color = COST_COLORS[cost] ?? COST_COLORS[1];
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded px-1.5 h-4 text-[10px] font-bold tabular-nums", className)}
      style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      {cost}
    </span>
  );
}

// ----- Item icon -------------------------------------------------------------------
export function ItemIcon({ id, item, size = 24, className, showTooltip = true, onClick, rounded = "rounded" }: {
  id?: string; item?: Item; size?: number; className?: string; showTooltip?: boolean; onClick?: () => void; rounded?: string;
}) {
  const lookup = useStaticData((s) => s.itemsById);
  const it = item ?? (id ? lookup.get(id) : undefined);
  const body = (
    <div
      className={cn("shrink-0 overflow-hidden bg-surface-2 border border-black/40", rounded, onClick && "cursor-pointer", className)}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      {it ? <img src={it.icon} alt={it.name} className="w-full h-full object-cover" loading="lazy" draggable={false} /> : (
        <div className="w-full h-full flex items-center justify-center text-[8px] text-fg-subtle">?</div>
      )}
    </div>
  );
  if (!showTooltip || !it) return body;
  return <Tooltip content={<ItemTooltip item={it} />} delay={150}>{body}</Tooltip>;
}

export function ItemTooltip({ item: it }: { item: Item }) {
  const items = useStaticData((s) => s.itemsById);
  return (
    <div className="w-64 select-text">
      <div className="flex items-center gap-2">
        <ItemIcon item={it} size={32} showTooltip={false} />
        <div>
          <div className="font-semibold text-sm">{it.name}</div>
          {it.composition.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              {it.composition.map((cId, i) => {
                const c = items.get(cId);
                return <span key={i} className="flex items-center gap-1 text-[11px] text-fg-muted">{c && <img src={c.icon} className="size-3.5 rounded-sm" alt="" />}{i === 0 && it.composition.length > 1 ? " + " : ""}</span>;
              })}
            </div>
          )}
        </div>
      </div>
      <RichDesc desc={it.desc} vars={it.effects} className="mt-2 pt-2 border-t border-border" />
      {it.unique && <div className="mt-1 text-[10px] text-warning">ユニーク: 1体につき1つまで</div>}
    </div>
  );
}

// ----- Trait icon --------------------------------------------------------------------
export function TraitIcon({ id, trait, style = 0, size = 22, count, className, showTooltip = true, label }: {
  id?: string; trait?: Trait; style?: number; size?: number; count?: number; className?: string; showTooltip?: boolean; label?: boolean;
}) {
  const lookup = useStaticData((s) => s.traitsById);
  const t = trait ?? (id ? lookup.get(id) : undefined);
  const color = TRAIT_STYLE_COLORS[style] ?? TRAIT_STYLE_COLORS[0];
  const active = style > 0;
  const body = (
    <div className={cn("inline-flex items-center gap-1.5 shrink-0", className)}>
      <div
        className="hex-clip flex items-center justify-center"
        style={{
          width: size, height: size,
          background: active ? `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 55%, #000))` : "var(--color-surface-3)",
        }}
      >
        {t ? (
          <img src={t.icon} alt={t.name} style={{ width: size * 0.62, height: size * 0.62, filter: active ? "brightness(0.1)" : "brightness(0.6)" }} draggable={false} />
        ) : <span className="text-[8px]">?</span>}
      </div>
      {count !== undefined && <span className="text-xs font-semibold tabular-nums" style={{ color: active ? color : "var(--color-fg-subtle)" }}>{count}</span>}
      {label && t && <span className="text-xs text-fg-muted">{t.name}</span>}
    </div>
  );
  if (!showTooltip || !t) return body;
  return <Tooltip content={<TraitTooltip trait={t} count={count} />} delay={150}>{body}</Tooltip>;
}

export function TraitTooltip({ trait: t, count }: { trait: Trait; count?: number }) {
  const vars: Record<string, number | null> = {};
  const activeEffect = t.effects.find((e) => count !== undefined && count >= e.minUnits && count <= e.maxUnits) ?? t.effects[0];
  if (activeEffect) Object.assign(vars, activeEffect.variables);
  vars["MinUnits"] = activeEffect?.minUnits ?? null;
  return (
    <div className="w-72 select-text">
      <div className="flex items-center gap-2">
        <TraitIcon trait={t} style={activeEffect?.style ?? 0} size={28} showTooltip={false} />
        <div className="font-semibold text-sm">{t.name}</div>
        <div className="ml-auto flex gap-1">
          {t.effects.map((e, i) => (
            <span
              key={i}
              className="px-1.5 rounded text-[11px] font-semibold tabular-nums"
              style={{ color: TRAIT_STYLE_COLORS[e.style], background: count !== undefined && count >= e.minUnits && count <= e.maxUnits ? `color-mix(in srgb, ${TRAIT_STYLE_COLORS[e.style]} 25%, transparent)` : "transparent" }}
            >
              {e.minUnits}
            </span>
          ))}
        </div>
      </div>
      <RichDesc desc={t.desc} vars={vars} rows={traitRows(t)} className="mt-2 pt-2 border-t border-border" />
    </div>
  );
}

// ----- Augment icon -------------------------------------------------------------------
const AUG_TIER_COLOR: Record<number, string> = { 0: "var(--color-fg-subtle)", 1: "#c0cad9", 2: "#f0c250", 3: "#a8f5ff" };

export function AugmentIcon({ id, augment, size = 32, className, showTooltip = true, label }: {
  id?: string; augment?: Augment; size?: number; className?: string; showTooltip?: boolean; label?: boolean;
}) {
  const lookup = useStaticData((s) => s.augmentsById);
  const a = augment ?? (id ? lookup.get(id) : undefined);
  const color = AUG_TIER_COLOR[a?.tier ?? 0];
  const body = (
    <div className={cn("inline-flex items-center gap-2 shrink-0", className)}>
      <div
        className="rounded-full overflow-hidden bg-surface-2 flex items-center justify-center"
        style={{ width: size, height: size, boxShadow: `0 0 0 2px ${color}` }}
      >
        {a ? <img src={a.icon} alt={a.name} className="w-[78%] h-[78%] object-contain" loading="lazy" draggable={false} /> : <span className="text-[9px] text-fg-subtle px-1 text-center">{id?.split("_").slice(-1)[0]}</span>}
      </div>
      {label && <span className="text-xs text-fg">{a?.name ?? id}</span>}
    </div>
  );
  if (!showTooltip || !a) return body;
  return (
    <Tooltip content={
      <div className="w-64 select-text">
        <div className="flex items-center gap-2">
          <AugmentIcon augment={a} size={28} showTooltip={false} />
          <span className="font-semibold text-sm">{a.name}</span>
        </div>
        <RichDesc desc={a.desc} vars={a.effects} className="mt-2 pt-2 border-t border-border" />
      </div>
    } delay={150}>{body}</Tooltip>
  );
}

// ----- Placement -------------------------------------------------------------------------
export function PlacementBadge({ placement, size = "md", className }: { placement: number; size?: "sm" | "md" | "lg"; className?: string }) {
  const color = placementColor(placement);
  const s = { sm: "size-6 text-xs", md: "size-8 text-sm", lg: "size-11 text-lg" }[size];
  return (
    <div
      className={cn("rounded-lg flex items-center justify-center font-bold tabular-nums shrink-0", s, className)}
      style={{
        color: placement <= 4 ? "#0b0f1a" : "var(--color-fg-muted)",
        background: placement <= 4 ? color : "var(--color-surface-3)",
        boxShadow: placement === 1 ? "0 0 16px -2px rgba(247,201,72,0.6)" : undefined,
      }}
    >
      {placement}
    </div>
  );
}

export function StarRow({ stars, size = 12 }: { stars: number; size?: number }) {
  return (
    <span className="inline-flex gap-[1px]">
      {Array.from({ length: stars }).map((_, i) => (
        <Star key={i} className="fill-current" style={{ width: size, height: size, color: stars >= 3 ? "var(--color-gold-bright)" : stars === 2 ? "#d5deee" : "#b48a5a" }} />
      ))}
    </span>
  );
}

/** Small horizontal strip of recent placements. */
export function PlacementStrip({ placements, className }: { placements: number[]; className?: string }) {
  return (
    <div className={cn("flex items-end gap-[3px] h-8", className)}>
      {placements.map((p, i) => (
        <Tooltip key={i} content={`${p}位`}>
          <div
            className="w-2 rounded-sm transition-all"
            style={{ height: `${((9 - p) / 8) * 100}%`, background: placementColor(p), opacity: p > 4 ? 0.55 : 1 }}
          />
        </Tooltip>
      ))}
    </div>
  );
}

export function ImageWithFallback({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (err) return <div className={cn("bg-surface-3", className)} />;
  return <img src={src} alt={alt ?? ""} className={className} onError={() => setErr(true)} draggable={false} />;
}

// ----- User augment tier (S/A/B/C/D) -------------------------------------------------------
export function TierBadge({ tier, size = "sm", showEmpty = false, className }: {
  tier: Tier | null | undefined; size?: "xs" | "sm"; showEmpty?: boolean; className?: string;
}) {
  const s = size === "xs" ? "h-4 min-w-4 px-1 text-[10px]" : "h-5 min-w-5 px-1.5 text-[11px]";
  if (!tier) {
    if (!showEmpty) return null;
    return <span className={cn("inline-flex items-center justify-center rounded font-medium text-fg-subtle bg-white/5 border border-white/10", s, className)}>未評価</span>;
  }
  const color = TIER_COLORS[tier];
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded font-bold tabular-nums leading-none", s, className)}
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`, textShadow: `0 0 8px color-mix(in srgb, ${color} 60%, transparent)` }}
      title={`${tier} ティア`}
    >
      {tier}
    </span>
  );
}

/** Compact 5-segment S/A/B/C/D toggle. Clicking the active tier clears it. */
export function TierPicker({ value, onChange, size = "sm", className, stopPropagation = true }: {
  value: Tier | null | undefined; onChange: (t: Tier | null) => void; size?: "xs" | "sm"; className?: string; stopPropagation?: boolean;
}) {
  const seg = size === "xs" ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]";
  return (
    <div
      role="radiogroup"
      aria-label="ティア"
      className={cn("no-drag inline-flex items-center rounded-md border border-white/10 bg-black/25 p-0.5 gap-0.5 shrink-0", className)}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {TIER_ORDER.map((t) => {
        const active = value === t;
        const color = TIER_COLORS[t];
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            title={active ? `${t} ティア（クリックで解除）` : `${t} ティアに設定`}
            onClick={() => onChange(active ? null : t)}
            className={cn("rounded font-bold tabular-nums leading-none transition-all duration-100 focus-ring", seg, !active && "text-fg-subtle hover:text-fg hover:bg-white/10")}
            style={active ? { color: "#0b0f1a", background: color, boxShadow: `0 0 10px -2px ${color}` } : { color: `color-mix(in srgb, ${color} 55%, var(--color-fg-subtle))` }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
