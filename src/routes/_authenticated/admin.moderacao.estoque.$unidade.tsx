import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { EstoqueGestao } from "@/components/admin/estoque-gestao";
import { UNIDADE_LABEL, type UnidadeProdutos } from "@/components/admin/produtos-gestao";

const SLUGS: Record<string, UnidadeProdutos> = {
  solar: "solar",
  carregadores: "carregadores",
  "grupo-2p": "grupo2p",
};

export const Route = createFileRoute("/_authenticated/admin/moderacao/estoque/$unidade")({
  beforeLoad: ({ params }) => {
    if (!SLUGS[params.unidade]) throw redirect({ to: "/admin/moderacao/estoque/$unidade", params: { unidade: "grupo-2p" } });
  },
  head: ({ params }) => {
    const label = UNIDADE_LABEL[SLUGS[params.unidade] ?? "grupo2p"];
    return {
      meta: [
        { title: `Estoque — ${label} | Portal 2P` },
        {
          name: "description",
          content: `Saldos, containers em trânsito e catálogo do SAP de ${label}.`,
        },
        { property: "og:title", content: `Estoque — ${label} | Portal 2P` },
        {
          property: "og:description",
          content: `Estoque consolidado do SAP para ${label} no Portal 2P.`,
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: Page,
});

function Page() {
  const { unidade } = Route.useParams();
  return (
    <AdminRouteGuard feature="admin.objetos.produtos" area="moderacao">
      <EstoqueGestao unidade={SLUGS[unidade] ?? "grupo2p"} />
    </AdminRouteGuard>
  );
}
