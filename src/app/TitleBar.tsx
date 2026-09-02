import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { overlay } from "@/lib/api";
import { Tooltip, Kbd } from "@/components/ui";
import { useSettings } from "@/stores/settings";

export function TitleBar() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);
  const shortcut = useSettings((s) => s.settings.overlayShortcut);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setMaximized).catch(() => {});
    win.onResized(() => win.isMaximized().then(setMaximized).catch(() => {})).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [win]);

  const btn = "h-full w-11 inline-flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5 transition-colors no-drag";
  return (
    <div className="drag-region h-10 shrink-0 flex items-center justify-between bg-bg-elev border-b border-border select-none" onDoubleClick={() => win.toggleMaximize()}>
      <div className="flex items-center gap-2.5 pl-3.5">
        <img src="/icon.png" alt="" className="size-5" />
        <span className="text-xs font-semibold tracking-wide text-fg-muted">TFT Tracker</span>
      </div>
      <div className="flex items-center h-full">
        <Tooltip content={<span className="flex items-center gap-2">オーバーレイ切替 <Kbd>{shortcut.replace("CommandOrControl", "Ctrl")}</Kbd></span>} side="bottom">
          <button className={cn(btn, "w-auto px-3 gap-1.5 text-xs")} onClick={() => overlay.toggle()}>
            <Layers className="size-3.5" /> Overlay
          </button>
        </Tooltip>
        <div className="w-px h-5 bg-border mx-1" />
        <button className={btn} onClick={() => win.minimize()} aria-label="最小化"><Minus className="size-4" /></button>
        <button className={btn} onClick={() => win.toggleMaximize()} aria-label="最大化">
          {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
        </button>
        <button className={cn(btn, "hover:bg-danger hover:text-white")} onClick={() => win.close()} aria-label="閉じる"><X className="size-4" /></button>
      </div>
    </div>
  );
}
