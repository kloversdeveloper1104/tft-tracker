import { Outlet } from "react-router";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui";
import { useStaticData } from "@/stores/staticData";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { useSettings } from "@/stores/settings";

export function Layout() {
  const { error, loading, refresh } = useStaticData();
  const locale = useSettings((s) => s.settings.locale);
  return (
    <div className="h-full flex flex-col">
      <TitleBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 relative bg-bg">
          {error && (
            <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 py-2 bg-danger/15 border-b border-danger/30 text-sm text-danger">
              <AlertTriangle className="size-4" />
              <span className="flex-1">静的データの取得に失敗しました: {error}</span>
              <Button size="xs" variant="danger" loading={loading} icon={<RefreshCw className="size-3" />} onClick={() => refresh(locale)}>再試行</Button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
