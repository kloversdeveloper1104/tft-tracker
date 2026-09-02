import { Plus, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, IconButton, Tooltip } from "@/components/ui";
import { ChampionIcon, CostChip, ItemIcon, StarRow } from "@/components/tft";
import type { Champion, PlannerUnit } from "@/lib/types";
import { ItemPickerPopover } from "./ItemPicker";
import { MAX_ITEMS } from "./logic";

export function UnitActionBar({ unit, champion, onCycleStars, onSetItem, onClearItem, onRemove, onClose }: {
  unit: PlannerUnit; champion?: Champion;
  onCycleStars: () => void; onSetItem: (slot: number, itemId: string) => void; onClearItem: (slot: number) => void;
  onRemove: () => void; onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gold/30 bg-surface-2/80 px-3 py-2 animate-slide-up">
      <ChampionIcon champion={champion} id={unit.championId} size={36} stars={unit.stars} showTooltip={false} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold truncate">{champion?.name ?? unit.championId}</span>
          {champion && <CostChip cost={champion.cost} />}
        </div>
        <div className="text-[11px] text-fg-subtle tabular-nums">ヘックス {unit.hex + 1}</div>
      </div>

      <div className="h-8 w-px bg-border mx-1" />

      <Tooltip content="クリックで星を変更 (1→2→3)">
        <button
          type="button"
          onClick={onCycleStars}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-bg-elev hover:border-gold/60 hover:bg-surface-3 transition-colors focus-ring"
        >
          <Star className="size-3.5 text-gold" />
          <StarRow stars={unit.stars} size={12} />
        </button>
      </Tooltip>

      <div className="flex items-center gap-1.5">
        {Array.from({ length: MAX_ITEMS }).map((_, i) => {
          const id = unit.items[i];
          return (
            <ItemPickerPopover
              key={i}
              exclude={[]}
              onPick={(it) => onSetItem(i, it.apiName)}
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  onContextMenu={(e) => { e.preventDefault(); if (id) onClearItem(i); }}
                  title={id ? "左クリックで変更 / 右クリックで外す" : "アイテムを装備"}
                  className={cn(
                    "size-9 rounded-md border flex items-center justify-center transition-colors focus-ring",
                    open ? "border-accent bg-accent/10" : id ? "border-border-strong bg-bg-elev hover:border-accent/60" : "border-dashed border-border-strong bg-bg-elev/60 hover:border-accent/60 hover:bg-surface-3",
                  )}
                >
                  {id ? <ItemIcon id={id} size={30} rounded="rounded" /> : <Plus className="size-4 text-fg-subtle" />}
                </button>
              )}
            />
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={onRemove}>削除</Button>
        <IconButton size="sm" title="選択解除" onClick={onClose}><X className="size-4" /></IconButton>
      </div>
    </div>
  );
}
