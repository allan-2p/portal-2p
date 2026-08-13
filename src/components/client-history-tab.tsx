import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  GraduationCap,
  History,
  MapPin,
  Phone,
  ShoppingCart,
} from "lucide-react";
import { getClientTimeline, type ClientTimelineEntry, type ClientTimelineKind } from "@/lib/salesforce.functions";
import { cn } from "@/lib/utils";

const FILTROS: Array<{ key: "all" | ClientTimelineKind; label: string }> = [
  { key: "all", label: "Tudo" },
  { key: "pedido", label: "Pedidos" },
  { key: "interacao", label: "Interações" },
  { key: "visita", label: "Visitas" },
  { key: "treinamento", label: "Treinamentos" },
];

const META: Record<ClientTimelineKind, { label: string; icon: typeof Phone; cls: string }> = {
  pedido: { label: "Pedido", icon: ShoppingCart, cls: "text-success" },
  interacao: { label: "Interação", icon: Phone, cls: "text-primary" },
  visita: { label: "Visita", icon: MapPin, cls: "text-amber-500" },
  treinamento: { label: "Treinamento", icon: GraduationCap, cls: "text-purple-500" },
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Props = {
  /** ID da conta no Salesforce (quando houver). */
  accountId?: string;
  /** Nome do cliente — usado para trazer também propostas e tarefas de Carregadores. */
  clienteNome?: string;
  className?: string;
};

/**
 * Aba de histórico do cliente: pedidos, interações, visitas e treinamentos
 * em uma única linha do tempo. Usada em todo o portal, sem separação por instância.
 */
export function ClientHistoryTab({ accountId, clienteNome, className }: Props) {
  const fetchTimeline = useServerFn(getClientTimeline);
  const q = useQuery({
    queryKey: ["client-timeline", accountId ?? "", clienteNome ?? ""],
    queryFn: () => fetchTimeline({ data: { accountId, clienteNome } }),
    enabled: Boolean(accountId || clienteNome),
    staleTime: 2 * 60_000,
  });

  const [filtro, setFiltro] = useState<"all" | ClientTimelineKind>("all");
  const entries: ClientTimelineEntry[] = q.data?.entries ?? [];

  const contagem = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const e of entries) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [entries]);

  const lista = filtro === "all" ? entries : entries.filter((e) => e.kind === filtro);

  return (
    <div className={cn("glass rounded-xl p-5", className)}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <History className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Histórico do cliente</h3>
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={cn(
                "text-[11px] px-2 py-1 rounded-md transition-colors",
                filtro === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-muted-foreground hover:bg-surface",
              )}
            >
              {f.label}
              <span className="ml-1 opacity-70 tabular-nums">{contagem[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
          Carregando histórico…
        </div>
      ) : q.isError ? (
        <div className="text-sm text-destructive text-center py-8">
          Não foi possível carregar o histórico deste cliente.
        </div>
      ) : lista.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          Nenhum registro no histórico deste cliente.
        </div>
      ) : (
        <ol className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
          {lista.map((e) => {
            const meta = META[e.kind];
            const Icon = meta.icon;
            return (
              <li key={e.id} className="flex gap-3">
                <div className="mt-0.5">
                  <Icon className={cn("h-4 w-4", meta.cls)} />
                </div>
                <div className="flex-1 min-w-0 border-b border-border pb-3">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="text-sm font-medium truncate">{e.title}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums shrink-0 inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {e.date ? new Date(`${e.date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground uppercase tracking-wider">
                      {meta.label}
                    </span>
                    {e.status && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                        {e.status}
                      </span>
                    )}
                    {e.amount ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success tabular-nums">
                        {fmtBRL(e.amount)}
                      </span>
                    ) : null}
                    {e.source === "carregadores" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                        2P Carregadores
                      </span>
                    )}
                    {e.owner && <span className="text-[10px] text-muted-foreground">· {e.owner}</span>}
                  </div>
                  {e.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3 whitespace-pre-wrap">
                      {e.description}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
