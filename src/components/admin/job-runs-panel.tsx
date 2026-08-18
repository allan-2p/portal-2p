import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MinusCircle,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listJobRuns, jobRunsStats, reprocessJobRun, type JobRunRow } from "@/lib/job-runs.functions";

const JOB_LABELS: Record<string, string> = {
  "checkout.finalizar": "Checkout • Finalizar pedido",
  "cron.sap-nfs": "Cron • Notas fiscais (SAP)",
  "cron.pagamento-link": "Cron • Pagamento (boleto Itaú)",
  "webhook.fretefy": "Webhook • Fretefy (rastreio)",
};

const REPROCESSAVEL = new Set(["cron.sap-nfs", "cron.pagamento-link", "webhook.fretefy"]);

const STATUS = [
  { key: "all", label: "Todos" },
  { key: "error", label: "Falhas" },
  { key: "running", label: "Em execução" },
  { key: "ok", label: "Sucesso" },
  { key: "skipped", label: "Ignorados" },
] as const;

type StatusKey = (typeof STATUS)[number]["key"];

function StatusIcon({ status }: { status: JobRunRow["status"] }) {
  if (status === "error") return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  if (status === "running") return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />;
  if (status === "skipped") return <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
  return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />;
}

function Bloco({ titulo, valor }: { titulo: string; valor: unknown }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/40 p-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
        {JSON.stringify(valor ?? {}, null, 2)}
      </pre>
    </div>
  );
}

/** Monitoramento dos gatilhos automáticos, com auditoria e reprocessamento. */
export function JobRunsPanel() {
  const [job, setJob] = useState<string>("all");
  const [status, setStatus] = useState<StatusKey>("all");
  const [search, setSearch] = useState("");
  const [termo, setTermo] = useState("");
  const [limit, setLimit] = useState(10);
  const [aberto, setAberto] = useState<string | null>(null);

  const qc = useQueryClient();
  const listar = useServerFn(listJobRuns);
  const stats = useServerFn(jobRunsStats);
  const reprocessar = useServerFn(reprocessJobRun);

  const saude = useQuery({ queryKey: ["job-runs-stats"], queryFn: () => stats() });
  const runs = useQuery({
    queryKey: ["job-runs", job, status, termo, limit],
    queryFn: () => listar({ data: { job, status, search: termo, limit } }),
  });

  const reprocesso = useMutation({
    mutationFn: (id: string) => reprocessar({ data: { id } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Reprocessado. Nova execução registrada.");
      else toast.error(r.error ?? "Falha ao reprocessar.");
      void qc.invalidateQueries({ queryKey: ["job-runs"] });
      void qc.invalidateQueries({ queryKey: ["job-runs-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = runs.data?.rows ?? [];
  const total = runs.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(saude.data?.stats ?? []).map((s) => (
          <div key={s.job} className="rounded-xl border border-border bg-card p-3">
            <div className="truncate text-xs font-medium">{JOB_LABELS[s.job] ?? s.job}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-2xl font-semibold ${s.erros24h ? "text-destructive" : ""}`}>{s.erros24h}</span>
              <span className="text-[11px] text-muted-foreground">falhas em 24h</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {s.total24h} execuções em 24h • {s.erros7d} falhas em 7 dias
            </div>
            {s.ultimoErro ? (
              <div className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="line-clamp-2">{s.ultimoErro}</span>
              </div>
            ) : null}
          </div>
        ))}
        {!saude.isLoading && (saude.data?.stats ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            Nenhum gatilho executado nos últimos 7 dias.
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={job}
          onChange={(e) => setJob(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Gatilho"
        >
          <option value="all">Todos os gatilhos</option>
          {Object.entries(JOB_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-1">
          {STATUS.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={status === s.key ? "default" : "outline"}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <form
          className="flex min-w-[200px] flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTermo(search.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por referência ou mensagem de erro"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Buscar
          </Button>
        </form>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void runs.refetch();
            void saude.refetch();
          }}
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${runs.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {runs.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Carregando execuções…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nenhuma execução encontrada com estes filtros.</div>
        ) : (
          rows.map((r) => {
            const open = aberto === r.id;
            return (
              <div key={r.id} className="p-3">
                <div className="flex items-start gap-2">
                  <StatusIcon status={r.status} />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setAberto(open ? null : r.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{JOB_LABELS[r.job] ?? r.job}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {r.trigger_source}
                      </span>
                      {r.attempt > 1 ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          tentativa {r.attempt}
                        </span>
                      ) : null}
                      {r.ref_id ? <span className="text-xs text-muted-foreground">ref {r.ref_id}</span> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleString("pt-BR")}
                      {r.duration_ms != null ? ` • ${r.duration_ms} ms` : ""}
                      {r.actor_email ? ` • ${r.actor_email}` : ""}
                    </div>
                    {r.error_message ? (
                      <div className="mt-1 text-xs text-destructive">{r.error_message}</div>
                    ) : null}
                  </button>

                  <div className="flex items-center gap-1">
                    {REPROCESSAVEL.has(r.job) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reprocesso.isPending}
                        onClick={() => reprocesso.mutate(r.id)}
                      >
                        {reprocesso.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        <span className="ml-1 hidden sm:inline">Reprocessar</span>
                      </Button>
                    ) : null}
                    <Button size="icon" variant="ghost" onClick={() => setAberto(open ? null : r.id)}>
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {open ? (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <Bloco titulo="Payload recebido" valor={r.payload} />
                    <Bloco titulo="Resultado" valor={r.result} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {rows.length < total ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => (l === 10 ? 25 : l + 25))}>
            Carregar mais ({rows.length}/{total})
          </Button>
        </div>
      ) : null}
    </div>
  );
}
