import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { EstoquePainel } from "@/components/estoque-painel";

export const Route = createFileRoute("/_authenticated/admin/estoque")({
  component: EstoquePage,
  head: () => ({
    meta: [
      { title: "Estoque e Produtos | Portal 2P" },
      {
        name: "description",
        content: "Estoque, NCM e catálogo consolidado do SAP para 2P Solar e 2P Carregadores.",
      },
      { property: "og:title", content: "Estoque e Produtos | Portal 2P" },
      {
        property: "og:description",
        content: "Saldos, containers em trânsito e produtos consolidados do SAP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function EstoquePage() {
  return (
    <AppLayout>
      <AdminRouteGuard feature="admin.objetos.produtos" area="configuracoes">
        <EstoquePainel />
      </AdminRouteGuard>
    </AppLayout>
  );
}
