import { useEffect, useSyncExternalStore } from "react";

export type NotificationKind = "task" | "atlas" | "info";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  client?: string;
  createdAt: number;
  read: boolean;
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
  // dynamic import to avoid SSR issues
  import("sonner").then(({ toast }) => {
    const icon = n.kind === "atlas" ? "✨" : n.kind === "task" ? "📌" : "🔔";
    toast(`${icon}  ${n.title}`, {
      description: n.client ? `${n.client} · ${n.description}` : n.description,
      duration: 5500,
    });
  });
}

export function markAllRead() {
  setState({ items: state.items.map((i) => ({ ...i, read: true })) });
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
