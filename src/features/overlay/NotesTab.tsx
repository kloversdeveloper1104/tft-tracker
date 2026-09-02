import { useEffect, useRef, useState } from "react";
import { LazyStore } from "@tauri-apps/plugin-store";
import { Flag, RotateCcw, Coins } from "lucide-react";
import { interestFor, MAX_INTEREST } from "@/features/odds/data";
import { clamp, fmtDuration } from "@/lib/utils";
import { OBtn, OChip, OInput, OSection } from "./ui";

const overlayStore = new LazyStore("overlay.json", { autoSave: true });

interface StageMark { stage: number; at: number }

export function NotesTab() {
  const [notes, setNotes] = useState("");
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  const [marks, setMarks] = useState<StageMark[]>([]);
  const [now, setNow] = useState(Date.now());
  const [gold, setGold] = useState(50);

  useEffect(() => {
    let active = true;
    Promise.all([overlayStore.get<string>("notes"), overlayStore.get<StageMark[]>("stageMarks")])
      .then(([n, m]) => { if (!active) return; setNotes(n ?? ""); setMarks(Array.isArray(m) ? m : []); setReady(true); })
      .catch(() => setReady(true));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (marks.length === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [marks.length]);

  const onNotes = (v: string) => {
    setNotes(v);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { overlayStore.set("notes", v).catch(() => {}); }, 400);
  };
  const persistMarks = (m: StageMark[]) => { setMarks(m); overlayStore.set("stageMarks", m).catch(() => {}); };

  const start = marks[0]?.at;
  const elapsed = start ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
  const lastMark = marks[marks.length - 1];
  const sinceLast = lastMark ? Math.max(0, Math.floor((now - lastMark.at) / 1000)) : 0;
  const nextStage = (lastMark?.stage ?? 1) + (marks.length ? 1 : 0);

  return (
    <div className="flex flex-col gap-3 p-3 animate-fade-in">
      <OSection title="メモ" action={<span className="text-[10px] text-fg-subtle">自動保存</span>}>
        {ready ? (
          <textarea
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="このゲームのメモ (相手の構成、狙うアイテムなど)"
            className="no-drag w-full h-28 resize-none rounded-md border border-white/10 bg-black/25 p-2 text-[12px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-accent select-text"
          />
        ) : <div className="skeleton h-28" />}
      </OSection>

      <OSection
        title="ステージタイマー"
        action={<OBtn title="リセット" onClick={() => persistMarks([])} disabled={marks.length === 0}><RotateCcw /></OBtn>}
      >
        <div className="flex items-center gap-2">
          <OChip onClick={() => persistMarks([...marks, { stage: nextStage, at: Date.now() }])} className="bg-accent/20 text-accent hover:bg-accent/30 h-7 px-2.5">
            <Flag className="size-3 mr-1" /> ステージ {nextStage} 開始
          </OChip>
          <div className="ml-auto text-right leading-tight">
            <div className="text-[16px] font-semibold tabular-nums">{fmtDuration(elapsed)}</div>
            <div className="text-[10px] text-fg-subtle tabular-nums">現ステージ {fmtDuration(sinceLast)}</div>
          </div>
        </div>
        {marks.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {marks.map((m) => (
              <span key={m.at} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] tabular-nums text-fg-muted">
                S{m.stage} @ {fmtDuration(Math.floor((m.at - (start ?? m.at)) / 1000))}
              </span>
            ))}
          </div>
        )}
      </OSection>

      <OSection title="利子計算">
        <div className="flex items-center gap-2">
          <Coins className="size-3.5 text-gold" />
          <OInput type="number" min={0} max={200} value={gold} onChange={(e) => setGold(clamp(Number(e.target.value) || 0, 0, 200))} className="w-20" />
          <span className="text-[11px] text-fg-muted">g →</span>
          <span className="text-[14px] font-semibold text-gold tabular-nums">+{interestFor(gold)}g</span>
          {interestFor(gold) < MAX_INTEREST && <span className="ml-auto text-[10px] text-fg-subtle tabular-nums">次まで {10 - (gold % 10)}g</span>}
        </div>
        <div className="flex gap-1 mt-1">
          {[10, 20, 30, 40, 50].map((t, i) => (
            <div key={t} className={`flex-1 rounded px-1 py-0.5 text-center text-[10px] tabular-nums ${gold >= t ? "bg-gold/20 text-gold" : "bg-white/5 text-fg-subtle"}`}>
              {t}g · +{i + 1}
            </div>
          ))}
        </div>
      </OSection>
    </div>
  );
}
