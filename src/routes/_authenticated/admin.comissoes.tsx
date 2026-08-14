import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ModeracaoPlaceholder, PlaceholderLink } from "@/components/admin/moderacao-placeholder";
import { ModerationAuditLog } from "@/components/moderation-audit-log";

export const Route = createFileRoute("/_authenticated/admin/comissoes")({
  head: () => ({
    meta: [
      { title: "Regras de Comissões — 2P Solar | Portal 2P" },
      { name: "description", content: "Faixas e regras de comissão da unidade 2P Solar." },
      { property: "og:title", content: "Regras de Comissões — 2P Solar | Portal 2P" },
      { property: "og:description", content: "Moderação das comissões da unidade 2P Solar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.comissoes">
      <AppLayout>
        <ModeracaoPlaceholder
          unidade="2P Solar"
          titulo="Regras de Comissões"
          descricao="Faixas de comissão (Vendido, Novos e Retenção) dos consultores de 2P Solar."
        >
          <p className="text-sm text-muted-foreground">
            As faixas de comissão de 2P Solar são editadas hoje dentro de{" "}
            <PlaceholderLink to="/admin/metas">Regras de Metas</PlaceholderLink>, junto das metas por consultor.
          </p>
        </ModeracaoPlaceholder>
        <div className="max-w-[1100px] mx-auto mt-5">
          <ModerationAuditLog area="solar_comissoes" description="alterações nas comissões de 2P Solar." />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
