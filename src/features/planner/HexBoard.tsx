import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { COST_COLORS } from "@/data/odds";
import { HEX_COLS, HEX_ROWS } from "@/lib/tft";
import { useStaticData } from "@/stores/staticData";
import { ItemIcon, StarRow } from "@/components/tft";
import type { Champion, PlannerUnit } from "@/lib/types";

export const HEX_W = 72;
export const HEX_H = Math.round((HEX_W * 2) / Math.sqrt(3)); // pointy-top hex height (~83)
const GAP = 5;
/** Pointy-top hexagon (in-game orientation; rows interlock horizontally). */
export const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

export type DragData =
  | { type: "champion"; championId: string }
  | { type: "unit"; hex: number; championId: string };

export const BOARD_WIDTH = HEX_COLS * (HEX_W + GAP) + HEX_W / 2;

export function HexBoard({ units, selectedHex, onSelect, onRemove }: {
  units: PlannerUnit[];
  selectedHex: number | null;
  onSelect: (hex: number | null) => void;
  onRemove: (hex: number) => void;
}) {
  const championsById = useStaticData((s) => s.championsById);
  const byHex = new Map<number, PlannerUnit>();
  for (const u of units) byHex.set(u.hex, u);
  return (
    <div className="relative flex flex-col items-start select-none" style={{ width: BOARD_WIDTH }}>
      {Array.from({ length: HEX_ROWS }).map((_, r) => (
        <div
          key={r}
          className="flex"
          style={{ gap: GAP, marginLeft: r % 2 ? HEX_W / 2 + GAP / 2 : 0, marginTop: r ? -(HEX_H / 4) + GAP : 0 }}
        >
          {Array.from({ length: HEX_COLS }).map((_, c) => {
            const hex = r * HEX_COLS + c;
            const unit = byHex.get(hex);
            return (
              <HexCell
                key={hex}
                hex={hex}
                unit={unit}
                champion={unit ? championsById.get(unit.championId) : undefined}
                selected={selectedHex === hex}
                onSelect={onSelect}
                onRemove={onRemove}
              />
            );
          })}
        </div>
      ))}
      <div className="absolute -left-1 top-1 -translate-x-full text-[10px] uppercase tracking-wider text-fg-subtle/70 select-none pointer-events-none">後列</div>
      <div className="absolute -left-1 bottom-1 -translate-x-full text-[10px] uppercase tracking-wider text-fg-subtle/70 select-none pointer-events-none">前列</div>
    </div>
  );
}

function HexCell({ hex, unit, champion, selected, onSelect, onRemove }: {
  hex: number; unit?: PlannerUnit; champion?: Champion; selected: boolean;
  onSelect: (hex: number | null) => void; onRemove: (hex: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `hex-${hex}`, data: { hex } });
  return (
    <div
      ref={setNodeRef}
      className="relative"
      style={{ width: HEX_W, height: HEX_H }}
      onContextMenu={(e) => { e.preventDefault(); if (unit) onRemove(hex); }}
      onClick={() => onSelect(unit ? hex : null)}
      title={unit ? undefined : `ヘックス ${hex + 1}`}
    >
      <div
        className="absolute inset-0 transition-colors duration-150"
        style={{ clipPath: HEX_CLIP, background: isOver ? "var(--color-accent)" : "var(--color-border-strong)" }}
      />
      <div
        className="absolute inset-[1.5px] transition-colors duration-150"
        style={{
          clipPath: HEX_CLIP,
          background: isOver ? "color-mix(in srgb, var(--color-accent) 30%, var(--color-surface-2))" : "color-mix(in srgb, var(--color-surface-2) 85%, transparent)",
        }}
      />
      {!unit && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-fg-subtle/40 tabular-nums pointer-events-none">{hex + 1}</div>
      )}
      {unit && <UnitTile unit={unit} champion={champion} selected={selected} hex={hex} />}
    </div>
  );
}

function UnitTile({ unit, champion, selected, hex }: { unit: PlannerUnit; champion?: Champion; selected: boolean; hex: number }) {
  const data: DragData = { type: "unit", hex, championId: unit.championId };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `unit-${hex}`, data });
  const color = COST_COLORS[champion?.cost ?? 1] ?? COST_COLORS[1];
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={champion?.name ?? unit.championId}
      className={cn(
        "absolute inset-0 cursor-grab active:cursor-grabbing touch-none outline-none transition-opacity",
        isDragging && "opacity-30",
      )}
    >
      <div
        className="absolute inset-0 transition-all duration-150"
        style={{
          clipPath: HEX_CLIP,
          background: selected ? "var(--color-gold-bright)" : color,
        }}
      />
      <div className="absolute inset-[3px] overflow-hidden bg-surface-3" style={{ clipPath: HEX_CLIP }}>
        {champion ? (
          <img src={champion.squareIcon} alt={champion.name} className="w-full h-full object-cover scale-[1.15]" draggable={false} loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[9px] text-fg-subtle text-center px-2 break-all">{unit.championId}</div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
      </div>
      {selected && (
        <div className="absolute inset-0 pointer-events-none animate-pulse-soft" style={{ clipPath: HEX_CLIP, boxShadow: "inset 0 0 0 2px var(--color-gold-bright)" }} />
      )}
      <div className="absolute left-1/2 -translate-x-1/2 -top-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        <StarRow stars={unit.stars} size={12} />
      </div>
      {unit.items.length > 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 flex gap-px">
          {unit.items.slice(0, 3).map((it, i) => <ItemIcon key={i} id={it} size={18} rounded="rounded-sm" />)}
        </div>
      )}
    </div>
  );
}

/** Champion rendered as a hex tile (used for the drag overlay). */
export function HexGhost({ champion, size = 64 }: { champion?: Champion; size?: number }) {
  const color = COST_COLORS[champion?.cost ?? 1] ?? COST_COLORS[1];
  const h = Math.round((size * 2) / Math.sqrt(3));
  return (
    <div className="relative drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]" style={{ width: size, height: h }}>
      <div className="absolute inset-0" style={{ clipPath: HEX_CLIP, background: color }} />
      <div className="absolute inset-[3px] overflow-hidden bg-surface-3" style={{ clipPath: HEX_CLIP }}>
        {champion && <img src={champion.squareIcon} alt="" className="w-full h-full object-cover scale-[1.15]" draggable={false} />}
      </div>
    </div>
  );
}
