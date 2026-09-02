import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChevronDown, ExternalLink, Layers } from "lucide-react";
import { cn, fmtPct } from "@/lib/utils";
import { TRAIT_STYLE_COLORS, TRAIT_STYLE_LABELS } from "@/data/odds";
import { Button, EmptyState } from "@/components/ui";
import { ChampionIcon, ItemIcon, TraitIcon } from "@/components/tft";
import { useLookup } from "@/stores/staticData";
import type { CompStat } from "@/lib/types";
import { Chips, MiniBar, PlacementText, Pct, SectionLabel } from "./shared";
import { base64UrlEncode, compToPlannerParam, starsFromAvg } from "./lib";

type CompSort = "games" | "avgPlacement" | "top4Rate" | "winRate";

const SORTS: { value: CompSort; label: string }[] = [
  { value: "games", label: "試合数" },
  { value: "avgPlacement", label: "平均順位" },
  { value: "top4Rate", label: "Top4率" },
  { value: "winRate", label: "1位率" },
];

export function compDisplayName(comp: CompStat, traitName: (id: string) => string): string {
  const core = [...comp.coreTraits].sort((a, b) => b.style - a.style || b.numUnits - a.numUnits).slice(0, 3);
  if (core.length === 0) return `構成 ${comp.key.slice(0, 6)}`;
  return core.map((t) => `${t.numUnits} ${traitName(t.name)}`).join(" · ");
}

