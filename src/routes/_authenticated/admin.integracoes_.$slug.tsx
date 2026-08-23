import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Lock, Plug, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { integrationBySlug } from "@/lib/integrations-catalog";
import { getIntegrationConfig, testIntegration } from "@/lib/integration-config.functions";
import { formatLastSync } from "@/components/integration-status";
import { IntegrationLogsPanel } from "@/components/integration-logs";
import { IntegrationAlertBadge, IntegrationAlertSettingsCard, useIntegrationAlerts } from "@/components/integration-alerts";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { FreteRegrasPanel } from "@/components/frete-regras-panel";
import { IntegracaoPainel } from "@/components/integracao-painel";
import { SalesforceCamposPanel } from "@/components/salesforce-campos-panel";

export const Route = createFileRoute("/_authenticated/admin/integracoes_/$slug")({
  head: () => ({
    meta: [
      { title: "Configuração da integração · Portal 2P" },
      { name: "description", content: "Credenciais e teste de conexão de uma integração do Portal 2P." },
      { property: "og:title", content: "Configuração da integração · Portal 2P" },
      { property: "og:description", content: "Credenciais e teste de conexão de uma integração do Portal 2P." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.integracoes" area="integracoes">
      <IntegracaoConfigPage />
    </AdminRouteGuard>
  ),
});

function IntegracaoConfigPage() {
  const { slug } = useParams({ from: "/_authenticated/admin/integracoes_/$slug" });
  const def = integrationBySlug(slug);

  const { bySlug: alertsBySlug } = useIntegrationAlerts();
  const fetchConfig = useServerFn(getIntegrationConfig);
  const runTest = useServerFn(testIntegration);
  const qc = useQueryClient();

  const config = useQuery({
    queryKey: ["integration", slug, "config"],
    queryFn: () => fetchConfig({ data: { slug } }),
    enabled: Boolean(def),
    refetchOnWindowFocus: false,
  });

  const test = useMutation({
    mutationFn: () => runTest({ data: { slug } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["integration-logs"] });
      if (r.status === "ok") toast.success("Conexão testada com sucesso");
      else if (r.status === "error") toast.error("Falha na conexão");
      else toast.warning("Integração não configurada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao testar conexão"),
  });

  if (!def) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto py-10 text-center space-y-4">
          <h1 className="font-display text-xl font-bold">Integração não encontrada</h1>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/integracoes">Voltar para Integrações</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const alert = alertsBySlug.get(slug);
  const states = new Map((config.data?.credentials ?? []).map((c) => [c.env, c]));
  const result = test.data;

  return (
    <AppLayout>
      <div className={`${slug === "sap" || slug === "salesforce" ? "max-w-6xl" : "max-w-3xl"} mx-auto space-y-6`}>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/integracoes">
            <ArrowLeft className="h-4 w-4 mr-1" /> Integrações
          </Link>
        </Button>

        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Plug className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{def.category}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold">{def.name}</h1>
              <IntegrationAlertBadge alert={alert} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{def.description}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold">Credenciais</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Valores secretos ficam guardados no backend e nunca são exibidos aqui.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => config.refetch()} disabled={config.isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${config.isFetching ? "animate-spin" : ""}`} /> Recarregar
            </Button>
          </div>

          {def.credentials.length === 0 && (
            <p className="text-sm text-muted-foreground">Esta integração não exige credenciais.</p>
          )}

          {def.credentials.map((c) => {
            const s = states.get(c.env);
            const configured = s?.configured ?? false;
            return (
              <div key={c.env} className="space-y-1.5">
                <Label htmlFor={c.env} className="flex items-center gap-2">
                  {c.label}
                  {c.required && <span className="text-destructive">*</span>}
                  {c.secret && <Lock className="h-3 w-3 text-muted-foreground" />}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={c.env}
                    readOnly
                    value={
                      config.isLoading
                        ? "Carregando…"
                        : configured
                          ? c.secret
                            ? `•••••••••••••• (${s?.length ?? 0} caracteres)`
                            : (s?.preview ?? "")
                          : "Não configurado"
                    }
                    className={configured ? "font-mono text-xs" : "font-mono text-xs text-muted-foreground"}
                  />
                  <span
                    className={`text-xs whitespace-nowrap rounded-full px-2 py-1 border ${
                      configured
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {configured ? "Configurado" : "Ausente"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">{c.env}</p>
                {c.help && <p className="text-xs text-muted-foreground">{c.help}</p>}
              </div>
            );
          })}

          {def.credentials.some((c) => c.secret) && (
            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              Para cadastrar ou trocar um valor secreto, peça a alteração no chat do projeto — as chaves são gravadas no
              cofre do backend e não trafegam pelo navegador.
            </p>
          )}
          {def.note && <p className="text-xs text-muted-foreground">{def.note}</p>}
        </section>

        {slug === "fretefy" ? <FreteRegrasPanel /> : null}

        {slug === "salesforce" ? <SalesforceCamposPanel /> : null}

        {slug === "sap" || slug === "salesforce" ? <IntegracaoPainel painel={slug} /> : null}

        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold">Teste de conexão</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Executa uma verificação real contra o serviço.</p>
            </div>
            <Button size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Testar conexão
            </Button>
          </div>

          {result && (
            <div
              className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
                result.status === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                  : result.status === "error"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {result.status === "ok" ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <div>
                <div>{result.detail}</div>
                <div className="text-xs opacity-80 mt-1">
                  Verificado em {new Date(result.checkedAt).toLocaleString("pt-BR")}
                  {result.lastSync ? ` · Última sincronização: ${formatLastSync(result.lastSync)}` : ""}
                </div>
              </div>
            </div>
          )}

          {def.docsUrl && (
            <a
              href={def.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
            >
              Documentação <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </section>

        {alert && (
          <div
            role="alert"
            className={
              alert.level === "error"
                ? "rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
                : alert.level === "stale"
                  ? "rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400"
                  : "rounded-2xl border border-border bg-surface-2 p-4 text-sm text-muted-foreground"
            }
          >
            {alert.message}
          </div>
        )}

        <IntegrationAlertSettingsCard slug={slug} />

        <IntegrationLogsPanel slug={slug} />
      </div>
    </AppLayout>
  );
}
