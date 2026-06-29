import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { BarChart3, Target, Wallet, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboards")({
  head: () => ({ meta: [{ title: "Dashboards — Portal 2P" }] }),
  component: DashboardsPage,
});

function DashboardsPage() {
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pessoal</div>
          <h1 className="text-3xl font-bold mt-1">Meus Dashboards</h1>
          <p className="text-sm text-muted-foreground mt-1">Acompanhe suas próprias metas, comissões e indicadores.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { l: "Meta acumulada (ano)", v: "...", sub: "Dados em breve", Icon: Target },
            { l: "Comissão prevista", v: "...", sub: "Dados em breve", Icon: Wallet },
            { l: "Ranking equipe", v: "...", sub: "Dados em breve", Icon: TrendingUp },
            { l: "Bônus do trimestre", v: "...", sub: "Dados em breve", Icon: BarChart3 },
          ].map((c) => (
            <div key={c.l} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{c.l}</div>
                <c.Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="font-display font-bold text-3xl mt-2">{c.v}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>
            </div>
          ))}
        </div>

        <div className="glass rounded-2xl p-12 text-center">
          <BarChart3 className="h-10 w-10 text-primary mx-auto mb-3" />
          <h3 className="font-display font-semibold text-lg">Dashboards detalhados em construção</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Em breve você acompanhará histórico de comissões, metas trimestrais, evolução pessoal e comparativos com a equipe.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
