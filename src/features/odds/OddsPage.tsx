import { useMemo, useState } from "react";
import { Calculator, Dices, Grid3x3, TrendingUp, Zap } from "lucide-react";
import { Page, PageHeader, Tabs } from "@/components/ui";
import { DEFAULT_ODDS } from "@/data/odds";
import { useSettings } from "@/stores/settings";
import { useStaticData } from "@/stores/staticData";
import { ShopOddsTab } from "./ShopOddsTab";
import { HitCalculatorTab } from "./HitCalculatorTab";
import { TrainerTab } from "./TrainerTab";
import { LevelTab } from "./LevelTab";
import { championsPerCostFrom } from "./data";

type TabId = "odds" | "calc" | "trainer" | "level";

export function OddsPage() {
  const [tab, setTab] = useState<TabId>("odds");
  const odds = useSettings((s) => s.settings.odds) ?? DEFAULT_ODDS;
  const champions = useStaticData((s) => s.data?.champions);
  const setName = useStaticData((s) => s.data?.setName);
  const championsPerCost = useMemo(() => championsPerCostFrom(champions), [champions]);
  const isCustom = useSettings((s) => s.settings.odds) !== null;

  return (
    <Page wide>
      <PageHeader
        icon={<Dices />}
        title="確率 & 練習"
        subtitle={
          <span>
            ショップ確率・当たり計算・ロールダウン練習
            {setName && <span className="text-fg-subtle"> · {setName}</span>}
            {isCustom && <span className="ml-2 text-gold text-xs">カスタム確率テーブル</span>}
          </span>
        }
        actions={
          <Tabs<TabId>
            value={tab}
            onChange={setTab}
            items={[
              { id: "odds", label: "ショップ確率", icon: <Grid3x3 className="size-4" /> },
              { id: "calc", label: "当たり確率計算", icon: <Calculator className="size-4" /> },
              { id: "trainer", label: "ロールダウン練習", icon: <Zap className="size-4" /> },
              { id: "level", label: "レベルアップ表", icon: <TrendingUp className="size-4" /> },
            ]}
          />
        }
      />
      {tab === "odds" && <ShopOddsTab odds={odds} championsPerCost={championsPerCost} />}
      {tab === "calc" && <HitCalculatorTab odds={odds} championsPerCost={championsPerCost} />}
      {tab === "trainer" && <TrainerTab odds={odds} />}
      {tab === "level" && <LevelTab />}
    </Page>
  );
}
