import { useLocation, useNavigate } from "react-router";
import { AlertTriangle, BookOpen, Gem, Hexagon, Package, RefreshCw, Users } from "lucide-react";
import { Button, EmptyState, Page, PageHeader, Skeleton, Tabs } from "@/components/ui";
import { useStaticData } from "@/stores/staticData";
import { useSettings } from "@/stores/settings";
import { ChampionsTab } from "./ChampionsTab";
import { TraitsTab } from "./TraitsTab";
import { ItemsTab } from "./ItemsTab";
import { AugmentsTab } from "./AugmentsTab";
import { CardGridSkeleton } from "./primitives";

type Tab = "champions" | "traits" | "items" | "augments";
const TAB_IDS: Tab[] = ["champions", "traits", "items", "augments"];

export function ReferencePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useStaticData();
  const locale = useSettings((s) => s.settings.locale);

  const seg = location.pathname.split("/")[2] ?? "";
  const tab: Tab = (TAB_IDS as string[]).includes(seg) ? (seg as Tab) : "champions";

  return (
    <Page wide>
      <PageHeader
        icon={<BookOpen />}
        title="図鑑"
        subtitle={data ? `Set ${data.setNumber}${data.setName ? ` · ${data.setName}` : ""} · ${data.champions.length} ユニット / ${data.traits.length} 特性 / ${data.items.length} アイテム` : "静的データを読み込み中..."}
        actions={
          <Tabs<Tab>
            value={tab}
            onChange={(v) => navigate(`/reference/${v}`)}
            items={[
              { id: "champions", label: "チャンピオン", icon: <Users className="size-4" /> },
              { id: "traits", label: "特性", icon: <Hexagon className="size-4" /> },
              { id: "items", label: "アイテム", icon: <Package className="size-4" /> },
              { id: "augments", label: "オーグメント", icon: <Gem className="size-4" /> },
            ]}
          />
        }
      />
      {!data ? (
        error && !loading ? (
          <div className="card">
            <EmptyState
              icon={<AlertTriangle />}
              title="静的データを読み込めませんでした"
              description={error}
              action={<Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={() => refresh(locale)}>再試行</Button>}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="card p-3 flex gap-2">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-7 w-40 rounded-full" />
              <Skeleton className="h-7 w-24 rounded-full" />
            </div>
            <CardGridSkeleton count={18} height={124} />
          </div>
        )
      ) : tab === "champions" ? (
        <ChampionsTab data={data} />
      ) : tab === "traits" ? (
        <TraitsTab data={data} />
      ) : tab === "items" ? (
        <ItemsTab data={data} />
      ) : (
        <AugmentsTab data={data} />
      )}
    </Page>
  );
}
