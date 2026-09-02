import { useEffect, useMemo, useState } from "react";
import { ClipboardCopy, Download, Eraser, Gem, ListPlus } from "lucide-react";
import { useStaticData } from "@/stores/staticData";
import { Badge, Button, EmptyState, SearchInput, Select } from "@/components/ui";
import { AugmentIcon, RichDesc, TierBadge, TierPicker, TraitIcon } from "@/components/tft";
import { TIER_COLORS, TIER_ORDER, tierRank, useAugmentTiers, type Tier } from "@/lib/augmentTiers";
import type { Augment, StaticData } from "@/lib/types";
import { Chip, ResultCount, SelectedTraitChips, ShowMore, TraitPicker, norm, useShowMore } from "./primitives";
import { TierBulkModal, TierClearModal, TierImportModal, exportTiersToClipboard } from "./TierModals";

export const AUG_TIER_LABELS: Record<number, string> = { 3: "プリズム", 2: "ゴールド", 1: "シルバー", 0: "不明" };
export const AUG_TIER_COLORS: Record<number, string> = { 0: "var(--color-fg-subtle)", 1: "#c0cad9", 2: "#f0c250", 3: "#a8f5ff" };
const RARITY_ORDER = [3, 2, 1, 0];

type UserTierFilter = Tier | "none";
type SortMode = "rarity" | "tier";
type GroupKey = string; // rarity: "r3".."r0"; tier: "S".."D" | "none"

