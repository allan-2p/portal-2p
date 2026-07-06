import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Filter } from "lucide-react";

export const Route = createFileRoute("/_authenticated/marketing/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — Marketing — Portal 2P" }] }),
  component: MarketingCampanhas,
});

function MarketingCampanhas() {
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing</div>
          <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
            <Filter className="h-6 w-6 text-primary" /> Campanhas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lista consolidada de campanhas ativas de Solar e Carregadores.
          </p>
        </div>
        <div className="glass rounded-xl p-8 text-center text-muted-foreground">
          Ainda sem integração com ferramentas de campanha. Assim que ativarmos, esta página lista automaticamente cada campanha, canal e custo.
        </div>
      </div>
    </AppLayout>
  );
}
