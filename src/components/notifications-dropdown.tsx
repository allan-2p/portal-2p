import { useEffect, useRef, useState } from "react";
import { Bell, Sparkles, CheckCircle2, ListChecks, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  markAllRead,
  clearNotifications,
  timeAgo,
  useNotifications,
  useServerNotificationsFeed,
} from "@/hooks/use-notifications";

export function NotificationsDropdown() {
  const { items, lastPulse } = useNotifications();
  useServerNotificationsFeed();
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const firstPulse = useRef(true);
  const unread = items.filter((i) => !i.read).length;

  useEffect(() => {
    if (firstPulse.current) {
      firstPulse.current = false;
      return;
    }
    setShake(true);
    const t = setTimeout(() => setShake(false), 900);
    return () => clearTimeout(t);
  }, [lastPulse]);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread > 0) setTimeout(markAllRead, 400);
        }}
        className={cn(
          "relative p-2 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors",
          shake && "animate-bell-shake",
        )}
        aria-label="Notificações"
      >
        <Bell className={cn("h-4 w-4", unread > 0 ? "text-primary" : "text-muted-foreground")} />
        {unread > 0 && (
          <>
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-[10px] font-semibold text-primary-foreground flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary/40 animate-ping" />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-[360px] bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-display font-semibold text-sm">Notificações</div>
                <div className="text-[11px] text-muted-foreground">
                  Pagamentos, tarefas do Salesforce e Atlas
                </div>
              </div>
              {items.length > 0 && (
                <button
                  onClick={clearNotifications}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <Bell className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  Nada por aqui ainda.
                </div>
              ) : (
                items.map((n) => {
                  const Icon =
                    n.kind === "atlas"
                      ? Sparkles
                      : n.kind === "task"
                        ? ListChecks
                        : n.kind === "pagamento"
                          ? CreditCard
                          : CheckCircle2;
                  const color =
                    n.kind === "atlas"
                      ? "from-primary to-[oklch(0.7_0.18_280)]"
                      : n.kind === "task"
                        ? "from-emerald-500 to-emerald-700"
                        : n.kind === "pagamento"
                          ? "from-amber-500 to-amber-700"
                          : "from-sky-500 to-sky-700";
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "px-4 py-3 border-b border-border/60 last:border-b-0 flex gap-3 transition-colors",
                        !n.read && "bg-primary/5",
                      )}
                    >
                      <div
                        className={cn(
                          "h-8 w-8 shrink-0 rounded-full bg-gradient-to-br flex items-center justify-center",
                          color,
                        )}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <div className="font-medium text-sm truncate">{n.title}</div>
                          <div className="text-[10px] text-muted-foreground ml-auto shrink-0">
                            {timeAgo(n.createdAt)}
                          </div>
                        </div>
                        {n.client && (
                          <div className="text-[11px] text-primary mt-0.5 truncate">
                            {n.client}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {n.description}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes bell-shake {
          0%, 100% { transform: rotate(0); }
          15% { transform: rotate(-14deg); }
          30% { transform: rotate(12deg); }
          45% { transform: rotate(-9deg); }
          60% { transform: rotate(6deg); }
          75% { transform: rotate(-3deg); }
        }
        .animate-bell-shake { animation: bell-shake 0.85s cubic-bezier(.36,.07,.19,.97) both; transform-origin: top center; }
      `}</style>
    </div>
  );
}
