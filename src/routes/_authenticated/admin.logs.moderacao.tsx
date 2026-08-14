import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ExportLogsButton } from "@/components/admin/export-logs-button";
import { ModerationAuditLog } from "@/components/moderation-audit-log";

export const Route = createFileRoute("/_authenticated/admin/logs/moderacao")({
  head: () => ({
    meta: [
      { title: "Log de Moderação | Portal 2P" },
      {
        name: "description",
        content: "Auditoria das alterações feitas nas telas de moderação do Portal 2P.",
      },
      { property: "og:title", content: "Log de Moderação | Portal 2P" },
      {
        property: "og:description",
        content: "Quem alterou produtos, regras, comissões e metas — com autor e data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.logs.moderacao">
      <AppLayout>
        <div className="mx-auto max-w-6xl space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
            <h1 className="text-2xl font-bold">Log de Moderação</h1>
            <p className="text-sm text-muted-foreground">
              Todas as alterações feitas nas moderações do Grupo 2P, com autor e data.
            </p>
            </div>
            <ExportLogsButton source="moderacao" />
          </header>
          <ModerationAuditLog
            title="Log de auditoria"
            description="alterações em produtos, regras, comissões, metas e tabelas de todas as unidades."
          />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
