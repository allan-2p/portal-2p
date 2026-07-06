import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useState } from "react";
import { VendedorFilter } from "@/components/vendedor-filter";
import { CARTEIRA_OWNER_IDS } from "@/lib/salespeople";

export const Route = createFileRoute("/_authenticated/dashboards/geral")({
  head: () => ({ meta: [{ title: "Dashboard — Portal 2P" }] }),
  component: DashboardGeralPage,
});

function DashboardGeralPage() {
  const [ownerId, setOwnerId] = useState<string>("all");
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pessoal</div>
            <h1 className="text-3xl font-bold mt-1">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Seus indicadores de vendas, comissões e performance.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <VendedorFilter value={ownerId} onChange={setOwnerId} allowedIds={[...CARTEIRA_OWNER_IDS]} />
          </div>
        </div>

        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Dashboard principal em breve.
        </div>
      </div>
    </AppLayout>
  );
}
