import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir }

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** When present the column is sortable. */
  sortValue?: (row: T) => number | string | null | undefined;
  align?: "left" | "right" | "center";
  width?: number | string;
  /** Direction used the first time this column is clicked (default: numbers desc, strings asc). */
  defaultDir?: SortDir;
  className?: string;
  title?: string;
}

export interface SortableTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  defaultSort?: SortState;
  onRowClick?: (row: T) => void;
  /** Rendered in an extra full-width row beneath the row whose key is in `expandedKeys`. */
  renderDetail?: (row: T) => ReactNode;
  expandedKeys?: ReadonlySet<string>;
  selectedKey?: string | null;
  emptyMessage?: ReactNode;
  maxHeight?: number | string;
  dense?: boolean;
  className?: string;
}

function compare(a: number | string | null | undefined, b: number | string | null | undefined): number {
  const aNil = a === null || a === undefined || (typeof a === "number" && Number.isNaN(a));
  const bNil = b === null || b === undefined || (typeof b === "number" && Number.isNaN(b));
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ja");
}

const alignCls = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function SortableTable<T>({
  columns, rows, rowKey, defaultSort, onRowClick, renderDetail, expandedKeys, selectedKey,
  emptyMessage = "データがありません", maxHeight = "70vh", dense, className,
}: SortableTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    const keyed = rows.map((row, i) => ({ row, i, v: sv(row) }));
    keyed.sort((a, b) => {
      const c = compare(a.v, b.v);
      if (c !== 0) {
        // nil values always sink to the bottom regardless of direction
        const aNil = a.v === null || a.v === undefined;
        const bNil = b.v === null || b.v === undefined;
        if (aNil || bNil) return c;
        return sort.dir === "asc" ? c : -c;
      }
      return a.i - b.i;
    });
    return keyed.map((k) => k.row);
  }, [rows, sort, columns]);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (prev?.key === col.key) return { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" };
      const sample = rows.length ? col.sortValue!(rows[0]) : undefined;
      const dir = col.defaultDir ?? (typeof sample === "string" ? "asc" : "desc");
      return { key: col.key, dir };
    });
  };

  const cellPad = dense ? "px-2.5 py-1.5" : "px-3 py-2";

  return (
    <div className={cn("overflow-auto rounded-lg border border-border bg-surface", className)} style={{ maxHeight }}>
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--color-border)]">
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const sortable = !!col.sortValue;
              return (
                <th
                  key={col.key}
                  scope="col"
                  title={col.title}
                  style={{ width: col.width }}
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider text-fg-subtle whitespace-nowrap select-none",
                    cellPad, alignCls[col.align ?? "left"], col.className,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded focus-ring transition-colors hover:text-fg",
                        active && "text-fg",
                        col.align === "right" && "flex-row-reverse",
                      )}
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span>{col.header}</span>
                      {active ? (
                        sort.dir === "asc" ? <ChevronUp className="size-3 text-gold" /> : <ChevronDown className="size-3 text-gold" />
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-fg-muted">{emptyMessage}</td>
            </tr>
          )}
          {sorted.map((row) => {
            const key = rowKey(row);
            const expanded = expandedKeys?.has(key) ?? false;
            const selected = selectedKey === key;
            const clickable = !!onRowClick;
            return (
              <Fragment key={key}>
                <tr
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-t border-border/70 transition-colors",
                    clickable && "cursor-pointer hover:bg-surface-2",
                    (selected || expanded) && "bg-surface-2",
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn(cellPad, alignCls[col.align ?? "left"], "align-middle", col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {expanded && renderDetail && (
                  <tr className="border-t border-border/70 bg-bg-elev/60">
                    <td colSpan={columns.length} className="p-0">
                      <div className="animate-fade-in">{renderDetail(row)}</div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
