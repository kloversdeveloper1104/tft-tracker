import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Timer, Trophy, XCircle, Zap, Plus, Trash2, Square } from "lucide-react";
import { Button, Card, EmptyState, Input, Kbd, Select, Stat } from "@/components/ui";
import { ChampionIcon, CostChip } from "@/components/tft";
import { COST_COLORS } from "@/data/odds";
import { useStaticData } from "@/stores/staticData";
import { clamp, cn } from "@/lib/utils";
import type { Champion, OddsTable } from "@/lib/types";
import { ChampionPicker } from "./ChampionPicker";
import { LEVELS } from "./data";

// ----- Types --------------------------------------------------------------------
interface TargetCfg { championId: string; needed: number }

interface RunRecord {
  at: number;
  success: boolean;
  goldUsed: number;
  rerolls: number;
  avgReactionMs: number;
  efficiency: number; // target copies per 10 gold
  found: number;
  needed: number;
  level: number;
}

interface Sim {
  pool: Map<string, number>;
  byCost: Record<number, Champion[]>;
  shop: (Champion | null)[];
  gold: number;
  startGold: number;
  rerolls: number;
  found: Record<string, number>;
  actionTimes: number[];
  startedAt: number;
}

const HISTORY_KEY = "tft-tracker.trainer.history";

function loadHistory(): RunRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? (JSON.parse(raw) as RunRecord[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveHistory(h: RunRecord[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-10))); } catch { /* ignore */ }
}

// ----- Pool simulation -------------------------------------------------------------
function buildPool(champions: Champion[], odds: OddsTable): Pick<Sim, "pool" | "byCost"> {
  const pool = new Map<string, number>();
  const byCost: Record<number, Champion[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const c of champions) {
    if (c.cost < 1 || c.cost > 5) continue;
    pool.set(c.apiName, odds.poolSize[c.cost] ?? 0);
    byCost[c.cost].push(c);
  }
  return { pool, byCost };
}

function drawShop(sim: Sim, odds: OddsTable, level: number): (Champion | null)[] {
  const row = odds.shopOdds[level] ?? [100, 0, 0, 0, 0];
  const slots = odds.shopSlots || 5;
  const out: (Champion | null)[] = [];
  for (let s = 0; s < slots; s++) {
    // tier weighted by odds, restricted to tiers with remaining copies
    const weights = [1, 2, 3, 4, 5].map((cost) => {
      const rem = sim.byCost[cost].reduce((acc, c) => acc + (sim.pool.get(c.apiName) ?? 0), 0);
      return rem > 0 ? (row[cost - 1] ?? 0) : 0;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) { out.push(null); continue; }
    let r = Math.random() * total;
    let cost = 1;
    for (let i = 0; i < 5; i++) { r -= weights[i]; if (r < 0) { cost = i + 1; break; } }
    const cands = sim.byCost[cost];
    const remTotal = cands.reduce((acc, c) => acc + (sim.pool.get(c.apiName) ?? 0), 0);
    let r2 = Math.random() * remTotal;
    let picked: Champion | null = null;
    for (const c of cands) {
      r2 -= sim.pool.get(c.apiName) ?? 0;
      if (r2 < 0) { picked = c; break; }
    }
    if (!picked) picked = cands.find((c) => (sim.pool.get(c.apiName) ?? 0) > 0) ?? null;
    if (picked) sim.pool.set(picked.apiName, (sim.pool.get(picked.apiName) ?? 0) - 1);
    out.push(picked);
  }
  return out;
}

function returnShop(sim: Sim) {
  for (const c of sim.shop) if (c) sim.pool.set(c.apiName, (sim.pool.get(c.apiName) ?? 0) + 1);
  sim.shop = [];
}

// ----- Sparkline -------------------------------------------------------------------
function Sparkline({ values, width = 120, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) return <div style={{ width, height }} />;
  const max = Math.max(...values, 0.01);
  const min = Math.min(...values, 0);
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? width / 2 : pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke="var(--color-fg-subtle)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={4} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
    </svg>
  );
}

