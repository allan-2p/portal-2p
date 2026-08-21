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

export function PropostaTimeline({
  status,
  className,
}: {
  status: string;
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
