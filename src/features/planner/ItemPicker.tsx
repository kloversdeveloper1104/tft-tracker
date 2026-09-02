import { useMemo, useState, type ReactNode } from "react";
import { useStaticData } from "@/stores/staticData";
import { SearchInput } from "@/components/ui";
import { ItemIcon } from "@/components/tft";
import type { Item, ItemKind } from "@/lib/types";
import { Chip, Popover, norm } from "@/features/reference/primitives";
import { KIND_LABELS } from "@/features/reference/ItemsTab";

type KindFilter = "all" | ItemKind;
const KINDS: KindFilter[] = ["all", "completed", "component", "emblem", "artifact", "radiant", "support", "other"];
const KIND_ORDER: ItemKind[] = ["completed", "component", "emblem", "artifact", "radiant", "support", "special", "other"];

export function ItemPickerPanel({ onPick, exclude = [] }: { onPick: (item: Item) => void; exclude?: string[] }) {
  const data = useStaticData((s) => s.data);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const list = useMemo(() => {
    const items = data?.items ?? [];
    const n = norm(q);
    return items
      .filter((it) => it.icon && (kind === "all" || it.kind === kind || (kind === "other" && it.kind === "special")))
      .filter((it) => !n || norm(it.name).includes(n) || norm(it.apiName).includes(n))
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name, "ja"))
      .slice(0, 240);
  }, [data, q, kind]);
  const present = useMemo(() => new Set((data?.items ?? []).map((i) => i.kind)), [data]);
  return (
    <div className="flex flex-col gap-2">
      <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="アイテムを検索..." autoFocus />
      <div className="flex flex-wrap gap-1">
        {KINDS.filter((k) => k === "all" || present.has(k) || (k === "other" && present.has("special"))).map((k) => (
          <Chip key={k} size="xs" active={kind === k} onClick={() => setKind(k)}>{k === "all" ? "すべて" : KIND_LABELS[k]}</Chip>
        ))}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {list.length === 0 ? (
          <p className="text-xs text-fg-subtle text-center py-4">該当なし</p>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {list.map((it) => (
              <button
                key={it.apiName}
                type="button"
                onClick={() => onPick(it)}
                className="rounded-md p-0.5 hover:bg-surface-3 transition-colors focus-ring disabled:opacity-30"
                disabled={exclude.includes(it.apiName)}
              >
                <ItemIcon item={it} size={30} rounded="rounded-md" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ItemPickerPopover({ trigger, onPick, exclude }: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; onPick: (item: Item) => void; exclude?: string[];
}) {
  return (
    <Popover trigger={trigger} width={320}>
      {(close) => <ItemPickerPanel exclude={exclude} onPick={(it) => { onPick(it); close(); }} />}
    </Popover>
  );
}
