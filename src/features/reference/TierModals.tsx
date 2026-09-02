// Modals + helpers for the user-maintained augment tier list. Shared by 図鑑 (AugmentsTab) and 設定 (TierSection).
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Link2 } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";
import { TierBadge } from "@/components/tft";
import { toast } from "@/stores/toast";
import { cn } from "@/lib/utils";
import { loadEnglishAugmentNames, parseTierText, useAugmentTiers, type ImportResult } from "@/lib/augmentTiers";
import type { Augment } from "@/lib/types";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Lazily loads apiName -> English name while `open` (cached per set). */
export function useEnglishNames(open: boolean, setNumber?: number): Map<string, string> | null {
  const [names, setNames] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!open || names) return;
    let active = true;
    loadEnglishAugmentNames(setNumber).then((m) => { if (active) setNames(m); });
    return () => { active = false; };
  }, [open, names, setNumber]);
  return names;
}

/** Copy the tier list JSON to the clipboard. */
export async function exportTiersToClipboard(): Promise<void> {
  const st = useAugmentTiers.getState();
  const n = Object.keys(st.data.ratings).length;
  try {
    await navigator.clipboard.writeText(st.exportJson());
    toast.success("エクスポートしました", `${n} 件の評価を JSON としてクリップボードにコピーしました`);
  } catch (e) {
    toast.error("コピーに失敗しました", errMsg(e));
  }
}

function reportImport(r: ImportResult, verb = "取り込みました") {
  if (r.unmatched.length) toast.warning(`${r.matched} 件を${verb}`, `未一致 ${r.unmatched.length} 件: ${r.unmatched.slice(0, 6).join("、")}${r.unmatched.length > 6 ? " …" : ""}`);
  else toast.success(`${r.matched} 件を${verb}`);
}

const textareaCls = "w-full min-h-40 rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent transition-colors resize-y select-text font-mono leading-relaxed";

