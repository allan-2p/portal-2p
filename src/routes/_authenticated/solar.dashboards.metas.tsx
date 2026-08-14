import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useState } from "react";
import { VendedorFilter } from "@/components/vendedor-filter";
import { GoalsPanel } from "@/components/goals-panel";
import { CARTEIRA_OWNER_IDS } from "@/lib/salespeople";

export const Route = createFileRoute("/_authenticated/solar/dashboards/metas")({
  head: () => ({ meta: [{ title: "Metas — Portal 2P" }] }),
  component: DashboardMetasPage,
});

function DashboardMetasPage() {
  const [ownerId, setOwnerId] = useState<string>("all");
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pessoal</div>
            <h1 className="text-3xl font-bold mt-1">Metas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Faturamento, retenção e novos A+B do trimestre.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <VendedorFilter value={ownerId} onChange={setOwnerId} allowedIds={[...CARTEIRA_OWNER_IDS]} />
          </div>
        </div>

        <GoalsPanel ownerId={ownerId} />
      </div>
    </AppLayout>
  );
}
