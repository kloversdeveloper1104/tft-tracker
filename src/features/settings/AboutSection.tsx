import { Info, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "@/stores/toast";
import { SettingsCard } from "./common";

const APP_VERSION = "1.0.0";

const LINKS = [
  { label: "Riot Developer Portal", url: "https://developer.riotgames.com/" },
  { label: "Community Dragon", url: "https://www.communitydragon.org/" },
  { label: "Riot Games 法的情報", url: "https://www.riotgames.com/en/legal" },
];

export function AboutSection() {
  const open = (url: string) => openUrl(url).catch(() => toast.error("ブラウザを開けませんでした", url));
  return (
    <SettingsCard title="このアプリについて" icon={<Info />}>
      <div className="flex items-start gap-4">
        <img src="/icon.png" alt="" className="size-14 rounded-xl border border-border bg-surface-2" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-gradient-gold">TFT Tracker</span>
            <span className="text-xs text-fg-subtle tabular-nums">v{APP_VERSION}</span>
          </div>
          <p className="text-xs text-fg-muted mt-1">Teamfight Tactics のデスクトップ用コンパニオンアプリ。Tauri + React で構築。</p>
          <div className="mt-3 text-xs text-fg-muted">
            <span className="text-fg-subtle">データソース: </span>Riot Games API (試合・ランク) · Community Dragon (チャンピオン・アイテム・特性の静的データ)
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {LINKS.map((l) => (
              <button key={l.url} onClick={() => open(l.url)} className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-1 text-xs text-fg-muted hover:text-fg hover:border-border-strong transition-colors focus-ring">
                {l.label} <ExternalLink className="size-3" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-5 pt-4 border-t border-border text-[11px] leading-relaxed text-fg-subtle">
        TFT Tracker isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
      </p>
    </SettingsCard>
  );
}
