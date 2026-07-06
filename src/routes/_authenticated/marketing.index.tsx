import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Megaphone, Users, TrendingUp, DollarSign } from "lucide-react";

export const Route = createFileRoute("/_authenticated/marketing/")({
  head: () => ({ meta: [{ title: "Marketing — Portal 2P" }] }),
  component: MarketingOverview,
});

function MarketingOverview() {
  const kpis = [
    { label: "Leads (30d)", value: "—", icon: Users, hint: "Consolidando fontes" },
    { label: "MQL → SQL", value: "—", icon: TrendingUp, hint: "Aguardando ligação com Salesforce" },
    { label: "CAC estimado", value: "—", icon: DollarSign, hint: "Depende de custo de campanhas" },
    { label: "Ticket médio", value: "—", icon: DollarSign, hint: "Solar + Carregadores" },
  ];
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing</div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" /> Overview
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Consolidação de dados de marketing das unidades Solar e Carregadores.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="glass rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{k.label}</div>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-3 text-3xl font-bold">{k.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{k.hint}</div>
              </div>
            );
          })}
        </div>

        <div className="glass rounded-xl p-8 text-center text-muted-foreground">
          <Megaphone className="h-8 w-8 mx-auto mb-3 text-primary" />
          <div className="font-medium text-foreground">Painel em construção</div>
          <div className="text-sm mt-1">
            Os dados de campanhas, funil e atribuição serão integrados a partir das ferramentas de marketing usadas por Solar e Carregadores.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
