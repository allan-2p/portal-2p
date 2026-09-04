import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { FretefyMonitorPanel } from "@/components/admin/fretefy-monitor-panel";

export const Route = createFileRoute("/_authenticated/admin/logs/fretefy")({
  head: () => ({
    meta: [
      { title: "Monitor da Fretefy | Portal 2P" },
      {
        name: "description",
        content:
          "Chamadas do webhook de rastreio da Fretefy, taxa de falha, cargas sem baixa de entrega e reprocessamento por CargaId.",
      },
      { property: "og:title", content: "Monitor da Fretefy | Portal 2P" },
      {
        property: "og:description",
        content: "Saúde dos webhooks da Fretefy e reprocessamento manual das cargas no Portal 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.logs.jobs" area="logs">
      <AppLayout>
        <div className="mx-auto max-w-6xl space-y-5">
          <header>
            <h1 className="text-2xl font-bold">Monitor da Fretefy</h1>
            <p className="text-sm text-muted-foreground">
              Cada chamada do webhook de rastreio e cada oferta de carga fica registrada aqui, com taxa de
              falha, payload, resultado e reprocessamento por CargaId.
            </p>
          </header>
          <FretefyMonitorPanel />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
