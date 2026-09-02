import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStaticData } from "@/stores/staticData";
import { EmptyState, SearchInput } from "@/components/ui";
import { ChampionIcon, CostChip, TraitIcon } from "@/components/tft";
import type { Champion, Trait } from "@/lib/types";
import { CostChips, SelectedTraitChips, TraitPicker, norm } from "@/features/reference/primitives";
import { championTraits } from "@/features/reference/ChampionsTab";
import type { DragData } from "./HexBoard";

export function ChampionPool({ champions, traits, placed, onPick }: {
  champions: Champion[]; traits: Trait[]; placed: Set<string>; onPick: (c: Champion) => void;
}) {
  const traitsById = useStaticData((s) => s.traitsById);
  const traitsByName = useStaticData((s) => s.traitsByName);
  const [q, setQ] = useState("");
  const [costs, setCosts] = useState<Set<number>>(() => new Set());
  const [traitFilter, setTraitFilter] = useState<Set<string>>(() => new Set());

  const traitMap = useMemo(() => {
    const m = new Map<string, Trait[]>();
    for (const c of champions) m.set(c.apiName, championTraits(c, traitsById, traitsByName));
    return m;
  }, [champions, traitsById, traitsByName]);

  const list = useMemo(() => {
    const n = norm(q);
    return champions
      .filter((c) => {
        if (costs.size && !costs.has(c.cost)) return false;
        const ts = traitMap.get(c.apiName) ?? [];
        if (traitFilter.size && !ts.some((t) => traitFilter.has(t.apiName))) return false;
        if (n && !(norm(c.name).includes(n) || ts.some((t) => norm(t.name).includes(n)))) return false;
        return true;
      })
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
  }, [champions, q, costs, traitFilter, traitMap]);

  const toggleCost = (c: number) => setCosts((s) => { const x = new Set(s); x.has(c) ? x.delete(c) : x.add(c); return x; });
  const toggleTrait = (id: string) => setTraitFilter((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });

  return (
    <div className="card flex flex-col min-h-0 h-full">
      <div className="p-3 border-b border-border flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2"><Users className="size-4 text-gold" />チャンピオン</h3>
          <span className="text-xs text-fg-subtle tabular-nums">{list.length} / {champions.length}</span>
        </div>
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・特性で検索..." />
        <div className="flex flex-wrap items-center gap-1.5">
          <CostChips selected={costs} onToggle={toggleCost} />
          <TraitPicker traits={traits} selected={traitFilter} onToggle={toggleTrait} onClear={() => setTraitFilter(new Set())} />
        </div>
        <SelectedTraitChips ids={traitFilter} traitsById={traitsById} onRemove={toggleTrait} />
        <p className="text-[11px] text-fg-subtle">クリックで自動配置、ドラッグでヘックスへ配置</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-0.5">
        {list.length === 0 ? (
          <EmptyState icon={<Users />} title="該当なし" className="py-8" />
        ) : (
          list.map((c) => (
            <PoolRow key={c.apiName} champion={c} traits={traitMap.get(c.apiName) ?? []} placed={placed.has(c.apiName)} onPick={() => onPick(c)} />
          ))
        )}
      </div>
    </div>
  );
}

function PoolRow({ champion: c, traits, placed, onPick }: { champion: Champion; traits: Trait[]; placed: boolean; onPick: () => void }) {
  const data: DragData = { type: "champion", championId: c.apiName };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pool-${c.apiName}`, data });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onPick}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing touch-none transition-colors focus-ring outline-none",
        "hover:bg-surface-2",
        isDragging && "opacity-40",
        placed && "bg-gold/5",
      )}
    >
      <ChampionIcon champion={c} size={40} showTooltip={false} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-sm font-medium truncate", placed && "text-gold")}>{c.name}</span>
          <CostChip cost={c.cost} />
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {traits.map((t) => (
            <span key={t.apiName} className="inline-flex items-center gap-0.5 text-[10px] text-fg-subtle">
              <TraitIcon trait={t} size={12} showTooltip={false} />
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <GripVertical className="size-4 text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
