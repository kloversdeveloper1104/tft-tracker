import { create } from "zustand";
import type { Augment, Champion, Item, Locale, StaticData, StaticDataMeta, Trait } from "@/lib/types";
import { staticData as api } from "@/lib/api";

interface StaticState {
  data: StaticData | null;
  meta: StaticDataMeta | null;
  loading: boolean;
  error: string | null;
  championsById: Map<string, Champion>;
  championsByName: Map<string, Champion>;
  traitsById: Map<string, Trait>;
  traitsByName: Map<string, Trait>;
  itemsById: Map<string, Item>;
  augmentsById: Map<string, Augment>;
  /** Loaded sets other than the current one (for old match details). */
  extraSets: Map<number, StaticData>;
  load: (locale: Locale, setNumber?: number) => Promise<void>;
  refresh: (locale: Locale) => Promise<void>;
  loadSet: (locale: Locale, setNumber: number) => Promise<StaticData | null>;
}

function index(data: StaticData | null) {
  const championsById = new Map<string, Champion>();
  const championsByName = new Map<string, Champion>();
  const traitsById = new Map<string, Trait>();
  const traitsByName = new Map<string, Trait>();
  const itemsById = new Map<string, Item>();
  const augmentsById = new Map<string, Augment>();
  if (data) {
    for (const c of data.champions) {
      championsById.set(c.apiName, c);
      championsById.set(c.apiName.toLowerCase(), c);
      championsByName.set(c.name, c);
    }
    for (const t of data.traits) {
      traitsById.set(t.apiName, t);
      traitsByName.set(t.name, t);
    }
    for (const i of data.items) itemsById.set(i.apiName, i);
    for (const a of data.augments) augmentsById.set(a.apiName, a);
  }
  return { championsById, championsByName, traitsById, traitsByName, itemsById, augmentsById };
}

export const useStaticData = create<StaticState>((set, get) => ({
  data: null,
  meta: null,
  loading: false,
  error: null,
  ...index(null),
  extraSets: new Map(),
  load: async (locale, setNumber) => {
    set({ loading: true, error: null });
    try {
      const [data, meta] = await Promise.all([api.get(locale, setNumber), api.meta()]);
      set({ data, meta, loading: false, ...index(data) });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
  refresh: async (locale) => {
    set({ loading: true, error: null });
    try {
      const meta = await api.refresh(locale);
      const data = await api.get(locale);
      set({ data, meta, loading: false, extraSets: new Map(), ...index(data) });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
  loadSet: async (locale, setNumber) => {
    const cur = get();
    if (cur.data?.setNumber === setNumber) return cur.data;
    const cached = cur.extraSets.get(setNumber);
    if (cached) return cached;
    try {
      const data = await api.get(locale, setNumber);
      const extraSets = new Map(cur.extraSets);
      extraSets.set(setNumber, data);
      set({ extraSets });
      return data;
    } catch {
      return null;
    }
  },
}));

/** Lookup helpers that fall back to a raw id when data is missing. */
export function useLookup() {
  const s = useStaticData();
  return {
    champion: (id: string) => s.championsById.get(id) ?? s.championsById.get(id.toLowerCase()),
    trait: (id: string) => s.traitsById.get(id),
    item: (id: string) => s.itemsById.get(id),
    augment: (id: string) => s.augmentsById.get(id),
    data: s.data,
  };
}
