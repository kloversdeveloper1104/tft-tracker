import { MonitorCog } from "lucide-react";
import { Switch } from "@/components/ui";
import { useSettings } from "@/stores/settings";
import { SettingsCard, saveSettings } from "./common";

export function DisplaySection() {
  const settings = useSettings((s) => s.settings);
  return (
    <SettingsCard title="表示" icon={<MonitorCog />} description="変更は即座に保存されます。">
      <div className="flex flex-col gap-4">
        <Switch
          checked={settings.reduceMotion}
          onChange={(v) => saveSettings({ reduceMotion: v })}
          label="アニメーションを減らす"
          description="フェードやスライドなどの動きを最小限にします。"
        />
        <Switch
          checked={settings.autoSyncOnLaunch}
          onChange={(v) => saveSettings({ autoSyncOnLaunch: v })}
          label="起動時に戦績を自動同期"
          description="アカウント連携済みの場合、起動時に最新の試合を取得します。"
        />
      </div>
    </SettingsCard>
  );
}
