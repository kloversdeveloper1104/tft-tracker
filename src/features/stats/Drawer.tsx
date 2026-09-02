import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui";

const KEYFRAMES = `@keyframes stats-drawer-in { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: translateX(0) } }`;

/** Right-side sliding panel (feature-local; the shared Modal is centered). */
export function Drawer({ open, onClose, title, children, width = 560 }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[900] animate-fade-in" onMouseDown={onClose}>
      <style>{KEYFRAMES}</style>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <aside
        role="dialog"
        aria-modal
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 h-full max-w-full bg-surface border-l border-border shadow-pop flex flex-col"
        style={{ width, animation: "stats-drawer-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both" }}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border shrink-0">
          <div className="min-w-0 flex-1">{title}</div>
          <IconButton size="sm" title="閉じる" onClick={onClose}><X className="size-4" /></IconButton>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
