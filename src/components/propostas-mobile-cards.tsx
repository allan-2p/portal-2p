import { Link } from "@tanstack/react-router";
import { Copy, Eye, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/proposta-status-ui";
import { formatPropostaNumero, formatSapNumero } from "@/lib/sap-numero";
import { bloqueiaReenvioSap } from "@/lib/proposta-legado";
import { fmtBRL } from "@/lib/carregadores";
import { cn } from "@/lib/utils";

/**
 * Lista de propostas em cartões — usada apenas em telas pequenas (mobile),
 * no lugar da tabela larga. Mesmas ações da tabela, com alvos de toque
 * confortáveis (>= 40px).
 */

export type PropostaCardRow = {
  id: string;
  numero: string | null;
  nome?: string | null;
  numero_sap?: string | null;
  sap_ov_numero?: string | null;
  cliente_nome: string;
  totais: Record<string, number>;
  status: string;
  created_at: string;
  expedido_em?: string | null;
  finalizado_em?: string | null;
  consultor_nome?: string | null;
  criado_por_nome?: string | null;
  sap_ov_status?: string | null;
  sf_status?: string | null;
};

export function PropostasMobileCards({
  rows,
  rotaNova,
  carregando,
  podeExcluir,
  onDetalhe,
  onIntegracoes,
  onExcluir,
  className,
}: {
  rows: PropostaCardRow[];
  /** Rota da tela de proposta (continuar/duplicar). */
  rotaNova: "/solar/propostas/nova" | "/carregadores/propostas/nova";
  carregando?: boolean;
  podeExcluir?: boolean;
  onDetalhe: (id: string) => void;
  onIntegracoes: (id: string) => void;
  onExcluir: (id: string) => void;
  className?: string;
}) {
  if (carregando) {
    return (
      <div className={cn("space-y-3 p-3", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={cn("px-4 py-10 text-center text-sm text-muted-foreground", className)}>
        Nenhuma proposta encontrada.
      </div>
    );
  }

  return (
    <ul className={cn("divide-y divide-border/60", className)}>
      {rows.map((r) => {
        const integracoesOk = r.sap_ov_status === "criada" && r.sf_status === "sincronizado";
        return (
          <li key={r.id} className="p-4">
            <button
              type="button"
              onClick={() => onDetalhe(r.id)}
              className="w-full text-left"
              aria-label={`Abrir proposta de ${r.cliente_nome}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold leading-tight">
                    {r.cliente_nome}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-muted-foreground">
                    {r.nome || "Sem nome"}
                  </div>
                </div>
                <StatusDot status={r.status} className="mt-1.5 shrink-0" />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <div>
                  Nº <span className="text-foreground">{formatPropostaNumero(r.numero) || "—"}</span>
                </div>
                <div className="text-right">
                  SAP{" "}
                  <span className="text-foreground">
                    {formatSapNumero(r.sap_ov_numero || r.numero_sap) || "—"}
                  </span>
                </div>
                <div className="truncate">
                  {r.consultor_nome || r.criado_por_nome || "—"}
                </div>
                <div className="text-right text-sm font-semibold tabular-nums text-foreground">
                  {fmtBRL(r.totais?.['valorTotal'] ?? 0)}
                </div>
                {r.expedido_em ? (
                  <div className="col-span-2">
                    Despacho{" "}
                    <span className="text-foreground">
                      {new Date(`${String(r.expedido_em).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                ) : null}
                <div>
                  Compra{" "}
                  <span className="text-foreground">
                    {r.finalizado_em ? new Date(r.finalizado_em).toLocaleDateString("pt-BR") : "—"}
                  </span>
                </div>
                <div className="text-right">
                  Criação{" "}
                  <span className="text-foreground">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            </button>

            <div className="mt-3 flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon" aria-label="Detalhar" onClick={() => onDetalhe(r.id)}>
                <Eye className="h-4 w-4" />
              </Button>
              {!bloqueiaReenvioSap(r as Record<string, unknown>) && (
                <Button variant="ghost" size="icon" aria-label="Continuar proposta" asChild>
                  <Link to={rotaNova} search={{ id: r.id } as never}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="Duplicar proposta" asChild>
                <Link to={rotaNova} search={{ dup: r.id } as never}>
                  <Copy className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Integrações e auditoria"
                className={integracoesOk ? "text-success" : "text-warning"}
                onClick={() => onIntegracoes(r.id)}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {podeExcluir && (
                <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => onExcluir(r.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
