import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, CheckCircle2, XCircle, Loader2, Clock, Server } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSyncStatus, requestSync, type SyncRun } from "@/lib/sync.functions";

const JOBS: { job: string; instanceId: string; label: string }[] = [
  { job: "salesforce_accounts", instanceId: "solar", label: "Contas Salesforce · Solar" },
  { job: "salesforce_accounts", instanceId: "carregadores", label: "Contas Salesforce · Carregadores" },
];

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function duration(run: SyncRun) {
  if (!run.finished_at) return null;
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function SyncPanel() {
  const fetchStatus = useServerFn(getSyncStatus);
  const enqueue = useServerFn(requestSync);
  const qc = useQueryClient();

  const status = useQuery({
    queryKey: ["sync", "status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const ask = useMutation({
    mutationFn: (v: { job: string; instanceId: string }) => enqueue({ data: v }),
    onSuccess: () => {
      toast.success("Sincronização solicitada — o worker vai executar em instantes.");
      qc.invalidateQueries({ queryKey: ["sync", "status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao solicitar sincronização"),
  });

  const runs = status.data?.runs ?? [];
  const queue = status.data?.queue ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg">Sincronização em background</h2>
            <p className="text-sm text-muted-foreground mt-1">
              O worker externo atualiza as bases espelho que o portal consulta. As telas leem sempre do
              banco — nunca do Salesforce em tempo real.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {JOBS.map((j) => {
            const last = runs.find((r) => r.job === j.job && r.instance_id === j.instanceId);
            const pending = queue.some((q) => q.job === j.job && q.instance_id === j.instanceId);
            const ok = last?.status === "success";
            return (
              <div key={`${j.job}-${j.instanceId}`} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{j.label}</span>
                  {last?.status === "running" || pending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                  ) : ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : last ? (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  <div>Última: {fmt(last?.finished_at ?? last?.started_at ?? null)}</div>
                  {last && (
                    <div>
                      {last.rows_written} registros
                      {duration(last) ? ` · ${duration(last)}` : ""}
                    </div>
                  )}
                  {last?.error && <div className="text-destructive break-words">{last.error}</div>}
                  {!last && <div>Nenhuma execução registrada ainda.</div>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={pending || ask.isPending}
                  onClick={() => ask.mutate({ job: j.job, instanceId: j.instanceId })}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {pending ? "Na fila…" : "Sincronizar agora"}
                </Button>
              </div>
            );
          })}
        </div>

        {runs.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium mb-2">Histórico recente</h3>
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {runs.slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <span
                    className={
                      r.status === "success"
                        ? "text-emerald-500"
                        : r.status === "running"
                          ? "text-muted-foreground"
                          : "text-destructive"
                    }
                  >
                    ●
                  </span>
                  <span className="font-medium truncate">{r.job}</span>
                  <span className="text-muted-foreground">{r.instance_id}</span>
                  <span className="ml-auto text-muted-foreground shrink-0">{fmt(r.started_at)}</span>
                  <span className="text-muted-foreground shrink-0 w-20 text-right">
                    {r.rows_written} regs
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
