import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminAreaGuard } from "@/components/admin/admin-area-guard";
import { AdminSectionHome, AdminSectionNotice } from "@/components/admin/admin-section-home";
import { useNewFeatures } from "@/hooks/use-new-features";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | Portal 2P" },
      {
        name: "description",
        content: "Visão geral das configurações do Grupo 2P: usuários, perfis, objetos e tabelas.",
      },
      { property: "og:title", content: "Configurações | Portal 2P" },
      {
        property: "og:description",
        content: "Atalhos e pendências das configurações administrativas do Portal 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfiguracoesHome,
});

function ConfiguracoesHome() {
  const { newFeatures, markSeen } = useNewFeatures();
  return (
    <AdminAreaGuard area="configuracoes">
      <AppLayout>
        <AdminSectionHome sectionId="configuracoes">
          <AdminSectionNotice
            title="Sugestões"
            dismissKey="configuracoes"
            onDismiss={(ids) => {
              if (ids.includes("novas-telas")) markSeen();
            }}
            items={[
              ...(newFeatures.length
                ? [
                    {
                      id: "novas-telas",
                      label: `${newFeatures.length} tela(s) nova(s) bloqueada(s) por padrão`,
                      hint: "libere em Perfis para quem precisa",
                      to: "/admin/perfis",
                    },
                  ]
                : []),
              { id: "perfis", label: "Revise os perfis de acesso", hint: "quem vê o quê", to: "/admin/perfis" },
              {
                id: "vinculos",
                label: "Confira vínculos do Salesforce",
                hint: "usuários sem sf_user_id",
                to: "/admin/vinculos",
              },
            ]}
          />
        </AdminSectionHome>
      </AppLayout>
    </AdminAreaGuard>
  );
}
