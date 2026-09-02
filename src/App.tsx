import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router";
import { register, unregister, isRegistered } from "@tauri-apps/plugin-global-shortcut";
import { Layout } from "@/app/Layout";
import { useSettings } from "@/stores/settings";
import { useStaticData } from "@/stores/staticData";
import { overlay } from "@/lib/api";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { MatchesPage } from "@/features/matches/MatchesPage";
import { MatchDetailPage } from "@/features/matches/MatchDetailPage";
import { StatsPage } from "@/features/stats/StatsPage";
import { ReferencePage } from "@/features/reference/ReferencePage";
import { PlannerPage } from "@/features/planner/PlannerPage";
import { OddsPage } from "@/features/odds/OddsPage";
import { CollectorPage } from "@/features/collector/CollectorPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

function Bootstrap() {
  const { load, loaded, settings } = useSettings();
  const loadStatic = useStaticData((s) => s.load);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!loaded) return;
    loadStatic(settings.locale);
  }, [loaded, settings.locale, loadStatic]);

  useEffect(() => {
    if (!loaded) return;
    document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion);
  }, [loaded, settings.reduceMotion]);

  // Global shortcut for overlay toggle
  useEffect(() => {
    if (!loaded || !settings.overlayShortcut) return;
    const sc = settings.overlayShortcut;
    let active = true;
    (async () => {
      try {
        if (await isRegistered(sc)) await unregister(sc);
        if (!active) return;
        await register(sc, (e) => { if (e.state === "Pressed") overlay.toggle(); });
      } catch (err) {
        console.warn("shortcut register failed", err);
      }
    })();
    return () => { active = false; unregister(sc).catch(() => {}); };
  }, [loaded, settings.overlayShortcut]);

  return null;
}

export default function App() {
  return (
    <HashRouter>
      <Bootstrap />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="matches" element={<MatchesPage />} />
          <Route path="matches/:matchId" element={<MatchDetailPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="reference/*" element={<ReferencePage />} />
          <Route path="planner" element={<PlannerPage />} />
          <Route path="odds" element={<OddsPage />} />
          <Route path="collector" element={<CollectorPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
