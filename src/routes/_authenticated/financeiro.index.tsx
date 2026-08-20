import { createFileRoute, Link } from "@tanstack/react-router";
import { Landmark, Receipt, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { useInstance } from "@/components/instance-provider";

export const Route = createFileRoute("/_authenticated/financeiro/")({
  head: () => ({
    meta: [
      { title: "Financeiro — Portal 2P" },
      {
        name: "description",
        content: "Painel financeiro do Grupo 2P: condições de pagamento (ZTERM) usadas nas propostas e no SAP.",
      },
      { property: "og:title", content: "Financeiro — Portal 2P" },
      {
        property: "og:description",
        content: "Gestão das condições de pagamento (ZTERM) do Grupo 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroHome,
});

function FinanceiroHome() {
  const { hasFeature } = useInstance();
  return (
    <AppLayout>
      <div className="max-w-[1100px] mx-auto space-y-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Financeiro</div>
          <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" /> Painel financeiro
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Controles financeiros do Grupo 2P. No momento, apenas administradores do sistema têm acesso.
          </p>
        </div>

        {hasFeature("financeiro.condicoes") && (
          <Link
            to="/financeiro/condicoes"
            preload="intent"
            className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-5 hover:bg-surface-2 transition-colors"
          >
            <span className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Receipt className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Condições de Pagamento (ZTERM)</span>
              <span className="block text-sm text-muted-foreground">
                Catálogo de condições enviadas ao SAP — ativar, desativar e ajustar parcelas.
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}
      </div>
    </AppLayout>
  );
}
