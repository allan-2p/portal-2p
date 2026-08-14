import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminListUserActivity } from "@/lib/activity.functions";
// Recharts é pesado: o painel só é baixado quando a tela realmente renderiza os gráficos.
const ActivityDashboard = lazy(() =>
  import("@/components/activity-dashboard").then((m) => ({ default: m.ActivityDashboard })),
);
import { SecurityAlerts } from "@/components/security-alerts";
import { Loader2, Activity, LogIn, LogOut, RefreshCw, Search, ShieldAlert, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ExportLogsButton } from "@/components/admin/export-logs-button";

export const Route = createFileRoute("/_authenticated/admin/atividade")({
  head: () => ({
    meta: [
      { title: "Log de Usuários | Portal 2P" },
      {
        name: "description",
        content: "Histórico de logins, logouts e atividade dos usuários do Portal 2P.",
      },
      { property: "og:title", content: "Log de Usuários | Portal 2P" },
      {
        property: "og:description",
        content: "Histórico de logins e atividade dos usuários do portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.atividade" area="logs">
      <AtividadePage />
    </AdminRouteGuard>
  ),
});

const EVENT_LABEL: Record<string, string> = {
  login: "Entrou",
  logout: "Saiu",
  page_view: "Acesso",
  login_failed: "Falha no login",
  integration: "Integração",
  sensitive_action: "Ação sensível",
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

function AtividadePage() {
  const list = useServerFn(adminListUserActivity);
  const [event, setEvent] = useState<"all" | "login" | "logout" | "page_view">("all");
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-user-activity", event, days],
    queryFn: () => list({ data: { event, days, limit: 300 } }),
    staleTime: 30_000,
  });

  const term = q.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter(
    (r) => !term || (r.email ?? "").toLowerCase().includes(term),
  );
  const summary = (data?.summary ?? []).filter(
    (s) =>
      !term ||
      (s.email ?? "").toLowerCase().includes(term) ||
      (s.full_name ?? "").toLowerCase().includes(term),
  );

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" /> Log de Usuários
            </h1>
            <p className="text-sm text-muted-foreground">
              Entradas, saídas e frequência de uso do portal.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar usuário…"
                className="pl-8 w-56"
              />
            </div>
            <Select value={event} onValueChange={(v) => setEvent(v as typeof event)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos eventos</SelectItem>
                <SelectItem value="login">Somente entradas</SelectItem>
                <SelectItem value="logout">Somente saídas</SelectItem>
                <SelectItem value="login_failed">Falhas de login</SelectItem>
                <SelectItem value="integration">Integrações (Atlas)</SelectItem>
                <SelectItem value="sensitive_action">Ações sensíveis</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
                <SelectItem value="365">12 meses</SelectItem>
              </SelectContent>
            </Select>
            <ExportLogsButton source="atividade" days={Number(days) || 30} />
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </header>

        <SecurityAlerts />

        <Suspense fallback={<div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
          <ActivityDashboard days={days} />
        </Suspense>

        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
            {/* Resumo por usuário */}
            <div className="glass rounded-xl overflow-hidden self-start">
              <div className="px-4 py-3 border-b border-border/60 font-semibold text-sm">
                Resumo por usuário
              </div>
              {summary.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  Nenhuma atividade no período.
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {summary.map((s) => (
                    <li key={s.user_id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {s.full_name ?? s.email ?? s.user_id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          Último acesso: {fmt(s.last_login ?? s.last_event)}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        {s.logins} login{s.logins === 1 ? "" : "s"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Eventos */}
            <div className="glass rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 font-semibold text-sm">
                Eventos recentes{" "}
                <span className="font-normal text-muted-foreground text-xs">
                  ({rows.length})
                </span>
              </div>
              {rows.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  Nenhum registro encontrado.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Quando</th>
                        <th className="text-left px-4 py-2 font-medium">Usuário</th>
                        <th className="text-left px-4 py-2 font-medium">Evento</th>
                        <th className="text-left px-4 py-2 font-medium">Origem</th>
                        <th className="text-left px-4 py-2 font-medium">Dispositivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b border-border/40 last:border-0">
                          <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                            {fmt(r.created_at)}
                          </td>
                          <td className="px-4 py-2 truncate max-w-[220px]">{r.email ?? "—"}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px] gap-1",
                                r.event === "login"
                                  ? "border-primary/40 text-primary"
                                  : r.event === "login_failed"
                                    ? "border-destructive/40 text-destructive"
                                    : r.event === "integration"
                                      ? "border-amber-500/40 text-amber-500"
                                      : "border-muted-foreground/30 text-muted-foreground",
                              )}
                            >
                              {r.event === "login" ? (
                                <LogIn className="h-3 w-3" />
                              ) : r.event === "login_failed" ? (
                                <ShieldAlert className="h-3 w-3" />
                              ) : r.event === "integration" ? (
                                <Plug className="h-3 w-3" />
                              ) : (
                                <LogOut className="h-3 w-3" />
                              )}
                              {EVENT_LABEL[r.event] ?? r.event}
                              {r.detail ? ` • ${r.detail}` : ""}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                            {r.ip ?? "—"}
                          </td>
                          <td className="px-4 py-2 truncate max-w-[280px] text-muted-foreground">
                            {r.user_agent ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
