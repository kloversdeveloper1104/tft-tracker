import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { AppSettings } from "@/lib/types";
import { riot } from "@/lib/api";

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  platform: "jp1",
  locale: "ja_jp",
  gameName: "",
  tagLine: "",
  puuid: null,
  overlayShortcut: "CommandOrControl+Shift+O",
  overlayOpacity: 0.92,
  overlayScale: 1,
  odds: null,
  reduceMotion: false,
  autoSyncOnLaunch: true,
};

const store = new LazyStore("settings.json", { autoSave: true });

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  reset: () => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    try {
      const saved = (await store.get<Partial<AppSettings>>("settings")) ?? {};
      const merged = { ...DEFAULT_SETTINGS, ...saved };
      set({ settings: merged, loaded: true });
      if (merged.apiKey) await riot.configure(merged.apiKey, merged.platform).catch(() => {});
    } catch {
      set({ loaded: true });
    }
  },
  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await store.set("settings", next);
    await store.save();
    if ("apiKey" in patch || "platform" in patch) {
      await riot.configure(next.apiKey, next.platform).catch(() => {});
    }
  },
  reset: async () => {
    set({ settings: DEFAULT_SETTINGS });
    await store.set("settings", DEFAULT_SETTINGS);
    await store.save();
  },
}));

/** Shared store instance for other windows (overlay) to read the same settings file. */
export const settingsStore = store;
