import { useEffect, useMemo, useState } from "react";
import { LazyStore } from "@tauri-apps/plugin-store";
import { listen } from "@tauri-apps/api/event";
import { Check, LayoutGrid } from "lucide-react";
import { ChampionIcon, CostChip, ItemIcon, TraitIcon } from "@/components/tft";
import { useStaticData } from "@/stores/staticData";
import { computeBoardTraits } from "@/lib/tft";
import { TRAIT_STYLE_COLORS } from "@/data/odds";
import { cn } from "@/lib/utils";
import type { PlannerComp } from "@/lib/types";
import { OEmpty, OSection } from "./ui";

const plannerStore = new LazyStore("planner.json");

export function CompTab() {
  const [comp, setComp] = useState<PlannerComp | null>(null);
  const [loading, setLoading] = useState(true);
  const [acquired, setAcquired] = useState<Record<string, boolean>>({});
  const s = useStaticData();

  useEffect(() => {
    let active = true;
    plannerStore.get<PlannerComp | null>("activeComp").then((c) => { if (active) { setComp(c ?? null); setLoading(false); } }).catch(() => setLoading(false));
    const un = listen<{ comp: PlannerComp | null }>("planner-updated", (e) => { setComp(e.payload?.comp ?? null); });
    return () => { active = false; un.then((u) => u()).catch(() => {}); };
  }, []);

  useEffect(() => { setAcquired({}); }, [comp?.id]);

  const units = useMemo(() => {
    if (!comp) return [];
    return [...comp.units].sort((a, b) => {
      const ca = s.championsById.get(a.championId)?.cost ?? 0;
      const cb = s.championsById.get(b.championId)?.cost ?? 0;
      return cb - ca || a.hex - b.hex;
    });
  }, [comp, s.championsById]);

  const traits = useMemo(
    () => (comp ? computeBoardTraits(comp.units, s.championsById, s.traitsByName, s.traitsById, s.itemsById, comp.emblems) : []),
    [comp, s.championsById, s.traitsByName, s.traitsById, s.itemsById],
  );

  const itemGoals = useMemo(() => {
    if (!comp) return { completed: [] as { id: string; count: number }[], components: [] as { id: string; count: number }[] };
    const completed = new Map<string, number>();
    const components = new Map<string, number>();
    for (const u of comp.units) {
      for (const itemId of u.items) {
        completed.set(itemId, (completed.get(itemId) ?? 0) + 1);
        const it = s.itemsById.get(itemId);
        const comps = it?.composition?.length ? it.composition : [itemId];
        for (const c of comps) components.set(c, (components.get(c) ?? 0) + 1);
      }
    }
    const toArr = (m: Map<string, number>) => [...m.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
    return { completed: toArr(completed), components: toArr(components) };
  }, [comp, s.itemsById]);

  if (loading) {
    return <div className="flex flex-col gap-2 p-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-9" />)}</div>;
  }
  if (!comp || comp.units.length === 0) {
    return <OEmpty icon={<LayoutGrid />} title="構成がありません" description="プランナーで構成を作成して「オーバーレイへ送信」" />;
  }

  const doneCount = units.filter((_, i) => acquired[`${comp.id}:${i}`]).length;

  return (
    <div className="flex flex-col gap-3 p-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold truncate">{comp.name || "無題の構成"}</div>
          <div className="text-[10px] text-fg-subtle">Set {comp.setNumber} · {units.length} ユニット</div>
        </div>
        <div className="text-[11px] tabular-nums text-fg-muted">
          取得 <span className={cn("font-semibold", doneCount === units.length ? "text-success" : "text-fg")}>{doneCount}</span>/{units.length}
        </div>
      </div>

      {traits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {traits.map((t) => (
            <span
              key={t.trait.apiName}
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-semibold tabular-nums"
              style={{
                color: t.style > 0 ? TRAIT_STYLE_COLORS[t.style] : "var(--color-fg-subtle)",
                background: t.style > 0 ? `color-mix(in srgb, ${TRAIT_STYLE_COLORS[t.style]} 14%, transparent)` : "rgba(255,255,255,0.04)",
              }}
              title={`${t.trait.name} ${t.count}${t.next ? ` (次 ${t.next})` : ""}`}
            >
              <TraitIcon trait={t.trait} style={t.style} size={14} showTooltip={false} />
              {t.count}
            </span>
          ))}
        </div>
      )}

      <OSection title="ユニット">
        <ul className="flex flex-col gap-1">
          {units.map((u, i) => {
            const c = s.championsById.get(u.championId);
            const key = `${comp.id}:${i}`;
            const done = !!acquired[key];
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setAcquired((a) => ({ ...a, [key]: !done }))}
                  className={cn(
                    "no-drag w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-white/5",
                    done && "opacity-55",
                  )}
                >
                  <span className={cn("size-4 rounded border flex items-center justify-center shrink-0", done ? "bg-success border-success" : "border-white/20 bg-black/20")}>
                    {done && <Check className="size-3 text-black" strokeWidth={3} />}
                  </span>
                  <ChampionIcon id={u.championId} champion={c} size={30} stars={u.stars} items={u.items} showTooltip={false} />
                  <span className={cn("flex-1 truncate text-[12px] ml-1", done && "line-through")}>{c?.name ?? u.championId}</span>
                  {c && <CostChip cost={c.cost} />}
                </button>
              </li>
            );
          })}
        </ul>
      </OSection>

      {itemGoals.completed.length > 0 && (
        <OSection title="アイテム目標">
          <div className="flex flex-wrap gap-1.5">
            {itemGoals.completed.map((g) => (
              <span key={g.id} className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1 py-0.5" title={s.itemsById.get(g.id)?.name ?? g.id}>
                <ItemIcon id={g.id} size={20} showTooltip={false} />
                {g.count > 1 && <span className="text-[10px] tabular-nums text-fg-muted">×{g.count}</span>}
              </span>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-fg-subtle">素材:</span>
            {itemGoals.components.map((g) => (
              <span key={g.id} className="inline-flex items-center gap-0.5" title={s.itemsById.get(g.id)?.name ?? g.id}>
                <ItemIcon id={g.id} size={16} showTooltip={false} />
                <span className="text-[10px] tabular-nums text-fg-muted">×{g.count}</span>
              </span>
            ))}
          </div>
        </OSection>
      )}

      {comp.notes && (
        <OSection title="メモ">
          <p className="text-[11px] text-fg-muted whitespace-pre-wrap leading-relaxed">{comp.notes}</p>
        </OSection>
      )}
    </div>
  );
}
