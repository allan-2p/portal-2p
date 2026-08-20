import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { SapSyncMonitor } from "@/components/admin/sap-sync-monitor";

export const Route = createFileRoute("/_authenticated/admin/logs/sap")({
  head: () => ({
    meta: [
      { title: "Monitor de Sync SAP | Portal 2P" },
      {
        name: "description",
        content:
          "Acompanhe o status da sincronização de clientes com o SAP, veja mensagens de erro e reenvie cadastros.",
      },
      { property: "og:title", content: "Monitor de Sync SAP | Portal 2P" },
      {
        property: "og:description",
        content: "Status, erros e reenvio da sincronização de clientes com o SAP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MonitorSapPage,
});

function MonitorSapPage() {
  return (
    <AdminRouteGuard feature="admin.logs.sap" area="logs">
      <AppLayout>
        <div className="mx-auto max-w-7xl space-y-5">
          <header>
            <h1 className="text-2xl font-bold">Monitor de Sync SAP</h1>
            <p className="text-sm text-muted-foreground">
              Status da sincronização de cada cliente com o SAP, mensagens de erro e reenvio
              individual ou em lote.
            </p>
          </header>
          <SapSyncMonitor />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  );
}
