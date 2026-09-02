import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { KeyRound, Eye, EyeOff, ExternalLink, Wifi, UserRound, Link2, Unlink, Search } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { riot } from "@/lib/api";
import { PLATFORMS, type Platform, type Summoner } from "@/lib/types";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import { SettingsCard, saveSettings, submitOn } from "./common";

const DEV_PORTAL = "https://developer.riotgames.com/";

export function RiotApiSection() {
  const settings = useSettings((s) => s.settings);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [platform, setPlatform] = useState<Platform>(settings.platform);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { setApiKey(settings.apiKey); setPlatform(settings.platform); }, [settings.apiKey, settings.platform]);
  const dirty = apiKey.trim() !== settings.apiKey || platform !== settings.platform;

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    await saveSettings({ apiKey: apiKey.trim(), platform });
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    try {
      const key = apiKey.trim();
      if (!key) { toast.warning("APIキーを入力してください"); return; }
      await riot.configure(key, platform);
      const s = useSettings.getState().settings;
      if (s.puuid) {
        const sum = await riot.getSummoner(s.puuid);
        toast.success("接続成功", `${s.gameName}#${s.tagLine} · サモナーレベル ${sum.summonerLevel}`);
      } else if (s.gameName && s.tagLine) {
        const acc = await riot.resolveAccount(s.gameName, s.tagLine);
        toast.success("接続成功", `${acc.gameName}#${acc.tagLine} を確認しました`);
      } else {
        toast.info("APIキーを設定しました", "Riot ID を入力して「検索して連携」で接続を確認できます");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("接続に失敗しました", /403|401/.test(msg) ? "APIキーが無効か期限切れです (24時間で失効)" : msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsCard
      title="Riot API"
      icon={<KeyRound />}
      description="Riot Games Developer Portal で発行した API キーを設定します。開発用キーは 24 時間ごとに失効するため、定期的に更新してください。"
      dirty={dirty}
      onSave={save}
      saving={saving}
      action={
        <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => openUrl(DEV_PORTAL).catch(() => toast.error("ブラウザを開けませんでした", DEV_PORTAL))}>
          Developer Portal を開く
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4">
        <Input
          label="API キー"
          type={show ? "text" : "password"}
          value={apiKey}
          placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setApiKey(e.target.value)}
          {...submitOn(save)}
          right={
            <button type="button" onClick={() => setShow((v) => !v)} className="text-fg-subtle hover:text-fg focus-ring rounded" aria-label={show ? "隠す" : "表示"}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
          hint={settings.apiKey ? "保存済みのキーがあります" : "未設定"}
        />
        <Select
          label="プラットフォーム"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
          options={PLATFORMS.map((p) => ({ value: p.id, label: `${p.label} · ${p.region}` }))}
        />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="outline" icon={<Wifi className="size-3.5" />} onClick={test} loading={testing} disabled={!apiKey.trim()}>
          接続テスト
        </Button>
        {dirty && <span className="text-xs text-fg-subtle">保存前のキーでテストします</span>}
      </div>
    </SettingsCard>
  );
}

export function RiotIdSection() {
  const settings = useSettings((s) => s.settings);
  const [gameName, setGameName] = useState(settings.gameName);
  const [tagLine, setTagLine] = useState(settings.tagLine);
  const [busy, setBusy] = useState(false);
  const [summoner, setSummoner] = useState<Summoner | null>(null);

  useEffect(() => { setGameName(settings.gameName); setTagLine(settings.tagLine); }, [settings.gameName, settings.tagLine]);

  useEffect(() => {
    let active = true;
    if (!settings.puuid || !settings.apiKey) { setSummoner(null); return; }
    riot.getSummoner(settings.puuid).then((s) => { if (active) setSummoner(s); }).catch(() => { if (active) setSummoner(null); });
    return () => { active = false; };
  }, [settings.puuid, settings.apiKey]);

  const dirty = gameName.trim() !== settings.gameName || tagLine.trim().replace(/^#/, "") !== settings.tagLine;

  const link = async () => {
    const gn = gameName.trim();
    const tl = tagLine.trim().replace(/^#/, "");
    if (!gn || !tl) { toast.warning("ゲーム名とタグラインを入力してください"); return; }
    if (!settings.apiKey) { toast.warning("先に API キーを設定してください"); return; }
    setBusy(true);
    try {
      const acc = await riot.resolveAccount(gn, tl);
      await saveSettings({ puuid: acc.puuid, gameName: acc.gameName, tagLine: acc.tagLine }, "");
      toast.success("アカウントを連携しました", `${acc.gameName}#${acc.tagLine}`);
      try { setSummoner(await riot.getSummoner(acc.puuid)); } catch { /* ignore */ }
    } catch (e) {
      toast.error("アカウントが見つかりません", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    await saveSettings({ puuid: null }, "連携を解除しました");
    setSummoner(null);
  };

  const iconUrl = summoner ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${summoner.profileIconId}.jpg` : null;

  return (
    <SettingsCard title="Riot ID" icon={<UserRound />} description="戦績の同期に使う自分のアカウントを連携します。" dirty={dirty}>
      {settings.puuid && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-bg-elev border border-border p-3 animate-fade-in">
          <div className="size-12 rounded-full bg-surface-3 overflow-hidden shrink-0 ring-2 ring-gold/50">
            {iconUrl ? <img src={iconUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full skeleton" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">
              {settings.gameName}<span className="text-fg-subtle">#{settings.tagLine}</span>
            </div>
            <div className="text-xs text-fg-muted tabular-nums">
              {summoner ? `サモナーレベル ${summoner.summonerLevel}` : settings.apiKey ? "レベル取得中..." : "APIキー未設定"} · {PLATFORMS.find((p) => p.id === settings.platform)?.label}
            </div>
            <div className="text-[10px] text-fg-subtle font-mono truncate mt-0.5">{settings.puuid}</div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-success"><Link2 className="size-3.5" />連携済み</span>
          <Button size="sm" variant="ghost" icon={<Unlink className="size-3.5" />} onClick={unlink}>連携解除</Button>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <Input className="flex-1" label="ゲーム名" value={gameName} placeholder="Hide on bush" onChange={(e) => setGameName(e.target.value)} {...submitOn(link)} onBlur={undefined} />
        <Input className="md:w-40" label="タグライン" value={tagLine} placeholder="JP1" left={<span className="text-sm">#</span>} onChange={(e) => setTagLine(e.target.value)} {...submitOn(link)} onBlur={undefined} />
        <Button variant="primary" icon={<Search className="size-4" />} onClick={link} loading={busy}>
          検索して連携
        </Button>
      </div>
    </SettingsCard>
  );
}
