import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { VendedorFilter } from "@/components/vendedor-filter";
import { GoalsPanel } from "@/components/goals-panel";
import { CARTEIRA_OWNER_IDS } from "@/lib/salespeople";

export const Route = createFileRoute("/_authenticated/dashboards")({
  head: () => ({ meta: [{ title: "Dashboards — Portal 2P" }] }),
  component: DashboardsPage,
});

function DashboardsPage() {
  const [ownerId, setOwnerId] = useState<string>("all");
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pessoal</div>
            <h1 className="text-3xl font-bold mt-1">Meus Dashboards</h1>
            <p className="text-sm text-muted-foreground mt-1">Acompanhe suas próprias metas, comissões e indicadores.</p>
          </div>
          <VendedorFilter value={ownerId} onChange={setOwnerId} allowedIds={[...CARTEIRA_OWNER_IDS]} />
        </div>

        <GoalsPanel ownerId={ownerId} />

        <div className="glass rounded-2xl p-12 text-center">
          <BarChart3 className="h-10 w-10 text-primary mx-auto mb-3" />
          <h3 className="font-display font-semibold text-lg">Mais dashboards em construção</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Em breve você acompanhará histórico de comissões, evolução pessoal e comparativos com a equipe.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
