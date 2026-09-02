import { useState } from "react";
import { Languages, RefreshCw, Database } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { useSettings } from "@/stores/settings";
import { useStaticData } from "@/stores/staticData";
import { toast } from "@/stores/toast";
import { fmtDate, fmtRelative } from "@/lib/utils";
import type { Locale } from "@/lib/types";
import { SettingsCard, saveSettings } from "./common";

export function LocaleSection() {
  const locale = useSettings((s) => s.settings.locale);
  const { meta, data, loading, error, refresh } = useStaticData();
  const [refreshing, setRefreshing] = useState(false);

  const change = async (l: Locale) => {
    if (l === locale) return;
    await saveSettings({ locale: l }, "データ言語を変更しました");
  };

  const doRefresh = async () => {
    setRefreshing(true);
    await refresh(locale);
    const err = useStaticData.getState().error;
    if (err) toast.error("再取得に失敗しました", err);
    else toast.success("静的データを再取得しました");
    setRefreshing(false);
  };

  return (
    <SettingsCard
      title="データ言語"
      icon={<Languages />}
      description="Community Dragon から取得するチャンピオン・アイテム名の言語です。変更すると自動で再読み込みします。"
      action={
        <Button size="sm" variant="outline" icon={<RefreshCw className="size-3.5" />} onClick={doRefresh} loading={refreshing || loading}>
          静的データを再取得
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        <Select
          label="言語"
          value={locale}
          onChange={(e) => change(e.target.value as Locale)}
          options={[{ value: "ja_jp", label: "日本語" }, { value: "en_us", label: "English" }]}
        />
        <div className="rounded-lg bg-bg-elev border border-border p-3 text-xs flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-fg-muted"><Database className="size-3.5" />キャッシュ状態</div>
          {error && <div className="text-danger">{error}</div>}
          {!error && (
            <>
              <div className="flex justify-between tabular-nums"><span className="text-fg-subtle">取得日時</span><span>{meta?.cachedAt ? `${fmtDate(meta.cachedAt)} (${fmtRelative(meta.cachedAt)})` : data?.fetchedAt ? fmtDate(data.fetchedAt) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-fg-subtle">現在のセット</span><span>{data ? `Set ${data.setNumber}${data.setName ? ` · ${data.setName}` : ""}` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-fg-subtle">利用可能なセット</span><span className="tabular-nums">{meta?.availableSets?.length ? meta.availableSets.join(", ") : "—"}</span></div>
              <div className="flex justify-between tabular-nums"><span className="text-fg-subtle">内容</span><span>{data ? `${data.champions.length} チャンピオン · ${data.items.length} アイテム · ${data.traits.length} 特性 · ${data.augments.length} オーグメント` : "—"}</span></div>
            </>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
