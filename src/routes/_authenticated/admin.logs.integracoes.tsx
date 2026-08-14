import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { IntegrationLogsPanel } from "@/components/integration-logs";

export const Route = createFileRoute("/_authenticated/admin/logs/integracoes")({
  head: () => ({
    meta: [
      { title: "Log de Integrações | Portal 2P" },
      {
        name: "description",
        content: "Histórico de sincronizações, avisos e erros das integrações do Portal 2P.",
      },
      { property: "og:title", content: "Log de Integrações | Portal 2P" },
      {
        property: "og:description",
        content: "Sincronizações, avisos e erros de todas as integrações do portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.logs.integracoes">
      <AppLayout>
        <div className="mx-auto max-w-6xl space-y-5">
          <header>
            <h1 className="text-2xl font-bold">Log de Integrações</h1>
            <p className="text-sm text-muted-foreground">
              Histórico completo de sincronizações e erros de todas as integrações.
            </p>
          </header>
          <IntegrationLogsPanel title="Histórico geral de sincronizações e erros" />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
