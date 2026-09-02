import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_SETTINGS, settingsStore, useSettings } from "@/stores/settings";
import { useStaticData } from "@/stores/staticData";
import type { AppSettings } from "@/lib/types";

/**
 * Keeps the overlay window's settings in sync with the shared settings.json:
 * initial load, `settings-updated` events from the main window, focus, and a 3s poll.
 * Also loads static data for the current locale.
 */
export function useOverlaySettings() {
  const settings = useSettings((s) => s.settings);
  const loaded = useSettings((s) => s.loaded);
  const load = useSettings((s) => s.load);
  const loadStatic = useStaticData((s) => s.load);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    const apply = (saved: Partial<AppSettings> | null | undefined) => {
      if (!active || !saved) return;
      const merged = { ...DEFAULT_SETTINGS, ...saved };
      const cur = useSettings.getState().settings;
      if (JSON.stringify(cur) !== JSON.stringify(merged)) useSettings.setState({ settings: merged, loaded: true });
    };
    const refresh = () => settingsStore.get<Partial<AppSettings>>("settings").then(apply).catch(() => {});
    const id = window.setInterval(refresh, 3000);
    window.addEventListener("focus", refresh);
    const unlisten = listen<AppSettings>("settings-updated", (e) => apply(e.payload));
    return () => {
      active = false;
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      unlisten.then((u) => u()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    loadStatic(settings.locale);
  }, [loaded, settings.locale, loadStatic]);

  return { settings, loaded };
}
