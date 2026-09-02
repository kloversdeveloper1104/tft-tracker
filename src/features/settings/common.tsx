import type { ReactNode } from "react";
import { emit } from "@tauri-apps/api/event";
import { Save } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import { cn } from "@/lib/utils";
import type { AppSettings } from "@/lib/types";

/** Persist a settings patch, notify other windows and toast. */
export async function saveSettings(patch: Partial<AppSettings>, message = "保存しました"): Promise<boolean> {
  try {
    await useSettings.getState().update(patch);
    await emit("settings-updated", useSettings.getState().settings).catch(() => {});
    if (message) toast.success(message);
    return true;
  } catch (e) {
    toast.error("保存に失敗しました", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Settings section card with dirty indicator and optional save button. */
export function SettingsCard({ title, icon, description, dirty, onSave, saving, children, action, className }: {
  title: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  dirty?: boolean;
  onSave?: () => void;
  saving?: boolean;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn("transition-shadow", dirty && "shadow-[0_0_0_1px_rgba(232,184,74,0.35)]", className)}
      title={
        <span className="inline-flex items-center gap-2">
          {icon && <span className="text-gold [&>svg]:size-4">{icon}</span>}
          {title}
          {dirty && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-gold/15 text-gold text-[10px] font-medium px-1.5 py-0.5"><span className="size-1.5 rounded-full bg-gold animate-pulse-soft" />未保存</span>}
        </span>
      }
      action={
        <div className="flex items-center gap-2">
          {action}
          {onSave && (
            <Button size="sm" variant={dirty ? "gold" : "secondary"} icon={<Save className="size-3.5" />} onClick={onSave} loading={saving} disabled={!dirty}>
              保存
            </Button>
          )}
        </div>
      }
    >
      {description && <p className="text-xs text-fg-muted mb-4 -mt-1">{description}</p>}
      {children}
    </Card>
  );
}

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5 border-b border-border/60 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm text-fg">{label}</div>
        {hint && <div className="text-xs text-fg-subtle mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Enter submits, blur submits (only when dirty). */
export function submitOn(onSubmit: () => void) {
  return {
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onSubmit(); } },
    onBlur: () => onSubmit(),
  };
}
