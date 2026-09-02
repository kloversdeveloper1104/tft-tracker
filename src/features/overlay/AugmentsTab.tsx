// Overlay: quick augment lookup during an in-game augment choice (search + user tier + comp synergy).
import { useEffect, useMemo, useRef, useState } from "react";
import { LazyStore } from "@tauri-apps/plugin-store";
import { listen } from "@tauri-apps/api/event";
import { Gem, Search, Sparkles, X } from "lucide-react";
import { AugmentIcon, RichDesc, TierBadge, TierPicker } from "@/components/tft";
import { useStaticData } from "@/stores/staticData";
import { computeBoardTraits } from "@/lib/tft";
import { cn } from "@/lib/utils";
import { loadEnglishAugmentNames, normFull, plainDesc, tierRank, useAugmentTiers, TIER_COLORS, type Tier } from "@/lib/augmentTiers";
import type { Augment, PlannerComp } from "@/lib/types";
import { OEmpty, OSection } from "./ui";

const plannerStore = new LazyStore("planner.json");
const RARITY_COLOR: Record<number, string> = { 0: "var(--color-fg-subtle)", 1: "#c0cad9", 2: "#f0c250", 3: "#a8f5ff" };
const RARITY_LABEL: Record<number, string> = { 0: "不明", 1: "シルバー", 2: "ゴールド", 3: "プリズム" };
const MAX_RESULTS = 8;

interface SearchRecord { a: Augment; name: string; en: string; desc: string }

