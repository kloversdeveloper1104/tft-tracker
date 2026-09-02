import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, HardDrive, Play, Square, Trash2 } from "lucide-react";
import { Button, Card, Checkbox, Modal, Page, PageHeader, ProgressBar, Select, Skeleton, Slider, Stat } from "@/components/ui";
import { app, ladder } from "@/lib/api";
import { QUEUES } from "@/data/odds";
import { cn } from "@/lib/utils";
import { useStaticData } from "@/stores/staticData";
import { toast } from "@/stores/toast";
import type { CollectOptions, CollectStatus, LadderTier } from "@/lib/types";

const STORAGE_KEY = "tft.collector.opts";
const DEFAULT_OPTS: CollectOptions = { tiers: ["challenger", "grandmaster"], playersLimit: 50, matchesPerPlayer: 10, queueId: 1100 };
const TIERS: { id: LadderTier; label: string; color: string }[] = [
  { id: "challenger", label: "チャレンジャー", color: "#ffd46b" },
  { id: "grandmaster", label: "グランドマスター", color: "#ff6464" },
  { id: "master", label: "マスター", color: "#b56cff" },
];
const PHASES: Record<string, { label: string; color: string }> = {
  idle: { label: "待機中", color: "var(--color-fg-subtle)" },
  ladder: { label: "ラダー取得中", color: "var(--color-accent)" },
  matches: { label: "試合取得中", color: "var(--color-gold)" },
  done: { label: "完了", color: "var(--color-success)" },
  cancelled: { label: "キャンセル", color: "var(--color-warning)" },
  error: { label: "エラー", color: "var(--color-danger)" },
};
const IDLE: CollectStatus = { running: false, phase: "idle", done: 0, total: 0, added: 0, message: "" };
const REQ_PER_MIN = 50; // dev key: 100 req / 2 min

function loadOpts(): CollectOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<CollectOptions>;
      const tiers = Array.isArray(o.tiers) ? o.tiers.filter((t): t is LadderTier => TIERS.some((x) => x.id === t)) : DEFAULT_OPTS.tiers;
      return {
        tiers: tiers.length ? tiers : DEFAULT_OPTS.tiers,
        playersLimit: typeof o.playersLimit === "number" ? o.playersLimit : DEFAULT_OPTS.playersLimit,
        matchesPerPlayer: typeof o.matchesPerPlayer === "number" ? o.matchesPerPlayer : DEFAULT_OPTS.matchesPerPlayer,
        queueId: typeof o.queueId === "number" ? o.queueId : DEFAULT_OPTS.queueId,
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_OPTS;
}

