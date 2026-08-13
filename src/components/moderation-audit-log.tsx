import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Info, Loader2, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listModerationAudit, type ModerationAuditRow } from "@/lib/moderation-audit.functions";
import { moderationAreaLabel } from "@/lib/moderation-audit";

function DetailsLine({ details }: { details: ModerationAuditRow["details"] }) {
  if (!details) return null;
  const pairs = Object.entries(details).filter(([, v]) => v !== null && v !== "");
  if (pairs.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground mt-0.5 break-words">
      {pairs.map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
    </div>
  );
}

/**
 * Log de auditoria das moderações: quem alterou o quê e quando.
 * Sem `area`, mostra todas as áreas moderadas.
 */
export function ModerationAuditLog({
  area,
  title = "Log de auditoria",
  description = "Todas as alterações feitas nesta moderação, com autor e data.",
}: {
  area?: string;
  title?: string;
  description?: string;
}) {
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  const fetchLogs = useServerFn(listModerationAudit);
  const q = useQuery({
    queryKey: ["moderation-audit", area ?? "all", pageSize, page],
    queryFn: () => fetchLogs({ data: { area, limit: pageSize, offset: page * pageSize } }),
    refetchOnWindowFocus: false,
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" /> {title}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} registro{total === 1 ? "" : "s"} · {description}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Atualizar
        </Button>
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
          <Info className="h-4 w-4" /> Nenhuma alteração registrada ainda.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="px-6 py-3">
              <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                {!area && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                    {moderationAreaLabel(r.area)}
                  </span>
                )}
                <span>{r.summary}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                  {r.action}
                </span>
              </div>
              {r.target && <div className="text-xs text-muted-foreground mt-0.5">Alvo: {r.target}</div>}
              <DetailsLine details={r.details} />
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <User className="h-3 w-3" />
                {r.actor_name ?? r.actor_email ?? "—"}
                {r.actor_name && r.actor_email ? ` (${r.actor_email})` : ""} ·{" "}
                {new Date(r.created_at).toLocaleString("pt-BR")}
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
