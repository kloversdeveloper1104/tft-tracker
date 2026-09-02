import { NavLink } from "react-router";
import { LayoutDashboard, Swords, BarChart3, BookOpen, Grid3X3, Dices, Settings, Layers, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/stores/settings";
import { useStaticData } from "@/stores/staticData";
import { overlay } from "@/lib/api";

const NAV = [
  { to: "/", label: "ダッシュボード", icon: LayoutDashboard, end: true },
  { to: "/matches", label: "戦績", icon: Swords },
  { to: "/stats", label: "メタ統計", icon: BarChart3 },
  { to: "/reference", label: "図鑑", icon: BookOpen },
  { to: "/planner", label: "プランナー", icon: Grid3X3 },
  { to: "/odds", label: "確率 & 練習", icon: Dices },
  { to: "/collector", label: "データ収集", icon: Database },
];

export function Sidebar() {
  const settings = useSettings((s) => s.settings);
  const data = useStaticData((s) => s.data);
  return (
    <aside className="w-[220px] shrink-0 flex flex-col bg-bg-elev border-r border-border">
      <div className="px-4 pt-5 pb-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-fg-subtle font-semibold">Teamfight Tactics</div>
        <div className="text-lg font-bold text-gradient-gold leading-tight">Tracker</div>
        {data && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span className="size-1.5 rounded-full bg-teal animate-pulse-soft" />
            Set {data.setNumber} · {data.champions.length} units
          </div>
        )}
      </div>
      <nav className="flex-1 px-2.5 flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 h-10 text-sm font-medium transition-all duration-150 focus-ring",
                isActive
                  ? "bg-surface-3 text-fg shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] border-l-2 border-gold pl-[10px]"
                  : "text-fg-muted hover:text-fg hover:bg-surface-2",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn("size-[18px] transition-colors", isActive ? "text-gold" : "text-fg-subtle group-hover:text-fg-muted")} />
                {label}
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => overlay.toggle()}
          className="mt-2 flex items-center gap-3 rounded-lg px-3 h-10 text-sm font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-all focus-ring"
        >
          <Layers className="size-[18px] text-fg-subtle" />
          オーバーレイ
        </button>
      </nav>
      <div className="p-2.5 border-t border-border">
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            "flex items-center gap-3 rounded-lg px-3 h-11 transition-all focus-ring",
            isActive ? "bg-surface-3" : "hover:bg-surface-2",
          )}
        >
          <div className="size-8 rounded-full bg-gradient-to-br from-gold to-gold-dim flex items-center justify-center text-[#2a1f05] font-bold text-sm">
            {(settings.gameName || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{settings.gameName || "未設定"}</div>
            <div className="text-[11px] text-fg-subtle truncate">{settings.tagLine ? `#${settings.tagLine} · ${settings.platform.toUpperCase()}` : "Riot ID を設定"}</div>
          </div>
          <Settings className="size-4 text-fg-subtle" />
        </NavLink>
      </div>
    </aside>
  );
}
