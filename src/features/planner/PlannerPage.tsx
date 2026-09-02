import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import {
  AlertTriangle, ClipboardPaste, Copy, Eraser, FilePlus2, Files, Grid3X3, Layers, Save, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { overlay } from "@/lib/api";
import { toast } from "@/stores/toast";
import { useStaticData } from "@/stores/staticData";
import { Button, EmptyState, Modal, Page, PageHeader, Select, Skeleton } from "@/components/ui";
import type { Champion, PlannerComp } from "@/lib/types";
import { usePlanner, useActiveComp } from "./plannerStore";
import { HexBoard, HexGhost, type DragData } from "./HexBoard";
import { UnitActionBar } from "./UnitActionBar";
import { ChampionPool } from "./ChampionPool";
import { TraitsPanel } from "./TraitsPanel";
import { RecommendCard } from "./RecommendCard";
import { MAX_ITEMS, MAX_LEVEL, copyText, decodeShare, encodeShare, firstEmptyHex, nextStars, placeShareUnits } from "./logic";

export function PlannerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data, loading, error } = useStaticData();
  const championsById = useStaticData((s) => s.championsById);
  const { comps, loaded, saving, load, createComp, setActive, updateActive, removeComp, duplicateComp, flush } = usePlanner();
  const comp = useActiveComp();
  const setNumber = data?.setNumber ?? 0;

  const [selectedHex, setSelectedHex] = useState<number | null>(null);
  const [level, setLevel] = useState(8);
  const [drag, setDrag] = useState<DragData | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "clear" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);

  // Ensure there is always an active comp once loaded.
  useEffect(() => {
    if (loaded && !comp) createComp(setNumber, { name: "新しい構成" });
  }, [loaded, comp, createComp, setNumber]);

  // Keep selection valid.
  useEffect(() => {
    if (selectedHex !== null && !comp?.units.some((u) => u.hex === selectedHex)) setSelectedHex(null);
  }, [comp, selectedHex]);

  const mutate = useCallback(
    (fn: (c: PlannerComp) => PlannerComp) => updateActive((c) => ({ ...fn(c), setNumber: c.setNumber || setNumber })),
    [updateActive, setNumber],
  );

  const placeChampion = useCallback((champion: Champion | undefined, championId: string): boolean => {
    const cur = usePlanner.getState();
    const active = cur.comps.find((c) => c.id === cur.activeCompId);
    if (!active) return false;
    const hex = firstEmptyHex(active.units, champion);
    if (hex === null) { toast.warning("ボードが満杯です", "空きヘックスがありません。"); return false; }
    mutate((c) => ({ ...c, units: [...c.units, { hex, championId, stars: 1, items: [] }] }));
    setSelectedHex(hex);
    return true;
  }, [mutate]);

  // URL params: ?add=<apiName> / ?comp=<code>
  const handledSearch = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !data || !comp) return;
    const search = location.search;
    if (!search) { handledSearch.current = null; return; }
    if (handledSearch.current === search) return;
    handledSearch.current = search;
    const p = new URLSearchParams(search);
    const code = p.get("comp");
    const add = p.get("add");
    if (code) {
      try {
        const payload = decodeShare(code);
        const units = placeShareUnits(payload.units, championsById);
        createComp(setNumber, { name: payload.name || "読み込んだ構成", units, emblems: payload.emblems });
        toast.success("構成を読み込みました", payload.name || undefined);
      } catch (e) {
        toast.error("構成を読み込めませんでした", e instanceof Error ? e.message : String(e));
      }
    }
    if (add) {
      const c = championsById.get(add) ?? championsById.get(add.toLowerCase());
      if (c) { if (placeChampion(c, c.apiName)) toast.success(`${c.name} を追加しました`); }
      else toast.warning("チャンピオンが見つかりません", add);
    }
    navigate("/planner", { replace: true });
  }, [loaded, data, comp, location.search, championsById, createComp, setNumber, placeChampion, navigate]);

  // ----- DnD -------------------------------------------------------------------
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragStart = (e: DragStartEvent) => setDrag((e.active.data.current as DragData | undefined) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDrag(null);
    const d = e.active.data.current as DragData | undefined;
    const target = (e.over?.data.current as { hex?: number } | undefined)?.hex;
    if (!d || target === undefined) return;
    if (d.type === "champion") {
      mutate((c) => ({ ...c, units: [...c.units.filter((u) => u.hex !== target), { hex: target, championId: d.championId, stars: 1, items: [] }] }));
      setSelectedHex(target);
    } else if (d.hex !== target) {
      mutate((c) => ({
        ...c,
        units: c.units.map((u) => (u.hex === d.hex ? { ...u, hex: target } : u.hex === target ? { ...u, hex: d.hex } : u)),
      }));
      setSelectedHex(target);
    }
  };

  // ----- Unit actions ---------------------------------------------------------------
  const selectedUnit = comp?.units.find((u) => u.hex === selectedHex) ?? null;
  const removeUnit = (hex: number) => { mutate((c) => ({ ...c, units: c.units.filter((u) => u.hex !== hex) })); if (selectedHex === hex) setSelectedHex(null); };
  const editUnit = (hex: number, fn: (u: PlannerComp["units"][number]) => PlannerComp["units"][number]) =>
    mutate((c) => ({ ...c, units: c.units.map((u) => (u.hex === hex ? fn(u) : u)) }));

  // ----- Comp actions -----------------------------------------------------------------
  const save = async () => { await flush(); toast.success("保存しました", comp?.name || undefined); };
  const newComp = () => { createComp(setNumber, { name: `構成 ${comps.length + 1}` }); setSelectedHex(null); };
  const sendToOverlay = async () => {
    try {
      await flush();
      await overlay.open();
      toast.success("オーバーレイへ送信しました");
    } catch (e) {
      toast.error("オーバーレイを開けませんでした", e instanceof Error ? e.message : String(e));
    }
  };
  const copyCode = async () => {
    if (!comp) return;
    const ok = await copyText(encodeShare(comp));
    if (ok) toast.success("共有コードをコピーしました");
    else toast.error("クリップボードにコピーできませんでした");
  };
  const importFromCode = () => {
    try {
      const payload = decodeShare(importCode);
      const units = placeShareUnits(payload.units, championsById);
      createComp(setNumber, { name: payload.name || "読み込んだ構成", units, emblems: payload.emblems });
      setImportOpen(false);
      setImportCode("");
      setImportError(null);
      setSelectedHex(null);
      toast.success("構成を読み込みました", `${units.length} ユニット`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const placedIds = useMemo(() => new Set(comp?.units.map((u) => u.championId) ?? []), [comp]);
  const unitCount = comp?.units.length ?? 0;
  const overCap = unitCount > level;
  const dragChampion = drag ? championsById.get(drag.championId) : undefined;

  if (error && !data && !loading) {
    return (
      <Page wide>
        <PageHeader icon={<Grid3X3 />} title="プランナー" />
        <div className="card"><EmptyState icon={<AlertTriangle />} title="静的データを読み込めませんでした" description={error} /></div>
      </Page>
    );
  }
  if (!data || !loaded || !comp) {
    return (
      <Page wide>
        <PageHeader icon={<Grid3X3 />} title="プランナー" subtitle="読み込み中..." />
        <div className="card p-3 flex gap-2 mb-4"><Skeleton className="h-9 w-64" /><Skeleton className="h-9 w-40" /><Skeleton className="h-9 w-24" /></div>
        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
          <Skeleton className="h-[420px] rounded-xl" />
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      </Page>
    );
  }

  return (
    <Page wide>
      <PageHeader
        icon={<Grid3X3 />}
        title="プランナー"
        subtitle={`Set ${data.setNumber} · ${comps.length} 件の構成${saving ? " · 保存中..." : ""}`}
        actions={
          <Button variant="gold" icon={<Layers className="size-4" />} onClick={sendToOverlay}>オーバーレイへ送信</Button>
        }
      />

      {/* top bar */}
      <div className="card p-3 mb-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={comp.name}
            onChange={(e) => mutate((c) => ({ ...c, name: e.target.value }))}
            placeholder="構成名を入力..."
            className="h-9 flex-1 min-w-[200px] rounded-lg border border-border bg-bg-elev px-3 text-sm font-semibold text-fg placeholder:text-fg-subtle placeholder:font-normal outline-none focus:border-gold/60 transition-colors select-text"
          />
          <Select
            aria-label="保存済みの構成"
            value={comp.id}
            onChange={(e) => { setActive(e.target.value); setSelectedHex(null); }}
            options={comps.map((c) => ({ value: c.id, label: `${c.name || "(無題)"} · ${c.units.length}体` }))}
            className="w-56"
          />
          <Button size="md" icon={<Save className="size-4" />} onClick={save} loading={saving}>保存</Button>
          <Button size="md" variant="ghost" icon={<FilePlus2 className="size-4" />} onClick={newComp}>新規</Button>
          <Button size="md" variant="ghost" icon={<Files className="size-4" />} onClick={() => { duplicateComp(comp.id); setSelectedHex(null); toast.info("構成を複製しました"); }}>複製</Button>
          <Button size="md" variant="ghost" className="text-danger hover:bg-danger/10" icon={<Trash2 className="size-4" />} onClick={() => setConfirm("delete")}>削除</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="レベル"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            options={Array.from({ length: MAX_LEVEL }, (_, i) => ({ value: i + 1, label: `レベル ${i + 1}` }))}
            className="w-32"
          />
          <span
            className={cn("inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm tabular-nums", overCap ? "border-warning/50 bg-warning/10 text-warning" : "border-border bg-bg-elev text-fg-muted")}
          >
            {overCap && <AlertTriangle className="size-3.5" />}
            ユニット <span className="font-semibold text-fg">{unitCount}</span> / {level}
            {overCap && <span className="text-xs">上限超過</span>}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" icon={<Eraser className="size-3.5" />} onClick={() => setConfirm("clear")} disabled={unitCount === 0 && comp.emblems.length === 0}>クリア</Button>
            <Button size="sm" variant="outline" icon={<Copy className="size-3.5" />} onClick={copyCode} disabled={unitCount === 0}>共有コードをコピー</Button>
            <Button size="sm" variant="outline" icon={<ClipboardPaste className="size-3.5" />} onClick={() => { setImportError(null); setImportOpen(true); }}>コードから読み込み</Button>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            {/* board */}
            <div className="card p-5 flex flex-col gap-4 overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-wide">ボード</h3>
                <span className="text-[11px] text-fg-subtle">ドラッグで移動・入れ替え / 右クリックで削除</span>
              </div>
              <div className="flex justify-center py-2 pl-8 overflow-x-auto">
                <div className="relative">
                  <div className="absolute inset-0 -m-6 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(232,184,74,0.06),transparent_70%)] pointer-events-none" />
                  <HexBoard units={comp.units} selectedHex={selectedHex} onSelect={setSelectedHex} onRemove={removeUnit} />
                </div>
              </div>
              {selectedUnit ? (
                <UnitActionBar
                  key={selectedUnit.hex}
                  unit={selectedUnit}
                  champion={championsById.get(selectedUnit.championId)}
                  onCycleStars={() => editUnit(selectedUnit.hex, (u) => ({ ...u, stars: nextStars(u.stars) }))}
                  onSetItem={(slot, id) => editUnit(selectedUnit.hex, (u) => {
                    const items = [...u.items];
                    if (slot < items.length) items[slot] = id;
                    else items.push(id);
                    return { ...u, items: items.slice(0, MAX_ITEMS) };
                  })}
                  onClearItem={(slot) => editUnit(selectedUnit.hex, (u) => ({ ...u, items: u.items.filter((_, i) => i !== slot) }))}
                  onRemove={() => removeUnit(selectedUnit.hex)}
                  onClose={() => setSelectedHex(null)}
                />
              ) : (
                <div className="h-[58px] rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-fg-subtle">
                  {unitCount === 0 ? "右のリストからチャンピオンをクリックまたはドラッグして配置" : "ユニットをクリックすると星・アイテムを編集できます"}
                </div>
              )}
            </div>

            <TraitsPanel
              comp={comp}
              traits={data.traits}
              onAddEmblem={(id) => mutate((c) => ({ ...c, emblems: [...c.emblems, id] }))}
              onRemoveEmblem={(i) => mutate((c) => ({ ...c, emblems: c.emblems.filter((_, j) => j !== i) }))}
            />

            <RecommendCard
              comp={comp}
              setNumber={data.setNumber}
              onLoad={(units, name) => { mutate((c) => ({ ...c, units, name: c.name || name })); setSelectedHex(null); }}
            />
          </div>

          <div className="xl:sticky xl:top-0 h-[calc(100vh-120px)] min-h-[480px]">
            <ChampionPool champions={data.champions} traits={data.traits} placed={placedIds} onPick={(c) => placeChampion(c, c.apiName)} />
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {drag ? <HexGhost champion={dragChampion} /> : null}
        </DragOverlay>
      </DndContext>

      {/* confirm modals */}
      <Modal
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title="構成を削除"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>キャンセル</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => { removeComp(comp.id); setConfirm(null); setSelectedHex(null); toast.info("構成を削除しました"); }}>削除</Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">「{comp.name || "(無題)"}」を削除します。この操作は取り消せません。</p>
      </Modal>
      <Modal
        open={confirm === "clear"}
        onClose={() => setConfirm(null)}
        title="ボードをクリア"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>キャンセル</Button>
            <Button variant="danger" icon={<Eraser className="size-4" />} onClick={() => { mutate((c) => ({ ...c, units: [], emblems: [] })); setConfirm(null); setSelectedHex(null); }}>クリア</Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">配置したユニットと追加の紋章をすべて削除します。構成名は保持されます。</p>
      </Modal>
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="共有コードから読み込み"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>キャンセル</Button>
            <Button variant="primary" icon={<ClipboardPaste className="size-4" />} onClick={importFromCode} disabled={!importCode.trim()}>読み込む</Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm text-fg-muted">「共有コードをコピー」で作成したコードを貼り付けてください。新しい構成として追加されます。</p>
          <textarea
            value={importCode}
            onChange={(e) => { setImportCode(e.target.value); setImportError(null); }}
            rows={5}
            spellCheck={false}
            placeholder="eyJuYW1lIjoi..."
            className={cn("w-full rounded-lg border bg-bg-elev px-3 py-2 text-xs font-mono text-fg outline-none focus:border-accent transition-colors select-text resize-y", importError ? "border-danger/60" : "border-border")}
          />
          {importError && <p className="text-xs text-danger">{importError}</p>}
        </div>
      </Modal>
    </Page>
  );
}
