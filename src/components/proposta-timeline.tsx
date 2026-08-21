import {
  PROPOSTA_STATUS,
  PROPOSTA_STATUS_DATA_COL,
  propostaStatusStyle,
  type PropostaStatus,
} from "@/lib/proposta-status";
import { cn } from "@/lib/utils";

/**
 * Linha do tempo universal de andamento do pedido (2P Solar, 2P Carregadores).
 * Mostra as etapas do fluxo até o status atual. Quando cancelado, exibe
 * apenas o aviso de cancelamento.
 */

/** Etapas de andamento após o fechamento do pedido. */
export const ETAPAS_ANDAMENTO: PropostaStatus[] = [
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
  "Entregue",
];

const fmtDataHora = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

/** Data em que o pedido entrou no status (coluna carimbada na transição). */
function dataDoStatus(
  etapa: PropostaStatus,
  proposta?: Record<string, any> | null,
): string | null {
  if (!proposta) return null;
  const col = PROPOSTA_STATUS_DATA_COL[etapa];
  const legado = etapa === "Coletado" ? proposta["enviado_em"] : null;
  return fmtDataHora((proposta[col] as string | null) ?? (legado as string | null));
}

export function PropostaTimeline({
  status,
  proposta,
  className,
}: {
  status: string;
  /** Linha da proposta — usada para mostrar a data de cada etapa. */
  proposta?: Record<string, any> | null;
  className?: string;
}) {
  const cancelado = status === "Cancelado";
  const atual = ETAPAS_ANDAMENTO.indexOf(status as PropostaStatus);

  if (cancelado) {
    const s = propostaStatusStyle("Cancelado");
    return (
      <div
        className={cn("rounded-xl border border-border px-4 py-3 text-sm font-medium", className)}
        style={{ color: s.bg }}
      >
        Pedido cancelado
        {dataDoStatus("Cancelado", proposta) ? (
          <span className="ml-2 font-normal text-muted-foreground">
            em {dataDoStatus("Cancelado", proposta)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-start">
        {ETAPAS_ANDAMENTO.map((etapa, i) => {
          const done = atual >= i && atual !== -1;
          const s = propostaStatusStyle(etapa);
          return (
            <div key={etapa} className="flex-1 min-w-0">
              <div className="flex items-center">
                <div
                  className={cn("h-1 flex-1 rounded-full", i === 0 && "opacity-0")}
                  style={{ backgroundColor: done ? s.bg : "var(--border)" }}
                />
                <span
                  className={cn(
                    "h-4 w-4 shrink-0 rounded-full ring-2 ring-background transition-transform",
                    done && "scale-110",
                  )}
                  style={{ backgroundColor: done ? s.bg : "var(--border)" }}
                  aria-current={atual === i ? "step" : undefined}
                />
                <div
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    i === ETAPAS_ANDAMENTO.length - 1 && "opacity-0",
                  )}
                  style={{
                    backgroundColor: atual > i && atual !== -1 ? s.bg : "var(--border)",
                  }}
                />
              </div>
              <div
                className={cn(
                  "mt-2 text-center text-[11px] leading-tight",
                  done ? "font-semibold" : "text-muted-foreground",
                )}
                style={done ? { color: s.bg } : undefined}
              >
                {etapa}
              </div>
              <div className="mt-0.5 text-center text-[10px] leading-tight text-muted-foreground tabular-nums">
                {dataDoStatus(etapa, proposta) ?? ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
