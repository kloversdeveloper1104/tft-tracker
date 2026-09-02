import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Compact chip-style toggle used across the overlay. */
export function OChip({ active, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "no-drag inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-md text-[11px] font-medium tabular-nums transition-colors focus-ring",
        active ? "bg-accent text-white" : "bg-white/5 text-fg-muted hover:text-fg hover:bg-white/10",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Compact icon button. */
export function OBtn({ className, active, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "no-drag inline-flex items-center justify-center size-6 rounded-md transition-colors focus-ring [&>svg]:size-3.5",
        active ? "bg-accent/25 text-accent" : "text-fg-muted hover:text-fg hover:bg-white/10",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function OSection({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      <header className="flex items-center justify-between">
        <h4 className="text-[10px] uppercase tracking-wider font-semibold text-fg-subtle">{title}</h4>
        {action}
      </header>
      {children}
    </section>
  );
}

export function OEmpty({ icon, title, description }: { icon?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-10 px-4 animate-fade-in">
      {icon && <div className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-fg-subtle [&>svg]:size-5">{icon}</div>}
      <div className="text-xs font-semibold text-fg">{title}</div>
      {description && <div className="text-[11px] text-fg-muted leading-relaxed">{description}</div>}
    </div>
  );
}

export function OInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "no-drag h-7 rounded-md border border-white/10 bg-black/25 px-2 text-[12px] text-fg outline-none focus:border-accent transition-colors tabular-nums select-text",
        className,
      )}
      {...rest}
    />
  );
}
