import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowDownAZ, ArrowDownWideNarrow, Grid3X3, MousePointerClick, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { COST_COLORS } from "@/data/odds";
import { useStaticData } from "@/stores/staticData";
import { Button, EmptyState, SearchInput, Tabs } from "@/components/ui";
import { ChampionIcon, CostChip, RichDesc, TraitIcon } from "@/components/tft";
import type { Champion, StaticData, Trait } from "@/lib/types";
import { Chip, CostChips, ResultCount, SelectedTraitChips, ShowMore, TraitPicker, fmtNum, norm, useShowMore } from "./primitives";

type SortKey = "cost" | "name";

/** Resolve a champion's traits to Trait objects (apiNames first, display names as fallback). */
export function championTraits(c: Champion, traitsById: Map<string, Trait>, traitsByName: Map<string, Trait>): Trait[] {
  const out: Trait[] = [];
  const seen = new Set<string>();
  const push = (t?: Trait) => { if (t && !seen.has(t.apiName)) { seen.add(t.apiName); out.push(t); } };
  for (const id of c.traitApiNames) push(traitsById.get(id));
  for (const name of c.traits) push(traitsByName.get(name));
  return out;
}

export function ChampionsTab({ data }: { data: StaticData }) {
  const traitsById = useStaticData((s) => s.traitsById);
  const traitsByName = useStaticData((s) => s.traitsByName);
  const navigate = useNavigate();
  const location = useLocation();

  const [query, setQuery] = useState("");
  const [costs, setCosts] = useState<Set<number>>(() => new Set());
  const [traitFilter, setTraitFilter] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<SortKey>("cost");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // `?select=<apiName>` (from the traits tab) selects a champion and clears the param.
  useEffect(() => {
    const sel = new URLSearchParams(location.search).get("select");
    if (sel) {
      setSelectedId(sel);
      navigate("/reference/champions", { replace: true });
    }
  }, [location.search, navigate]);

  const traitMap = useMemo(() => {
    const m = new Map<string, Trait[]>();
    for (const c of data.champions) m.set(c.apiName, championTraits(c, traitsById, traitsByName));
    return m;
  }, [data.champions, traitsById, traitsByName]);

  const filtered = useMemo(() => {
    const q = norm(query);
    const list = data.champions.filter((c) => {
      if (costs.size && !costs.has(c.cost)) return false;
      const ts = traitMap.get(c.apiName) ?? [];
      if (traitFilter.size && !ts.some((t) => traitFilter.has(t.apiName))) return false;
      if (q && !(norm(c.name).includes(q) || norm(c.apiName).includes(q) || ts.some((t) => norm(t.name).includes(q)))) return false;
      return true;
    });
    return list.sort((a, b) => (sort === "cost" ? a.cost - b.cost || a.name.localeCompare(b.name, "ja") : a.name.localeCompare(b.name, "ja") || a.cost - b.cost));
  }, [data.champions, query, costs, traitFilter, traitMap, sort]);

  const { visible, hasMore, remaining, showMore } = useShowMore(filtered, 120);
  const selected = selectedId ? data.champions.find((c) => c.apiName === selectedId) ?? null : null;

  const toggleCost = (c: number) => setCosts((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleTrait = (id: string) => setTraitFilter((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const hasFilter = query || costs.size > 0 || traitFilter.size > 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <div className="min-w-0 flex flex-col gap-3">
        {/* toolbar */}
        <div className="card p-3 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="名前・特性で検索..." className="w-64" />
            <CostChips selected={costs} onToggle={toggleCost} />
            <TraitPicker traits={data.traits} selected={traitFilter} onToggle={toggleTrait} onClear={() => setTraitFilter(new Set())} />
            <div className="ml-auto flex items-center gap-2">
              <ResultCount shown={filtered.length} total={data.champions.length} unit="体" />
              <Tabs<SortKey>
                size="sm"
                value={sort}
                onChange={setSort}
                items={[
                  { id: "cost", label: "コスト", icon: <ArrowDownWideNarrow className="size-3.5" /> },
                  { id: "name", label: "名前", icon: <ArrowDownAZ className="size-3.5" /> },
                ]}
              />
            </div>
          </div>
          {(traitFilter.size > 0 || hasFilter) && (
            <div className="flex items-center gap-2">
              <SelectedTraitChips ids={traitFilter} traitsById={traitsById} onRemove={toggleTrait} />
              {hasFilter && (
                <button type="button" className="text-xs text-fg-subtle hover:text-fg ml-auto focus-ring rounded px-1" onClick={() => { setQuery(""); setCosts(new Set()); setTraitFilter(new Set()); }}>
                  フィルターをリセット
                </button>
              )}
            </div>
          )}
        </div>

        {/* grid */}
        {filtered.length === 0 ? (
          <EmptyState icon={<Users />} title="該当するチャンピオンがありません" description="検索条件やフィルターを変更してください。" />
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2">
              {visible.map((c) => (
                <ChampionCard
                  key={c.apiName}
                  c={c}
                  traits={traitMap.get(c.apiName) ?? []}
                  selected={c.apiName === selectedId}
                  onClick={() => setSelectedId(c.apiName)}
                />
              ))}
            </div>
            <ShowMore hasMore={hasMore} remaining={remaining} onClick={showMore} />
          </>
        )}
      </div>

      {/* detail */}
      <aside className="xl:sticky xl:top-0 min-w-0">
        {selected ? (
          <ChampionDetail
            key={selected.apiName}
            c={selected}
            traits={traitMap.get(selected.apiName) ?? []}
            champions={data.champions}
            traitMap={traitMap}
            onSelectChampion={setSelectedId}
            onFilterTrait={(id) => setTraitFilter(new Set([id]))}
            onAddToPlanner={() => navigate(`/planner?add=${encodeURIComponent(selected.apiName)}`)}
          />
        ) : (
          <div className="card">
            <EmptyState icon={<MousePointerClick />} title="チャンピオンを選択" description="カードをクリックすると、スキル・ステータス・関連ユニットの詳細を表示します。" />
          </div>
        )}
      </aside>
    </div>
  );
}

function ChampionCard({ c, traits, selected, onClick }: { c: Champion; traits: Trait[]; selected: boolean; onClick: () => void }) {
  const color = COST_COLORS[c.cost] ?? COST_COLORS[1];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all duration-150 focus-ring",
        selected
          ? "bg-surface-2 border-gold/60 shadow-glow-gold"
          : "bg-surface border-border hover:bg-surface-2 hover:border-border-strong hover:-translate-y-0.5",
      )}
    >
      <ChampionIcon champion={c} size={56} showTooltip={false} />
      <div className="flex items-center gap-1.5 min-w-0 max-w-full">
        <span className="text-xs font-semibold truncate">{c.name}</span>
        <CostChip cost={c.cost} />
      </div>
      <div className="flex items-center gap-1">
        {traits.map((t) => <TraitIcon key={t.apiName} trait={t} size={16} showTooltip />)}
      </div>
      <span className="absolute inset-x-3 bottom-0 h-px opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
    </button>
  );
}

