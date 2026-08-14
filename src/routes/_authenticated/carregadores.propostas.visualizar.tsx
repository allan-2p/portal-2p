import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { PropostaDetalhe } from "@/components/proposta-detalhe";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/carregadores/propostas/visualizar")({
  head: () => ({
    meta: [
      { title: "Detalhes da proposta — Portal 2P Carregadores" },
      {
        name: "description",
        content: "Resumo objetivo da proposta: cliente, itens, totais e andamento do pedido.",
      },
      { property: "og:title", content: "Detalhes da proposta — Portal 2P Carregadores" },
      {
        property: "og:description",
        content: "Consulte dados do cliente, produtos, valores e o andamento do pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s['id'] === "string" ? s['id'] : undefined,
  }),
  component: VisualizarPropostaPage,
});

function VisualizarPropostaPage() {
  const { id } = Route.useSearch();
  return (
    <AppLayout>
      <div className="max-w-[1200px] mx-auto space-y-5">
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link to="/carregadores/propostas">
            <ArrowLeft className="h-4 w-4" /> Voltar às propostas
          </Link>
        </Button>
        <PropostaDetalhe id={id} />
      </div>
    </AppLayout>
  );
}
