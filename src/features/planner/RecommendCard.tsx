import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, Database, Download, RefreshCw, Sparkles } from "lucide-react";
import { cn, fmtPct } from "@/lib/utils";
import { computeBoardTraits } from "@/lib/tft";
import { compName, coreUnits, loadoutUnits, topRecommendations, type Recommendation } from "@/lib/recommend";
import { useStaticData } from "@/stores/staticData";
import { toast } from "@/stores/toast";
import { Button, EmptyState, IconButton, Modal, ProgressBar, Skeleton } from "@/components/ui";
import { ChampionIcon, TraitIcon } from "@/components/tft";
import { PlacementText } from "@/features/stats/shared";
import { starsFromAvg } from "@/features/stats/lib";
import type { PlannerComp, PlannerUnit } from "@/lib/types";
import { firstEmptyHex } from "./logic";
import { useLadderComps } from "./useLadderComps";

/**
 * 「おすすめの構成(上位帯データ)」: ranks ladder comp clusters against the units on the board and
 * offers to load one of them onto the active comp.
 */
export function RecommendCard({ comp, setNumber, onLoad }: {
  comp: PlannerComp;
  setNumber: number;
  /** Replace the active comp's units (already auto-placed) — `name` is the comp's display name. */
  onLoad: (units: PlannerUnit[], name: string) => void;
}) {
  const navigate = useNavigate();
  const championsById = useStaticData((s) => s.championsById);
  const traitsByName = useStaticData((s) => s.traitsByName);
  const traitsById = useStaticData((s) => s.traitsById);
  const itemsById = useStaticData((s) => s.itemsById);
  const ladder = useLadderComps(setNumber);
  const [pending, setPending] = useState<Recommendation | null>(null);

  const ownedIds = useMemo(() => comp.units.map((u) => u.championId), [comp.units]);
  const activeTraitIds = useMemo(
    () => computeBoardTraits(comp.units, championsById, traitsByName, traitsById, itemsById, comp.emblems)
      .filter((t) => t.style > 0)
      .map((t) => t.trait.apiName),
    [comp.units, comp.emblems, championsById, traitsByName, traitsById, itemsById],
  );
  const recs = useMemo(
    () => topRecommendations({ championIds: ownedIds, traitApiNames: activeTraitIds }, ladder.comps, 3),
    [ownedIds, activeTraitIds, ladder.comps],
  );

  const traitName = (id: string) => traitsById.get(id)?.name ?? id.replace(/^TFT\d+_/, "");
  const nameOf = (rec: Recommendation) => compName(rec.comp, traitName);

  const confirmLoad = () => {
    if (!pending) return;
    const placed: PlannerUnit[] = [];
    for (const u of loadoutUnits(pending.comp)) {
      const hex = firstEmptyHex(placed, championsById.get(u.championId));
      if (hex === null) break;
      placed.push({ hex, championId: u.championId, stars: u.stars, items: u.items });
    }
    const name = nameOf(pending);
    onLoad(placed, name);
    setPending(null);
    toast.success("構成を読み込みました", `${name} · ${placed.length} ユニット`);
  };

  return (
    <div className="card flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2">
          <Sparkles className="size-4 text-gold" />
          おすすめの構成
          <span className="text-xs font-normal text-fg-subtle">(上位帯データ)</span>
        </h3>
        {ladder.setNumber !== null && ladder.games > 0 && (
          <span className="text-xs text-fg-subtle tabular-nums">Set {ladder.setNumber} · {ladder.games.toLocaleString()} 件</span>
        )}
        <div className="ml-auto">
          <IconButton size="xs" title="再読み込み" onClick={ladder.refresh} disabled={ladder.loading}>
            <RefreshCw className={cn("size-3.5", ladder.loading && "animate-spin")} />
          </IconButton>
        </div>
      </div>

      {ladder.loading && ladder.comps.length === 0 ? (
        <div className="p-3 flex flex-col gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[112px] rounded-lg" />)}
        </div>
      ) : ladder.error ? (
        <EmptyState
          className="py-8"
          icon={<AlertTriangle />}
          title="上位帯データを読み込めませんでした"
          description={ladder.error}
          action={<Button size="sm" variant="outline" icon={<RefreshCw className="size-3.5" />} onClick={ladder.refresh}>再試行</Button>}
        />
      ) : ladder.empty || recs.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={<Database />}
          title="上位帯データがありません"
          description="メタ統計の「データ収集」でチャレンジャー等の上位帯の試合を集めると、現在のボードから目指せる構成を提案します。"
          action={<Button size="sm" variant="primary" icon={<Database className="size-3.5" />} onClick={() => navigate("/collector")}>データ収集へ</Button>}
        />
      ) : (
        <div className="p-3 flex flex-col gap-2.5">
          {comp.units.length === 0 && (
            <p className="text-[11px] text-fg-subtle px-1">ボードにユニットを配置すると一致度が計算されます。現在は上位帯で強い構成を表示しています。</p>
          )}
          {recs.map((rec, i) => (
            <RecommendationRow key={rec.comp.key} rec={rec} rank={i + 1} name={nameOf(rec)} ownedIds={ownedIds} onPick={() => setPending(rec)} />
          ))}
        </div>
      )}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="構成を読み込む"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>キャンセル</Button>
            <Button variant="primary" icon={<Download className="size-4" />} onClick={confirmLoad}>読み込む</Button>
          </>
        }
      >
        {pending && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-fg-muted">
              「{comp.name || "(無題)"}」のユニットを「{nameOf(pending)}」の主要ユニット（採用率 50% 以上・最大 9 体）に置き換えます。星とアイテムは上位帯の平均から設定されます。
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              {loadoutUnits(pending.comp).map((u) => (
                <ChampionIcon key={u.championId} id={u.championId} size={40} stars={u.stars} items={u.items} />
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RecommendationRow({ rec, rank, name, ownedIds, onPick }: {
  rec: Recommendation; rank: number; name: string; ownedIds: string[]; onPick: () => void;
}) {
  const owned = useMemo(() => new Set(ownedIds.map((id) => id.toLowerCase())), [ownedIds]);
  const units = useMemo(() => coreUnits(rec.comp), [rec.comp]);
  const coreTraits = useMemo(
    () => [...rec.comp.coreTraits].sort((a, b) => b.style - a.style || b.numUnits - a.numUnits),
    [rec.comp.coreTraits],
  );
  const overlapPct = Math.round(rec.overlap * 100);

  return (
    <article className="rounded-lg border border-border bg-surface-2/40 p-3 flex flex-col gap-2.5 hover:border-border-strong transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="size-6 rounded-md bg-surface-2 border border-border text-[11px] font-bold tabular-nums text-fg-muted flex items-center justify-center shrink-0">
          {rank}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {coreTraits.slice(0, 4).map((t) => <TraitIcon key={t.name} id={t.name} style={t.style} count={t.numUnits} size={20} />)}
        </div>
        <span className="text-sm font-semibold text-fg truncate">{name}</span>
        <dl className="ml-auto flex items-center gap-4 shrink-0">
          <StatCell label="平均順位"><PlacementText value={rec.comp.avgPlacement} bold /></StatCell>
          <StatCell label="Top4率"><span className="tabular-nums font-semibold text-fg">{fmtPct(rec.comp.top4Rate, 0)}</span></StatCell>
          <StatCell label="採用率"><span className="tabular-nums font-semibold text-fg">{fmtPct(rec.comp.playRate)}</span></StatCell>
        </dl>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap pt-2 pl-0.5">
        {units.map((u) => {
          const has = owned.has(u.characterId.toLowerCase());
          return (
            <div key={u.characterId} className="relative shrink-0">
              <ChampionIcon id={u.characterId} size={36} stars={starsFromAvg(u.avgStars)} className={cn(!has && "opacity-40")} />
              {!has && (
                <span
                  aria-label="不足"
                  className="absolute -bottom-1 -right-1 size-4 rounded-full bg-gold text-[#2a1f05] text-[11px] font-bold leading-none flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
                >
                  +
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <ProgressBar value={rec.overlap} color="var(--color-gold)" className="flex-1" />
        <span className="text-xs tabular-nums font-semibold text-gold w-12 text-right">一致 {overlapPct}%</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-fg-subtle tabular-nums truncate">{rec.reason}</p>
        <Button size="xs" variant="outline" icon={<Download className="size-3.5" />} onClick={onPick} className="shrink-0">
          この構成を読み込む
        </Button>
      </div>
    </article>
  );
}

function StatCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-end min-w-12">
      <dt className="text-[10px] uppercase tracking-wider text-fg-subtle whitespace-nowrap">{label}</dt>
      <dd className="text-sm leading-tight">{children}</dd>
    </div>
  );
}
