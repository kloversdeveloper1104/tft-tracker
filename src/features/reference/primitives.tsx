// Small primitives shared by the 図鑑 / プランナー features (not part of the global UI kit).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COST_COLORS } from "@/data/odds";
import { SearchInput, Skeleton } from "@/components/ui";
import { TraitIcon } from "@/components/tft";
import type { Trait } from "@/lib/types";

// ----- Helpers ------------------------------------------------------------------
export function norm(s: string): string {
  return s.toLowerCase().normalize("NFKC").trim();
}

export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 100) / 100);
}

// ----- Chip (toggle) --------------------------------------------------------------
export function Chip({ active, onClick, children, color, className, size = "sm", title }: {
  active?: boolean; onClick?: () => void; children: ReactNode; color?: string; className?: string; size?: "xs" | "sm"; title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium transition-all duration-150 focus-ring select-none whitespace-nowrap",
        size === "xs" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
        active
          ? "bg-accent/15 border-accent/60 text-fg shadow-[0_0_12px_-4px_var(--color-accent)]"
          : "bg-bg-elev border-border text-fg-muted hover:text-fg hover:border-border-strong hover:bg-surface-2",
        className,
      )}
      style={active && color ? { color, borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 14%, transparent)`, boxShadow: `0 0 12px -4px ${color}` } : undefined}
    >
      {children}
    </button>
  );
}

export function CostChips({ selected, onToggle, className }: { selected: Set<number>; onToggle: (cost: number) => void; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label="コストで絞り込み">
      {[1, 2, 3, 4, 5].map((c) => (
        <Chip key={c} active={selected.has(c)} onClick={() => onToggle(c)} color={COST_COLORS[c]} className="min-w-8 justify-center tabular-nums" title={`${c}コスト`}>
          {c}
        </Chip>
      ))}
    </div>
  );
}

// ----- Popover (portal, anchored to trigger) ---------------------------------------
export function Popover({ trigger, children, align = "start", width = 300, open: controlled, onOpenChange, className }: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  width?: number;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  className?: string;
}) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = useCallback((o: boolean) => { setInner(o); onOpenChange?.(o); }, [onOpenChange]);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0, up: false });

  useLayoutEffect(() => {
    if (!open) return;
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const up = r.bottom + 320 > vh && r.top > vh / 2;
    let left = align === "end" ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, vw - width - 8));
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, up });
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = (e: Event) => { if (panel.current?.contains(e.target as Node)) return; setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, setOpen]);

  const close = useCallback(() => setOpen(false), [setOpen]);
  return (
    <>
      <span ref={anchor} className="inline-flex">{trigger({ open, toggle: () => setOpen(!open) })}</span>
      {open && createPortal(
        <div
          ref={panel}
          className={cn("fixed z-[950] card shadow-pop animate-pop p-2", className)}
          style={{ left: pos.left, top: pos.top, width, transform: pos.up ? "translateY(-100%)" : undefined }}
        >
          {typeof children === "function" ? children(close) : children}
        </div>,
        document.body,
      )}
    </>
  );
}

// ----- Trait multi-select -----------------------------------------------------------
export function TraitPicker({ traits, selected, onToggle, onClear, label = "特性", single = false, onPick }: {
  traits: Trait[]; selected: Set<string>; onToggle: (apiName: string) => void; onClear?: () => void; label?: string;
  /** single-pick mode: calls onPick and closes */
  single?: boolean; onPick?: (apiName: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const n = norm(q);
    return [...traits]
      .filter((t) => !n || norm(t.name).includes(n) || norm(t.apiName).includes(n))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [traits, q]);
  return (
    <Popover
      width={280}
      trigger={({ open, toggle }) => (
        <Chip active={selected.size > 0 || open} onClick={toggle}>
          {label}
          {selected.size > 0 && <span className="rounded-full bg-accent/30 px-1.5 text-[10px] tabular-nums">{selected.size}</span>}
          <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
        </Chip>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-2">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="特性を検索..." autoFocus />
          <div className="max-h-72 overflow-y-auto flex flex-col gap-0.5 pr-1">
            {list.length === 0 && <p className="text-xs text-fg-subtle px-2 py-3 text-center">該当なし</p>}
            {list.map((t) => {
              const on = selected.has(t.apiName);
              return (
                <button
                  key={t.apiName}
                  type="button"
                  onClick={() => { if (single && onPick) { onPick(t.apiName); close(); } else onToggle(t.apiName); }}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 h-8 text-xs text-left transition-colors focus-ring",
                    on ? "bg-accent/15 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <TraitIcon trait={t} size={18} showTooltip={false} style={on ? 3 : 0} />
                  <span className="flex-1 truncate">{t.name}</span>
                  {on && <Check className="size-3.5 text-accent" />}
                </button>
              );
            })}
          </div>
          {onClear && selected.size > 0 && (
            <button type="button" onClick={onClear} className="text-xs text-fg-muted hover:text-fg self-end px-2 py-1 focus-ring rounded">クリア</button>
          )}
        </div>
      )}
    </Popover>
  );
}

export function SelectedTraitChips({ ids, traitsById, onRemove }: { ids: Set<string>; traitsById: Map<string, Trait>; onRemove: (id: string) => void }) {
  if (ids.size === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {[...ids].map((id) => {
        const t = traitsById.get(id);
        return (
          <Chip key={id} active onClick={() => onRemove(id)} size="xs" title="解除">
            {t && <TraitIcon trait={t} size={14} showTooltip={false} style={3} />}
            {t?.name ?? id}
            <X className="size-3" />
          </Chip>
        );
      })}
    </div>
  );
}

// ----- Pagination -----------------------------------------------------------------
export function useShowMore<T>(list: T[], page = 120) {
  const [limit, setLimit] = useState(page);
  useEffect(() => { setLimit(page); }, [list, page]);
  return {
    visible: list.length > limit ? list.slice(0, limit) : list,
    hasMore: list.length > limit,
    remaining: Math.max(0, list.length - limit),
    showMore: () => setLimit((l) => l + page),
  };
}

export function ShowMore({ hasMore, remaining, onClick }: { hasMore: boolean; remaining: number; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center pt-2">
      <button
        type="button"
        onClick={onClick}
        className="h-9 px-5 rounded-lg border border-border bg-surface-2 text-sm text-fg-muted hover:text-fg hover:bg-surface-3 transition-colors focus-ring"
      >
        さらに表示 <span className="tabular-nums text-fg-subtle">(残り {remaining})</span>
      </button>
    </div>
  );
}

// ----- Misc ------------------------------------------------------------------------
export function ResultCount({ shown, total, unit = "件" }: { shown: number; total: number; unit?: string }) {
  return (
    <span className="text-xs text-fg-subtle tabular-nums whitespace-nowrap">
      {shown === total ? `${total}${unit}` : `${shown} / ${total}${unit}`}
    </span>
  );
}

export function CardGridSkeleton({ count = 12, height = 120, className }: { count?: number; height?: number; className?: string }) {
  return (
    <div className={cn("grid gap-2", className ?? "grid-cols-[repeat(auto-fill,minmax(150px,1fr))]")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height }}><Skeleton className="rounded-lg w-full h-full" /></div>
      ))}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-sm font-semibold tracking-wide text-fg flex items-center gap-2">
        <span className="h-4 w-0.5 rounded-full bg-gold" />
        {children}
      </h2>
      {right}
    </div>
  );
}