// ----- Component --------------------------------------------------------------------
type Phase = "setup" | "running" | "result";

export function TrainerTab({ odds }: { odds: OddsTable }) {
  const champions = useStaticData((s) => s.data?.champions);
  const loading = useStaticData((s) => s.loading);
  const byId = useStaticData((s) => s.championsById);

  const [level, setLevel] = useState(8);
  const [startGold, setStartGold] = useState(50);
  const [seconds, setSeconds] = useState(30);
  const [targets, setTargets] = useState<TargetCfg[]>([]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [history, setHistory] = useState<RunRecord[]>(() => loadHistory());
  const [result, setResult] = useState<RunRecord | null>(null);

  const simRef = useRef<Sim | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [timeLeft, setTimeLeft] = useState(0);
  const timeLeftRef = useRef(0);

  const rerollCost = odds.rerollCost || 2;
  const totalNeeded = targets.reduce((a, t) => a + t.needed, 0);
  const canStart = !!champions && targets.length > 0 && targets.every((t) => byId.has(t.championId));

  const finish = useCallback((sim: Sim, success: boolean) => {
    const found = targets.reduce((a, t) => a + Math.min(t.needed, sim.found[t.championId] ?? 0), 0);
    const goldUsed = sim.startGold - sim.gold;
    const gaps: number[] = [];
    for (let i = 1; i < sim.actionTimes.length; i++) gaps.push(sim.actionTimes[i] - sim.actionTimes[i - 1]);
    const avgReactionMs = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const rec: RunRecord = {
      at: Date.now(),
      success,
      goldUsed,
      rerolls: sim.rerolls,
      avgReactionMs,
      efficiency: goldUsed > 0 ? (found / goldUsed) * 10 : 0,
      found,
      needed: totalNeeded,
      level,
    };
    setResult(rec);
    setHistory((h) => { const next = [...h, rec].slice(-10); saveHistory(next); return next; });
    setPhase("result");
  }, [targets, totalNeeded, level]);

  const allDone = (sim: Sim) => targets.every((t) => (sim.found[t.championId] ?? 0) >= t.needed);
  const isStuck = (sim: Sim) =>
    sim.gold < rerollCost && !sim.shop.some((c) => c && sim.gold >= c.cost && targets.some((t) => t.championId === c.apiName && (sim.found[c.apiName] ?? 0) < t.needed));

  const start = () => {
    if (!champions) return;
    const { pool, byCost } = buildPool(champions, odds);
    const sim: Sim = {
      pool, byCost, shop: [], gold: startGold, startGold, rerolls: 0, found: {}, actionTimes: [performance.now()], startedAt: performance.now(),
    };
    sim.shop = drawShop(sim, odds, level);
    simRef.current = sim;
    timeLeftRef.current = seconds * 1000;
    setTimeLeft(seconds * 1000);
    setResult(null);
    setPhase("running");
  };

  const reroll = useCallback(() => {
    const sim = simRef.current;
    if (!sim || phase !== "running" || sim.gold < rerollCost) return;
    returnShop(sim);
    sim.gold -= rerollCost;
    sim.rerolls += 1;
    sim.actionTimes.push(performance.now());
    sim.shop = drawShop(sim, odds, level);
    rerender();
    if (isStuck(sim)) finish(sim, allDone(sim));
  }, [phase, rerollCost, odds, level, finish]); // eslint-disable-line react-hooks/exhaustive-deps

  const buy = useCallback((slot: number) => {
    const sim = simRef.current;
    if (!sim || phase !== "running") return;
    const c = sim.shop[slot];
    if (!c || sim.gold < c.cost) return;
    sim.gold -= c.cost;
    sim.shop[slot] = null;
    sim.found[c.apiName] = (sim.found[c.apiName] ?? 0) + 1;
    sim.actionTimes.push(performance.now());
    rerender();
    if (allDone(sim)) finish(sim, true);
    else if (isStuck(sim)) finish(sim, false);
  }, [phase, finish]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => { const sim = simRef.current; if (sim) finish(sim, allDone(sim)); };

  // Timer
  useEffect(() => {
    if (phase !== "running") return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      timeLeftRef.current -= now - last;
      last = now;
      if (timeLeftRef.current <= 0) {
        timeLeftRef.current = 0;
        setTimeLeft(0);
        window.clearInterval(id);
        const sim = simRef.current;
        if (sim) finish(sim, allDone(sim));
        return;
      }
      setTimeLeft(timeLeftRef.current);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, finish]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hotkeys
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "d" || e.key === "D") { e.preventDefault(); reroll(); }
      else if (e.key >= "1" && e.key <= "5") { e.preventDefault(); buy(Number(e.key) - 1); }
      else if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, reroll, buy]); // eslint-disable-line react-hooks/exhaustive-deps

  const sim = simRef.current;
  const targetSet = useMemo(() => new Map(targets.map((t) => [t.championId, t])), [targets]);

  if (loading && !champions) {
    return <div className="grid grid-cols-1 gap-3 animate-fade-in">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24" />)}</div>;
  }
  if (!champions) {
    return <EmptyState icon={<Zap />} title="静的データがありません" description="設定でデータを取得すると練習モードが使えます。" />;
  }

  // ----- Setup ------------------------------------------------------------------------
  if (phase === "setup") {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 animate-fade-in">
        <Card title="練習の設定" action={<Zap className="size-4 text-gold" />}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Select label="レベル" value={level} onChange={(e) => setLevel(Number(e.target.value))} options={LEVELS.map((l) => ({ value: l, label: `Lv ${l}` }))} />
              <Input label="開始ゴールド" type="number" min={0} max={200} value={startGold} onChange={(e) => setStartGold(clamp(Number(e.target.value) || 0, 0, 200))} />
              <Input label="制限時間 (秒)" type="number" min={5} max={300} value={seconds} onChange={(e) => setSeconds(clamp(Number(e.target.value) || 30, 5, 300))} />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-fg-muted">目標チャンピオン (1〜3体)</span>
                {targets.length < 3 && (
                  <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setTargets((t) => [...t, { championId: "", needed: 3 }])}>追加</Button>
                )}
              </div>
              {targets.length === 0 && (
                <button
                  onClick={() => setTargets([{ championId: "", needed: 3 }])}
                  className="rounded-lg border border-dashed border-border-strong px-3 py-5 text-sm text-fg-subtle hover:text-fg hover:border-accent transition-colors"
                >
                  + 目標を追加
                </button>
              )}
              {targets.map((t, i) => (
                <div key={i} className="flex items-end gap-2">
                  <ChampionPicker
                    className="flex-1"
                    value={t.championId || null}
                    onChange={(c) => setTargets((arr) => arr.map((x, j) => (j === i ? { ...x, championId: c?.apiName ?? "" } : x)))}
                  />
                  <Input
                    className="w-20"
                    type="number"
                    min={1}
                    max={9}
                    value={t.needed}
                    onChange={(e) => setTargets((arr) => arr.map((x, j) => (j === i ? { ...x, needed: clamp(Number(e.target.value) || 1, 1, 9) } : x)))}
                    right={<span className="text-[10px]">枚</span>}
                  />
                  <Button size="md" variant="ghost" className="px-2" onClick={() => setTargets((arr) => arr.filter((_, j) => j !== i))} title="削除">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <p className="text-[11px] text-fg-subtle">2★ = 3枚、3★ = 9枚。既に持っている分は差し引いて入力してください。</p>
            </div>
            <Button variant="gold" size="lg" icon={<Play className="size-4" />} disabled={!canStart} onClick={start}>
              練習開始
            </Button>
            <div className="text-xs text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1">
              <span><Kbd>D</Kbd> リロール ({rerollCost}g)</span>
              <span><Kbd>1</Kbd>–<Kbd>5</Kbd> 購入</span>
              <span><Kbd>Esc</Kbd> 終了</span>
            </div>
          </div>
        </Card>
        <HistoryCard history={history} onClear={() => { setHistory([]); saveHistory([]); }} />
      </div>
    );
  }

  // ----- Result --------------------------------------------------------------------------
  if (phase === "result" && result) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-5 animate-fade-in">
        <Card padded={false}>
          <div className={cn("p-6 flex items-center gap-5 border-b border-border", result.success ? "bg-success/5" : "bg-danger/5")}>
            <div className={cn("size-14 rounded-2xl flex items-center justify-center", result.success ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
              {result.success ? <Trophy className="size-7" /> : <XCircle className="size-7" />}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium">目標達成?</div>
              <div className={cn("text-3xl font-bold", result.success ? "text-success" : "text-danger")}>{result.success ? "達成!" : "未達成"}</div>
              <div className="text-xs text-fg-muted mt-0.5">目標 {result.found}/{result.needed} 枚 · Lv{result.level}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 p-6">
            <Stat label="使用ゴールド" value={`${result.goldUsed}g`} color="var(--color-gold)" />
            <Stat label="リロール数" value={result.rerolls} />
            <Stat label="反応速度" value={`${Math.round(result.avgReactionMs)}ms`} sub="1アクションあたり" />
            <Stat label="効率" value={result.efficiency.toFixed(2)} sub="枚 / 10g" color="var(--color-teal)" />
          </div>
          <div className="px-6 pb-6 flex flex-wrap gap-3">
            {targets.map((t) => {
              const c = byId.get(t.championId);
              const f = Math.min(t.needed, sim?.found[t.championId] ?? 0);
              return c ? (
                <div key={t.championId} className="flex items-center gap-2 rounded-lg bg-bg-elev border border-border px-2.5 py-1.5">
                  <ChampionIcon champion={c} size={28} showTooltip={false} />
                  <span className="text-sm">{c.name}</span>
                  <span className={cn("text-sm tabular-nums font-semibold", f >= t.needed ? "text-success" : "text-fg-muted")}>{f}/{t.needed}</span>
                </div>
              ) : null;
            })}
          </div>
          <div className="px-6 pb-6 flex gap-2">
            <Button variant="gold" icon={<RotateCcw className="size-4" />} onClick={start}>もう一度</Button>
            <Button variant="secondary" onClick={() => setPhase("setup")}>設定に戻る</Button>
          </div>
        </Card>
        <HistoryCard history={history} onClear={() => { setHistory([]); saveHistory([]); }} />
      </div>
    );
  }

  // ----- Running -------------------------------------------------------------------------
  if (!sim) return null;
  const secs = timeLeft / 1000;
  const urgent = secs <= 5;
  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-6 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Timer className={cn("size-5", urgent ? "text-danger" : "text-fg-muted")} />
            <span className={cn("text-3xl font-semibold tabular-nums leading-none", urgent && "text-danger animate-pulse-soft")}>{secs.toFixed(1)}s</span>
          </div>
          <Stat label="ゴールド" value={<span className="text-gold">{sim.gold}g</span>} />
          <Stat label="リロール" value={sim.rerolls} />
          <Stat label="使用" value={`${sim.startGold - sim.gold}g`} />
          <div className="ml-auto flex items-center gap-4 flex-wrap">
            {targets.map((t) => {
              const c = byId.get(t.championId);
              const f = sim.found[t.championId] ?? 0;
              const done = f >= t.needed;
              return c ? (
                <div key={t.championId} className="flex items-center gap-2">
                  <ChampionIcon champion={c} size={30} showTooltip={false} />
                  <div className="flex flex-col">
                    <span className="text-xs text-fg-muted leading-tight">{c.name}</span>
                    <span className={cn("text-sm font-semibold tabular-nums leading-tight", done ? "text-success" : "text-fg")}>{Math.min(f, t.needed)}/{t.needed}</span>
                  </div>
                  <div className="w-14 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.min(100, (f / t.needed) * 100)}%`, background: done ? "var(--color-success)" : COST_COLORS[c.cost] }} />
                  </div>
                </div>
              ) : null;
            })}
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-5 gap-3">
            {sim.shop.map((c, i) => {
              const target = c ? targetSet.get(c.apiName) : undefined;
              const isTarget = !!target && (sim.found[c!.apiName] ?? 0) < target.needed;
              const affordable = !!c && sim.gold >= c.cost;
              return (
                <button
                  key={i}
                  disabled={!c || !affordable}
                  onClick={() => buy(i)}
                  className={cn(
                    "relative rounded-xl border bg-bg-elev p-3 flex flex-col items-center gap-2 transition-all duration-150 focus-ring",
                    c ? "hover:-translate-y-0.5 hover:bg-surface-2" : "opacity-40",
                    !affordable && c && "opacity-50 cursor-not-allowed",
                    isTarget ? "border-gold shadow-glow-gold" : "border-border",
                  )}
                  style={c ? { borderBottomColor: COST_COLORS[c.cost], borderBottomWidth: 3 } : undefined}
                >
                  <span className="absolute top-2 left-2"><Kbd>{i + 1}</Kbd></span>
                  {isTarget && <span className="absolute top-2 right-2 text-[10px] font-semibold text-gold">目標</span>}
                  {c ? (
                    <>
                      <ChampionIcon champion={c} size={56} showTooltip={false} />
                      <span className="text-sm font-medium text-center leading-tight truncate w-full">{c.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-fg-muted"><CostChip cost={c.cost} /> {c.cost}g</span>
                    </>
                  ) : (
                    <div className="h-[104px] flex items-center justify-center text-xs text-fg-subtle">購入済み</div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button variant="primary" size="lg" icon={<RotateCcw className="size-4" />} disabled={sim.gold < rerollCost} onClick={reroll}>
              リロール ({rerollCost}g) <Kbd>D</Kbd>
            </Button>
            <Button variant="ghost" icon={<Square className="size-4" />} onClick={stop}>終了</Button>
            <span className="ml-auto text-xs text-fg-subtle">カードをクリック or <Kbd>1</Kbd>–<Kbd>5</Kbd> で購入</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function HistoryCard({ history, onClear }: { history: RunRecord[]; onClear: () => void }) {
  const eff = history.map((h) => h.efficiency);
  return (
    <Card
      title="直近の記録"
      action={
        <div className="flex items-center gap-3">
          <Sparkline values={eff} />
          {history.length > 0 && <Button size="xs" variant="ghost" onClick={onClear}>クリア</Button>}
        </div>
      }
      padded={false}
    >
      {history.length === 0 ? (
        <EmptyState icon={<Trophy />} title="まだ記録がありません" description="練習を完了すると直近10回の結果がここに表示されます。" className="py-10" />
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-fg-subtle">
              <th className="text-left px-4 py-2 font-medium">結果</th>
              <th className="text-right px-3 py-2 font-medium">Lv</th>
              <th className="text-right px-3 py-2 font-medium">枚数</th>
              <th className="text-right px-3 py-2 font-medium">使用g</th>
              <th className="text-right px-3 py-2 font-medium">リロール</th>
              <th className="text-right px-3 py-2 font-medium">反応</th>
              <th className="text-right px-4 py-2 font-medium">効率</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((h) => (
              <tr key={h.at} className="border-t border-border/60">
                <td className={cn("px-4 py-1.5 font-medium", h.success ? "text-success" : "text-danger")}>{h.success ? "達成" : "未達"}</td>
                <td className="px-3 py-1.5 text-right text-fg-muted">{h.level}</td>
                <td className="px-3 py-1.5 text-right">{h.found}/{h.needed}</td>
                <td className="px-3 py-1.5 text-right">{h.goldUsed}</td>
                <td className="px-3 py-1.5 text-right">{h.rerolls}</td>
                <td className="px-3 py-1.5 text-right">{Math.round(h.avgReactionMs)}ms</td>
                <td className="px-4 py-1.5 text-right text-teal">{h.efficiency.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