export function AugmentsTab() {
  const data = useStaticData((s) => s.data);
  const loading = useStaticData((s) => s.loading);
  const championsById = useStaticData((s) => s.championsById);
  const traitsByName = useStaticData((s) => s.traitsByName);
  const traitsById = useStaticData((s) => s.traitsById);
  const itemsById = useStaticData((s) => s.itemsById);
  const ratings = useAugmentTiers((s) => s.data.ratings);
  const loadTiers = useAugmentTiers((s) => s.load);
  const rate = useAugmentTiers((s) => s.rate);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [comp, setComp] = useState<PlannerComp | null>(null);
  const [enNames, setEnNames] = useState<Map<string, string> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadTiers(); }, [loadTiers]);

  // English names (lazy, module-cached in augmentTiers.ts)
  useEffect(() => {
    if (!data) return;
    let active = true;
    loadEnglishAugmentNames(data.setNumber).then((m) => { if (active) setEnNames(m); });
    return () => { active = false; };
  }, [data]);

  // Active comp from the planner (same source as CompTab)
  useEffect(() => {
    let active = true;
    plannerStore.get<PlannerComp | null>("activeComp").then((c) => { if (active) setComp(c ?? null); }).catch(() => {});
    const un = listen<{ comp: PlannerComp | null }>("planner-updated", (e) => setComp(e.payload?.comp ?? null));
    return () => { active = false; un.then((u) => u()).catch(() => {}); };
  }, []);

  // "/" focuses the search (only while this tab is mounted)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const compTraits = useMemo(() => {
    if (!comp || comp.units.length === 0) return new Set<string>();
    return new Set(computeBoardTraits(comp.units, championsById, traitsByName, traitsById, itemsById, comp.emblems).map((t) => t.trait.apiName));
  }, [comp, championsById, traitsByName, traitsById, itemsById]);

  const compChampionNames = useMemo(() => {
    if (!comp) return [] as string[];
    const names = new Set<string>();
    for (const u of comp.units) {
      const c = championsById.get(u.championId);
      if (c?.name) names.add(c.name);
    }
    return [...names];
  }, [comp, championsById]);

  const records = useMemo<SearchRecord[]>(() => {
    if (!data) return [];
    return data.augments.map((a) => ({
      a,
      name: normFull(a.name),
      en: normFull(enNames?.get(a.apiName) ?? ""),
      desc: normFull(plainDesc(a.desc)),
    }));
  }, [data, enNames]);

  const q = normFull(query);
  const results = useMemo(() => {
    if (!q) return [];
    const scored: { r: SearchRecord; score: number }[] = [];
    for (const r of records) {
      let score = 0;
      if (r.name.startsWith(q)) score = 5;
      else if (r.name.includes(q)) score = 4;
      else if (r.en && r.en.startsWith(q)) score = 3;
      else if (r.en && r.en.includes(q)) score = 2;
      else if (q.length >= 2 && r.desc.includes(q)) score = 1;
      if (score) scored.push({ r, score });
    }
    scored.sort((x, y) => y.score - x.score || tierRank(ratings[x.r.a.apiName]?.tier) - tierRank(ratings[y.r.a.apiName]?.tier) || y.r.a.tier - x.r.a.tier || x.r.a.name.localeCompare(y.r.a.name, "ja"));
    return scored.slice(0, MAX_RESULTS).map((s) => s.r.a);
  }, [q, records, ratings]);

  const topRated = useMemo(() => {
    if (!data) return [] as Augment[];
    return data.augments
      .filter((a) => { const t = ratings[a.apiName]?.tier; return t === "S" || t === "A"; })
      .sort((a, b) => tierRank(ratings[a.apiName]?.tier) - tierRank(ratings[b.apiName]?.tier) || b.tier - a.tier || a.name.localeCompare(b.name, "ja"))
      .slice(0, 12);
  }, [data, ratings]);

  const synergy = (a: Augment): { trait: boolean; unit: boolean } => {
    const trait = a.associatedTraits.some((t) => compTraits.has(t));
    const unit = compChampionNames.length > 0 && compChampionNames.some((n) => a.name.includes(n) || a.desc.includes(n));
    return { trait, unit };
  };

  if (loading && !data) return <div className="flex flex-col gap-2 p-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-9" />)}</div>;
  if (!data || data.augments.length === 0) {
    return <OEmpty icon={<Gem />} title="オーグメントデータがありません" description="メインウィンドウの設定から静的データを取得してください。" />;
  }

  const renderRow = (a: Augment) => {
    const tier = ratings[a.apiName]?.tier ?? null;
    const { trait, unit } = synergy(a);
    const expanded = open === a.apiName;
    return (
      <li key={a.apiName} className={cn("rounded-md transition-colors", expanded ? "bg-white/[0.07]" : "hover:bg-white/5")}>
        <button
          type="button"
          onClick={() => setOpen(expanded ? null : a.apiName)}
          className="no-drag w-full flex items-center gap-2 px-1.5 py-1 text-left focus-ring rounded-md"
        >
          <AugmentIcon augment={a} size={28} showTooltip={false} />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-[12px] font-medium">{a.name}</span>
              <span className="size-1.5 rounded-full shrink-0" style={{ background: RARITY_COLOR[a.tier], boxShadow: `0 0 6px ${RARITY_COLOR[a.tier]}` }} title={RARITY_LABEL[a.tier]} />
            </span>
            {(trait || unit) && (
              <span className="flex items-center gap-1 mt-0.5">
                {trait && <span className="inline-flex items-center gap-0.5 rounded px-1 text-[9px] font-semibold text-teal bg-teal/10 border border-teal/30"><Sparkles className="size-2.5" />構成と相性◎</span>}
                {unit && <span className="inline-flex items-center rounded px-1 text-[9px] font-semibold text-gold bg-gold/10 border border-gold/30">ユニット一致</span>}
              </span>
            )}
          </span>
          <TierBadge tier={tier} size="xs" showEmpty className={tier ? undefined : "opacity-60"} />
        </button>
        {expanded && (
          <div className="px-2 pb-2 pt-0.5 flex flex-col gap-2 animate-fade-in">
            <RichDesc desc={a.desc} vars={a.effects} className="text-[11px]" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-fg-subtle">{RARITY_LABEL[a.tier]}{enNames?.get(a.apiName) && enNames.get(a.apiName) !== a.name ? ` · ${enNames.get(a.apiName)}` : ""}</span>
              <TierPicker value={tier} onChange={(t) => rate(a.apiName, t, data.setNumber)} size="xs" />
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 p-2.5 animate-fade-in text-[12px]">
      <div className="no-drag relative flex items-center">
        <Search className="absolute left-2.5 size-4 text-fg-subtle pointer-events-none" />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(null); }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape") { setQuery(""); setOpen(null); }
            if (e.key === "Enter" && results.length) setOpen((o) => (o === results[0].apiName ? null : results[0].apiName));
          }}
          placeholder="オーグメント名・効果で検索（/ でフォーカス）"
          spellCheck={false}
          className="no-drag w-full h-9 rounded-lg border border-white/10 bg-black/30 pl-8 pr-8 text-[13px] text-fg placeholder:text-fg-subtle outline-none focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_25%,transparent)] transition-all select-text"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="no-drag absolute right-2 text-fg-subtle hover:text-fg focus-ring rounded" title="クリア">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {q ? (
        results.length === 0 ? (
          <OEmpty icon={<Search />} title="該当なし" description="日本語名・英語名・効果テキストで検索できます" />
        ) : (
          <ul className="flex flex-col gap-0.5">{results.map(renderRow)}</ul>
        )
      ) : topRated.length > 0 ? (
        <OSection title="S / A ティアのオーグメント" action={<span className="text-[10px] text-fg-subtle tabular-nums">{Object.keys(ratings).length} 件評価済み</span>}>
          {(["S", "A"] as Tier[]).map((t) => {
            const list = topRated.filter((a) => ratings[a.apiName]?.tier === t);
            if (list.length === 0) return null;
            return (
              <div key={t} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 px-1 mt-0.5">
                  <span className="text-[10px] font-bold" style={{ color: TIER_COLORS[t] }}>{t}</span>
                  <span className="flex-1 h-px" style={{ background: `color-mix(in srgb, ${TIER_COLORS[t]} 30%, transparent)` }} />
                </div>
                <ul className="flex flex-col gap-0.5">{list.map(renderRow)}</ul>
              </div>
            );
          })}
        </OSection>
      ) : (
        <OEmpty
          icon={<Gem />}
          title="ティア評価がまだありません"
          description={
            <>
              メインウィンドウの <b className="text-fg">図鑑 → オーグメント</b> で S/A/B/C/D を付けるか、
              「ティアを一括入力」で配信者・サイトのティア表を貼り付けてください。
              <br />ここで検索して、その場で評価することもできます。
            </>
          }
        />
      )}

      {comp && comp.units.length > 0 && !q && (
        <p className="text-[10px] text-fg-subtle px-1">
          相性判定: 構成「{comp.name || "無題"}」の特性 {compTraits.size} 種 / ユニット {compChampionNames.length} 体
        </p>
      )}
    </div>
  );
}
