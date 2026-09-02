import { useMemo, useState } from "react";
import { Check, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { cn, avgPlacementColor, fmtPlacement } from "@/lib/utils";
import { compName, coreUnits, topRecommendations, type Recommendation } from "@/lib/recommend";
import { useStaticData } from "@/stores/staticData";
import { ChampionIcon, ItemIcon, TraitIcon } from "@/components/tft";
import { useLadderComps } from "@/features/planner/useLadderComps";
import { OBtn } from "./ui";

const MAX_MISSING_ICONS = 5;

/** Overlay section 「進むべき構成」: compact top-3 pivot targets for the units the player owns. */
export function RecommendPanel({ ownedIds, traitApiNames, setNumber }: {
  ownedIds: string[];
  traitApiNames: string[];
  setNumber?: number;
}) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const traitsById = useStaticData((s) => s.traitsById);
  const ladder = useLadderComps(setNumber);

  const recs = useMemo(
    () => topRecommendations({ championIds: ownedIds, traitApiNames }, ladder.comps, 3),
    [ownedIds, traitApiNames, ladder.comps],
  );
  const traitName = (id: string) => traitsById.get(id)?.name ?? id.replace(/^TFT\d+_/, "");

  return (
    <section className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="no-drag w-full flex items-center justify-between rounded-md focus-ring"
        aria-expanded={open}
      >
        <h4 className="text-[10px] uppercase tracking-wider font-semibold text-fg-subtle flex items-center gap-1">
          <Sparkles className="size-3 text-gold" />
          進むべき構成
        </h4>
        <ChevronDown className={cn("size-3.5 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        ladder.loading && ladder.comps.length === 0 ? (
          <div className="flex flex-col gap-1">{[0, 1].map((i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : ladder.error ? (
          <div className="flex items-center gap-2 text-[11px] text-danger">
            <span className="flex-1 truncate" title={ladder.error}>上位帯データを読み込めませんでした</span>
            <OBtn title="再試行" onClick={ladder.refresh}><RefreshCw /></OBtn>
          </div>
        ) : ladder.empty || recs.length === 0 ? (
          <p className="text-[11px] text-fg-subtle leading-relaxed">メタ統計 → データ収集で上位帯データを集めると表示されます</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {recs.map((rec) => (
              <RecommendRow
                key={rec.comp.key}
                rec={rec}
                name={compName(rec.comp, traitName)}
                ownedIds={ownedIds}
                expanded={expanded === rec.comp.key}
                onToggle={() => setExpanded((e) => (e === rec.comp.key ? null : rec.comp.key))}
              />
            ))}
          </ul>
        )
      )}
    </section>
  );
}

function RecommendRow({ rec, name, ownedIds, expanded, onToggle }: {
  rec: Recommendation; name: string; ownedIds: string[]; expanded: boolean; onToggle: () => void;
}) {
  const championsById = useStaticData((s) => s.championsById);
  const owned = useMemo(() => new Set(ownedIds.map((id) => id.toLowerCase())), [ownedIds]);
  const units = useMemo(() => coreUnits(rec.comp), [rec.comp]);
  const coreTraits = useMemo(
    () => [...rec.comp.coreTraits].sort((a, b) => b.style - a.style || b.numUnits - a.numUnits).slice(0, 3),
    [rec.comp.coreTraits],
  );
  const champName = (id: string) => championsById.get(id)?.name ?? championsById.get(id.toLowerCase())?.name ?? id;
  const missing = rec.missingUnits;
  const extra = missing.length - MAX_MISSING_ICONS;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn("no-drag w-full flex flex-col gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-white/5", expanded && "bg-white/5")}
      >
        <div className="flex items-center gap-1.5 w-full min-w-0">
          <span className="flex items-center gap-0.5 shrink-0">
            {coreTraits.map((t) => <TraitIcon key={t.name} id={t.name} style={t.style} size={16} showTooltip={false} />)}
          </span>
          <span className="text-[12px] font-medium truncate flex-1">{name}</span>
          <span className="text-[11px] tabular-nums font-semibold text-gold shrink-0">{Math.round(rec.overlap * 100)}%</span>
          <span className="text-[11px] tabular-nums font-semibold shrink-0" style={{ color: avgPlacementColor(rec.comp.avgPlacement) }} title="平均順位">
            {fmtPlacement(rec.comp.avgPlacement, 1)}
          </span>
        </div>
        <div className="flex items-center gap-1 pl-0.5 min-h-6">
          {missing.length === 0 ? (
            <span className="text-[10px] text-success">主要ユニットが揃っています</span>
          ) : (
            <>
              <span className="text-[10px] text-fg-subtle mr-0.5">不足</span>
              {missing.slice(0, MAX_MISSING_ICONS).map((u) => (
                <span key={u.characterId} title={champName(u.characterId)}>
                  <ChampionIcon id={u.characterId} size={24} showTooltip={false} />
                </span>
              ))}
              {extra > 0 && <span className="text-[10px] tabular-nums text-fg-muted ml-0.5">+{extra}</span>}
            </>
          )}
        </div>
      </button>

      {expanded && (
        <ul className="mt-0.5 mb-1 ml-2 pl-2 border-l border-white/10 flex flex-col gap-0.5 animate-fade-in">
          {units.map((u) => {
            const has = owned.has(u.characterId.toLowerCase());
            return (
              <li key={u.characterId} className="flex items-center gap-1.5 text-[11px] min-w-0 py-0.5">
                {has ? (
                  <Check className="size-3 text-success shrink-0" strokeWidth={3} />
                ) : (
                  <span className="size-3 rounded-sm border border-white/20 shrink-0" />
                )}
                <ChampionIcon id={u.characterId} size={20} showTooltip={false} className={cn(has && "opacity-60")} />
                <span className={cn("truncate flex-1", has ? "text-fg-muted" : "text-fg")}>{champName(u.characterId)}</span>
                <span className="text-[10px] tabular-nums text-fg-subtle shrink-0">{Math.round(u.frequency * 100)}%</span>
                {!has && u.topItems.length > 0 && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    {u.topItems.slice(0, 3).map((it, i) => <ItemIcon key={`${it}-${i}`} id={it} size={16} showTooltip={false} />)}
                  </span>
                )}
              </li>
            );
          })}
          <li className="text-[10px] text-fg-subtle tabular-nums pt-0.5">{rec.reason}</li>
        </ul>
      )}
    </li>
  );
}
