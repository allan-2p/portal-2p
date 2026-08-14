import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { getSalesforceAccounts, type SalesforceAccount } from "@/lib/salesforce.functions";
import { Sparkles, Check, MinusCircle, X, MessageSquare, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/solar/clientes/sugestoes")({
  head: () => ({ meta: [{ title: "Sugestões do Atlas — Portal 2P" }] }),
  component: SugestoesPage,
});

type Verdict = "accepted" | "partial" | "rejected";
type Feedback = { verdict: Verdict; comment: string; at: number };

function fbKey(accountId: string, insightId: string) {
  return `portal2p:atlas-fb:${accountId}:${insightId}`;
}

type Insight = {
  id: string;
  title: string;
  reason: string;
  action: string;
  priority: number; // maior = mais crítico
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function generateInsights(a: SalesforceAccount): Insight[] {
  const out: Insight[] = [];
  const prev = a.quarterProjection ?? 0;
  const now = a.quarterSold ?? 0;

  if (prev > 0 && now === 0) {
    out.push({
      id: "risco-inatividade",
      title: "Cliente parou de comprar neste trimestre",
      reason: `Comprou ${brl(prev)} no trimestre anterior, ${brl(now)} agora.`,
      action:
        "Priorize contato de reativação nos próximos 7 dias — proposta de recompra com condição especial.",
      // Peso proporcional ao que se perdeu.
      priority: 100 + prev / 1000,
    });
  }
  if (prev > 0 && now > 0 && now < prev * 0.6) {
    const dropPct = (1 - now / prev) * 100;
    out.push({
      id: "queda-volume",
      title: "Queda relevante de volume trimestral",
      reason: `${brl(now)} vs. ${brl(prev)} anterior (queda de ${dropPct.toFixed(0)}%).`,
      action:
        "Agende reunião para entender concorrência, mix e possíveis bloqueios operacionais.",
      priority: 70 + dropPct / 2 + prev / 2000,
    });
  }
  if (now > 0 && now > prev * 1.3) {
    const gain = ((now - prev) / Math.max(prev, 1)) * 100;
    out.push({
      id: "upsell",
      title: "Momento ideal para upsell",
      reason: `Crescimento de ${gain.toFixed(0)}% no trimestre.`,
      action:
        "Ofereça portfólio complementar (financiamento, seguros, kits maiores) enquanto o momento é positivo.",
      priority: 60 + Math.min(gain, 200) / 4 + now / 2000,
    });
  }
  if (!a.segment) {
    out.push({
      id: "segmentar",
      title: "Cliente sem segmentação definida",
      reason: "Sem ABCD, o cliente não entra em campanhas segmentadas nem em cadências específicas.",
      action: "Classifique como A/B/C/D com base no potencial estimado de compra anual.",
      priority: 20,
    });
  }
  if (!a.phone) {
    out.push({
      id: "contato-faltando",
      title: "Contato incompleto no cadastro",
      reason: "Não há telefone principal cadastrado.",
      action: "Solicite telefone e e-mail do decisor para viabilizar contatos rápidos.",
      priority: 15,
    });
  }
  return out;
}

type Ranked = { account: SalesforceAccount; insight: Insight; score: number };

const SEGMENT_WEIGHT: Record<string, number> = { A: 1.6, B: 1.3, C: 1.0 };

function SugestoesPage() {
  const fetchAccounts = useServerFn(getSalesforceAccounts);
  const accountsQ = useQuery({
    queryKey: ["sf-accounts-sugestoes"],
    queryFn: () => fetchAccounts(),
    staleTime: 5 * 60_000,
  });
  const accounts = accountsQ.data?.records ?? [];

  const top = useMemo<Ranked[]>(() => {
    const eligible = accounts.filter((a) => {
      if (a.segment === "D") return false;
      const owner = (a.ownerName ?? "").trim().toLowerCase();
      if (owner === "marketing 2p") return false;
      return true;
    });
    const all: Ranked[] = [];
    for (const a of eligible) {
      const w = a.segment ? SEGMENT_WEIGHT[a.segment] ?? 1 : 0.9;
      for (const ins of generateInsights(a)) {
        all.push({ account: a, insight: ins, score: ins.priority * w });
      }
    }
    all.sort((x, y) => y.score - x.score);
    return all.slice(0, 10);
  }, [accounts]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
          <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Sugestões do Atlas
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            As 10 melhores hipóteses do Atlas para a carteira agora. Seu feedback (aceito,
            parcial ou recusado) treina o modelo para as próximas rodadas.
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            Filtros aplicados: exclui clientes segmento D e clientes de Marketing 2P.
          </p>
        </header>

        {accountsQ.isLoading ? (
          <div className="glass rounded-xl p-10 text-center text-muted-foreground">
            Carregando sugestões…
          </div>
        ) : top.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-60" />
            Nenhuma sugestão elegível no momento.
          </div>
        ) : (
          <div className="space-y-3">
            {top.map((r, idx) => (
              <InsightCard key={`${r.account.id}:${r.insight.id}`} rank={idx + 1} ranked={r} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function InsightCard({ rank, ranked }: { rank: number; ranked: Ranked }) {
  const { account, insight } = ranked;
  const [fb, setFb] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<Verdict | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(fbKey(account.id, insight.id));
    if (raw) {
      try {
        setFb(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    } else {
      setFb(null);
    }
    setPending(null);
    setComment("");
  }, [account.id, insight.id]);

  const save = (verdict: Verdict, requireComment: boolean) => {
    if (requireComment && !comment.trim()) {
      setPending(verdict);
      return;
    }
    const payload: Feedback = { verdict, comment: comment.trim(), at: Date.now() };
    window.localStorage.setItem(fbKey(account.id, insight.id), JSON.stringify(payload));
    setFb(payload);
    setPending(null);
    setComment("");
  };

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 font-bold text-sm">
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold">{insight.title}</div>
            {account.segment && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-muted-foreground font-medium">
                Seg. {account.segment}
              </span>
            )}
          </div>
          <Link
            to="/solar/clientes/perfil"
            search={{ account: account.id }}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-0.5"
          >
            <UserIcon className="h-3.5 w-3.5" /> {account.name}
          </Link>
          <p className="text-sm text-muted-foreground mt-2">{insight.reason}</p>
          <div className="mt-2 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-primary font-semibold mr-2">
              Ação sugerida
            </span>
            {insight.action}
          </div>

          {fb ? (
            <div className="mt-4 p-3 rounded-lg bg-surface-2/60 border border-border">
              <div className="flex items-center gap-2 text-sm">
                <VerdictBadge verdict={fb.verdict} />
                <span className="text-muted-foreground text-xs">
                  {new Date(fb.at).toLocaleString("pt-BR")}
                </span>
                <button
                  onClick={() => {
                    window.localStorage.removeItem(fbKey(account.id, insight.id));
                    setFb(null);
                  }}
                  className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Refazer
                </button>
              </div>
              {fb.comment && (
                <p className="text-sm mt-2 flex gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{fb.comment}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {pending && (
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    pending === "partial"
                      ? "Quais ressalvas? O que ajustar?"
                      : "Por que essa sugestão não se aplica?"
                  }
                  autoFocus
                  className="w-full min-h-[70px] p-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50 resize-y"
                />
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => save("accepted", false)}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-success/15 text-success hover:bg-success/25 font-medium"
                >
                  <Check className="h-3.5 w-3.5" /> Aceitar
                </button>
                <button
                  onClick={() => save("partial", true)}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25 font-medium"
                >
                  <MinusCircle className="h-3.5 w-3.5" /> Aceitar parcialmente
                </button>
                <button
                  onClick={() => save("rejected", true)}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25 font-medium"
                >
                  <X className="h-3.5 w-3.5" /> Recusar
                </button>
                {pending && (
                  <button
                    onClick={() => setPending(null)}
                    className="text-xs px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const map: Record<Verdict, { label: string; className: string; Icon: typeof Check }> = {
    accepted: { label: "Aceito", className: "bg-success/15 text-success", Icon: Check },
    partial: { label: "Parcial", className: "bg-primary/15 text-primary", Icon: MinusCircle },
    rejected: { label: "Recusado", className: "bg-destructive/15 text-destructive", Icon: X },
  };
  const m = map[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium",
        m.className,
      )}
    >
      <m.Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}
