import { useMemo, useState } from "react";
import { Gem } from "lucide-react";
import { useStaticData } from "@/stores/staticData";
import { Badge, EmptyState, SearchInput } from "@/components/ui";
import { AugmentIcon, RichDesc, TraitIcon } from "@/components/tft";
import type { Augment, StaticData } from "@/lib/types";
import { Chip, ResultCount, SelectedTraitChips, ShowMore, TraitPicker, norm, useShowMore } from "./primitives";

export const AUG_TIER_LABELS: Record<number, string> = { 3: "プリズム", 2: "ゴールド", 1: "シルバー", 0: "不明" };
export const AUG_TIER_COLORS: Record<number, string> = { 0: "var(--color-fg-subtle)", 1: "#c0cad9", 2: "#f0c250", 3: "#a8f5ff" };
const TIER_ORDER = [3, 2, 1, 0];

export function AugmentsTab({ data }: { data: StaticData }) {
  const traitsById = useStaticData((s) => s.traitsById);
  const [tiers, setTiers] = useState<Set<number>>(() => new Set());
  const [query, setQuery] = useState("");
  const [traitFilter, setTraitFilter] = useState<Set<string>>(() => new Set());

  const associatedTraits = useMemo(() => {
    const ids = new Set<string>();
    for (const a of data.augments) for (const t of a.associatedTraits) ids.add(t);
    return data.traits.filter((t) => ids.has(t.apiName));
  }, [data.augments, data.traits]);

  const tierCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of data.augments) m.set(a.tier, (m.get(a.tier) ?? 0) + 1);
    return m;
  }, [data.augments]);

  const filtered = useMemo(() => {
    const q = norm(query);
    return data.augments
      .filter((a) => {
        if (tiers.size && !tiers.has(a.tier)) return false;
        if (traitFilter.size && !a.associatedTraits.some((t) => traitFilter.has(t))) return false;
        if (q && !(norm(a.name).includes(q) || norm(a.desc).includes(q) || norm(a.apiName).includes(q))) return false;
        return true;
      })
      .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.name.localeCompare(b.name, "ja"));
  }, [data.augments, tiers, traitFilter, query]);

  const { visible, hasMore, remaining, showMore } = useShowMore(filtered, 120);
  const grouped = useMemo(() => {
    const m = new Map<number, Augment[]>();
    for (const a of visible) {
      const g = m.get(a.tier);
      if (g) g.push(a);
      else m.set(a.tier, [a]);
    }
    return [...m.entries()].sort((a, b) => TIER_ORDER.indexOf(a[0]) - TIER_ORDER.indexOf(b[0]));
  }, [visible]);

  const toggleTier = (t: number) => setTiers((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const toggleTrait = (id: string) => setTraitFilter((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const showHeaders = tiers.size === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="card p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="名前・効果で検索..." className="w-64" />
          <div className="flex items-center gap-1">
            {TIER_ORDER.filter((t) => (tierCounts.get(t) ?? 0) > 0).map((t) => (
              <Chip key={t} active={tiers.has(t)} onClick={() => toggleTier(t)} color={AUG_TIER_COLORS[t]}>
                <span className="size-2 rounded-full" style={{ background: AUG_TIER_COLORS[t] }} />
                {AUG_TIER_LABELS[t]}
                <span className="text-[10px] tabular-nums opacity-70">{tierCounts.get(t)}</span>
              </Chip>
            ))}
          </div>
          {associatedTraits.length > 0 && (
            <TraitPicker traits={associatedTraits} selected={traitFilter} onToggle={toggleTrait} onClear={() => setTraitFilter(new Set())} label="関連特性" />
          )}
          <ResultCount shown={filtered.length} total={data.augments.length} />
        </div>
        <SelectedTraitChips ids={traitFilter} traitsById={traitsById} onRemove={toggleTrait} />
      </div>

      {data.augments.length === 0 ? (
        <EmptyState icon={<Gem />} title="オーグメントのデータがありません" description="このセットのオーグメント情報は取得できませんでした。" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Gem />} title="該当するオーグメントがありません" />
      ) : (
        <>
          {grouped.map(([tier, list]) => (
            <section key={tier} className="flex flex-col gap-2">
              {showHeaders && (
                <h3 className="flex items-center gap-2 text-sm font-semibold mt-1">
                  <span className="size-2.5 rounded-full" style={{ background: AUG_TIER_COLORS[tier], boxShadow: `0 0 10px ${AUG_TIER_COLORS[tier]}` }} />
                  <span style={{ color: AUG_TIER_COLORS[tier] }}>{AUG_TIER_LABELS[tier]}</span>
                  <span className="text-xs text-fg-subtle tabular-nums font-normal">{list.length}</span>
                  <span className="flex-1 h-px bg-border ml-2" />
                </h3>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2">
                {list.map((a) => <AugmentCard key={a.apiName} augment={a} />)}
              </div>
            </section>
          ))}
          <ShowMore hasMore={hasMore} remaining={remaining} onClick={showMore} />
        </>
      )}
    </div>
  );
}

function AugmentCard({ augment: a }: { augment: Augment }) {
  const color = AUG_TIER_COLORS[a.tier];
  return (
    <article className="card p-3 flex gap-3 hover:border-border-strong transition-colors animate-fade-in">
      <AugmentIcon augment={a} size={40} showTooltip={false} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{a.name}</span>
          <Badge color={color} size="xs">{AUG_TIER_LABELS[a.tier]}</Badge>
          {a.associatedTraits.length > 0 && (
            <span className="ml-auto flex items-center gap-1">
              {a.associatedTraits.map((t) => <TraitIcon key={t} id={t} size={16} style={3} />)}
            </span>
          )}
        </div>
        <RichDesc desc={a.desc} vars={a.effects} className="mt-1 line-clamp-5" />
      </div>
    </article>
  );
}
