import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ModeracaoPlaceholder } from "@/components/admin/moderacao-placeholder";
import { CarregadoresLotesEditor } from "@/components/admin/carregadores-lotes-editor";

export const Route = createFileRoute("/_authenticated/carregadores/lotes")({
  head: () => ({
    meta: [
      { title: "Lotes de Entrega — 2P Carregadores | Portal 2P" },
      {
        name: "description",
        content: "Meses de referência e lotes de chegada de mercadoria disponíveis para os pedidos de carregadores.",
      },
      { property: "og:title", content: "Lotes de Entrega — 2P Carregadores | Portal 2P" },
      {
        property: "og:description",
        content: "Cadastro dos lotes de chegada usados no fechamento dos pedidos de carregadores do Grupo 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="carregadores.regras" area="moderacao">
      <AppLayout>
        <ModeracaoPlaceholder
          unidade="2P Carregadores"
          titulo="Lotes de Entrega"
          descricao="Mês de referência e lote de chegada que o consultor escolhe obrigatoriamente ao fechar o pedido."
        >
          <p className="text-sm text-muted-foreground">
            Apenas lotes ativos aparecem para escolha na proposta. A informação passará a vir do SAP no futuro.
          </p>
        </ModeracaoPlaceholder>
        <div className="max-w-[1100px] mx-auto mt-5">
          <CarregadoresLotesEditor />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
