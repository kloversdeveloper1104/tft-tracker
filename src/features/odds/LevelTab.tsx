import { useState } from "react";
import { Coins, TrendingUp } from "lucide-react";
import { Card, Input } from "@/components/ui";
import { clamp } from "@/lib/utils";
import { INTEREST_THRESHOLDS, MAX_INTEREST, XP_BUY_COST, XP_PER_BUY, XP_PER_LEVEL, XP_PER_ROUND, interestFor } from "./data";

export function LevelTab() {
  const [gold, setGold] = useState(50);
  const levels = Object.keys(XP_PER_LEVEL).map(Number).sort((a, b) => a - b);
  let cumulative = 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-5 animate-fade-in">
      <Card title="レベルアップに必要なXP" action={<span className="text-xs text-fg-subtle">{XP_BUY_COST}g = {XP_PER_BUY}XP · 自然増加 {XP_PER_ROUND}XP/ラウンド</span>} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-fg-subtle">
                <th className="text-left px-4 py-2 font-medium">レベル</th>
                <th className="text-right px-4 py-2 font-medium">必要XP</th>
                <th className="text-right px-4 py-2 font-medium">累積XP</th>
                <th className="text-right px-4 py-2 font-medium">購入のみのゴールド</th>
                <th className="px-4 py-2 font-medium w-44"></th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => {
                const xp = XP_PER_LEVEL[l];
                cumulative += xp;
                const goldOnly = Math.ceil(xp / XP_PER_BUY) * XP_BUY_COST;
                const max = Math.max(...levels.map((x) => XP_PER_LEVEL[x]));
                return (
                  <tr key={l} className="border-t border-border/60 hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2 font-semibold text-fg">Lv {l - 1} → {l}</td>
                    <td className="px-4 py-2 text-right">{xp}</td>
                    <td className="px-4 py-2 text-right text-fg-muted">{cumulative}</td>
                    <td className="px-4 py-2 text-right text-gold">{goldOnly}g</td>
                    <td className="px-4 py-2">
                      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(xp / max) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 border-t border-border text-[11px] text-fg-subtle">
          ※ Set 18 標準の値です。セットやパッチにより変動する場合があります (src/features/odds/data.ts)。
        </p>
      </Card>

      <div className="flex flex-col gap-5">
        <Card title="利子の目安" action={<Coins className="size-4 text-gold" />}>
          <div className="grid grid-cols-5 gap-2">
            {INTEREST_THRESHOLDS.map((t, i) => (
              <div key={t} className="rounded-lg bg-bg-elev border border-border px-2 py-2.5 text-center">
                <div className="text-[10px] text-fg-subtle">{t}g 以上</div>
                <div className="text-lg font-semibold text-gold tabular-nums">+{i + 1}g</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-fg-muted">所持ゴールド10gごとに1g、最大{MAX_INTEREST}g の利子がラウンド開始時に付与されます。</p>
          <div className="mt-4 flex items-end gap-3">
            <Input
              label="所持ゴールド"
              type="number"
              min={0}
              max={200}
              value={gold}
              onChange={(e) => setGold(clamp(Number(e.target.value) || 0, 0, 200))}
              className="w-36"
            />
            <div className="pb-1.5 text-sm">
              利子 <span className="text-gold font-semibold tabular-nums">+{interestFor(gold)}g</span>
              {interestFor(gold) < MAX_INTEREST && (
                <span className="text-fg-subtle text-xs ml-2">次の利子まで あと {10 - (gold % 10)}g</span>
              )}
            </div>
          </div>
        </Card>

        <Card title="経済のヒント" action={<TrendingUp className="size-4 text-fg-subtle" />}>
          <ul className="text-sm text-fg-muted list-disc pl-5 flex flex-col gap-1.5">
            <li>レベル7 → 8 は {XP_PER_LEVEL[8]}XP ({Math.ceil(XP_PER_LEVEL[8] / XP_PER_BUY) * XP_BUY_COST}g) と重いため、ステージ4-1〜4-2 で 50g を維持しながら上げるのが定石です。</li>
            <li>レベル8 → 9 は {XP_PER_LEVEL[9]}XP。9 に上げる前に 4コストの 2★ を揃えるか判断しましょう。</li>
            <li>各ラウンド {XP_PER_ROUND}XP 自然に入るため、購入で必要なゴールドは表の値より少なくなります。</li>
            <li>50g 以上を保つと毎ラウンド +{MAX_INTEREST}g。リロールは利子ラインを割らない範囲で。</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
