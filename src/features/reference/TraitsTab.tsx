import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Hexagon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRAIT_STYLE_COLORS, TRAIT_STYLE_LABELS } from "@/data/odds";
import { useStaticData } from "@/stores/staticData";
import { Badge, EmptyState, SearchInput } from "@/components/ui";
import { ChampionIcon, RichDesc, TraitIcon, traitRows } from "@/components/tft";
import type { Champion, StaticData, Trait, TraitEffect } from "@/lib/types";
import { Chip, ResultCount, fmtNum, norm } from "./primitives";
import { championTraits } from "./ChampionsTab";

export function isUniqueTrait(t: Trait): boolean {
  return t.effects.length === 1 && t.effects[0].minUnits === 1;
}

export function TraitsTab({ data }: { data: StaticData }) {
  const traitsById = useStaticData((s) => s.traitsById);
  const traitsByName = useStaticData((s) => s.traitsByName);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showUnique, setShowUnique] = useState(true);

  const championsByTrait = useMemo(() => {
    const m = new Map<string, Champion[]>();
    for (const c of data.champions) {
      for (const t of championTraits(c, traitsById, traitsByName)) {
        const arr = m.get(t.apiName);
        if (arr) arr.push(c);
        else m.set(t.apiName, [c]);
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
    return m;
  }, [data.champions, traitsById, traitsByName]);

  const list = useMemo(() => {
    const q = norm(query);
    return data.traits
      .filter((t) => (showUnique || !isUniqueTrait(t)) && (!q || norm(t.name).includes(q) || norm(t.apiName).includes(q)))
      .sort((a, b) => Number(isUniqueTrait(a)) - Number(isUniqueTrait(b)) || a.name.localeCompare(b.name, "ja"));
  }, [data.traits, query, showUnique]);

  return (
    <div className="flex flex-col gap-3">
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="特性を検索..." className="w-64" />
        <Chip active={showUnique} onClick={() => setShowUnique((v) => !v)}><Sparkles className="size-3" />ユニーク特性を表示</Chip>
        <ResultCount shown={list.length} total={data.traits.length} unit="種" />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Hexagon />} title="該当する特性がありません" />
      ) : (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
          {list.map((t) => (
            <TraitCard
              key={t.apiName}
              trait={t}
              champions={championsByTrait.get(t.apiName) ?? []}
              onSelectChampion={(id) => navigate(`/reference/champions?select=${encodeURIComponent(id)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TraitCard({ trait: t, champions, onSelectChampion }: { trait: Trait; champions: Champion[]; onSelectChampion: (id: string) => void }) {
  const effects = useMemo(() => [...t.effects].sort((a, b) => a.minUnits - b.minUnits), [t]);
  const unique = isUniqueTrait(t);
  const maxStyle = effects.reduce((m, e) => Math.max(m, e.style), 0);
  const [active, setActive] = useState(0);
  const eff: TraitEffect | undefined = effects[active] ?? effects[0];
  const vars = useMemo(() => {
    const v: Record<string, number | null> = { ...(eff?.variables ?? {}) };
    v["MinUnits"] = eff?.minUnits ?? null;
    return v;
  }, [eff]);
  const varTable = useMemo(() => {
    if (effects.length < 2) return [];
    const names = new Set<string>();
    for (const e of effects) for (const k of Object.keys(e.variables)) names.add(k);
    const rows: { name: string; values: (number | null)[] }[] = [];
    for (const n of names) {
      const values = effects.map((e) => e.variables[n] ?? null);
      const distinct = new Set(values.map((x) => (x === null ? "null" : String(x))));
      if (distinct.size > 1) rows.push({ name: n, values });
    }
    return rows;
  }, [effects]);

  return (
    <article className="card p-4 flex flex-col gap-3 animate-fade-in">
      <header className="flex items-center gap-3">
        <TraitIcon trait={t} size={40} style={maxStyle || (unique ? 5 : 0)} showTooltip={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold truncate">{t.name}</h3>
            {unique && <Badge color={TRAIT_STYLE_COLORS[5]} size="xs">ユニーク</Badge>}
          </div>
          <div className="text-[11px] text-fg-subtle tabular-nums">{champions.length} ユニット</div>
        </div>
        <div className="flex items-center gap-1">
          {effects.map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              title={`${e.minUnits}体: ${TRAIT_STYLE_LABELS[e.style] ?? ""}`}
              className={cn("h-7 min-w-8 px-2 rounded-md text-xs font-bold tabular-nums border transition-all focus-ring", i === active ? "scale-105" : "opacity-70 hover:opacity-100")}
              style={{
                color: TRAIT_STYLE_COLORS[e.style],
                borderColor: `color-mix(in srgb, ${TRAIT_STYLE_COLORS[e.style]} ${i === active ? 70 : 35}%, transparent)`,
                background: `color-mix(in srgb, ${TRAIT_STYLE_COLORS[e.style]} ${i === active ? 22 : 8}%, transparent)`,
              }}
            >
              {e.minUnits}{e.maxUnits > e.minUnits && e.maxUnits < 25 ? `–${e.maxUnits}` : ""}
            </button>
          ))}
        </div>
      </header>

      <RichDesc desc={t.desc} vars={vars} rows={traitRows(t)} />

      {varTable.length > 0 && (
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-[11px] tabular-nums">
            <thead className="bg-surface-2 text-fg-subtle">
              <tr>
                <th className="text-left px-2 py-1 font-medium">変数</th>
                {effects.map((e, i) => (
                  <th key={i} className="px-2 py-1 font-semibold text-right" style={{ color: TRAIT_STYLE_COLORS[e.style] }}>{e.minUnits}体</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {varTable.map((r) => (
                <tr key={r.name} className="border-t border-border/60">
                  <td className="px-2 py-1 text-fg-muted truncate max-w-[160px]" title={r.name}>{r.name}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className={cn("px-2 py-1 text-right", i === active ? "text-fg font-semibold" : "text-fg-muted")}>{fmtNum(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
        {champions.length === 0 && <span className="text-xs text-fg-subtle pt-2">このセットに該当ユニットはありません</span>}
        {champions.map((c) => (
          <div key={c.apiName} className="pt-2.5">
            <ChampionIcon champion={c} size={36} onClick={() => onSelectChampion(c.apiName)} />
          </div>
        ))}
      </div>
    </article>
  );
}
