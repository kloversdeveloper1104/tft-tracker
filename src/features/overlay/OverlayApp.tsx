import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { X, MousePointer2, SunMedium, LayoutGrid, Hammer, Dices, NotebookPen, Layers } from "lucide-react";
import { overlay } from "@/lib/api";
import { useSettings } from "@/stores/settings";
import { cn } from "@/lib/utils";
import { useOverlaySettings } from "./useOverlaySettings";
import { CompTab } from "./CompTab";
import { ItemsTab } from "./ItemsTab";
import { OddsTab } from "./OddsTab";
import { NotesTab } from "./NotesTab";
import { OBtn } from "./ui";

type Tab = "comp" | "items" | "odds" | "notes";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "comp", label: "構成", icon: <LayoutGrid className="size-3.5" /> },
  { id: "items", label: "アイテム", icon: <Hammer className="size-3.5" /> },
  { id: "odds", label: "確率", icon: <Dices className="size-3.5" /> },
  { id: "notes", label: "メモ", icon: <NotebookPen className="size-3.5" /> },
];

/** Seconds the overlay stays click-through before automatically reverting. */
const CLICK_THROUGH_SECONDS = 8;

export function OverlayApp() {
  const { settings, loaded } = useOverlaySettings();
  const [tab, setTab] = useState<Tab>("comp");
  const [ctLeft, setCtLeft] = useState(0);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [localOpacity, setLocalOpacity] = useState<number | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const opacityRef = useRef<HTMLDivElement>(null);

  const opacity = localOpacity ?? settings.overlayOpacity;
  const scale = Math.max(0.5, Math.min(2, settings.overlayScale || 1));
  const shortcut = settings.overlayShortcut.replace("CommandOrControl", "Ctrl");

  // Disable the context menu everywhere in the overlay window.
  useEffect(() => {
    const onCtx = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  // Click-through countdown: auto-revert since the user cannot click the overlay while enabled.
  useEffect(() => {
    if (ctLeft <= 0) return;
    const id = window.setTimeout(() => {
      const next = ctLeft - 1;
      setCtLeft(next);
      if (next <= 0) overlay.setClickThrough(false).catch(() => {});
    }, 1000);
    return () => window.clearTimeout(id);
  }, [ctLeft]);

  useEffect(() => {
    if (!opacityOpen) return;
    const onDoc = (e: MouseEvent) => { if (opacityRef.current && !opacityRef.current.contains(e.target as Node)) setOpacityOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [opacityOpen]);

  const enableClickThrough = async () => {
    try {
      await overlay.setClickThrough(true);
      setCtLeft(CLICK_THROUGH_SECONDS);
    } catch { /* ignore */ }
  };

  const changeOpacity = (v: number) => {
    setLocalOpacity(v);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await useSettings.getState().update({ overlayOpacity: v });
        await emit("settings-updated", useSettings.getState().settings);
      } catch { /* ignore */ }
      setLocalOpacity(null);
    }, 350);
  };

  return (
    <div className="h-screen w-screen overflow-hidden text-[12px] leading-snug" style={{ colorScheme: "dark" }}>
      <div
        style={{
          width: `calc(100vw / ${scale})`,
          height: `calc(100vh / ${scale})`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div
          className="h-full flex flex-col rounded-xl border border-white/10 overflow-hidden text-fg"
          style={{
            opacity,
            background: "linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 96%, transparent), color-mix(in srgb, var(--color-bg) 96%, transparent))",
            boxShadow: "0 12px 40px -10px rgba(0,0,0,0.8), 0 0 0 1px rgba(232,184,74,0.12) inset",
          }}
        >
          {/* Header / drag region */}
          <header data-tauri-drag-region className="drag-region flex items-center gap-1.5 h-9 px-2 border-b border-white/10 shrink-0 select-none cursor-move">
            <Layers data-tauri-drag-region className="size-3.5 text-gold shrink-0" />
            <span data-tauri-drag-region className="text-[12px] font-semibold tracking-wide text-gradient-gold shrink-0">TFT Tracker</span>
            <span data-tauri-drag-region className="flex-1" />
            {ctLeft > 0 && (
              <span className="text-[10px] tabular-nums text-warning bg-warning/10 rounded px-1.5 py-0.5 animate-pulse-soft">透過中 {ctLeft}s</span>
            )}
            <OBtn title={`クリック透過 (${CLICK_THROUGH_SECONDS}秒間ゲームへクリックを通す。${shortcut} で表示切替)`} onClick={enableClickThrough} active={ctLeft > 0}>
              <MousePointer2 />
            </OBtn>
            <div ref={opacityRef} className="relative">
              <OBtn title="透明度" onClick={() => setOpacityOpen((o) => !o)} active={opacityOpen}><SunMedium /></OBtn>
              {opacityOpen && (
                <div className="no-drag absolute right-0 top-full mt-1 z-50 glass rounded-lg p-2.5 w-44 shadow-pop animate-pop">
                  <div className="flex justify-between text-[10px] text-fg-muted mb-1">
                    <span>透明度</span>
                    <span className="tabular-nums text-fg">{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={1}
                    step={0.02}
                    value={opacity}
                    onChange={(e) => changeOpacity(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                  <div className="text-[10px] text-fg-subtle mt-1">拡大率は設定画面で変更 ({Math.round(scale * 100)}%)</div>
                </div>
              )}
            </div>
            <OBtn title={`閉じる (${shortcut} で再表示)`} onClick={() => overlay.close().catch(() => {})} className="hover:bg-danger/30 hover:text-danger">
              <X />
            </OBtn>
          </header>

          {/* Tabs */}
          <nav className="flex items-center gap-0.5 px-1.5 pt-1.5 shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "no-drag flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-md text-[11px] font-medium transition-colors focus-ring",
                  tab === t.id ? "bg-white/10 text-fg shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]" : "text-fg-muted hover:text-fg hover:bg-white/5",
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {!loaded ? (
              <div className="flex flex-col gap-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-9" />)}</div>
            ) : (
              <>
                {tab === "comp" && <CompTab />}
                {tab === "items" && <ItemsTab />}
                {tab === "odds" && <OddsTab />}
                {tab === "notes" && <NotesTab />}
              </>
            )}
          </main>

          <footer className="h-5 shrink-0 flex items-center justify-between px-2 border-t border-white/5 text-[9px] text-fg-subtle">
            <span>表示切替: {shortcut}</span>
            <span>ヘッダーをドラッグで移動</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
