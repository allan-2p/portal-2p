import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  MinusCircle,
  PackageSearch,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { JobRunRow } from "@/lib/job-runs.functions";
import {
  backfillDocumentosFretefy,
  fretefyResumo,
  listarEventosFretefy,
  pendenciasFretefy,
  reprocessarCargaFretefy,
} from "@/lib/fretefy-monitor.functions";

const JOB_LABELS: Record<string, string> = {
  "webhook.fretefy": "Webhook • Rastreio",
  "fretefy.oferta-carga": "Oferta de carga / NF",
};

const STATUS = [
  { key: "all", label: "Todos" },
  { key: "error", label: "Falhas" },
  { key: "skipped", label: "Ignorados" },
  { key: "ok", label: "Sucesso" },
] as const;

type StatusKey = (typeof STATUS)[number]["key"];

function StatusIcon({ status }: { status: JobRunRow["status"] }) {
  if (status === "error") return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  if (status === "running")
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />;
  if (status === "skipped") return <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
  return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />;
}

function dataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function cargaDoRun(r: JobRunRow): string | null {
  const alvo = { ...(r.payload ?? {}), ...(r.result ?? {}) } as Record<string, unknown>;
  for (const k of ["carga_id", "CargaId", "cargaId", "IdCarga"]) {
    const v = alvo[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (r.ref_type === "carga" && r.ref_id) return r.ref_id;
  return null;
}

/** Monitoramento dedicado dos webhooks da Fretefy, com reprocessamento por carga. */
export function FretefyMonitorPanel() {
  const [job, setJob] = useState<string>("all");
  const [status, setStatus] = useState<StatusKey>("all");
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [carga, setCarga] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const qc = useQueryClient();
  const resumoFn = useServerFn(fretefyResumo);
  const listarFn = useServerFn(listarEventosFretefy);
  const pendenciasFn = useServerFn(pendenciasFretefy);
  const reprocessarFn = useServerFn(reprocessarCargaFretefy);
  const backfillFn = useServerFn(backfillDocumentosFretefy);

  const resumo = useQuery({ queryKey: ["fretefy-resumo"], queryFn: () => resumoFn() });
  const eventos = useQuery({
    queryKey: ["fretefy-eventos", job, status, termo],
    queryFn: () => listarFn({ data: { job, status, search: termo, limit: 30 } }),
  });
  const pendentes = useQuery({ queryKey: ["fretefy-pendencias"], queryFn: () => pendenciasFn() });

  const reprocesso = useMutation({
    mutationFn: (cargaId: string) => reprocessarFn({ data: { cargaId } }),
    onSuccess: (r) => {
      if (r.ok) {
        const motivo = (r.resultado as Record<string, unknown>)?.["motivo"];
        toast.success(typeof motivo === "string" ? motivo : "Carga reprocessada.");
      } else {
        toast.error(r.error ?? "Falha ao reprocessar a carga.");
      }
      void qc.invalidateQueries({ queryKey: ["fretefy-eventos"] });
      void qc.invalidateQueries({ queryKey: ["fretefy-resumo"] });
      void qc.invalidateQueries({ queryKey: ["fretefy-pendencias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const backfill = useMutation({
    mutationFn: () => backfillFn({ data: { limite: 50 } }),
    onSuccess: (r) => {
      if (r.ok) {
        const res = (r.resultado ?? {}) as Record<string, unknown>;
        const enviados = Number(res["enviados"] ?? res["atualizados"] ?? 0);
        const analisados = Number(res["analisados"] ?? res["total"] ?? 0);
        toast.success(
          enviados > 0
            ? `${enviados} documento(s) reenviado(s) à Fretefy.`
            : analisados > 0
              ? "Nenhum documento pendente para reenviar."
              : "Reenvio concluído.",
        );
      } else {
        toast.error(r.error ?? "Falha no reenvio de documentos.");
      }
      void qc.invalidateQueries({ queryKey: ["fretefy-eventos"] });
      void qc.invalidateQueries({ queryKey: ["fretefy-resumo"] });
      void qc.invalidateQueries({ queryKey: ["fretefy-pendencias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = eventos.data?.rows ?? [];
  const lista = pendentes.data?.pendencias ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(resumo.data?.stats ?? []).map((s) => (
          <div key={s.job} className="rounded-xl border border-border bg-card p-3">
            <div className="truncate text-xs font-medium">{JOB_LABELS[s.job] ?? s.job}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-2xl font-semibold ${s.falha24h > 0 ? "text-destructive" : ""}`}>
                {s.falha24h.toLocaleString("pt-BR")}%
              </span>
              <span className="text-[11px] text-muted-foreground">de falha em 24h</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {s.total24h} chamadas em 24h ({s.erros24h} com erro) • 7 dias: {s.total7d} chamadas,{" "}
              {s.falha7d.toLocaleString("pt-BR")}% de falha
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">Última: {dataHora(s.ultimo)}</div>
            {s.ultimoErro ? (
              <div className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="line-clamp-2">{s.ultimoErro}</span>
              </div>
            ) : null}
          </div>
        ))}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs font-medium">Cargas sem baixa de entrega</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-2xl font-semibold ${lista.length ? "text-amber-600" : ""}`}>
              {pendentes.isLoading ? "…" : lista.length}
            </span>
            <span className="text-[11px] text-muted-foreground">pedidos aguardando</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Pedidos com carga criada na Fretefy e ainda sem data de entrega.
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <PackageSearch className="h-4 w-4" /> Reprocessar rastreio por CargaId
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = carga.trim();
            if (!v) return toast.error("Informe o CargaId da Fretefy.");
            reprocesso.mutate(v);
          }}
        >
          <Input
            value={carga}
            onChange={(e) => setCarga(e.target.value)}
            placeholder="CargaId (GUID enviado pela Fretefy)"
            className="min-w-[280px] flex-1"
          />
          <Button type="submit" disabled={reprocesso.isPending}>
            {reprocesso.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Reprocessar
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Roda o mesmo motor do webhook: encontra o pedido pela carga, reconsulta a entrega na Fretefy e,
          havendo data, dá a baixa. A execução fica registrada aqui e nos gatilhos.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div className="text-sm font-medium">Pendências de entrega</div>
          <Button variant="outline" size="sm" onClick={() => void pendentes.refetch()}>
            <RefreshCw className={`mr-1 h-4 w-4 ${pendentes.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
        <div className="divide-y divide-border">
          {pendentes.isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Carregando pedidos…</div>
          ) : lista.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">Nenhuma carga aguardando baixa de entrega.</div>
          ) : (
            lista.map((p) => {
              const dias = diasDesde(p.desde);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {p.numero ?? "—"} · {p.cliente ?? "Cliente não informado"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.status ?? "—"}
                      {p.nf ? ` • NF ${p.nf}` : ""}
                      {dias !== null ? ` • há ${dias} dia(s)` : ""}
                      {p.cargaId ? ` • carga ${p.cargaId}` : ""}
                    </div>
                  </div>
                  {p.cargaId ? (
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard?.writeText(p.cargaId ?? "");
                          setCarga(p.cargaId ?? "");
                          toast.success("CargaId copiado.");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        disabled={reprocesso.isPending}
                        onClick={() => reprocesso.mutate(p.cargaId as string)}
                      >
                        Reprocessar
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={job}
            onChange={(e) => setJob(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Gatilho da Fretefy"
          >
            <option value="all">Todos os gatilhos Fretefy</option>
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
            className="flex min-w-[220px] flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setTermo(busca.trim());
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por CargaId, pedido ou erro"
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
              void eventos.refetch();
              void resumo.refetch();
            }}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${eventos.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {eventos.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando chamadas…</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhuma chamada com estes filtros.</div>
          ) : (
            rows.map((r) => {
              const open = aberto === r.id;
              const cargaId = cargaDoRun(r);
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
                        <span className="text-[11px] text-muted-foreground">{dataHora(r.started_at)}</span>
                        {r.duration_ms != null ? (
                          <span className="text-[11px] text-muted-foreground">{r.duration_ms} ms</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {cargaId ? `carga ${cargaId}` : r.ref_id ? `ref ${r.ref_id}` : "sem referência"}
                        {r.error_message ? ` • ${r.error_message}` : ""}
                      </div>
                    </button>
                    {cargaId ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reprocesso.isPending}
                        onClick={() => reprocesso.mutate(cargaId)}
                      >
                        Reprocessar
                      </Button>
                    ) : null}
                  </div>

                  {open ? (
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div className="min-w-0 rounded-lg border border-border bg-muted/40 p-2">
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Payload recebido
                        </div>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                          {JSON.stringify(r.payload ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div className="min-w-0 rounded-lg border border-border bg-muted/40 p-2">
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Resultado
                        </div>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                          {JSON.stringify(r.result ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
