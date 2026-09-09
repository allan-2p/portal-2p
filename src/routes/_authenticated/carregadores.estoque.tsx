import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { EstoquePainel } from "@/components/estoque-painel";

export const Route = createFileRoute("/_authenticated/carregadores/estoque")({
  component: EstoqueCarregadoresPage,
  head: () => ({
    meta: [
      { title: "Estoque — 2P Carregadores | Portal 2P" },
      {
        name: "description",
        content:
          "Saldos, NCM, custo e containers em trânsito dos materiais da 2P Carregadores, vindos do SAP.",
      },
      { property: "og:title", content: "Estoque — 2P Carregadores | Portal 2P" },
      {
        property: "og:description",
        content: "Estoque e catálogo de produtos da 2P Carregadores sincronizados do SAP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function EstoqueCarregadoresPage() {
  return (
    <AppLayout>
      <AdminRouteGuard feature="carregadores.estoque">
        <EstoquePainel
          org="carregadores"
          titulo="Estoque — 2P Carregadores"
          descricao="Materiais da 2P Carregadores com saldo, NCM, custo, preço SAP e containers em trânsito."
        />
      </AdminRouteGuard>
    </AppLayout>
  );
}
