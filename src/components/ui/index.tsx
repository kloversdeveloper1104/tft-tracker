import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Check, Info, AlertTriangle, XCircle, CheckCircle2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast";

// ----- Button ----------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold" | "outline";
type Size = "xs" | "sm" | "md" | "lg";

const variantCls: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-[#8eabff] active:bg-accent-dim shadow-[0_4px_16px_-6px_rgba(124,156,255,0.6)]",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3 border border-border",
  ghost: "bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30",
  gold: "bg-gradient-to-b from-gold-bright to-gold text-[#2a1f05] font-semibold hover:brightness-110 shadow-[0_4px_18px_-6px_rgba(232,184,74,0.7)]",
  outline: "bg-transparent border border-border-strong text-fg hover:bg-surface-2",
};
const sizeCls: Record<Size, string> = {
  xs: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-base gap-2 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-all duration-150 focus-ring select-none",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100",
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ className, size = "md", title, ...rest }: ButtonProps & { title?: string }) {
  const s = { xs: "size-7", sm: "size-8", md: "size-9", lg: "size-11" }[size];
  return (
    <Button
      variant="ghost"
      size={size}
      title={title}
      aria-label={title}
      className={cn("px-0 rounded-md", s, className)}
      {...rest}
    />
  );
}

// ----- Card --------------------------------------------------------------------
export function Card({ className, children, title, action, padded = true }: {
  className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; padded?: boolean;
}) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold tracking-wide text-fg">{title}</h3>
          {action}
        </header>
      )}
      <div className={cn(padded && "p-4")}>{children}</div>
    </section>
  );
}