function ChampionDetail({ c, traits, champions, traitMap, onSelectChampion, onFilterTrait, onAddToPlanner }: {
  c: Champion; traits: Trait[]; champions: Champion[]; traitMap: Map<string, Trait[]>;
  onSelectChampion: (id: string) => void; onFilterTrait: (id: string) => void; onAddToPlanner: () => void;
}) {
  const color = COST_COLORS[c.cost] ?? COST_COLORS[1];
  const vars = useMemo(() => {
    const v: Record<string, number[]> = {};
    for (const x of c.ability.variables) v[x.name] = x.value;
    return v;
  }, [c]);
  const stats: { label: string; value: string }[] = [
    { label: "HP", value: String(c.stats.hp) },
    { label: "AD", value: String(c.stats.damage) },
    { label: "AR", value: String(c.stats.armor) },
    { label: "MR", value: String(c.stats.magicResist) },
    { label: "AS", value: c.stats.attackSpeed.toFixed(2) },
    { label: "射程", value: String(c.stats.range) },
    { label: "クリ率", value: `${Math.round(c.stats.critChance * 100)}%` },
    { label: "マナ", value: `${c.stats.initialMana}/${c.stats.mana}` },
  ];
  return (
    <div className="card overflow-hidden animate-fade-in max-h-[calc(100vh-140px)] overflow-y-auto">
      {/* banner */}
      <div className="relative h-44 bg-surface-2">
        <img src={c.icon} alt="" className="absolute inset-0 w-full h-full object-cover object-[center_20%]" draggable={false} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(22,29,47,0.1) 0%, rgba(22,29,47,0.55) 60%, var(--color-surface) 100%)" }} />
        <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
        <div className="absolute left-4 bottom-3 right-4 flex items-end gap-3">
          <ChampionIcon champion={c} size={48} showTooltip={false} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold leading-tight truncate drop-shadow">{c.name}</h3>
              <CostChip cost={c.cost} />
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {traits.map((t) => (
                <button
                  key={t.apiName}
                  type="button"
                  onClick={() => onFilterTrait(t.apiName)}
                  title="この特性で絞り込む"
                  className="inline-flex items-center gap-1 rounded-full bg-black/40 border border-white/10 pl-0.5 pr-2 h-5 text-[11px] text-fg hover:border-gold/60 hover:text-gold transition-colors focus-ring"
                >
                  <TraitIcon trait={t} size={16} showTooltip={false} style={3} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <Button variant="gold" icon={<Plus className="size-4" />} onClick={onAddToPlanner} className="w-full">
          プランナーに追加
        </Button>

        {/* ability */}
        <section>
          <div className="flex items-center gap-2.5">
            {c.ability.icon && <img src={c.ability.icon} alt="" className="size-10 rounded-md border border-border" draggable={false} />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gold truncate">{c.ability.name || "スキル"}</div>
              <div className="text-[11px] text-fg-subtle tabular-nums">マナ {c.stats.initialMana} / {c.stats.mana}</div>
            </div>
          </div>
          <RichDesc desc={c.ability.desc} vars={vars} className="mt-2" />
          {c.ability.variables.length > 0 && (
            <details className="mt-2 group">
              <summary className="text-[11px] text-fg-subtle cursor-pointer hover:text-fg-muted select-none">スキル変数 ({c.ability.variables.length})</summary>
              <div className="mt-1.5 rounded-md border border-border overflow-hidden">
                <table className="w-full text-[11px] tabular-nums">
                  <thead className="bg-surface-2 text-fg-subtle">
                    <tr><th className="text-left px-2 py-1 font-medium">変数</th><th className="px-2 py-1 font-medium text-right">1★</th><th className="px-2 py-1 font-medium text-right">2★</th><th className="px-2 py-1 font-medium text-right">3★</th></tr>
                  </thead>
                  <tbody>
                    {c.ability.variables.map((v) => (
                      <tr key={v.name} className="border-t border-border/60">
                        <td className="px-2 py-1 text-fg-muted truncate max-w-[140px]" title={v.name}>{v.name}</td>
                        {[1, 2, 3].map((i) => <td key={i} className="px-2 py-1 text-right">{fmtNum(v.value[i] ?? v.value[0])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>

        {/* stats */}
        <section>
          <h4 className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium mb-1.5">基本ステータス</h4>
          <div className="grid grid-cols-4 gap-1.5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-md bg-bg-elev border border-border px-2 py-1.5">
                <div className="text-[10px] text-fg-subtle">{s.label}</div>
                <div className="text-sm font-semibold tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* same-trait units */}
        <section className="flex flex-col gap-3">
          <h4 className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium">同じ特性のユニット</h4>
          {traits.map((t) => {
            const list = champions
              .filter((o) => (traitMap.get(o.apiName) ?? []).some((x) => x.apiName === t.apiName))
              .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
            return (
              <div key={t.apiName}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TraitIcon trait={t} size={18} style={3} />
                  <span className="text-xs font-medium">{t.name}</span>
                  <span className="text-[11px] text-fg-subtle tabular-nums">{list.length}</span>
                  <Chip size="xs" className="ml-auto" onClick={() => onFilterTrait(t.apiName)}><Grid3X3 className="size-3" />一覧で絞り込む</Chip>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((o) => (
                    <ChampionIcon
                      key={o.apiName}
                      champion={o}
                      size={32}
                      dim={o.apiName === c.apiName}
                      onClick={() => onSelectChampion(o.apiName)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
