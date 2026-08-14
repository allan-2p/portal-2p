import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { LogRetention } from "@/components/log-retention";

export const Route = createFileRoute("/_authenticated/admin/logs/retencao")({
  head: () => ({
    meta: [
      { title: "Retenção de Logs | Portal 2P" },
      {
        name: "description",
        content: "Política de retenção, arquivamento e limpeza dos logs do Portal 2P.",
      },
      { property: "og:title", content: "Retenção de Logs | Portal 2P" },
      {
        property: "og:description",
        content: "Defina por quanto tempo os logs ficam ativos e quando são arquivados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.logs.retencao">
      <AppLayout>
        <div className="mx-auto max-w-4xl space-y-5">
          <header>
            <h1 className="text-2xl font-bold">Retenção e limpeza de logs</h1>
            <p className="text-sm text-muted-foreground">
              Por quanto tempo os registros ficam ativos antes de serem arquivados ou removidos.
            </p>
          </header>
          <LogRetention />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
