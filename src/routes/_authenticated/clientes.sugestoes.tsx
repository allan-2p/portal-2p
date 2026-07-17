import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { getSalesforceAccounts, type SalesforceAccount } from "@/lib/salesforce.functions";
import { Sparkles, Search, Check, MinusCircle, X, MessageSquare, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Search = { account?: string };

export const Route = createFileRoute("/_authenticated/clientes/sugestoes")({
  head: () => ({ meta: [{ title: "Sugestões do Atlas — Portal 2P" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    account: typeof s.account === "string" ? s.account : undefined,
  }),
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
};

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
    });
  }
  if (prev > 0 && now > 0 && now < prev * 0.6) {
    out.push({
      id: "queda-volume",
      title: "Queda relevante de volume trimestral",
      reason: `${brl(now)} vs. ${brl(prev)} anterior (queda de ${(
        (1 - now / prev) *
        100
      ).toFixed(0)}%).`,
      action:
        "Agende reunião para entender concorrência, mix e possíveis bloqueios operacionais.",
    });
  }
  if (now > 0 && now > prev * 1.3) {
    out.push({
      id: "upsell",
      title: "Momento ideal para upsell",
      reason: `Crescimento de ${(((now - prev) / Math.max(prev, 1)) * 100).toFixed(0)}% no trimestre.`,
      action:
        "Ofereça portfólio complementar (financiamento, seguros, kits maiores) enquanto o momento é positivo.",
    });
  }
  if (!a.segment) {
    out.push({
      id: "segmentar",
      title: "Cliente sem segmentação definida",
      reason: "Sem ABCD, o cliente não entra em campanhas segmentadas nem em cadências específicas.",
      action: "Classifique como A/B/C/D com base no potencial estimado de compra anual.",
    });
  }
  if (!a.phone) {
    out.push({
      id: "contato-faltando",
      title: "Contato incompleto no cadastro",
      reason: "Não há telefone principal cadastrado.",
      action: "Solicite telefone e e-mail do decisor para viabilizar contatos rápidos.",
    });
  }
  if (out.length === 0) {
    out.push({
      id: "manutencao",
      title: "Relacionamento saudável — mantenha ritmo",
      reason: "Indicadores dentro do padrão para o segmento.",
      action:
        "Estabeleça cadência quinzenal de contato leve (novidades, materiais, casos) para preservar top of mind.",
    });
  }
  return out;
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function SugestoesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const fetchAccounts = useServerFn(getSalesforceAccounts);
  const accountsQ = useQuery({
    queryKey: ["sf-accounts-sugestoes"],
    queryFn: () => fetchAccounts(),
    staleTime: 5 * 60_000,
  });
  const accounts = accountsQ.data?.records ?? [];

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts.slice(0, 80);
    return accounts
      .filter((a) => a.name.toLowerCase().includes(q) || (a.cnpj ?? "").toLowerCase().includes(q))
      .slice(0, 80);
  }, [accounts, query]);

  const selected = useMemo(
    () => (search.account ? accounts.find((a) => a.id === search.account) ?? null : null),
    [accounts, search.account],
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" /> Sugestões do Atlas
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              O Atlas propõe hipóteses sobre cada cliente. Seu feedback (aceito, parcial ou
              recusado) treina o modelo para as próximas rodadas com os vendedores.
            </p>
          </div>
          {selected && (
            <Link
              to="/clientes/perfil"
              search={{ account: selected.id }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface text-sm font-medium"
            >
              <UserIcon className="h-4 w-4" /> Abrir perfil do cliente
            </Link>
          )}
        </header>

        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          <aside className="glass rounded-xl p-3 h-fit">
            <div className="relative mb-2">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente…"
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="max-h-[65vh] overflow-y-auto -mx-1 px-1">
              {accountsQ.isLoading && (
                <div className="p-4 text-sm text-muted-foreground">Carregando clientes…</div>
              )}
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate({ to: "/clientes/sugestoes", search: { account: a.id } })}
                  className={cn(
                    "w-full text-left px-2.5 py-2 rounded-md text-sm mb-0.5 transition-colors",
                    selected?.id === a.id
                      ? "bg-primary/15 text-primary font-medium"
                      : "hover:bg-surface-2",
                  )}
                >
                  <div className="truncate">{a.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {a.segment ? `Seg. ${a.segment}` : "s/ segmentação"}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {selected ? (
            <InsightsPanel account={selected} />
          ) : (
            <div className="glass rounded-xl p-10 text-center text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-60" />
              Selecione um cliente para ver as sugestões do Atlas.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function InsightsPanel({ account }: { account: SalesforceAccount }) {
  const insights = useMemo(() => generateInsights(account), [account]);
  return (
    <div className="space-y-3">
      <div className="glass rounded-xl p-5">
        <div className="text-[11px] uppercase text-muted-foreground">Cliente</div>
        <div className="text-xl font-bold">{account.name}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {account.cnpj ?? "sem CNPJ"} · Responsável: {account.ownerName ?? "—"}
        </div>
      </div>

      {insights.map((i) => (
        <InsightCard key={i.id} accountId={account.id} insight={i} />
      ))}
    </div>
  );
}

function InsightCard({ accountId, insight }: { accountId: string; insight: Insight }) {
  const [fb, setFb] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<Verdict | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(fbKey(accountId, insight.id));
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
  }, [accountId, insight.id]);

  const save = (verdict: Verdict, requireComment: boolean) => {
    if (requireComment && !comment.trim()) {
      setPending(verdict);
      return;
    }
    const payload: Feedback = { verdict, comment: comment.trim(), at: Date.now() };
    window.localStorage.setItem(fbKey(accountId, insight.id), JSON.stringify(payload));
    setFb(payload);
    setPending(null);
    setComment("");
  };

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{insight.title}</div>
          <p className="text-sm text-muted-foreground mt-1">{insight.reason}</p>
          <div className="mt-2 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-primary font-semibold mr-2">
              Ação sugerida
            </span>
            {insight.action}
          </div>

          {/* Feedback */}
          {fb ? (
            <div className="mt-4 p-3 rounded-lg bg-surface-2/60 border border-border">
              <div className="flex items-center gap-2 text-sm">
                <VerdictBadge verdict={fb.verdict} />
                <span className="text-muted-foreground text-xs">
                  {new Date(fb.at).toLocaleString("pt-BR")}
                </span>
                <button
                  onClick={() => {
                    window.localStorage.removeItem(fbKey(accountId, insight.id));
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