export function CompsTab({ comps, minGames }: { comps: CompStat[]; minGames: number }) {
  const [sort, setSort] = useState<CompSort>("games");
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...comps];
    switch (sort) {
      case "avgPlacement": arr.sort((a, b) => a.avgPlacement - b.avgPlacement || b.games - a.games); break;
      case "top4Rate": arr.sort((a, b) => b.top4Rate - a.top4Rate || b.games - a.games); break;
      case "winRate": arr.sort((a, b) => b.winRate - a.winRate || b.games - a.games); break;
      default: arr.sort((a, b) => b.games - a.games);
    }
    return arr;
  }, [comps, sort]);

  const maxPlayRate = useMemo(() => Math.max(0, ...comps.map((c) => c.playRate)), [comps]);

  if (comps.length === 0) {
    return (
      <EmptyState
        icon={<Layers />}
        title="構成データがありません"
        description={`条件に合う構成が見つかりません。最低試合数（現在 ${minGames}）を下げるか、期間を広げてみてください。`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-fg-muted">並び替え</span>
        <Chips items={SORTS} value={sort} onChange={setSort} />
        <span className="ml-auto text-xs text-fg-subtle tabular-nums">{comps.length} 構成</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {sorted.map((comp, i) => (
          <CompCard
            key={comp.key}
            comp={comp}
            rank={i + 1}
            maxPlayRate={maxPlayRate}
            expanded={expanded === comp.key}
            onToggle={() => setExpanded((e) => (e === comp.key ? null : comp.key))}
          />
        ))}
      </div>
    </div>
  );
}

function CompCard({ comp, rank, maxPlayRate, expanded, onToggle }: {
  comp: CompStat; rank: number; maxPlayRate: number; expanded: boolean; onToggle: () => void;
}) {
  const lookup = useLookup();
  const navigate = useNavigate();
  const traitName = (id: string) => lookup.trait(id)?.name ?? id.replace(/^TFT\d+_/, "");
  const name = compDisplayName(comp, traitName);

  const units = useMemo(() => {
    const byCost = (id: string) => lookup.champion(id)?.cost ?? 0;
    return [...comp.units].sort((a, b) => b.frequency - a.frequency || byCost(b.characterId) - byCost(a.characterId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.units, lookup.data]);

  const coreTraits = useMemo(
    () => [...comp.coreTraits].sort((a, b) => b.style - a.style || b.numUnits - a.numUnits),
    [comp.coreTraits],
  );

  const openInPlanner = (e: MouseEvent) => {
    e.stopPropagation();
    const payload = compToPlannerParam(comp, name);
    navigate({ pathname: "/planner", search: `?comp=${base64UrlEncode(payload)}` });
  };

  const previewUnits = units.slice(0, 9);

  return (
    <article
      className={cn(
        "card transition-colors cursor-pointer group",
        expanded ? "border-border-strong" : "hover:border-border-strong",
      )}
      onClick={onToggle}
    >
      <div className="px-4 py-3 flex flex-col gap-3">
        {/* header: rank, traits, name */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="size-7 rounded-md bg-surface-2 border border-border text-xs font-bold tabular-nums text-fg-muted flex items-center justify-center shrink-0">
            {rank}
          </span>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {coreTraits.map((t) => (
              <TraitIcon key={t.name} id={t.name} style={t.style} count={t.numUnits} size={22} />
            ))}
          </div>
          <span className="text-sm font-semibold text-fg truncate ml-1">{name}</span>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Button size="xs" variant="outline" icon={<ExternalLink className="size-3.5" />} onClick={openInPlanner}>
              プランナーで開く
            </Button>
            <ChevronDown className={cn("size-4 text-fg-subtle transition-transform", expanded && "rotate-180")} />
          </div>
        </div>

        {/* units + stats */}
        <div className="flex items-start gap-5 flex-wrap xl:flex-nowrap">
          <div className="flex items-start gap-2.5 flex-wrap flex-1 min-w-0 pt-2">
            {previewUnits.map((u) => (
              <div key={u.characterId} className="flex flex-col items-center gap-1.5 w-[50px]">
                <ChampionIcon
                  id={u.characterId}
                  size={44}
                  stars={starsFromAvg(u.avgStars)}
                  items={u.topItems.slice(0, 3)}
                  dim={u.frequency < 0.5}
                />
                <span className={cn("text-[10px] tabular-nums leading-none mt-1", u.frequency < 0.5 ? "text-fg-subtle" : "text-fg-muted")}>
                  {Math.round(u.frequency * 100)}%
                </span>
              </div>
            ))}
          </div>
          <dl className="grid grid-cols-6 gap-x-5 gap-y-1 shrink-0 text-right">
            <StatCell label="平均順位"><PlacementText value={comp.avgPlacement} bold className="text-base" /></StatCell>
            <StatCell label="Top4率"><Pct value={comp.top4Rate} className="text-base font-semibold text-fg" /></StatCell>
            <StatCell label="1位率"><Pct value={comp.winRate} className="text-base font-semibold text-fg" /></StatCell>
            <StatCell label="採用率">
              <span className="text-base font-semibold text-fg tabular-nums">{fmtPct(comp.playRate)}</span>
              <MiniBar value={comp.playRate} max={maxPlayRate} className="mt-1 w-16 ml-auto" />
            </StatCell>
            <StatCell label="平均Lv"><span className="text-base font-semibold text-fg tabular-nums">{comp.avgLevel.toFixed(1)}</span></StatCell>
            <StatCell label="試合数"><span className="text-base font-semibold text-fg tabular-nums">{comp.games.toLocaleString()}</span></StatCell>
          </dl>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 animate-fade-in cursor-default" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-2">
            <SectionLabel>全ユニット ({units.length})</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              {units.map((u) => {
                const c = lookup.champion(u.characterId);
                return (
                  <div key={u.characterId} className={cn("flex items-center gap-3 py-1.5 border-b border-border/60", u.frequency < 0.5 && "opacity-60")}>
                    <ChampionIcon id={u.characterId} size={32} stars={starsFromAvg(u.avgStars)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-fg truncate">{c?.name ?? u.characterId}</div>
                      <div className="text-[11px] text-fg-subtle tabular-nums">採用 {Math.round(u.frequency * 100)}% · 平均 ★{u.avgStars.toFixed(1)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {u.topItems.slice(0, 3).map((it, i) => <ItemIcon key={`${it}-${i}`} id={it} size={22} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <SectionLabel>コア特性</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {coreTraits.map((t) => {
                const color = TRAIT_STYLE_COLORS[t.style] ?? TRAIT_STYLE_COLORS[0];
                return (
                  <div key={t.name} className="flex items-center gap-2.5 rounded-md bg-surface-2 border border-border px-2.5 py-1.5">
                    <TraitIcon id={t.name} style={t.style} size={22} />
                    <span className="text-sm text-fg flex-1 truncate">{traitName(t.name)}</span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color }}>{t.numUnits}</span>
                    <span className="text-[10px] text-fg-subtle w-14 text-right">{TRAIT_STYLE_LABELS[t.style] ?? ""}</span>
                  </div>
                );
              })}
              {coreTraits.length === 0 && <span className="text-xs text-fg-subtle">コア特性なし</span>}
            </div>
            <p className="text-[11px] text-fg-subtle mt-2 leading-relaxed">
              順位分布は集計データに含まれていないため表示できません。平均順位・Top4率・1位率を参照してください。
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function StatCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-end min-w-14">
      <dt className="text-[10px] uppercase tracking-wider text-fg-subtle whitespace-nowrap">{label}</dt>
      <dd className="leading-tight">{children}</dd>
    </div>
  );
}
