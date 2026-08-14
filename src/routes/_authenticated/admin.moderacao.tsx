import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminAreaGuard } from "@/components/admin/admin-area-guard";
import { AdminSectionHome } from "@/components/admin/admin-section-home";
import { ModerationAuditLog } from "@/components/moderation-audit-log";

export const Route = createFileRoute("/_authenticated/admin/moderacao")({
  head: () => ({
    meta: [
      { title: "Moderação | Portal 2P" },
      {
        name: "description",
        content: "Visão geral da moderação do Grupo 2P: produtos e regras de propostas, metas e comissões.",
      },
      { property: "og:title", content: "Moderação | Portal 2P" },
      {
        property: "og:description",
        content: "Atalhos e últimas alterações das moderações do Portal 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminAreaGuard area="moderacao">
      <AppLayout>
        <AdminSectionHome sectionId="moderacao">
          <ModerationAuditLog
            title="Últimas alterações"
            description="o que foi alterado recentemente nas moderações, com autor e data."
          />
        </AdminSectionHome>
      </AppLayout>
    </AdminAreaGuard>
  ),
});
