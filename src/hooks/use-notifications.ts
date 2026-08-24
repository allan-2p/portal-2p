import { useEffect, useSyncExternalStore } from "react";
import { listarMinhasNotificacoesFn, marcarNotificacoesLidasFn } from "@/lib/notificacoes.functions";

export type NotificationKind = "task" | "atlas" | "info" | "pagamento";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  client?: string;
  createdAt: number;
  read: boolean;
  /** Notificação vinda do servidor (persistida). */
  serverId?: string;
}


interface State {
  items: AppNotification[];
  lastPulse: number; // increments to drive bell shake
}

let state: State = { items: [], lastPulse: 0 };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  emit();
}

export function pushNotification(n: Omit<AppNotification, "id" | "createdAt" | "read">) {
  const item: AppNotification = {
    ...n,
    id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    read: false,
  };
  setState({
    items: [item, ...state.items].slice(0, 30),
    lastPulse: state.lastPulse + 1,
  });
  // Toast desativado a pedido: nada de pop-up automático no canto da tela.
  // As notificações continuam disponíveis no sino (ícone do topo).

}

export function markAllRead() {
  const pendentes = state.items.filter((i) => !i.read && i.serverId).map((i) => i.serverId!);
  setState({ items: state.items.map((i) => ({ ...i, read: true })) });
  if (pendentes.length) void marcarNotificacoesLidasFn({ data: { ids: pendentes } }).catch(() => {});
}

export function clearNotifications() {
  setState({ items: [] });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => state;

export function useNotifications() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// --- feed do servidor ------------------------------------------------------
// Busca as notificações persistidas (ex.: Pix pago / expirado / cancelado)
// e mostra toast para cada novidade não lida.
const vistos = new Set<string>();

async function sincronizarServidor(primeiraCarga: boolean) {
  try {
    // Sem sessão ativa a server fn responde 401/500 — nem chamamos.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.access_token) return;

    const remotas = await listarMinhasNotificacoesFn();
    const novas = remotas.filter((r) => !vistos.has(r.id));
    if (!novas.length) return;
    novas.forEach((r) => vistos.add(r.id));

    const mapeadas: AppNotification[] = novas.map((r) => ({
      id: `s_${r.id}`,
      serverId: r.id,
      kind: (r.tipo as NotificationKind) ?? "info",
      title: r.titulo,
      description: r.descricao ?? "",
      createdAt: new Date(r.created_at).getTime(),
      read: r.lida,
    }));

    setState({
      items: [...mapeadas, ...state.items]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30),
      lastPulse: state.lastPulse + (mapeadas.some((m) => !m.read) ? 1 : 0),
    });

    if (!primeiraCarga) {
      // Sem toast automático: as novidades aparecem apenas no sino.
    }

  } catch {
    // sino nunca deve quebrar a navegação
  }
}

let feedIniciado = false;

/** Liga o feed persistido do sino (poll a cada 45s). Chame uma vez no layout. */
export function useServerNotificationsFeed(enabled = true) {
  useEffect(() => {
    if (!enabled || feedIniciado) return;
    feedIniciado = true;
    void sincronizarServidor(true);
    const t = setInterval(() => void sincronizarServidor(false), 45_000);
    const onFocus = () => void sincronizarServidor(false);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      feedIniciado = false;
    };
  }, [enabled]);
}


// --- demo feed -------------------------------------------------------------
// Periodically pushes a sample task / atlas notification so the bell is alive.
// Runs once across the app.
let demoStarted = false;
const DEMO_FEED: Array<Omit<AppNotification, "id" | "createdAt" | "read">> = [
  {
    kind: "task",
    title: "Nova tarefa: ligar para ALC Solar",
    description: "Salesforce agendou retorno para hoje 14h.",
    client: "ALC Solar - Renováveis",
  },
  {
    kind: "atlas",
    title: "Atlas detectou oportunidade",
    description: "Ticket subindo + compra recorrente. Apresente a linha premium.",
    client: "Cipriani Engenharia Solar",
  },
  {
    kind: "task",
    title: "Nova tarefa: enviar proposta",
    description: "Limpador premium · venc. hoje 17h.",
    client: "Cipriani Engenharia Solar",
  },
  {
    kind: "atlas",
    title: "Atlas: risco de churn",
    description: "Vertice caiu 18% em geração nas últimas 2 semanas.",
    client: "Vertice Construtora Solar",
  },
  {
    kind: "atlas",
    title: "Atlas: follow-up sugerido",
    description: "Sol Engenharia em 86% da projeção — converta agora.",
    client: "Sol Engenharia Energéticas",
  },
  {
    kind: "task",
    title: "Nova tarefa: visita técnica",
    description: "Agendada para amanhã 09h.",
    client: "Vertice Construtora Solar",
  },
  {
    kind: "atlas",
    title: "Atlas: 3 clientes A sem interação",
    description: "Economy Solar, ALC Solar e Enertrend há +10 dias.",
  },
];

export function useNotificationsDemoFeed() {
  useEffect(() => {
    if (demoStarted) return;
    demoStarted = true;

    // seed two so the bell starts with content
    pushNotification(DEMO_FEED[0]);
    setTimeout(() => pushNotification(DEMO_FEED[1]), 1200);

    let i = 2;
    const interval = setInterval(() => {
      pushNotification(DEMO_FEED[i % DEMO_FEED.length]);
      i++;
    }, 38_000);
    return () => clearInterval(interval);
  }, []);
}

export function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}
