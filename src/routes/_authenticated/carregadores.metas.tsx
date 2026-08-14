import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ModeracaoPlaceholder, PlaceholderLink } from "@/components/admin/moderacao-placeholder";

export const Route = createFileRoute("/_authenticated/carregadores/metas")({
  head: () => ({
    meta: [
      { title: "Regras de Metas — 2P Carregadores | Portal 2P" },
      { name: "description", content: "Metas por consultor e por trimestre da unidade 2P Carregadores." },
      { property: "og:title", content: "Regras de Metas — 2P Carregadores | Portal 2P" },
      { property: "og:description", content: "Moderação das metas da unidade 2P Carregadores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="cpo.metas" area="moderacao">
      <AppLayout>
        <ModeracaoPlaceholder
          unidade="2P Carregadores"
          titulo="Regras de Metas"
          descricao="Metas mensais e trimestrais dos consultores da unidade 2P Carregadores."
        >
          <p className="text-sm text-muted-foreground">
            Enquanto as metas de carregadores não são cadastradas aqui, o acompanhamento usa os números
            consolidados do grupo em{" "}
            <PlaceholderLink to="/admin/metas">2P Solar › Regras de Metas</PlaceholderLink>.
          </p>
        </ModeracaoPlaceholder>
        <div className="max-w-[1100px] mx-auto mt-5">
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