// ----- Badge --------------------------------------------------------------------
export function Badge({ children, color, className, size = "sm" }: {
  children: ReactNode; color?: string; className?: string; size?: "xs" | "sm";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium border",
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
        className,
      )}
      style={color ? { color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` } : undefined}
    >
      {children}
    </span>
  );
}

// ----- Tabs -----------------------------------------------------------------------
export interface TabItem<T extends string> { id: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode }

export function Tabs<T extends string>({ items, value, onChange, className, size = "md" }: {
  items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string; size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={cn("inline-flex items-center gap-1 rounded-lg bg-bg-elev p-1 border border-border", className)}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-all duration-150 focus-ring",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active ? "bg-surface-3 text-fg shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]" : "text-fg-muted hover:text-fg hover:bg-surface-2",
            )}
          >
            {it.icon}
            {it.label}
            {it.badge}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedControl<T extends string>(props: Parameters<typeof Tabs<T>>[0]) {
  return <Tabs {...props} size="sm" />;
}

// ----- Inputs ----------------------------------------------------------------------
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, left, right, className, id, ...rest }, ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <label htmlFor={inputId} className="text-xs font-medium text-fg-muted">{label}</label>}
      <div className={cn(
        "flex items-center gap-2 h-9 rounded-lg border bg-bg-elev px-3 transition-colors focus-within:border-accent",
        error ? "border-danger/60" : "border-border",
      )}>
        {left && <span className="text-fg-subtle shrink-0">{left}</span>}
        <input
          ref={ref}
          id={inputId}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-fg placeholder:text-fg-subtle select-text"
          {...rest}
        />
        {right && <span className="text-fg-subtle shrink-0">{right}</span>}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
});

export function SearchInput(props: InputProps) {
  return <Input left={<Search className="size-4" />} placeholder="検索..." {...props} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  options: { value: string | number; label: ReactNode }[];
}

export function Select({ label, options, className, id, ...rest }: SelectProps) {
  const auto = useId();
  const selId = id ?? auto;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <label htmlFor={selId} className="text-xs font-medium text-fg-muted">{label}</label>}
      <select
        id={selId}
        className="h-9 rounded-lg border border-border bg-bg-elev px-3 text-sm text-fg outline-none focus:border-accent transition-colors"
        {...rest}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value} className="bg-surface text-fg">{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center justify-between gap-4 cursor-pointer", disabled && "opacity-50 cursor-not-allowed")}>
      <span className="flex flex-col">
        {label && <span className="text-sm text-fg">{label}</span>}
        {description && <span className="text-xs text-fg-subtle">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-ring",
          checked ? "bg-accent" : "bg-surface-3 border border-border-strong",
        )}
      >
        <span className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )} />
      </button>
    </label>
  );
}

export function Slider({ value, min, max, step = 1, onChange, label, format }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label?: ReactNode; format?: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <div className="flex justify-between text-xs">
          <span className="font-medium text-fg-muted">{label}</span>
          <span className="tabular-nums text-fg">{format ? format(value) : value}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

// ----- Tooltip (hover, portal) --------------------------------------------------------
export function Tooltip({ content, children, className, side = "top", delay = 80 }: {
  content: ReactNode; children: ReactNode; className?: string; side?: "top" | "bottom" | "left" | "right"; delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = () => {
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const x = side === "left" ? r.left : side === "right" ? r.right : r.left + r.width / 2;
      const y = side === "top" ? r.top : side === "bottom" ? r.bottom : r.top + r.height / 2;
      setPos({ x, y });
      setOpen(true);
    }, delay);
  };
  const hide = () => { window.clearTimeout(timer.current); setOpen(false); };
  const transform = {
    top: "translate(-50%, calc(-100% - 8px))",
    bottom: "translate(-50%, 8px)",
    left: "translate(calc(-100% - 8px), -50%)",
    right: "translate(8px, -50%)",
  }[side];
  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} className={cn("inline-flex", className)}>
      {children}
      {open && content && createPortal(
        <div
          role="tooltip"
          className="fixed z-[1000] pointer-events-none animate-fade-in max-w-xs"
          style={{ left: pos.x, top: pos.y, transform }}
        >
          <div className="glass rounded-lg px-3 py-2 text-xs text-fg shadow-pop">{content}</div>
        </div>,
        document.body,
      )}
    </span>
  );
}

// ----- Modal ----------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, width = "max-w-lg" }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center p-6 animate-fade-in" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal
        className={cn("relative w-full card shadow-pop animate-pop", width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton size="sm" title="閉じる" onClick={onClose}><X className="size-4" /></IconButton>
        </header>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <footer className="flex justify-end gap-2 px-5 py-3 border-t border-border">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ----- Feedback --------------------------------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-fg-muted", className)} />;
}

export function ProgressBar({ value, max = 1, className, color }: { value: number; max?: number; className?: string; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-surface-3 overflow-hidden", className)}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color ?? "var(--color-accent)" }} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: {
  icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center gap-3 py-14 px-6 animate-fade-in", className)}>
      {icon && <div className="size-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-fg-subtle [&>svg]:size-7">{icon}</div>}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="text-sm text-fg-muted max-w-md">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, color, className }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; color?: string; className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
      <span className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium">{label}</span>
      <span className="text-xl font-semibold tabular-nums leading-tight" style={color ? { color } : undefined}>{value}</span>
      {sub && <span className="text-xs text-fg-muted">{sub}</span>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="px-1.5 py-0.5 rounded border border-border-strong bg-bg-elev text-[11px] font-mono text-fg-muted">{children}</kbd>;
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}
        className={cn(
          "size-4 rounded border flex items-center justify-center transition-colors focus-ring",
          checked ? "bg-accent border-accent" : "bg-bg-elev border-border-strong",
        )}
      >
        {checked && <Check className="size-3 text-white" strokeWidth={3} />}
      </span>
      {label && <span className="text-sm text-fg">{label}</span>}
    </label>
  );
}

// ----- Toaster ----------------------------------------------------------------------------
const toastIcon = {
  info: <Info className="size-4 text-info" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  warning: <AlertTriangle className="size-4 text-warning" />,
  error: <XCircle className="size-4 text-danger" />,
};

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return createPortal(
    <div className="fixed bottom-4 right-4 z-[1100] flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div key={t.id} className="glass rounded-lg px-3 py-2.5 shadow-pop animate-slide-up flex gap-2.5 items-start">
          <span className="mt-0.5 shrink-0">{toastIcon[t.kind]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-fg">{t.title}</p>
            {t.message && <p className="text-xs text-fg-muted mt-0.5 break-words">{t.message}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-fg-subtle hover:text-fg"><X className="size-3.5" /></button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ----- Page scaffolding ---------------------------------------------------------------------
export function PageHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div className="flex items-center gap-3">
        {icon && <div className="size-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-gold [&>svg]:size-5">{icon}</div>}
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn("h-full overflow-y-auto", className)}>
      <div className={cn("mx-auto px-6 py-6 animate-fade-in", wide ? "max-w-[1600px]" : "max-w-[1280px]")}>{children}</div>
    </div>
  );
}
