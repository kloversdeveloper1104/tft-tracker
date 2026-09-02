import { useMemo, useState } from "react";
import { Backpack, Eraser, FlaskConical, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPONENT_ORDER, buildRecipeMap } from "@/lib/tft";
import { useStaticData } from "@/stores/staticData";
import { Badge, Button, EmptyState, SearchInput, Tabs } from "@/components/ui";
import { ItemIcon, RichDesc } from "@/components/tft";
import type { Item, ItemKind, StaticData } from "@/lib/types";
import { Chip, ResultCount, SectionTitle, ShowMore, norm, useShowMore } from "./primitives";

type KindFilter = "all" | ItemKind;
export const KIND_LABELS: Record<ItemKind, string> = {
  component: "素材", completed: "完成", emblem: "紋章", artifact: "遺物", radiant: "光輝", support: "サポート", special: "特殊", other: "その他",
};
const KIND_ORDER: ItemKind[] = ["component", "completed", "emblem", "artifact", "radiant", "support", "special", "other"];
const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "すべて" },
  ...KIND_ORDER.map((k) => ({ id: k as KindFilter, label: KIND_LABELS[k] })),
];

type CombineMode = "combine" | "inventory";

export function ItemsTab({ data }: { data: StaticData }) {
  const itemsById = useStaticData((s) => s.itemsById);
  const recipes = useMemo(() => buildRecipeMap(data.items), [data.items]);
  const components = useMemo(() => COMPONENT_ORDER.filter((id) => itemsById.has(id)), [itemsById]);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle>アイテム合成表</SectionTitle>
        <div className="grid grid-cols-1 2xl:grid-cols-[auto_minmax(0,1fr)] gap-4 items-start">
          <RecipeGrid components={components} recipes={recipes} />
          <Combiner components={components} recipes={recipes} />
        </div>
      </section>
      <ItemList data={data} />
    </div>
  );
}