function fmtBytes(b: number): string {
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function CollectorPage() {
  const qc = useQueryClient();
  const setNumber = useStaticData((s) => s.data?.setNumber);
  const [opts, setOpts] = useState<CollectOptions>(loadOpts);
  const [status, setStatus] = useState<CollectStatus>(IDLE);
  const [log, setLog] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(opts)); } catch { /* ignore */ }
  }, [opts]);

  const applyStatus = useCallback((s: CollectStatus) => {
    setStatus(s);
    if (s.message) setLog((l) => (l[l.length - 1] === s.message ? l : [...l, s.message].slice(-20)));
  }, []);

  const statusQuery = useQuery({
    queryKey: ["ladder", "status"],
    queryFn: ladder.status,
    refetchInterval: status.running ? 2000 : false,
  });
  useEffect(() => { if (statusQuery.data) applyStatus(statusQuery.data); }, [statusQuery.data, applyStatus]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    ladder.onProgress((s) => { if (active) applyStatus(s); }).then((u) => { if (active) unlisten = u; else u(); });
    return () => { active = false; unlisten?.(); };
  }, [applyStatus]);

  // refresh stored-data numbers when a run finishes
  useEffect(() => {
    if (wasRunning.current && !status.running) {
      qc.invalidateQueries({ queryKey: ["ladder", "count"] });
      qc.invalidateQueries({ queryKey: ["app", "dbStats"] });
      if (status.phase === "done") toast.success("収集が完了しました", `${status.added} 試合を追加`);
      else if (status.phase === "error") toast.error("収集中にエラーが発生しました", status.message);
    }
    wasRunning.current = status.running;
  }, [status.running, status.phase, status.added, status.message, qc]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log]);

  const count = useQuery({ queryKey: ["ladder", "count", setNumber ?? null], queryFn: () => ladder.count(setNumber) });
  const dbStats = useQuery({ queryKey: ["app", "dbStats"], queryFn: app.dbStats });

  const start = useMutation({
    mutationFn: () => ladder.start(opts),
    onMutate: () => { setLog([]); setStatus({ ...IDLE, running: true, phase: "ladder", message: "開始しています…" }); },
    onError: (e: Error) => { toast.error("収集を開始できませんでした", e.message); statusQuery.refetch(); },
    onSuccess: () => statusQuery.refetch(),
  });
  const cancel = useMutation({
    mutationFn: ladder.cancel,
    onSuccess: () => toast.info("キャンセルを要求しました", "進行中のリクエストが終わり次第停止します"),
    onError: (e: Error) => toast.error("キャンセルに失敗しました", e.message),
  });
  const clear = useMutation({
    mutationFn: ladder.clear,
    onSuccess: () => {
      toast.success("収集データを削除しました");
      setConfirmClear(false);
      qc.invalidateQueries({ queryKey: ["ladder", "count"] });
      qc.invalidateQueries({ queryKey: ["app", "dbStats"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error("削除に失敗しました", e.message),
  });

  const requests = useMemo(
    () => opts.tiers.length + opts.playersLimit + opts.playersLimit * opts.matchesPerPlayer,
    [opts],
  );
  const etaMin = Math.max(1, Math.ceil(requests / REQ_PER_MIN));
  const phase = PHASES[status.phase] ?? { label: status.phase, color: "var(--color-fg-muted)" };
  const running = status.running;
  const canStart = !running && opts.tiers.length > 0 && !start.isPending;

  const toggleTier = (t: LadderTier, on: boolean) =>
    setOpts((o) => ({ ...o, tiers: on ? [...new Set([...o.tiers, t])] : o.tiers.filter((x) => x !== t) }));

  return (
    <Page>
      <PageHeader
        title="データ収集"
        subtitle="上位ランク帯の試合を収集して「メタ統計」に使います"
        icon={<Database />}
      />

      <div className="grid grid-cols-[1fr_340px] gap-4 items-start">
        <div className="flex flex-col gap-4">
          {/* explanation + warning */}
          <Card>
            <p className="text-sm text-fg-muted leading-relaxed">
              チャレンジャーなど上位ランク帯のプレイヤーを取得し、それぞれの直近の試合をローカル DB に保存します。
              集めた試合は <span className="text-fg">メタ統計</span> のデータソース「上位帯」として、ユニット・特性・アイテム・構成の勝率分析に使われます。
            </p>
            <div className="mt-3 flex gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-3 text-xs text-warning">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                Riot の開発用 API キーは <b>100 リクエスト / 2 分</b>（20 リクエスト / 秒）に制限されています。
                収集は自動でレート制限に合わせて待機しますが、大量に集める場合は時間がかかります。収集中は「同期」など他の API 操作も遅くなります。
              </div>
            </div>
          </Card>

          {/* controls */}
          <Card title="収集オプション">
            <div className="flex flex-col gap-5">
              <div>
                <div className="text-xs font-medium text-fg-muted mb-2">対象ティア</div>
                <div className="flex items-center gap-5">
                  {TIERS.map((t) => (
                    <Checkbox
                      key={t.id}
                      checked={opts.tiers.includes(t.id)}
                      onChange={(v) => toggleTier(t.id, v)}
                      label={<span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: t.color }} />{t.label}</span>}
                    />
                  ))}
                </div>
                {opts.tiers.length === 0 && <p className="text-xs text-danger mt-1.5">少なくとも1つのティアを選択してください。</p>}
              </div>
              <div className="grid grid-cols-2 gap-5">
                <Slider label="スキャンするプレイヤー数" min={10} max={300} step={10} value={opts.playersLimit} onChange={(v) => setOpts((o) => ({ ...o, playersLimit: v }))} format={(v) => `${v} 人`} />
                <Slider label="1人あたりの試合数" min={5} max={40} step={1} value={opts.matchesPerPlayer} onChange={(v) => setOpts((o) => ({ ...o, matchesPerPlayer: v }))} format={(v) => `${v} 試合`} />
              </div>
              <div className="grid grid-cols-2 gap-5 items-end">
                <Select
                  label="キュー"
                  value={String(opts.queueId ?? 1100)}
                  onChange={(e) => setOpts((o) => ({ ...o, queueId: Number(e.target.value) }))}
                  options={QUEUES.filter((q) => [1100, 1090, 1160, 1130].includes(q.id)).map((q) => ({ value: q.id, label: q.label }))}
                />
                <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-xs">
                  <div className="text-fg-subtle">推定所要時間（開発用キー）</div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-fg">約 {etaMin} 分</span>
                    <span className="text-fg-muted tabular-nums">最大 {requests.toLocaleString("ja-JP")} リクエスト · 最大 {(opts.playersLimit * opts.matchesPerPlayer).toLocaleString("ja-JP")} 試合</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <Button variant="gold" icon={<Play className="size-4" />} disabled={!canStart} loading={start.isPending && !running} onClick={() => start.mutate()} className="mt-4">
                  収集を開始
                </Button>
                <Button variant="danger" icon={<Square className="size-4" />} disabled={!running} loading={cancel.isPending} onClick={() => cancel.mutate()} className="mt-4">
                  キャンセル
                </Button>
                {running && <span className="ml-auto mt-4 text-xs text-fg-subtle">収集中はオプションを変更できません（次回から反映）</span>}
              </div>
            </div>
          </Card>

          {/* status */}
          <Card
            title="進行状況"
            action={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: phase.color }}>
                <span className={cn("size-1.5 rounded-full", running && "animate-pulse-soft")} style={{ background: phase.color }} />
                {phase.label}
              </span>
            }
          >
            {statusQuery.isPending && !running ? (
              <Skeleton className="h-16" />
            ) : (
              <>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-fg-muted truncate">{status.message || (running ? "処理中…" : "開始するとここに進捗が表示されます")}</span>
                  <span className="tabular-nums text-fg-subtle shrink-0 ml-3">
                    {status.total > 0 ? `${status.done} / ${status.total}` : running ? "準備中" : "—"}
                    <span className="mx-1.5 text-border-strong">·</span>
                    追加 <span className="text-fg">{status.added}</span> 試合
                  </span>
                </div>
                <ProgressBar value={status.done} max={status.total || 1} color={phase.color} />
                <div ref={logRef} className="mt-3 h-40 overflow-y-auto rounded-lg bg-bg-elev border border-border p-2.5 font-mono text-[11px] leading-relaxed text-fg-muted select-text">
                  {log.length === 0 ? <span className="text-fg-subtle">ログはまだありません</span> : log.map((line, i) => (
                    <div key={i} className={cn(i === log.length - 1 && "text-fg")}>{line}</div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* stored data */}
        <Card title="保存済みデータ" action={<HardDrive className="size-4 text-fg-subtle" />}>
          {dbStats.isError ? (
            <div className="text-xs text-danger flex flex-col gap-2">
              DB 情報の取得に失敗しました: {dbStats.error.message}
              <Button size="xs" variant="danger" onClick={() => dbStats.refetch()} loading={dbStats.isFetching} className="self-start">再試行</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-gold/25 bg-gold/[0.06] px-3.5 py-3">
                {count.isPending ? <Skeleton className="h-10 w-32" /> : (
                  <Stat label={`上位帯の試合 (Set ${setNumber ?? "?"})`} value={count.isError ? "–" : count.data.toLocaleString("ja-JP")} color="var(--color-gold)" sub={count.isError ? "取得失敗" : "メタ統計で利用可能"} />
                )}
              </div>
              {dbStats.isPending ? (
                <div className="grid grid-cols-2 gap-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                  <Stat label="上位帯の試合（全セット）" value={dbStats.data.ladderMatches.toLocaleString("ja-JP")} />
                  <Stat label="自分の試合" value={dbStats.data.matches.toLocaleString("ja-JP")} />
                  <Stat label="プレイヤー" value={dbStats.data.players.toLocaleString("ja-JP")} />
                  <Stat label="DB サイズ" value={fmtBytes(dbStats.data.sizeBytes)} />
                </div>
              )}
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-4" />}
                disabled={running || (dbStats.data?.ladderMatches ?? 0) === 0}
                onClick={() => setConfirmClear(true)}
              >
                収集データを削除
              </Button>
              <p className="text-[11px] text-fg-subtle leading-relaxed">自分の試合履歴は削除されません。上位帯の収集データのみが対象です。</p>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="収集データを削除しますか？"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>キャンセル</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} loading={clear.isPending} onClick={() => clear.mutate()}>削除する</Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted leading-relaxed">
          上位帯の収集データ（{(dbStats.data?.ladderMatches ?? 0).toLocaleString("ja-JP")} 試合）をすべて削除します。この操作は元に戻せません。
          メタ統計の「上位帯」データは再収集するまで空になります。
        </p>
      </Modal>
    </Page>
  );
}
