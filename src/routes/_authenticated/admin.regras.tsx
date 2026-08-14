import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ModeracaoPlaceholder, PlaceholderLink } from "@/components/admin/moderacao-placeholder";

export const Route = createFileRoute("/_authenticated/admin/regras")({
  head: () => ({
    meta: [
      { title: "Regras de Propostas — 2P Solar | Portal 2P" },
      { name: "description", content: "Regras de propostas da unidade 2P Solar: origem dos dados e cálculo." },
      { property: "og:title", content: "Regras de Propostas — 2P Solar | Portal 2P" },
      { property: "og:description", content: "Moderação das regras de propostas da unidade 2P Solar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.regras" area="moderacao">
      <AppLayout>
        <ModeracaoPlaceholder
          unidade="2P Solar"
          titulo="Regras de Propostas"
          descricao="Documentação e parâmetros do cálculo das propostas da unidade 2P Solar."
        >
          <p className="text-sm text-muted-foreground">
            As propostas de 2P Solar hoje seguem as tabelas de{" "}
            <PlaceholderLink to="/admin/tabelas">Configurações › Tabelas</PlaceholderLink> e as metas em{" "}
            <PlaceholderLink to="/admin/metas">Regras de Metas</PlaceholderLink>.
          </p>
        </ModeracaoPlaceholder>
        <div className="max-w-[1100px] mx-auto mt-5">
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
