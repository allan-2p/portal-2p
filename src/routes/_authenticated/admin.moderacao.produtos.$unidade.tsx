import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ProdutosGestao, UNIDADE_LABEL, type UnidadeProdutos } from "@/components/admin/produtos-gestao";

const SLUGS: Record<string, UnidadeProdutos> = {
  solar: "solar",
  carregadores: "carregadores",
  "grupo-2p": "grupo2p",
};

export const Route = createFileRoute("/_authenticated/admin/moderacao/produtos/$unidade")({
  beforeLoad: ({ params }) => {
    if (!SLUGS[params.unidade]) throw redirect({ to: "/admin/moderacao/produtos/$unidade", params: { unidade: "grupo-2p" } });
  },
  head: ({ params }) => {
    const label = UNIDADE_LABEL[SLUGS[params.unidade] ?? "grupo2p"];
    return {
      meta: [
        { title: `Gestão de Produtos — ${label} | Portal 2P` },
        {
          name: "description",
          content: `Controle do catálogo SAP de ${label}: produtos ativos, visibilidade e preços.`,
        },
        { property: "og:title", content: `Gestão de Produtos — ${label} | Portal 2P` },
        {
          property: "og:description",
          content: `Moderação do catálogo de produtos de ${label} no Portal 2P.`,
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
      <ProdutosGestao unidade={SLUGS[unidade] ?? "grupo2p"} />
    </AdminRouteGuard>
  );
}
