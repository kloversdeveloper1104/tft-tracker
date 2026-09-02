import { useEffect, useMemo, useState } from "react";
import { Layers, ExternalLink, Keyboard } from "lucide-react";
import { Button, Input, Kbd, Slider } from "@/components/ui";
import { overlay } from "@/lib/api";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import { SettingsCard, submitOn, saveSettings } from "./common";

const MODIFIERS = ["CommandOrControl", "Command", "Control", "Ctrl", "Alt", "Option", "AltGr", "Shift", "Super", "Meta"];
const KEY_RE = /^([A-Z]|[0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Enter|Tab|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Plus|Minus|Comma|Period|Slash|Backslash|Semicolon|Quote|BracketLeft|BracketRight|Backquote|Equal|Numpad[0-9]|NumpadAdd|NumpadSubtract|NumpadMultiply|NumpadDivide)$/i;

export function validateShortcut(v: string): string | null {
  const parts = v.split("+").map((p) => p.trim());
  if (parts.length < 2) return "修飾キーとキーを + で結合してください (例: CommandOrControl+Shift+O)";
  if (parts.some((p) => !p)) return "空の要素があります";
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  for (const m of mods) {
    if (!MODIFIERS.some((x) => x.toLowerCase() === m.toLowerCase())) return `不明な修飾キー: ${m}`;
  }
  if (!KEY_RE.test(key)) return `不明なキー: ${key}`;
  return null;
}

export function OverlaySection() {
  const settings = useSettings((s) => s.settings);
  const [shortcut, setShortcut] = useState(settings.overlayShortcut);
  const [opacity, setOpacity] = useState(settings.overlayOpacity);
  const [scale, setScale] = useState(settings.overlayScale);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setShortcut(settings.overlayShortcut); }, [settings.overlayShortcut]);
  useEffect(() => { setOpacity(settings.overlayOpacity); }, [settings.overlayOpacity]);
  useEffect(() => { setScale(settings.overlayScale); }, [settings.overlayScale]);

  const error = useMemo(() => validateShortcut(shortcut), [shortcut]);
  const dirty = shortcut !== settings.overlayShortcut || opacity !== settings.overlayOpacity || scale !== settings.overlayScale;

  const save = async () => {
    if (!dirty) return;
    if (error) { toast.error("ショートカットの形式が正しくありません", error); return; }
    setSaving(true);
    await saveSettings({ overlayShortcut: shortcut, overlayOpacity: opacity, overlayScale: scale });
    setSaving(false);
  };

  return (
    <SettingsCard
      title="オーバーレイ"
      icon={<Layers />}
      description="ゲーム中に最前面表示できる小型ウィンドウです。グローバルショートカットで表示/非表示を切り替えます。"
      dirty={dirty}
      onSave={save}
      saving={saving}
      action={
        <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />} onClick={() => overlay.open().catch((e) => toast.error("オーバーレイを開けませんでした", String(e)))}>
          オーバーレイを開く
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-3">
          <Input
            label="表示切替ショートカット"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            {...submitOn(save)}
            onBlur={undefined}
            left={<Keyboard className="size-4" />}
            error={error}
            spellCheck={false}
            hint={
              <span className="flex flex-wrap items-center gap-1">
                修飾キー: {["CommandOrControl", "Ctrl", "Alt", "Shift", "Super"].map((m) => <Kbd key={m}>{m}</Kbd>)} + キー (A–Z, 0–9, F1–F24 など)
              </span>
            }
          />
          <div className="text-xs text-fg-subtle">
            現在: <Kbd>{settings.overlayShortcut.replace("CommandOrControl", "Ctrl")}</Kbd>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <Slider label="透明度" min={0.4} max={1} step={0.02} value={opacity} onChange={setOpacity} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="拡大率" min={0.8} max={1.4} step={0.05} value={scale} onChange={setScale} format={(v) => `${Math.round(v * 100)}%`} />
          <div className="rounded-lg border border-border bg-bg-elev p-3 flex items-center justify-center overflow-hidden h-20">
            <div
              className="rounded-md border border-white/10 bg-surface px-3 py-1.5 text-[11px] text-fg flex items-center gap-2 shadow-pop transition-transform"
              style={{ opacity, transform: `scale(${scale})` }}
            >
              <Layers className="size-3 text-gold" /> TFT Tracker プレビュー
            </div>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
