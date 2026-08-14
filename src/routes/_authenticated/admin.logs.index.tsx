import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminAreaGuard } from "@/components/admin/admin-area-guard";
import { AdminSectionHome, AdminSectionNotice } from "@/components/admin/admin-section-home";

export const Route = createFileRoute("/_authenticated/admin/logs/")({
  head: () => ({
    meta: [
      { title: "Logs | Portal 2P" },
      {
        name: "description",
        content: "Visão geral dos logs do Portal 2P: usuários, integrações, moderação e retenção.",
      },
      { property: "og:title", content: "Logs | Portal 2P" },
      {
        property: "og:description",
        content: "Atalhos para os registros de auditoria e políticas de retenção do Portal 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminAreaGuard area="logs">
      <AppLayout>
        <AdminSectionHome sectionId="logs">
          <AdminSectionNotice
            title="Sugestões"
            items={[
              { label: "Acompanhe logins e falhas de acesso", to: "/admin/atividade" },
              { label: "Verifique integrações com erro recente", to: "/admin/logs/integracoes" },
              { label: "Confira a política de retenção", hint: "limpeza automática", to: "/admin/logs/retencao" },
            ]}
          />
        </AdminSectionHome>
      </AppLayout>
    </AdminAreaGuard>
  ),
});
