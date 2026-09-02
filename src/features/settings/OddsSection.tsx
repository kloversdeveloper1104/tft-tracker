import { useEffect, useMemo, useState } from "react";
import { Dices, RotateCcw, AlertTriangle } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { COST_COLORS, DEFAULT_ODDS } from "@/data/odds";
import { useSettings } from "@/stores/settings";
import { cn, clamp } from "@/lib/utils";
import type { OddsTable } from "@/lib/types";
import { COSTS, COST_LABELS, LEVELS } from "@/features/odds/data";
import { oddsEqual } from "@/features/odds/math";
import { SettingsCard, saveSettings } from "./common";

function cloneOdds(o: OddsTable): OddsTable {
  return {
    shopOdds: Object.fromEntries(LEVELS.map((l) => [l, [...(o.shopOdds[l] ?? [0, 0, 0, 0, 0])]])),
    poolSize: { ...o.poolSize },
    rerollCost: o.rerollCost,
    shopSlots: o.shopSlots,
  };
}

export function OddsSection() {
  const saved = useSettings((s) => s.settings.odds);
  const [draft, setDraft] = useState<OddsTable>(() => cloneOdds(saved ?? DEFAULT_ODDS));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(cloneOdds(saved ?? DEFAULT_ODDS)); }, [saved]);

  const dirty = !oddsEqual(draft, saved ?? DEFAULT_ODDS);
  const isDefault = oddsEqual(draft, DEFAULT_ODDS);
  const rowSums = useMemo(() => LEVELS.map((l) => (draft.shopOdds[l] ?? []).reduce((a, b) => a + (b || 0), 0)), [draft]);
  const invalidRows = rowSums.filter((s) => Math.abs(s - 100) > 0.001).length;

  const setCell = (l: number, i: number, v: number) => {
    setDraft((d) => {
      const row = [...(d.shopOdds[l] ?? [0, 0, 0, 0, 0])];
      row[i] = clamp(v, 0, 100);
      return { ...d, shopOdds: { ...d.shopOdds, [l]: row } };
    });
  };

  const save = async () => {
    if (!dirty || invalidRows > 0) return;
    setSaving(true);
    await saveSettings({ odds: isDefault ? null : cloneOdds(draft) });
    setSaving(false);
  };

  const cellCls = "w-full h-8 rounded-md bg-bg-elev border border-border px-2 text-sm text-right tabular-nums outline-none focus:border-accent transition-colors select-text";

  return (
    <SettingsCard
      title="確率テーブル"
      icon={<Dices />}
      description="ショップ確率・プールサイズ・リロール費用を編集できます。各行の合計は 100 である必要があります。既定値と同じ場合は既定値として保存されます。"
      dirty={dirty}
      onSave={save}
      saving={saving}
      action={
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setDraft(cloneOdds(DEFAULT_ODDS))} disabled={isDefault}>
          既定値に戻す
        </Button>
      }
    >
      {invalidRows > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="size-4" /> 合計が 100 でない行が {invalidRows} 行あります。修正すると保存できます。
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-6">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 border-spacing-x-1.5">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-fg-subtle">
                <th className="text-left font-medium px-1">Lv</th>
                {COSTS.map((c) => (
                  <th key={c} className="font-medium text-right px-1">
                    <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: COST_COLORS[c] }} />{COST_LABELS[c]}</span>
                  </th>
                ))}
                <th className="font-medium text-right px-1">合計</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((l, li) => {
                const ok = Math.abs(rowSums[li] - 100) < 0.001;
                return (
                  <tr key={l}>
                    <td className="px-1 text-sm font-semibold text-fg-muted tabular-nums">{l}</td>
                    {COSTS.map((_, i) => (
                      <td key={i} className="w-20">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={draft.shopOdds[l]?.[i] ?? 0}
                          onChange={(e) => setCell(l, i, Number(e.target.value) || 0)}
                          className={cn(cellCls, !ok && "border-danger/60")}
                        />
                      </td>
                    ))}
                    <td className={cn("px-1 text-right text-sm tabular-nums font-medium", ok ? "text-success" : "text-danger")}>{rowSums[li]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3">
          <div className="text-xs font-medium text-fg-muted">プールサイズ (1体あたりの枚数)</div>
          <div className="grid grid-cols-5 gap-1.5">
            {COSTS.map((c) => (
              <div key={c} className="flex flex-col gap-1">
                <span className="text-[10px] text-center" style={{ color: COST_COLORS[c] }}>{c}コス</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={draft.poolSize[c] ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, poolSize: { ...d.poolSize, [c]: clamp(Number(e.target.value) || 0, 0, 99) } }))}
                  className={cellCls}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <Input label="リロール費用" type="number" min={1} max={20} value={draft.rerollCost} onChange={(e) => setDraft((d) => ({ ...d, rerollCost: clamp(Number(e.target.value) || 1, 1, 20) }))} right={<span className="text-xs">g</span>} />
            <Input label="ショップ枠数" type="number" min={1} max={10} value={draft.shopSlots} onChange={(e) => setDraft((d) => ({ ...d, shopSlots: clamp(Number(e.target.value) || 1, 1, 10) }))} />
          </div>
          <div className="text-[11px] text-fg-subtle">
            {isDefault ? "現在は既定値 (Set 18 標準) です。" : "カスタム値が適用されます。確率ページとオーバーレイに反映されます。"}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
