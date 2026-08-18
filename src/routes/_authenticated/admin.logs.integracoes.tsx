import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ExportLogsButton } from "@/components/admin/export-logs-button";
import { IntegrationLogsPanel } from "@/components/integration-logs";
import { ClientesIntegracaoStatus } from "@/components/admin/clientes-integracao-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/logs/integracoes")({
  validateSearch: (search: Record<string, unknown>) => ({
    cliente: typeof search["cliente"] === "string" ? (search["cliente"] as string) : undefined,
  }),

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
  component: LogIntegracoesPage,
});

function LogIntegracoesPage() {
  const { cliente } = Route.useSearch();
  return (
    <AdminRouteGuard feature="admin.logs.integracoes" area="logs">
      <AppLayout>
        <div className="mx-auto max-w-7xl space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Log de Integrações</h1>
              <p className="text-sm text-muted-foreground">
                {cliente
                  ? "Auditoria das integrações deste cliente: tentativas, payloads e respostas."
                  : "Histórico completo de sincronizações e erros de todas as integrações."}
              </p>
            </div>
            <ExportLogsButton source="integracoes" />
          </header>
          <Tabs defaultValue={cliente ? "logs" : "cadastros"}>
            <TabsList>
              <TabsTrigger value="cadastros">Status por cliente</TabsTrigger>
              <TabsTrigger value="logs">Histórico de logs</TabsTrigger>
            </TabsList>
            <TabsContent value="cadastros" className="mt-4">
              <ClientesIntegracaoStatus />
            </TabsContent>
            <TabsContent value="logs" className="mt-4">
              <IntegrationLogsPanel
                clienteId={cliente}
                title={
                  cliente ? "Auditoria do cliente" : "Histórico geral de sincronizações e erros"
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </AppLayout>
    </AdminRouteGuard>
  );
}

