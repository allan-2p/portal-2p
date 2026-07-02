import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSalesforceTasks, getSalesforceForecasts } from "@/lib/salesforce.functions";
import { pushNotification } from "./use-notifications";
import { useAuth } from "./use-auth";

const SEEN_KEY = "portal2p-seen-notifs";
const POLL_MS = 2 * 60_000;
const MAX_SEEN = 500;

let hookStarted = false;

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function saveSeen(seen: Set<string>) {
  if (typeof window === "undefined") return;
  const arr = Array.from(seen).slice(-MAX_SEEN);
  localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function isoPlusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function useSalesforceNotifications() {
  const { user } = useAuth();
  const fetchTasks = useServerFn(getSalesforceTasks);
  const fetchForecasts = useServerFn(getSalesforceForecasts);
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!user) return;
    if (hookStarted) return;
    hookStarted = true;

    seenRef.current = loadSeen();
    // primeira execução silenciosa: se seen vazio, marca tudo como visto sem tocar sino
    const firstRun = seenRef.current.size === 0;

    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      const seen = seenRef.current!;
      try {
        const today = todayIso();
        const [tasksRes, forecastsRes] = await Promise.all([
          fetchTasks({ data: { start: today, end: today } }).catch(() => ({ records: [] as any[] })),
          fetchForecasts({ data: {} }).catch(() => ({ records: [] as any[] })),
        ]);

        const nextSeen = new Set(seen);
        const newItems: Array<() => void> = [];

        for (const t of tasksRes.records ?? []) {
          const key = `task:${t.id}`;
          if (nextSeen.has(key)) continue;
          nextSeen.add(key);
          if (!firstRun) {
            newItems.push(() =>
              pushNotification({
                kind: "task",
                title: `Tarefa para hoje: ${t.subject}`,
                description: t.description?.slice(0, 140) ?? "Tarefa aberta no Salesforce.",
                client: t.what ?? t.who ?? undefined,
              }),
            );
          }
        }

        const cutoff = isoPlusDays(3);
        for (const opp of forecastsRes.records ?? []) {
          if (!opp.forecastDate || opp.forecastDate > cutoff) continue;
          const key = `opp:${opp.id}`;
          if (nextSeen.has(key)) continue;
          nextSeen.add(key);
          if (!firstRun) {
            const overdue = opp.forecastDate < todayIso();
            newItems.push(() =>
              pushNotification({
                kind: "atlas",
                title: overdue
                  ? `Previsão vencida: ${opp.name}`
                  : `Previsão próxima: ${opp.name}`,
                description: `Fechamento previsto ${new Date(opp.forecastDate!).toLocaleDateString("pt-BR")}${
                  opp.amount ? ` · ${opp.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""
                }.`,
                client: opp.account ?? undefined,
              }),
            );
          }
        }

        seenRef.current = nextSeen;
        saveSeen(nextSeen);
        // Escalona pushes para não empilhar toasts no mesmo tick
        newItems.forEach((fn, i) => setTimeout(fn, i * 400));
      } catch {
        // silencia — próximo ciclo tenta de novo
      }
    }

    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      hookStarted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
