import { useCallback, useEffect, useState } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { HardDrive, FolderOpen, Trash2, RotateCcw, RefreshCw } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { Button, Modal, Skeleton, Stat } from "@/components/ui";
import { app } from "@/lib/api";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import { SettingsCard } from "./common";

type DbStats = Awaited<ReturnType<typeof app.dbStats>>;

export function DataSection() {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [dir, setDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<"cache" | "reset" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d] = await Promise.all([app.dbStats(), app.dataDir()]);
      setStats(s);
      setDir(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDir = async () => {
    if (!dir) return;
    try {
      await openPath(dir);
    } catch {
      try { await revealItemInDir(dir); } catch (e) { toast.error("フォルダを開けませんでした", e instanceof Error ? e.message : String(e)); }
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      if (confirm === "cache") {
        await app.clearCache();
        toast.success("キャッシュを削除しました");
        await load();
      } else if (confirm === "reset") {
        await useSettings.getState().reset();
        await emit("settings-updated", useSettings.getState().settings).catch(() => {});
        toast.success("設定をリセットしました");
      }
    } catch (e) {
      toast.error("失敗しました", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const mb = stats ? stats.sizeBytes / (1024 * 1024) : 0;

  return (
    <SettingsCard
      title="データ管理"
      icon={<HardDrive />}
      action={<Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={load} loading={loading}>更新</Button>}
    >
      {error && <div className="mb-3 rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-5">
        {loading && !stats ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)
        ) : (
          <>
            <Stat label="自分の試合" value={(stats?.matches ?? 0).toLocaleString()} />
            <Stat label="ラダー試合" value={(stats?.ladderMatches ?? 0).toLocaleString()} />
            <Stat label="プレイヤー" value={(stats?.players ?? 0).toLocaleString()} />
            <Stat label="DBサイズ" value={`${mb.toFixed(1)} MB`} />
          </>
        )}
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-bg-elev border border-border px-3 py-2.5 mb-4">
        <FolderOpen className="size-4 text-fg-subtle shrink-0" />
        <span className="text-xs text-fg-muted font-mono truncate flex-1 select-text" title={dir ?? ""}>{dir ?? "..."}</span>
        <Button size="xs" variant="outline" onClick={openDir} disabled={!dir}>フォルダを開く</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Trash2 className="size-4" />} onClick={() => setConfirm("cache")}>キャッシュを削除</Button>
        <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setConfirm("reset")}>設定をリセット</Button>
      </div>
      <Modal
        open={confirm !== null}
        onClose={() => !busy && setConfirm(null)}
        title={confirm === "cache" ? "キャッシュを削除しますか?" : "設定をリセットしますか?"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>キャンセル</Button>
            <Button variant="danger" onClick={run} loading={busy}>{confirm === "cache" ? "削除する" : "リセットする"}</Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirm === "cache"
            ? "静的データのキャッシュを削除します。次回の読み込み時に Community Dragon から再取得されます。保存済みの試合データは削除されません。"
            : "API キー、Riot ID、オーバーレイ設定、確率テーブルなどすべての設定が既定値に戻ります。この操作は取り消せません。"}
        </p>
      </Modal>
    </SettingsCard>
  );
}
