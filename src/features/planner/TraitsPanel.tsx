import { useMemo } from "react";
import { Hexagon, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRAIT_STYLE_COLORS } from "@/data/odds";
import { computeBoardTraits, type ActiveTrait } from "@/lib/tft";
import { useStaticData } from "@/stores/staticData";
import { TraitIcon } from "@/components/tft";
import type { PlannerComp, Trait } from "@/lib/types";
import { Chip, TraitPicker } from "@/features/reference/primitives";

export function TraitsPanel({ comp, traits, onAddEmblem, onRemoveEmblem }: {
  comp: PlannerComp; traits: Trait[]; onAddEmblem: (apiName: string) => void; onRemoveEmblem: (index: number) => void;
}) {
  const championsById = useStaticData((s) => s.championsById);
  const traitsByName = useStaticData((s) => s.traitsByName);
  const traitsById = useStaticData((s) => s.traitsById);
  const itemsById = useStaticData((s) => s.itemsById);

  const rows = useMemo(
    () => computeBoardTraits(comp.units, championsById, traitsByName, traitsById, itemsById, comp.emblems),
    [comp.units, comp.emblems, championsById, traitsByName, traitsById, itemsById],
  );
  const active = rows.filter((r) => r.style > 0);
  const inactive = rows.filter((r) => r.style === 0);

  return (
    <div className="card flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2"><Hexagon className="size-4 text-gold" />特性</h3>
        <span className="text-xs text-fg-subtle tabular-nums">{active.length} アクティブ</span>
        <div className="ml-auto">
          <TraitPicker traits={traits} selected={new Set()} onToggle={() => {}} single onPick={onAddEmblem} label="紋章を追加" />
        </div>
      </div>

      {comp.emblems.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-fg-subtle mr-1">追加の紋章</span>
          {comp.emblems.map((e, i) => {
            const t = traitsById.get(e);
            return (
              <Chip key={`${e}-${i}`} size="xs" active onClick={() => onRemoveEmblem(i)} title="削除">
                {t && <TraitIcon trait={t} size={14} showTooltip={false} style={3} />}
                {t?.name ?? e}
                <X className="size-3" />
              </Chip>
            );
          })}
        </div>
      )}

      <div className="p-2 flex flex-col gap-0.5">
        {rows.length === 0 && (
          <div className="text-xs text-fg-subtle text-center py-6 flex flex-col items-center gap-2">
            <Plus className="size-4" />
            ユニットを配置すると特性が表示されます
          </div>
        )}
        {active.map((r) => <TraitRow key={r.trait.apiName} row={r} />)}
        {inactive.length > 0 && active.length > 0 && <div className="h-px bg-border my-1" />}
        {inactive.map((r) => <TraitRow key={r.trait.apiName} row={r} dim />)}
      </div>
    </div>
  );
}

function TraitRow({ row, dim }: { row: ActiveTrait; dim?: boolean }) {
  const color = TRAIT_STYLE_COLORS[row.style] ?? TRAIT_STYLE_COLORS[0];
  const effects = [...row.trait.effects].sort((a, b) => a.minUnits - b.minUnits);
  return (
    <div className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-opacity", dim ? "opacity-45 hover:opacity-80" : "hover:bg-surface-2")}>
      <TraitIcon trait={row.trait} style={row.style} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{row.trait.name}</span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: dim ? "var(--color-fg-subtle)" : color }}>
            {row.count}
            {row.next !== null && <span className="text-fg-subtle font-normal"> / {row.next}</span>}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {effects.map((e, i) => {
          const on = row.count >= e.minUnits && row.count <= e.maxUnits;
          const c = TRAIT_STYLE_COLORS[e.style];
          return (
            <span
              key={i}
              className="min-w-6 h-5 px-1 rounded text-[11px] font-semibold tabular-nums flex items-center justify-center border"
              style={{
                color: on ? "#0b0f1a" : c,
                background: on ? c : `color-mix(in srgb, ${c} 8%, transparent)`,
                borderColor: `color-mix(in srgb, ${c} ${on ? 100 : 35}%, transparent)`,
              }}
            >
              {e.minUnits}
            </span>
          );
        })}
      </div>
    </div>
  );
}