// ----- Bulk text input --------------------------------------------------------------------------
export function TierBulkModal({ open, onClose, augments, setNumber }: {
  open: boolean; onClose: () => void; augments: Augment[]; setNumber?: number;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const enNames = useEnglishNames(open, setNumber);
  const importText = useAugmentTiers((s) => s.importText);

  useEffect(() => { if (!open) setText(""); }, [open]);

  const preview = useMemo(() => (text.trim() ? parseTierText(text, augments, enNames ?? undefined) : null), [text, augments, enNames]);

  const apply = async () => {
    if (!preview || preview.tiers.size === 0) return;
    setBusy(true);
    try {
      const r = await importText(text, augments, enNames ?? undefined, setNumber);
      reportImport(r, "評価しました");
      onClose();
    } catch (e) {
      toast.error("保存に失敗しました", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="ティアを一括入力"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>キャンセル</Button>
          <Button variant="primary" onClick={apply} loading={busy} disabled={!preview || preview.tiers.size === 0}>
            {preview && preview.tiers.size > 0 ? `${preview.tiers.size} 件を適用` : "適用"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-bg-elev border border-border px-3 py-2 text-xs text-fg-muted leading-relaxed">
          <p className="font-medium text-fg mb-1">書式（行ごと）</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><code className="text-gold">S: 名前1, 名前2, 名前3</code>　/　<code className="text-gold">Aティア 名前…</code>　/　<code className="text-gold">B - name</code></li>
            <li><code className="text-gold">名前 S</code>（1行に1件）や、<code className="text-gold">S</code> だけの行の後に名前を続ける形式も可</li>
            <li>区切りは <code>,</code> <code>、</code> <code>/</code> <code>・</code> タブ・改行。日本語名・英語名どちらでも可（表記の揺れはあいまい一致）</li>
          </ul>
        </div>
        <textarea
          className={textareaCls}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"S: 名前1, 名前2\nA: 名前3、名前4\nB - Name5 / Name6\n名前7 C"}
          autoFocus
          spellCheck={false}
        />
        {preview && (
          <div className="flex flex-col gap-2 animate-fade-in">
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" />一致 <b className="tabular-nums">{preview.tiers.size}</b> 件</span>
              <span className={cn("inline-flex items-center gap-1", preview.unmatched.length ? "text-warning" : "text-fg-subtle")}>
                <AlertTriangle className="size-3.5" />未一致 <b className="tabular-nums">{preview.unmatched.length}</b> 件
              </span>
              {enNames === null && <span className="text-fg-subtle">英語名を読み込み中…</span>}
            </div>
            {preview.tiers.size > 0 && (
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
                {[...preview.tiers.entries()].slice(0, 80).map(([id, tier]) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-md bg-surface-2 border border-border px-1.5 py-0.5 text-[11px]">
                    <TierBadge tier={tier} size="xs" />
                    <span className="truncate max-w-40">{augments.find((a) => a.apiName === id)?.name ?? id}</span>
                  </span>
                ))}
                {preview.tiers.size > 80 && <span className="text-[11px] text-fg-subtle self-center">… 他 {preview.tiers.size - 80} 件</span>}
              </div>
            )}
            {preview.unmatched.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                {preview.unmatched.map((t, i) => (
                  <span key={i} className="rounded-md bg-warning/10 border border-warning/30 text-warning px-1.5 py-0.5 text-[11px] truncate max-w-56" title={t}>{t}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ----- Import (JSON or URL) -------------------------------------------------------------------------
export function TierImportModal({ open, onClose, augments, setNumber }: {
  open: boolean; onClose: () => void; augments?: Augment[]; setNumber?: number;
}) {
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState<"json" | "url" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importUrl = useAugmentTiers((s) => s.importUrl);
  const setImportUrl = useAugmentTiers((s) => s.setImportUrl);
  const importJson = useAugmentTiers((s) => s.importJson);
  const importFromUrl = useAugmentTiers((s) => s.importFromUrl);
  const [url, setUrl] = useState(importUrl);
  const enNames = useEnglishNames(open, setNumber);

  useEffect(() => { if (open) { setUrl(useAugmentTiers.getState().importUrl); setJson(""); setError(null); } }, [open]);

  const runJson = async () => {
    setBusy("json");
    setError(null);
    try {
      const r = await importJson(json);
      reportImport(r);
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const runUrl = async () => {
    setBusy("url");
    setError(null);
    try {
      if (url.trim() !== importUrl) await setImportUrl(url.trim());
      const r = await importFromUrl(url, augments, enNames ?? undefined, setNumber);
      reportImport(r);
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="ティアをインポート"
      width="max-w-xl"
      footer={<Button variant="ghost" onClick={onClose} disabled={!!busy}>閉じる</Button>}
    >
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-fg flex items-center gap-1.5"><ClipboardPaste className="size-3.5 text-gold" />JSON を貼り付け</h4>
          <textarea
            className={cn(textareaCls, "min-h-32")}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='{"version":1,"setNumber":18,"ratings":{"TFT..._Augment":{"tier":"S"}}}'
            spellCheck={false}
          />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" onClick={runJson} loading={busy === "json"} disabled={!json.trim() || busy === "url"}>JSON を取り込む</Button>
          </div>
        </section>
        <section className="flex flex-col gap-2 pt-3 border-t border-border">
          <h4 className="text-xs font-semibold text-fg flex items-center gap-1.5"><Link2 className="size-3.5 text-gold" />URL から取得</h4>
          <div className="flex items-end gap-2">
            <Input
              className="flex-1"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/tiers.json（または書式付きテキスト）"
              hint="JSON（本アプリのエクスポート形式）または一括入力と同じ書式のテキストに対応。サイト側が CORS を許可していない場合は取得できません。"
              onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) runUrl(); }}
            />
            <Button size="md" variant="secondary" onClick={runUrl} loading={busy === "url"} disabled={!url.trim() || busy === "json"} className="mb-[22px]">取得</Button>
          </div>
        </section>
        {error && <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger break-words">{error}</div>}
        <p className="text-[11px] text-fg-subtle">取り込んだ評価は既存の評価に上書きマージされます（含まれないオーグメントの評価は保持）。</p>
      </div>
    </Modal>
  );
}

// ----- Clear ---------------------------------------------------------------------------------------------
export function TierClearModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const clearAll = useAugmentTiers((s) => s.clearAll);
  const n = useAugmentTiers((s) => Object.keys(s.data.ratings).length);
  const run = async () => {
    setBusy(true);
    try {
      await clearAll();
      toast.success("ティア評価をすべてクリアしました");
      onClose();
    } catch (e) {
      toast.error("失敗しました", errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="ティア評価をすべてクリアしますか?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>キャンセル</Button>
          <Button variant="danger" onClick={run} loading={busy}>クリアする</Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        {n} 件のオーグメント評価を削除します。この操作は取り消せません。必要であれば先に「エクスポート」でバックアップしてください。
      </p>
    </Modal>
  );
}
