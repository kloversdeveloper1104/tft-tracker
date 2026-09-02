import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Target, Info } from "lucide-react";
import { Card, Input, Select, Stat } from "@/components/ui";
import { ChampionIcon } from "@/components/tft";
import { COST_COLORS } from "@/data/odds";
import { useStaticData } from "@/stores/staticData";
import { clamp, cn } from "@/lib/utils";
import type { OddsTable } from "@/lib/types";
import { ChampionPicker } from "./ChampionPicker";
import { computeHit } from "./math";
import { COST_LABELS, LEVELS } from "./data";
import { CHART_AXIS, CHART_GRID, ChartTip } from "./chartBits";

function NumberField({ label, value, min, max, onChange, hint, suffix }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string; suffix?: string;
}) {
  return (
    <Input
      label={label}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(clamp(Number(e.target.value) || 0, min, max))}
      hint={hint}
      right={suffix && <span className="text-xs">{suffix}</span>}
    />
  );
}

export function HitCalculatorTab({ odds, championsPerCost }: { odds: OddsTable; championsPerCost: Record<number, number> }) {
  const byId = useStaticData((s) => s.championsById);
  const [level, setLevel] = useState(8);
  const [gold, setGold] = useState(50);
  const [championId, setChampionId] = useState<string | null>(null);
  const [cost, setCost] = useState(4);
  const [needed, setNeeded] = useState(3);
  const [owned, setOwned] = useState(0);
  const [taken, setTaken] = useState(0);
  const [otherRemoved, setOtherRemoved] = useState(0);

  const champion = championId ? byId.get(championId) : undefined;
  const poolMax = odds.poolSize[cost] ?? 0;
  const otherMax = Math.max(0, poolMax * (championsPerCost[cost] ?? 1) - poolMax);

  const result = useMemo(
    () => computeHit({
      level, gold, cost, needed, owned,
      takenByOthers: Math.min(taken, poolMax),
      otherRemoved: Math.min(otherRemoved, otherMax),
      odds, championsPerCost,
    }),
    [level, gold, cost, needed, owned, taken, otherRemoved, odds, championsPerCost, poolMax, otherMax],
  );

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const color = COST_COLORS[cost];
  const successColor = result.pSuccess >= 0.75 ? "var(--color-success)" : result.pSuccess >= 0.4 ? "var(--color-gold)" : "var(--color-danger)";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5 animate-fade-in">
      <Card title="条件" action={<Target className="size-4 text-fg-subtle" />}>
        <div className="flex flex-col gap-4">
          <ChampionPicker
            label="目標チャンピオン (任意)"
            value={championId}
            onChange={(c) => { setChampionId(c?.apiName ?? null); if (c) setCost(clamp(c.cost, 1, 5)); }}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="レベル"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              options={LEVELS.map((l) => ({ value: l, label: `Lv ${l}` }))}
            />
            <Select
              label="コスト"
              value={cost}
              disabled={!!champion}
              onChange={(e) => setCost(Number(e.target.value))}
              options={[1, 2, 3, 4, 5].map((c) => ({ value: c, label: COST_LABELS[c] }))}
            />
            <NumberField label="ゴールド" value={gold} min={0} max={200} onChange={setGold} suffix="g" />
            <NumberField label="必要な枚数" value={needed} min={1} max={9} onChange={setNeeded} hint="2★=3枚 / 3★=9枚" />
            <NumberField label="既に所持" value={owned} min={0} max={9} onChange={setOwned} />
            <NumberField label="他プレイヤーが所持" value={taken} min={0} max={poolMax} onChange={setTaken} hint={`最大 ${poolMax}`} />
          </div>
          <NumberField
            label="同コストの他ユニット消費数"
            value={otherRemoved}
            min={0}
            max={Math.min(150, otherMax)}
            onChange={setOtherRemoved}
            hint="盤面・ベンチに出ている同コストの他チャンピオン枚数 (全プレイヤー合計)"
          />
          <div className="rounded-lg bg-bg-elev border border-border p-3 text-xs text-fg-muted flex flex-col gap-1 tabular-nums">
            <div className="flex justify-between"><span>スロットあたり出現率</span><span className="text-fg">{pct(result.pSlot)}</span></div>
            <div className="flex justify-between"><span>残りターゲット / 残りプール</span><span className="text-fg">{result.remainingTarget} / {result.remainingPool}</span></div>
            <div className="flex justify-between"><span>予算内のショップ数</span><span className="text-fg">{result.shops} 回 (現在のショップ含む)</span></div>
            <div className="flex justify-between"><span>Lv{level} {COST_LABELS[cost]} 確率</span><span className="text-fg">{odds.shopOdds[level]?.[cost - 1] ?? 0}%</span></div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        <Card padded={false}>
          <div className="flex flex-col md:flex-row md:items-center gap-5 p-5">
            <div className="flex items-center gap-4">
              {champion ? (
                <ChampionIcon champion={champion} size={64} showTooltip={false} />
              ) : (
                <div className="size-16 rounded-md bg-surface-2 flex items-center justify-center text-fg-subtle text-xs" style={{ boxShadow: `0 0 0 2px ${color}` }}>
                  {cost}コスト
                </div>
              )}
              <div>
                <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium">{gold}g 以内で {needed}枚 揃う確率</div>
                <div className="text-5xl font-semibold leading-none mt-1" style={{ color: successColor }}>
                  {result.alreadyDone ? "100%" : pct(result.pSuccess)}
                </div>
                <div className="text-xs text-fg-muted mt-1.5">
                  {result.alreadyDone && "既に必要枚数を所持しています"}
                  {result.impossible && "プールに十分な枚数が残っていません (または確率0%)"}
                  {!result.alreadyDone && !result.impossible && `${champion?.name ?? COST_LABELS[cost]} をあと ${result.need} 枚`}
                </div>
              </div>
            </div>
            <div className="md:ml-auto grid grid-cols-3 gap-6">
              <Stat label="期待入手枚数" value={result.expectedCopies.toFixed(2)} sub={`上限 ${result.need} 枚`} />
              <Stat
                label="必要枚数までの期待ゴールド"
                value={result.expectedGold === null ? "—" : `${result.expectedGoldIsLowerBound ? "≥" : ""}${result.expectedGold.toFixed(1)}g`}
                sub={result.expectedGoldIsLowerBound ? "250ショップで未収束" : "リロール費用の期待値"}
              />
              <Stat label="1ショップで1枚以上" value={pct(1 - (result.firstShopDist[0] ?? 1))} sub="現在のプールで" />
            </div>
          </div>
        </Card>

        <Card title="成功確率 vs 使用ゴールド" action={<span className="text-xs text-fg-subtle">{odds.rerollCost}g 刻み</span>}>
          {result.curve.length > 1 ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.curve} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hitFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} {...CHART_GRID} />
                  <XAxis dataKey="gold" {...CHART_AXIS} tickFormatter={(v) => `${v}g`} />
                  <YAxis {...CHART_AXIS} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                  <ReferenceLine y={0.5} stroke="var(--color-border-strong)" strokeDasharray="3 3" />
                  <RTooltip
                    cursor={{ stroke: "var(--color-fg-subtle)", strokeWidth: 1 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as { gold: number; shop: number; p: number; pOne: number };
                      return (
                        <ChartTip
                          title={`${d.gold}g 使用 (${d.shop}ショップ目)`}
                          rows={[
                            { label: `${needed}枚 揃う`, value: pct(d.p), color: "var(--color-accent)" },
                            { label: "1枚以上", value: pct(d.pOne) },
                          ]}
                        />
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="p" stroke="var(--color-accent)" strokeWidth={2} fill="url(#hitFill)" isAnimationActive={false} dot={false} activeDot={{ r: 4, stroke: "var(--color-surface)", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-fg-subtle gap-2"><Info className="size-4" /> ゴールドを増やすと推移が表示されます</div>
          )}
        </Card>

        <Card title="ショップごとの累積確率" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-fg-subtle">
                  <th className="text-left px-4 py-2 font-medium">ショップ</th>
                  <th className="text-right px-4 py-2 font-medium">使用ゴールド</th>
                  <th className="text-right px-4 py-2 font-medium">1枚以上</th>
                  <th className="text-right px-4 py-2 font-medium">{needed}枚以上</th>
                  <th className="px-4 py-2 font-medium w-40"></th>
                </tr>
              </thead>
              <tbody>
                {result.perShop.map((r) => {
                  const inBudget = r.shop <= result.shops;
                  return (
                    <tr key={r.shop} className={cn("border-t border-border/60", !inBudget && "opacity-45")}>
                      <td className="px-4 py-1.5 text-fg-muted">{r.shop}回目{r.shop === 1 && <span className="ml-1 text-[10px] text-fg-subtle">(現在)</span>}</td>
                      <td className="px-4 py-1.5 text-right">{r.gold}g</td>
                      <td className="px-4 py-1.5 text-right">{pct(r.pOne)}</td>
                      <td className="px-4 py-1.5 text-right font-medium">{pct(r.p)}</td>
                      <td className="px-4 py-1.5">
                        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.p * 100}%`, background: "var(--color-accent)" }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
