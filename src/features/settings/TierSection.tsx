import { useEffect, useState } from "react";
import { ClipboardCopy, Download, Eraser, Gem, Link2, ListPlus } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useStaticData } from "@/stores/staticData";
import { toast } from "@/stores/toast";
import { fmtDate, fmtRelative } from "@/lib/utils";
import { TIER_COLORS, TIER_ORDER, countTiers, loadEnglishAugmentNames, useAugmentTiers } from "@/lib/augmentTiers";
import { TierBulkModal, TierClearModal, TierImportModal, exportTiersToClipboard } from "@/features/reference/TierModals";
import { SettingsCard } from "./common";

export function TierSection() {
  const data = useStaticData((s) => s.data);
  const tiers = useAugmentTiers((s) => s.data);
  const loaded = useAugmentTiers((s) => s.loaded);
  const load = useAugmentTiers((s) => s.load);
  const importUrl = useAugmentTiers((s) => s.importUrl);
  const setImportUrl = useAugmentTiers((s) => s.setImportUrl);
  const importFromUrl = useAugmentTiers((s) => s.importFromUrl);
  const [url, setUrl] = useState(importUrl);
  const [fetching, setFetching] = useState(false);
  const [modal, setModal] = useState<"bulk" | "import" | "clear" | null>(null);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setUrl(importUrl); }, [importUrl]);

  const counts = countTiers(tiers.ratings);
  const total = Object.keys(tiers.ratings).length;
  const augments = data?.augments ?? [];

  const rememberUrl = async () => {
    const v = url.trim();
    if (v !== importUrl) await setImportUrl(v).catch(() => {});
  };

  const fetchUrl = async () => {
    if (!url.trim()) return;
    setFetching(true);
    try {
      await rememberUrl();
      const en = augments.length ? await loadEnglishAugmentNames(data?.setNumber) : undefined;
      const r = await importFromUrl(url, augments.length ? augments : undefined, en, data?.setNumber);
      if (r.unmatched.length) toast.warning(`${r.matched} 件を取り込みました`, `未一致 ${r.unmatched.length} 件: ${r.unmatched.slice(0, 6).join("、")}${r.unmatched.length > 6 ? " …" : ""}`);
      else toast.success(`${r.matched} 件を取り込みました`);
    } catch (e) {
      toast.error("取り込みに失敗しました", e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  };

  return (
    <SettingsCard
      title="オーグメントティア"
      icon={<Gem />}
      description="Riot の試合 API はオーグメントの選択情報を返さなくなったため、ティアは統計から算出できません。配信者やサイトのティア表を参考に、自分で評価を管理します（図鑑 → オーグメント で個別評価、または一括入力）。"
      action={
        <span className="text-xs text-fg-subtle">
          {!loaded ? "読み込み中…" : tiers.updatedAt ? <>最終更新 <span className="text-fg-muted" title={fmtDate(tiers.updatedAt)}>{fmtRelative(tiers.updatedAt)}</span></> : "未評価"}
        </span>
      }
    >
      <div className="grid grid-cols-6 gap-2 mb-5">
        {TIER_ORDER.map((t) => (
          <div
            key={t}
            className="rounded-lg border px-3 py-2 flex flex-col gap-0.5"
            style={{ borderColor: `color-mix(in srgb, ${TIER_COLORS[t]} 35%, transparent)`, background: `color-mix(in srgb, ${TIER_COLORS[t]} 8%, transparent)` }}
          >
            <span className="text-[11px] font-bold" style={{ color: TIER_COLORS[t] }}>{t} ティア</span>
            <span className="text-xl font-semibold tabular-nums leading-tight">{counts[t]}</span>
          </div>
        ))}
        <div className="rounded-lg border border-border bg-bg-elev px-3 py-2 flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-fg-subtle">評価済み</span>
          <span className="text-xl font-semibold tabular-nums leading-tight">
            {total}
            {augments.length > 0 && <span className="text-xs text-fg-subtle font-normal"> / {augments.length}</span>}
          </span>
        </div>
      </div>

      {(tiers.sourceLabel || tiers.setNumber > 0) && (
        <p className="text-xs text-fg-subtle mb-4 -mt-2">
          {tiers.setNumber > 0 && <>Set {tiers.setNumber}</>}
          {tiers.setNumber > 0 && tiers.sourceLabel && " · "}
          {tiers.sourceLabel && <>取得元: <span className="text-fg-muted">{tiers.sourceLabel}</span></>}
          {data && tiers.setNumber > 0 && tiers.setNumber !== data.setNumber && <span className="text-warning ml-2">現在のセット (Set {data.setNumber}) と異なります</span>}
        </p>
      )}

      <div className="flex items-end gap-2 mb-4">
        <Input
          className="flex-1"
          label="インポート URL"
          left={<Link2 className="size-4" />}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={rememberUrl}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fetchUrl(); } }}
          placeholder="https://example.com/augment-tiers.json"
          hint="本アプリのエクスポート JSON、または一括入力と同じ書式のテキストを配信する URL。URL は記憶されます。"
        />
        <Button variant="primary" onClick={fetchUrl} loading={fetching} disabled={!url.trim()} className="mb-[22px]" icon={<Download className="size-4" />}>取り込む</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<ListPlus className="size-4" />} onClick={() => setModal("bulk")} disabled={augments.length === 0} title={augments.length === 0 ? "静的データの読み込みが必要です" : undefined}>ティアを一括入力</Button>
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => setModal("import")}>インポート</Button>
        <Button variant="secondary" icon={<ClipboardCopy className="size-4" />} onClick={() => exportTiersToClipboard()} disabled={total === 0}>エクスポート</Button>
        <Button variant="danger" icon={<Eraser className="size-4" />} onClick={() => setModal("clear")} disabled={total === 0}>すべてクリア</Button>
      </div>

      <TierBulkModal open={modal === "bulk"} onClose={() => setModal(null)} augments={augments} setNumber={data?.setNumber} />
      <TierImportModal open={modal === "import"} onClose={() => setModal(null)} augments={augments.length ? augments : undefined} setNumber={data?.setNumber} />
      <TierClearModal open={modal === "clear"} onClose={() => setModal(null)} />
    </SettingsCard>
  );
}
