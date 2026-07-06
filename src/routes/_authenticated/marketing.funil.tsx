import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/marketing/funil")({
  head: () => ({ meta: [{ title: "Funil — Marketing — Portal 2P" }] }),
  component: MarketingFunil,
});

function MarketingFunil() {
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing</div>
          <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Funil Consolidado
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Etapas do funil unificando as duas unidades.
          </p>
        </div>
        <div className="glass rounded-xl p-8 text-center text-muted-foreground">
          Etapas do funil serão exibidas aqui assim que a ligação com Salesforce (Leads/Opps) for finalizada para a visão de Marketing.
        </div>
      </div>
    </AppLayout>
  );
}