export function AugmentsTab({ data }: { data: StaticData }) {
  const traitsById = useStaticData((s) => s.traitsById);
  const [tiers, setTiers] = useState<Set<number>>(() => new Set());
  const [userTiers, setUserTiers] = useState<Set<UserTierFilter>>(() => new Set());
  const [sort, setSort] = useState<SortMode>("rarity");
  const [query, setQuery] = useState("");
  const [traitFilter, setTraitFilter] = useState<Set<string>>(() => new Set());
  const [modal, setModal] = useState<"bulk" | "import" | "clear" | null>(null);

  const ratings = useAugmentTiers((s) => s.data.ratings);
  const loadTiers = useAugmentTiers((s) => s.load);
  useEffect(() => { loadTiers(); }, [loadTiers]);

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

  const userTierCounts = useMemo(() => {
    const m: Record<UserTierFilter, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, none: 0 };
    for (const a of data.augments) {
      const t = ratings[a.apiName]?.tier;
      if (t) m[t]++;
      else m.none++;
    }
    return m;
  }, [data.augments, ratings]);

  const filtered = useMemo(() => {
    const q = norm(query);
    const byRarity = (a: Augment, b: Augment) => RARITY_ORDER.indexOf(a.tier) - RARITY_ORDER.indexOf(b.tier) || a.name.localeCompare(b.name, "ja");
    return data.augments
      .filter((a) => {
        if (tiers.size && !tiers.has(a.tier)) return false;
        if (userTiers.size) {
          const t: UserTierFilter = ratings[a.apiName]?.tier ?? "none";
          if (!userTiers.has(t)) return false;
        }
        if (traitFilter.size && !a.associatedTraits.some((t) => traitFilter.has(t))) return false;
        if (q && !(norm(a.name).includes(q) || norm(a.desc).includes(q) || norm(a.apiName).includes(q))) return false;
        return true;
      })
      .sort((a, b) => (sort === "tier" ? tierRank(ratings[a.apiName]?.tier) - tierRank(ratings[b.apiName]?.tier) || byRarity(a, b) : byRarity(a, b)));
  }, [data.augments, tiers, userTiers, traitFilter, query, sort, ratings]);

  const { visible, hasMore, remaining, showMore } = useShowMore(filtered, 120);
  const grouped = useMemo(() => {
    const m = new Map<GroupKey, Augment[]>();
    for (const a of visible) {
      const key: GroupKey = sort === "tier" ? (ratings[a.apiName]?.tier ?? "none") : `r${a.tier}`;
      const g = m.get(key);
      if (g) g.push(a);
      else m.set(key, [a]);
    }
    return [...m.entries()];
  }, [visible, sort, ratings]);

  const toggleTier = (t: number) => setTiers((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const toggleUserTier = (t: UserTierFilter) => setUserTiers((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const toggleTrait = (id: string) => setTraitFilter((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const showHeaders = sort === "tier" ? userTiers.size !== 1 : tiers.size !== 1;
  const ratedCount = Object.keys(ratings).length;

  const groupMeta = (key: GroupKey): { label: string; color: string } => {
    if (key.startsWith("r")) { const r = Number(key.slice(1)); return { label: AUG_TIER_LABELS[r], color: AUG_TIER_COLORS[r] }; }
    if (key === "none") return { label: "未評価", color: "var(--color-fg-subtle)" };
    return { label: `${key} ティア`, color: TIER_COLORS[key as Tier] };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="card p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="名前・効果で検索..." className="w-64" />
          <div className="flex items-center gap-1">
            {RARITY_ORDER.filter((t) => (tierCounts.get(t) ?? 0) > 0).map((t) => (
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
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="xs" variant="outline" icon={<ListPlus className="size-3.5" />} onClick={() => setModal("bulk")}>ティアを一括入力</Button>
            <Button size="xs" variant="ghost" icon={<ClipboardCopy className="size-3.5" />} onClick={() => exportTiersToClipboard()} disabled={ratedCount === 0} title="JSON をクリップボードへ">エクスポート</Button>
            <Button size="xs" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => setModal("import")}>インポート</Button>
            <Button size="xs" variant="ghost" icon={<Eraser className="size-3.5" />} onClick={() => setModal("clear")} disabled={ratedCount === 0} className="hover:text-danger">すべてクリア</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-fg-subtle font-medium">自分のティア</span>
          <div className="flex items-center gap-1" role="group" aria-label="ティアで絞り込み">
            {TIER_ORDER.map((t) => (
              <Chip key={t} active={userTiers.has(t)} onClick={() => toggleUserTier(t)} color={TIER_COLORS[t]} size="xs" className="min-w-9 justify-center">
                <b>{t}</b>
                <span className="text-[10px] tabular-nums opacity-70">{userTierCounts[t]}</span>
              </Chip>
            ))}
            <Chip active={userTiers.has("none")} onClick={() => toggleUserTier("none")} size="xs">
              未評価
              <span className="text-[10px] tabular-nums opacity-70">{userTierCounts.none}</span>
            </Chip>
          </div>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            options={[{ value: "rarity", label: "並び: レア度順" }, { value: "tier", label: "並び: ティア順" }]}
            className="[&>select]:h-7 [&>select]:text-xs [&>select]:rounded-md"
            aria-label="並び順"
          />
          <span className="text-[11px] text-fg-subtle ml-auto">
            評価済み <b className="tabular-nums text-fg-muted">{ratedCount}</b> 件 · 各カードの S/A/B/C/D をクリックで評価（再クリックで解除）
          </span>
        </div>
        <SelectedTraitChips ids={traitFilter} traitsById={traitsById} onRemove={toggleTrait} />
      </div>

      {data.augments.length === 0 ? (
        <EmptyState icon={<Gem />} title="オーグメントのデータがありません" description="このセットのオーグメント情報は取得できませんでした。" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Gem />} title="該当するオーグメントがありません" />
      ) : (
        <>
          {grouped.map(([key, list]) => {
            const meta = groupMeta(key);
            return (
              <section key={key} className="flex flex-col gap-2">
                {showHeaders && (
                  <h3 className="flex items-center gap-2 text-sm font-semibold mt-1">
                    <span className="size-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} />
                    <span style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-xs text-fg-subtle tabular-nums font-normal">{list.length}</span>
                    <span className="flex-1 h-px bg-border ml-2" />
                  </h3>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2">
                  {list.map((a) => <AugmentCard key={a.apiName} augment={a} userTier={ratings[a.apiName]?.tier ?? null} setNumber={data.setNumber} />)}
                </div>
              </section>
            );
          })}
          <ShowMore hasMore={hasMore} remaining={remaining} onClick={showMore} />
        </>
      )}

      <TierBulkModal open={modal === "bulk"} onClose={() => setModal(null)} augments={data.augments} setNumber={data.setNumber} />
      <TierImportModal open={modal === "import"} onClose={() => setModal(null)} augments={data.augments} setNumber={data.setNumber} />
      <TierClearModal open={modal === "clear"} onClose={() => setModal(null)} />
    </div>
  );
}

function AugmentCard({ augment: a, userTier, setNumber }: { augment: Augment; userTier: Tier | null; setNumber: number }) {
  const color = AUG_TIER_COLORS[a.tier];
  const rate = useAugmentTiers((s) => s.rate);
  const glow = userTier ? TIER_COLORS[userTier] : null;
  return (
    <article
      className="card p-3 flex gap-3 hover:border-border-strong transition-colors animate-fade-in"
      style={glow ? { boxShadow: `var(--shadow-card), inset 3px 0 0 ${glow}` } : undefined}
    >
      <AugmentIcon augment={a} size={40} showTooltip={false} />
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{a.name}</span>
          <TierBadge tier={userTier} size="xs" />
          <Badge color={color} size="xs">{AUG_TIER_LABELS[a.tier]}</Badge>
          {a.associatedTraits.length > 0 && (
            <span className="ml-auto flex items-center gap-1">
              {a.associatedTraits.map((t) => <TraitIcon key={t} id={t} size={16} style={3} />)}
            </span>
          )}
        </div>
        <RichDesc desc={a.desc} vars={a.effects} className="mt-1 line-clamp-5" />
        <div className="mt-2 flex items-center justify-end">
          <TierPicker value={userTier} onChange={(t) => rate(a.apiName, t, setNumber)} size="sm" />
        </div>
      </div>
    </article>
  );
}
