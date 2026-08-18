import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listIntegrationLogs, type IntegrationLogRow } from "@/lib/integration-logs.functions";

const NIVEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  info: { label: "OK", variant: "secondary" },
  warn: { label: "Atenção", variant: "outline" },
  error: { label: "Erro", variant: "destructive" },
};

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function valor(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/**
 * Auditoria por cliente: cada atualização de cadastro e cada tentativa de
 * integração (SAP / Salesforce), com campos alterados, payloads e erros.
 * Renderize apenas para o Administrador do Sistema.
 */
export function ClienteIntegracaoHistorico({ clienteId }: { clienteId: string }) {
  const listar = useServerFn(listIntegrationLogs);
  const [limit, setLimit] = useState(10);
  const [aberto, setAberto] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cliente-integracao-historico", clienteId, limit],
    queryFn: () => listar({ data: { clienteId, limit } }),
  });

  const rows = (data?.rows ?? []) as IntegrationLogRow[];
  const total = data?.total ?? 0;

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
          <History className="h-3.5 w-3.5" /> Histórico de atualizações e integrações
        </div>
        <Badge variant="outline" className="text-[10px]">Somente administrador</Badge>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">Nenhum registro de alteração ou integração para este cliente.</p>
      )}

      <ul className="space-y-1.5">
        {rows.map((r) => {
          const nivel = NIVEL[r.level] ?? NIVEL["info"]!;
          const alteracoes = (r.detail as any)?.alteracoes as Array<{ campo: string; de: unknown; para: unknown }> | undefined;
          const expandido = aberto === r.id;
          return (
            <li key={r.id} className="rounded-lg border border-border/70 bg-background/60 p-2">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() => setAberto(expandido ? null : r.id)}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={nivel.variant} className="text-[10px]">{nivel.label}</Badge>
                    <span className="text-xs font-semibold break-all">{r.event}</span>
                    <span className="text-[11px] text-muted-foreground">{r.slug}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {dataHora(r.created_at)}
                    {r.actor_email ? ` · ${r.actor_email}` : ""}
                  </div>
                  {r.message && <p className="text-xs break-words">{r.message}</p>}
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expandido ? "rotate-180" : ""}`} />
              </button>

              {expandido && (
                <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                  {alteracoes && alteracoes.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Campos alterados
                      </div>
                      {alteracoes.map((a, i) => (
                        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs">
                          <span className="font-medium break-all">{a.campo}</span>
                          <span className="text-right break-all">
                            <span className="text-muted-foreground line-through">{valor(a.de)}</span>
                            {" → "}
                            <span className="font-semibold">{valor(a.para)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed">
                    {JSON.stringify(r.detail ?? {}, null, 2)}
                  </pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {rows.length < total && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setLimit((n) => n + 25)}>
          Carregar mais ({rows.length}/{total})
        </Button>
      )}
    </div>
  );
}
