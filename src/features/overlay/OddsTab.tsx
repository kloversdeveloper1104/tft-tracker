import { useState } from "react";
import { COST_COLORS, DEFAULT_ODDS } from "@/data/odds";
import { useSettings } from "@/stores/settings";
import { useStaticData } from "@/stores/staticData";
import { COST_LABELS, LEVELS, championsPerCostFrom } from "@/features/odds/data";
import { OChip, OSection } from "./ui";

export function OddsTab() {
  const odds = useSettings((s) => s.settings.odds) ?? DEFAULT_ODDS;
  const champions = useStaticData((s) => s.data?.champions);
  const perCost = championsPerCostFrom(champions);
  const [level, setLevel] = useState(8);
  const row = odds.shopOdds[level] ?? [0, 0, 0, 0, 0];
  const slots = odds.shopSlots || 5;

  return (
    <div className="flex flex-col gap-3 p-3 animate-fade-in">
      <OSection title="レベル">
        <div className="flex flex-wrap gap-1">
          {LEVELS.map((l) => (
            <OChip key={l} active={l === level} onClick={() => setLevel(l)} className="min-w-7">{l}</OChip>
          ))}
        </div>
      </OSection>

      <OSection title={`Lv${level} ショップ確率`} action={<span className="text-[10px] text-fg-subtle tabular-nums">{slots}枠 · リロール{odds.rerollCost}g</span>}>
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3, 4, 5].map((c) => {
            const v = row[c - 1] ?? 0;
            return (
              <div key={c} className="flex items-center gap-2">
                <span className="w-14 text-[11px] text-fg-muted inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: COST_COLORS[c] }} />
                  {COST_LABELS[c]}
                </span>
                <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${v}%`, background: COST_COLORS[c] }} />
                </div>
                <span className="w-10 text-right text-[12px] font-semibold tabular-nums">{v}%</span>
              </div>
            );
          })}
        </div>
      </OSection>

      <OSection title="プール">
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-fg-subtle">
              <th className="text-left font-medium py-0.5">コスト</th>
              <th className="text-right font-medium py-0.5">1体あたり</th>
              <th className="text-right font-medium py-0.5">種類</th>
              <th className="text-right font-medium py-0.5">合計</th>
              <th className="text-right font-medium py-0.5">期待枚数/回</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((c) => {
              const v = row[c - 1] ?? 0;
              return (
                <tr key={c} className="border-t border-white/5">
                  <td className="py-0.5" style={{ color: COST_COLORS[c] }}>{COST_LABELS[c]}</td>
                  <td className="py-0.5 text-right">{odds.poolSize[c] ?? 0}</td>
                  <td className="py-0.5 text-right text-fg-muted">{perCost[c]}</td>
                  <td className="py-0.5 text-right text-fg-muted">{(odds.poolSize[c] ?? 0) * perCost[c]}</td>
                  <td className="py-0.5 text-right">{((v / 100) * slots).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </OSection>
    </div>
  );
}
