import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, ExternalLink, Cloud, Loader2, ArrowLeft, Upload, FileSpreadsheet, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getSalesforceStatus, getSalesforceSample } from "@/lib/salesforce.functions";


export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () => ({ meta: [{ title: "Integrações · Portal 2P" }] }),
  component: IntegracoesPage,
});

function IntegracoesPage() {
  const fetchStatus = useServerFn(getSalesforceStatus);
  const fetchSample = useServerFn(getSalesforceSample);

  const status = useQuery({
    queryKey: ["salesforce", "status"],
    queryFn: () => fetchStatus(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const sample = useMutation({
    mutationFn: () => fetchSample(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao buscar dados"),
    onSuccess: () => toast.success("Dados carregados do Salesforce"),
  });

  const connected = status.data?.connected === true;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecte o Portal 2P a serviços externos. Autorizações são geridas de forma segura pela Lovable.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-6 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-[#00A1E0]/15 flex items-center justify-center shrink-0">
            <Cloud className="h-6 w-6 text-[#00A1E0]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-lg">Salesforce</h2>
              <StatusBadge loading={status.isLoading} connected={connected} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Sincronize contas, oportunidades e casos da sua org Salesforce dentro do Portal.
            </p>

            {status.isLoading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexão…
              </div>
            )}

            {!status.isLoading && connected && (
              <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label="Organização" value={status.data?.orgName ?? "—"} />
                <Field label="Usuário conectado" value={status.data?.username ?? "—"} />
                <Field label="Status" value={status.data?.outcome ?? "verified"} />
                <Field label="Latência" value={status.data?.latencyMs != null ? `${status.data.latencyMs} ms` : "—"} />
              </dl>
            )}

            {!status.isLoading && !connected && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {status.data?.reason ?? "Salesforce não está conectado."}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => status.refetch()}
                disabled={status.isFetching}
              >
                <RefreshCw className={status.isFetching ? "animate-spin" : ""} />
                Testar conexão
              </Button>

              {connected ? (
                <Button
                  size="sm"
                  onClick={() => sample.mutate()}
                  disabled={sample.isPending}
                >
                  {sample.isPending ? <Loader2 className="animate-spin" /> : null}
                  Buscar contas de exemplo
                </Button>
              ) : (
                <a
                  href="https://lovable.dev/projects"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Autorizar Salesforce <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              {connected && (
                <a
                  href="https://lovable.dev/projects"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-surface-2"
                >
                  Gerenciar / Desconectar <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            {sample.data?.records && sample.data.records.length > 0 && (
              <div className="mt-5 rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold bg-surface-2 border-b border-border">
                  Últimas contas ({sample.data.records.length})
                </div>
                <ul className="divide-y divide-border text-sm">
                  {sample.data.records.map((r: any) => (
                    <li key={r.Id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <span className="truncate font-medium">{r.Name}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.Industry ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-border bg-surface/40 text-xs text-muted-foreground">
          A autorização OAuth do Salesforce é feita e revogada pelo painel de conectores da Lovable.
          Ao desconectar por lá, esta página passará a exibir o Salesforce como desconectado.
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium truncate mt-0.5">{value}</div>
    </div>
  );
}

function StatusBadge({ loading, connected }: { loading: boolean; connected: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Verificando
      </span>
    );
  }
  return connected ? (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Conectado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
      <XCircle className="h-3 w-3" /> Desconectado
    </span>
  );
}
