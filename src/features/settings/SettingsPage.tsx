import { Settings } from "lucide-react";
import { Page, PageHeader } from "@/components/ui";
import { useSettings } from "@/stores/settings";
import { RiotApiSection, RiotIdSection } from "./RiotSection";
import { LocaleSection } from "./LocaleSection";
import { OverlaySection } from "./OverlaySection";
import { OddsSection } from "./OddsSection";
import { DisplaySection } from "./DisplaySection";
import { DataSection } from "./DataSection";
import { TierSection } from "./TierSection";
import { AboutSection } from "./AboutSection";

export function SettingsPage() {
  const loaded = useSettings((s) => s.loaded);
  return (
    <Page>
      <PageHeader icon={<Settings />} title="設定" subtitle="API 連携・データ・オーバーレイ・確率テーブル" />
      {!loaded ? (
        <div className="flex flex-col gap-5">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-40" />)}</div>
      ) : (
        <div className="flex flex-col gap-5 pb-10">
          <RiotApiSection />
          <RiotIdSection />
          <LocaleSection />
          <OverlaySection />
          <OddsSection />
          <DisplaySection />
          <TierSection />
          <DataSection />
          <AboutSection />
        </div>
      )}
    </Page>
  );
}
