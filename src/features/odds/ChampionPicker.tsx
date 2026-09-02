import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStaticData } from "@/stores/staticData";
import { ChampionIcon, CostChip } from "@/components/tft";
import type { Champion } from "@/lib/types";

/** Searchable champion picker (dropdown with icons). */
export function ChampionPicker({ value, onChange, label, placeholder = "チャンピオンを検索...", className, compact }: {
  value: string | null;
  onChange: (c: Champion | null) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  compact?: boolean;
}) {
  const champions = useStaticData((s) => s.data?.champions);
  const byId = useStaticData((s) => s.championsById);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = value ? byId.get(value) : undefined;

  const list = useMemo(() => {
    const all = (champions ?? []).filter((c) => c.cost >= 1 && c.cost <= 5);
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? all.filter((c) => c.name.toLowerCase().includes(needle) || c.apiName.toLowerCase().includes(needle))
      : all;
    return filtered.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)).slice(0, 60);
  }, [champions, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => { setCursor(0); }, [q]);

  const pick = (c: Champion | null) => {
    onChange(c);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={rootRef} className={cn("relative flex flex-col gap-1.5", className)}>
      {label && <span className="text-xs font-medium text-fg-muted">{label}</span>}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 0); }}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border bg-bg-elev px-2.5 text-left text-sm transition-colors hover:border-border-strong focus-ring",
          compact ? "h-8" : "h-9",
          open && "border-accent",
        )}
      >
        {selected ? (
          <>
            <ChampionIcon champion={selected} size={compact ? 20 : 24} showTooltip={false} />
            <span className="flex-1 truncate text-fg">{selected.name}</span>
            <CostChip cost={selected.cost} />
            <span
              role="button"
              aria-label="クリア"
              className="text-fg-subtle hover:text-fg"
              onClick={(e) => { e.stopPropagation(); pick(null); }}
            >
              <X className="size-3.5" />
            </span>
          </>
        ) : (
          <>
            <Search className="size-4 text-fg-subtle" />
            <span className="flex-1 truncate text-fg-subtle">{placeholder}</span>
            <ChevronDown className="size-3.5 text-fg-subtle" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 card shadow-pop animate-pop overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-2.5 h-9">
            <Search className="size-4 text-fg-subtle" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(list.length - 1, c + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
                else if (e.key === "Enter") { e.preventDefault(); if (list[cursor]) pick(list[cursor]); }
                else if (e.key === "Escape") setOpen(false);
              }}
              placeholder="名前で検索"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle select-text"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {!champions && <div className="px-3 py-4 text-xs text-fg-subtle">静的データを読み込み中...</div>}
            {champions && list.length === 0 && <div className="px-3 py-4 text-xs text-fg-subtle">該当なし</div>}
            {list.map((c, i) => (
              <button
                key={c.apiName}
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(c)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-sm transition-colors",
                  i === cursor ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2",
                )}
              >
                <ChampionIcon champion={c} size={26} showTooltip={false} />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-[11px] text-fg-subtle truncate max-w-[40%]">{c.traits.join(" / ")}</span>
                <CostChip cost={c.cost} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
