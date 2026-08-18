import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listIntegrationLogs, type IntegrationLogRow } from "@/lib/integration-logs.functions";

const LEVELS = [
  { key: "all", label: "Todos" },
  { key: "error", label: "Erros" },
  { key: "warn", label: "Avisos" },
  { key: "info", label: "Info" },
] as const;

type Level = (typeof LEVELS)[number]["key"];

function LevelIcon({ level }: { level: IntegrationLogRow["level"] }) {
  if (level === "error") return <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />;
  if (level === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
}

/** Bloco de auditoria: payload enviado e resposta recebida da integração. */
function LogDetail({ detail }: { detail: Record<string, unknown> }) {
  const { payload, resposta, ...contexto } = detail;
  const blocos: Array<[string, unknown]> = [];
  if (Object.keys(contexto).length > 0) blocos.push(["Contexto", contexto]);
  if (payload !== undefined) blocos.push(["Payload enviado", payload]);
  if (resposta !== undefined) blocos.push(["Resposta recebida", resposta]);

  return (
    <div className="mt-2 grid gap-2 md:grid-cols-3">
      {blocos.map(([titulo, valor]) => (
        <div key={titulo} className="rounded-lg border border-border bg-muted/40 p-2 min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{titulo}</div>
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-56 overflow-auto">
            {JSON.stringify(valor, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

/**
 * Histórico de sincronizações e erros. Sem slug, mostra todas as integrações.
 * `clienteId` restringe a auditoria às tentativas/respostas de um cliente.
 */
export function IntegrationLogsPanel({
  slug,
  clienteId,
  title = "Histórico de sincronizações e erros",
}: {
  slug?: string;
  clienteId?: string;
  title?: string;
}) {
  const [level, setLevel] = useState<Level>("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState<Record<string, boolean>>({});

  const fetchLogs = useServerFn(listIntegrationLogs);
  const q = useQuery({
    queryKey: ["integration-logs", slug ?? "all", clienteId ?? "", level, termo, pageSize, page],
    queryFn: () =>
      fetchLogs({ data: { slug, clienteId, level, search: termo, limit: pageSize, offset: page * pageSize } }),
    refetchOnWindowFocus: false,
  });


  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} registro{total === 1 ? "" : "s"} · atualizações, testes de conexão e falhas.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => {
                  setLevel(l.key);
                  setPage(0);
                }}
                className={`px-3 py-1.5 text-xs ${level === l.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Atualizar
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
        </div>
      ) : q.error ? (
        <div className="p-6 text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "Erro ao carregar histórico."}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
          <Info className="h-4 w-4" /> Nenhum registro ainda. Execute um teste de conexão ou uma sincronização.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="px-6 py-3 flex items-start gap-3">
              <LevelIcon level={r.level} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                  {!slug && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                      {r.slug}
                    </span>
                  )}
                  <span className="capitalize">{r.event}</span>
                  {r.duration_ms != null && (
                    <span className="text-[11px] text-muted-foreground">{r.duration_ms} ms</span>
                  )}
                </div>
                {r.message && <div className="text-xs text-muted-foreground mt-0.5 break-words">{r.message}</div>}
                <div className="text-[11px] text-muted-foreground mt-1">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                  {r.actor_email ? ` · ${r.actor_email}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 flex-wrap text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          Por página:
          {[10, 25, 50].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setPageSize(n);
                setPage(0);
              }}
              className={`px-2 py-1 rounded border ${pageSize === n ? "border-primary text-primary" : "border-border"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span>
            {page + 1} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      </div>
    </section>
  );
}
