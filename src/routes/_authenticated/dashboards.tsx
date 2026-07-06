import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useState } from "react";
import { VendedorFilter } from "@/components/vendedor-filter";
import { GoalsPanel } from "@/components/goals-panel";
import { CARTEIRA_OWNER_IDS } from "@/lib/salespeople";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/dashboards")({
  head: () => ({ meta: [{ title: "Dashboards — Portal 2P" }] }),
  component: DashboardsPage,
});

function DashboardsPage() {
  const [ownerId, setOwnerId] = useState<string>("all");
  const [view, setView] = useState<"dashboard" | "metas">("dashboard");
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pessoal</div>
            <h1 className="text-3xl font-bold mt-1">Meus Dashboards</h1>
            <p className="text-sm text-muted-foreground mt-1">Acompanhe suas próprias metas, comissões e indicadores.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs value={view} onValueChange={(v) => setView(v as "dashboard" | "metas")}>
              <TabsList>
                <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                <TabsTrigger value="metas">Metas</TabsTrigger>
              </TabsList>
            </Tabs>
            <VendedorFilter value={ownerId} onChange={setOwnerId} allowedIds={[...CARTEIRA_OWNER_IDS]} />
          </div>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as "dashboard" | "metas")}>
          <TabsContent value="dashboard" className="mt-0" />
          <TabsContent value="metas" className="mt-0">
            <GoalsPanel ownerId={ownerId} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
