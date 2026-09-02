// Planner state + persistence (tauri-plugin-store `planner.json`).
// Overlay contract: on every change of the active comp we also write `activeComp` to the store
// and emit "planner-updated" { comp } so the overlay window can mirror it.
import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";
import type { PlannerComp } from "@/lib/types";
import { uid } from "@/lib/utils";

export const plannerStore = new LazyStore("planner.json", { autoSave: true });

export type CompInit = Partial<Pick<PlannerComp, "name" | "units" | "emblems" | "notes">>;

interface PlannerState {
  comps: PlannerComp[];
  activeCompId: string | null;
  loaded: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  load: () => Promise<void>;
  createComp: (setNumber: number, init?: CompInit) => PlannerComp;
  setActive: (id: string | null) => void;
  updateActive: (fn: (c: PlannerComp) => PlannerComp) => void;
  removeComp: (id: string) => void;
  duplicateComp: (id: string) => PlannerComp | null;
  /** Persist immediately (cancels the pending debounce). */
  flush: () => Promise<void>;
}

const DEBOUNCE_MS = 300;
let timer: number | undefined;

async function persistNow() {
  const { comps, activeCompId } = usePlanner.getState();
  const active = comps.find((c) => c.id === activeCompId) ?? null;
  usePlanner.setState({ saving: true });
  try {
    await plannerStore.set("comps", comps);
    await plannerStore.set("activeCompId", activeCompId);
    await plannerStore.set("activeComp", active);
    await plannerStore.save();
    usePlanner.setState({ lastSavedAt: Date.now() });
  } catch (e) {
    console.warn("planner persist failed", e);
  } finally {
    usePlanner.setState({ saving: false });
  }
  try {
    await emit("planner-updated", { comp: active });
  } catch (e) {
    console.warn("planner-updated emit failed", e);
  }
}

function schedulePersist() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    void persistNow();
  }, DEBOUNCE_MS);
}

function isComp(x: unknown): x is PlannerComp {
  if (!x || typeof x !== "object") return false;
  const c = x as Partial<PlannerComp>;
  return typeof c.id === "string" && Array.isArray(c.units);
}

export const usePlanner = create<PlannerState>((set, get) => ({
  comps: [],
  activeCompId: null,
  loaded: false,
  saving: false,
  lastSavedAt: null,

  load: async () => {
    if (get().loaded) return;
    try {
      const raw = (await plannerStore.get<unknown[]>("comps")) ?? [];
      const comps = raw.filter(isComp).map((c) => ({
        ...c,
        name: c.name ?? "",
        emblems: Array.isArray(c.emblems) ? c.emblems : [],
        notes: c.notes ?? "",
        setNumber: c.setNumber ?? 0,
        createdAt: c.createdAt ?? Date.now(),
        updatedAt: c.updatedAt ?? Date.now(),
      }));
      const savedActive = (await plannerStore.get<string | null>("activeCompId")) ?? null;
      const activeCompId = comps.some((c) => c.id === savedActive) ? savedActive : (comps[0]?.id ?? null);
      set({ comps, activeCompId, loaded: true });
    } catch (e) {
      console.warn("planner load failed", e);
      set({ loaded: true });
    }
  },

  createComp: (setNumber, init) => {
    const now = Date.now();
    const comp: PlannerComp = {
      id: uid(),
      name: init?.name ?? "",
      setNumber,
      units: init?.units ?? [],
      emblems: init?.emblems ?? [],
      notes: init?.notes ?? "",
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ comps: [comp, ...s.comps], activeCompId: comp.id }));
    schedulePersist();
    return comp;
  },

  setActive: (id) => {
    set({ activeCompId: id });
    schedulePersist();
  },

  updateActive: (fn) => {
    const { comps, activeCompId } = get();
    if (!activeCompId) return;
    let changed = false;
    const next = comps.map((c) => {
      if (c.id !== activeCompId) return c;
      changed = true;
      return { ...fn(c), id: c.id, updatedAt: Date.now() };
    });
    if (!changed) return;
    set({ comps: next });
    schedulePersist();
  },

  removeComp: (id) => {
    set((s) => {
      const comps = s.comps.filter((c) => c.id !== id);
      const activeCompId = s.activeCompId === id ? (comps[0]?.id ?? null) : s.activeCompId;
      return { comps, activeCompId };
    });
    schedulePersist();
  },

  duplicateComp: (id) => {
    const src = get().comps.find((c) => c.id === id);
    if (!src) return null;
    const now = Date.now();
    const copy: PlannerComp = {
      ...src,
      id: uid(),
      name: src.name ? `${src.name} のコピー` : "コピー",
      units: src.units.map((u) => ({ ...u, items: [...u.items] })),
      emblems: [...src.emblems],
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ comps: [copy, ...s.comps], activeCompId: copy.id }));
    schedulePersist();
    return copy;
  },

  flush: async () => {
    window.clearTimeout(timer);
    timer = undefined;
    await persistNow();
  },
}));

/** The active comp (stable reference from the comps array). */
export function useActiveComp(): PlannerComp | null {
  return usePlanner((s) => s.comps.find((c) => c.id === s.activeCompId) ?? null);
}
