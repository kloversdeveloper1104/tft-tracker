import { useMemo, useState } from "react";
import { Hammer } from "lucide-react";
import { ItemIcon } from "@/components/tft";
import { useStaticData } from "@/stores/staticData";
import { COMPONENT_ORDER, buildRecipeMap } from "@/lib/tft";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/types";
import { OEmpty } from "./ui";

export function ItemsTab() {
  const items = useStaticData((s) => s.data?.items);
  const loading = useStaticData((s) => s.loading);
  const byId = useStaticData((s) => s.itemsById);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [shown, setShown] = useState<string | null>(null);

  const components = useMemo(() => COMPONENT_ORDER.filter((id) => byId.has(id)), [byId]);
  const recipes = useMemo(() => (items ? buildRecipeMap(items) : new Map<string, Item>()), [items]);
  const recipeFor = (a: string, b: string) => recipes.get([a, b].sort().join("|"));

  if (loading && !items) return <div className="p-3"><div className="skeleton h-64" /></div>;
  if (!items || components.length === 0) return <OEmpty icon={<Hammer />} title="アイテムデータがありません" description="メインウィンドウの設定から静的データを取得してください。" />;

  const combo = sel.length === 2 ? recipeFor(sel[0], sel[1]) : undefined;
  const shownItem = shown ? byId.get(shown) : combo;
  const cell = 26;

  const clickHeader = (id: string) => {
    setShown(null);
    setSel((s) => (s.length >= 2 ? [id] : [...s, id]));
  };

  return (
    <div className="flex flex-col gap-3 p-3 animate-fade-in">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px]" style={{ width: cell * (components.length + 1) + 2 * (components.length + 2) }}>
          <thead>
            <tr>
              <th />
              {components.map((id, c) => (
                <th key={id} className="p-0">
                  <button
                    type="button"
                    onClick={() => clickHeader(id)}
                    onMouseEnter={() => setHover({ r: -1, c })}
                    onMouseLeave={() => setHover(null)}
                    className={cn("no-drag rounded transition-transform", sel.includes(id) && "ring-2 ring-gold", hover?.c === c && "scale-110")}
                    title={byId.get(id)?.name}
                  >
                    <ItemIcon id={id} size={cell} showTooltip={false} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {components.map((rid, r) => (
              <tr key={rid}>
                <td className="p-0">
                  <button
                    type="button"
                    onClick={() => clickHeader(rid)}
                    onMouseEnter={() => setHover({ r, c: -1 })}
                    onMouseLeave={() => setHover(null)}
                    className={cn("no-drag rounded transition-transform", sel.includes(rid) && "ring-2 ring-gold", hover?.r === r && "scale-110")}
                    title={byId.get(rid)?.name}
                  >
                    <ItemIcon id={rid} size={cell} showTooltip={false} />
                  </button>
                </td>
                {components.map((cid, c) => {
                  const it = recipeFor(rid, cid);
                  const hl = hover && (hover.r === r || hover.c === c);
                  const exact = hover && hover.r === r && hover.c === c;
                  return (
                    <td key={cid} className="p-0">
                      <button
                        type="button"
                        onMouseEnter={() => setHover({ r, c })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => { if (it) { setShown(it.apiName); setSel([rid, cid]); } }}
                        className={cn(
                          "no-drag block rounded transition-all duration-100",
                          hl && !exact && "brightness-125",
                          exact && "scale-110 ring-1 ring-white/60",
                          !hl && "opacity-80",
                        )}
                        style={{ width: cell, height: cell }}
                        title={it?.name}
                      >
                        {it ? <ItemIcon item={it} size={cell} showTooltip={false} /> : <div className="size-full rounded bg-white/5" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg bg-black/25 border border-white/10 p-2 min-h-[64px] flex items-center gap-2.5">
        <div className="flex items-center gap-1">
          {[0, 1].map((i) => {
            const id = sel[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => { setSel((s) => s.filter((_, j) => j !== i)); setShown(null); }}
                className="no-drag size-7 rounded border border-dashed border-white/20 flex items-center justify-center hover:border-accent"
                title={id ? "解除" : "素材を選択"}
              >
                {id ? <ItemIcon id={id} size={24} showTooltip={false} /> : <span className="text-[10px] text-fg-subtle">{i + 1}</span>}
              </button>
            );
          })}
        </div>
        <span className="text-fg-subtle text-[11px]">=</span>
        {shownItem ? (
          <div className="flex items-center gap-2 min-w-0 animate-fade-in">
            <ItemIcon item={shownItem} size={30} showTooltip={false} />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold truncate">{shownItem.name}</div>
              <div className="text-[10px] text-fg-muted flex items-center gap-1">
                {shownItem.composition.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1">{i > 0 && "+"}<ItemIcon id={c} size={12} showTooltip={false} /> {byId.get(c)?.name}</span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-fg-subtle">{sel.length === 2 ? "該当するレシピがありません" : "素材を2つ選ぶか、グリッドのセルをクリック"}</span>
        )}
      </div>
    </div>
  );
}