// ----- Recipe grid ----------------------------------------------------------------
function RecipeGrid({ components, recipes }: { components: string[]; recipes: Map<string, Item> }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  if (components.length === 0) return <div className="card p-6 text-sm text-fg-subtle">素材アイテムのデータがありません</div>;
  return (
    <div className="card p-3 overflow-x-auto">
      <table className="border-separate border-spacing-[3px]" onMouseLeave={() => setHover(null)}>
        <thead>
          <tr>
            <th className="size-9" />
            {components.map((id, c) => (
              <th key={id} className={cn("size-9 rounded-md transition-colors", hover?.c === c && "bg-surface-3")}>
                <div className="flex items-center justify-center"><ItemIcon id={id} size={28} /></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {components.map((rowId, r) => (
            <tr key={rowId}>
              <th className={cn("size-9 rounded-md transition-colors", hover?.r === r && "bg-surface-3")}>
                <div className="flex items-center justify-center"><ItemIcon id={rowId} size={28} /></div>
              </th>
              {components.map((colId, c) => {
                const item = recipes.get([rowId, colId].sort().join("|"));
                const lit = hover && (hover.r === r || hover.c === c);
                return (
                  <td
                    key={colId}
                    onMouseEnter={() => setHover({ r, c })}
                    className={cn("size-9 rounded-md transition-colors", lit ? "bg-surface-2" : "bg-bg-elev/60", hover?.r === r && hover.c === c && "ring-1 ring-gold/60")}
                  >
                    <div className="flex items-center justify-center">
                      {item ? <ItemIcon item={item} size={30} rounded="rounded-md" /> : <span className="text-fg-subtle/40 text-[10px]">·</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----- Interactive combiner ---------------------------------------------------------
function Combiner({ components, recipes }: { components: string[]; recipes: Map<string, Item> }) {
  const [mode, setMode] = useState<CombineMode>("combine");
  const [sel, setSel] = useState<string[]>([]); // up to 2 (duplicates allowed)
  const [inv, setInv] = useState<string[]>([]); // multiset

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of mode === "combine" ? sel : inv) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [mode, sel, inv]);

  const result = sel.length === 2 ? recipes.get([...sel].sort().join("|")) ?? null : null;

  const craftable = useMemo(() => {
    const seen = new Map<string, { item: Item; from: [string, string] }>();
    for (let i = 0; i < inv.length; i++) {
      for (let j = i + 1; j < inv.length; j++) {
        const key = [inv[i], inv[j]].sort().join("|");
        const item = recipes.get(key);
        if (item && !seen.has(item.apiName)) seen.set(item.apiName, { item, from: [inv[i], inv[j]] });
      }
    }
    const groups = new Map<ItemKind, { item: Item; from: [string, string] }[]>();
    for (const v of seen.values()) {
      const g = groups.get(v.item.kind);
      if (g) g.push(v);
      else groups.set(v.item.kind, [v]);
    }
    return [...groups.entries()].sort((a, b) => KIND_ORDER.indexOf(a[0]) - KIND_ORDER.indexOf(b[0]));
  }, [inv, recipes]);

  const clickComponent = (id: string) => {
    if (mode === "combine") setSel((s) => (s.length >= 2 ? [id] : [...s, id]));
    else setInv((s) => [...s, id]);
  };
  const removeOne = (id: string) => {
    const remove = (s: string[]) => { const i = s.lastIndexOf(id); return i >= 0 ? [...s.slice(0, i), ...s.slice(i + 1)] : s; };
    if (mode === "combine") setSel(remove);
    else setInv(remove);
  };
  const clear = () => (mode === "combine" ? setSel([]) : setInv([]));

  return (
    <div className="card p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-2">
        <Tabs<CombineMode>
          size="sm"
          value={mode}
          onChange={setMode}
          items={[
            { id: "combine", label: "合成シミュレーター", icon: <FlaskConical className="size-3.5" /> },
            { id: "inventory", label: "持っている素材", icon: <Backpack className="size-3.5" /> },
          ]}
        />
        <Button size="xs" variant="ghost" icon={<Eraser className="size-3.5" />} onClick={clear} className="ml-auto" disabled={(mode === "combine" ? sel : inv).length === 0}>クリア</Button>
      </div>
      <p className="text-xs text-fg-subtle">
        {mode === "combine" ? "素材を2つ選ぶと完成アイテムを表示します（同じ素材を2回選択可）。右クリックで1つ戻します。" : "持っている素材をクリックして追加（複数可）。作成できる完成アイテムを一覧します。右クリックで1つ減らします。"}
      </p>
      <div className="flex flex-wrap gap-2">
        {components.map((id) => {
          const n = counts.get(id) ?? 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => clickComponent(id)}
              onContextMenu={(e) => { e.preventDefault(); removeOne(id); }}
              className={cn(
                "relative rounded-lg border p-1 transition-all duration-150 focus-ring",
                n > 0 ? "border-gold/70 bg-gold/10 shadow-glow-gold" : "border-border bg-bg-elev hover:border-border-strong hover:bg-surface-2",
              )}
            >
              <ItemIcon id={id} size={36} rounded="rounded-md" />
              {n > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-gold text-[#2a1f05] text-[10px] font-bold tabular-nums flex items-center justify-center shadow">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {mode === "combine" ? (
        <div className="rounded-lg border border-border bg-bg-elev p-3 min-h-[92px] flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Slot id={sel[0]} />
            <span className="text-fg-subtle text-sm">+</span>
            <Slot id={sel[1]} />
            <span className="text-fg-subtle text-sm mx-1">=</span>
            <Slot id={result?.apiName} highlight />
          </div>
          <div className="min-w-0 flex-1">
            {result ? (
              <div className="animate-fade-in">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{result.name}</span>
                  {result.unique && <Badge color="var(--color-warning)" size="xs">ユニーク</Badge>}
                </div>
                <RichDesc desc={result.desc} vars={result.effects} className="mt-1" />
              </div>
            ) : sel.length === 2 ? (
              <span className="text-xs text-fg-subtle">この組み合わせのレシピは見つかりません</span>
            ) : (
              <span className="text-xs text-fg-subtle">素材を{2 - sel.length}つ選択してください</span>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-bg-elev p-3 min-h-[92px] flex flex-col gap-3">
          {inv.length < 2 ? (
            <span className="text-xs text-fg-subtle self-center py-4">素材を2つ以上追加すると作成可能なアイテムを表示します</span>
          ) : craftable.length === 0 ? (
            <span className="text-xs text-fg-subtle self-center py-4">作成できるアイテムがありません</span>
          ) : (
            craftable.map(([kind, list]) => (
              <div key={kind}>
                <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium mb-1.5">{KIND_LABELS[kind]} <span className="tabular-nums">({list.length})</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map(({ item, from }) => (
                    <div key={item.apiName} className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 py-1">
                      <ItemIcon item={item} size={28} rounded="rounded-md" />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium leading-tight">{item.name}</span>
                        <span className="flex items-center gap-0.5 mt-0.5">
                          <ItemIcon id={from[0]} size={12} showTooltip={false} />
                          <ItemIcon id={from[1]} size={12} showTooltip={false} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Slot({ id, highlight }: { id?: string; highlight?: boolean }) {
  return (
    <div className={cn("size-12 rounded-lg border-2 border-dashed flex items-center justify-center bg-surface", id ? "border-transparent" : highlight ? "border-gold/40" : "border-border-strong")}>
      {id ? <ItemIcon id={id} size={44} rounded="rounded-md" /> : <span className="text-fg-subtle text-lg">?</span>}
    </div>
  );
}

// ----- Item list ---------------------------------------------------------------------
function ItemList({ data }: { data: StaticData }) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = norm(query);
    return data.items
      .filter((it) => (kind === "all" || it.kind === kind) && (!q || norm(it.name).includes(q) || norm(it.apiName).includes(q) || norm(it.desc).includes(q)))
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name, "ja"));
  }, [data.items, kind, query]);
  const { visible, hasMore, remaining, showMore } = useShowMore(filtered, 120);
  const kindCounts = useMemo(() => {
    const m = new Map<KindFilter, number>();
    for (const it of data.items) m.set(it.kind, (m.get(it.kind) ?? 0) + 1);
    m.set("all", data.items.length);
    return m;
  }, [data.items]);

  return (
    <section>
      <SectionTitle right={<ResultCount shown={filtered.length} total={data.items.length} />}>アイテム一覧</SectionTitle>
      <div className="card p-3 flex flex-wrap items-center gap-2 mb-3">
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="アイテム名・効果で検索..." className="w-64" />
        <div className="flex flex-wrap items-center gap-1">
          {KIND_FILTERS.filter((k) => (kindCounts.get(k.id) ?? 0) > 0).map((k) => (
            <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label}
              <span className="text-[10px] tabular-nums opacity-70">{kindCounts.get(k.id) ?? 0}</span>
            </Chip>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<Package />} title="該当するアイテムがありません" />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            {visible.map((it) => <ItemCard key={it.apiName} item={it} />)}
          </div>
          <ShowMore hasMore={hasMore} remaining={remaining} onClick={showMore} />
        </>
      )}
    </section>
  );
}

function ItemCard({ item: it }: { item: Item }) {
  return (
    <article className="card p-3 flex gap-3 hover:border-border-strong transition-colors animate-fade-in">
      <ItemIcon item={it} size={40} rounded="rounded-md" showTooltip={false} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{it.name}</span>
          <Badge size="xs" className="text-fg-muted border-border">{KIND_LABELS[it.kind]}</Badge>
          {it.unique && <Badge color="var(--color-warning)" size="xs">ユニーク</Badge>}
          {it.composition.length > 0 && (
            <span className="ml-auto flex items-center gap-0.5">
              {it.composition.map((c, i) => <ItemIcon key={i} id={c} size={16} />)}
            </span>
          )}
        </div>
        <RichDesc desc={it.desc} vars={it.effects} className="mt-1 line-clamp-4" />
      </div>
    </article>
  );
}
