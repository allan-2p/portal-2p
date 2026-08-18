import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { JobRunsPanel } from "@/components/admin/job-runs-panel";
import { PixSimuladorPanel } from "@/components/admin/pix-simulador-panel";

export const Route = createFileRoute("/_authenticated/admin/logs/gatilhos")({
  head: () => ({
    meta: [
      { title: "Gatilhos automáticos | Portal 2P" },
      {
        name: "description",
        content:
          "Monitore as execuções de checkout, crons do SAP, pagamento e webhook da Fretefy, e reprocesse falhas.",
      },
      { property: "og:title", content: "Gatilhos automáticos | Portal 2P" },
      {
        property: "og:description",
        content: "Auditoria e reprocessamento dos gatilhos automáticos do Portal 2P.",
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
            <h1 className="text-2xl font-bold">Gatilhos e reprocessamento</h1>
            <p className="text-sm text-muted-foreground">
              Cada execução do checkout, dos crons do SAP e do pagamento, e do webhook da Fretefy fica
              registrada aqui com payload, resultado e erro — e pode ser reprocessada.
            </p>
          </header>
          <JobRunsPanel />
          <PixSimuladorPanel />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
