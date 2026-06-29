import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Sparkles, Send, ArrowUp, Target, AlertTriangle, TrendingUp, LineChart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/atlas")({
  head: () => ({ meta: [{ title: "Atlas — Portal 2P" }] }),
  component: AtlasPage,
});

type Msg = { id: string; role: "user" | "atlas"; content: string };

const SUGGESTIONS = [
  { icon: AlertTriangle, label: "Quais clientes estão em risco?", color: "text-destructive" },
  { icon: Target, label: "Top oportunidades da semana", color: "text-success" },
  { icon: TrendingUp, label: "Plano de ação para bater a meta", color: "text-primary" },
  { icon: LineChart, label: "Tendências da minha carteira", color: "text-[oklch(0.55_0.18_280)]" },
];

function fakeReply(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("risco") || p.includes("ruim")) {
    return "Identifiquei 3 clientes em risco crítico: **Solaron Franquias** (saúde 12), **JN Construções** (18) e **Economy Solar** (22). Sugiro ligação imediata com Solaron — contato perdido há 25 dias. Quer que eu gere o roteiro de retomada?";
  }
  if (p.includes("oportunidade") || p.includes("top")) {
    return "As 3 melhores oportunidades agora:\n\n1. **Vertice Construtora** — cotação ORC-9821 em negociação, ticket R$ 54k\n2. **Cipriani Engenharia** — interesse na linha premium de limpadores\n3. **Jislaine Farias** — proposta aprovada aguardando OC\n\nFoco aqui pode adicionar R$ 90k no fechamento do mês.";
  }
  if (p.includes("meta") || p.includes("plano")) {
    return "Para fechar a meta de R$ 4,55M você precisa de **R$ 4,12M** nos próximos 18 dias úteis. Sugestão:\n\n• Acelerar 4 orçamentos em análise (R$ 230k)\n• Reativar 6 clientes A sem pedido em 30d\n• Upsell de acessórios nos top 10 (potencial R$ 180k)";
  }
  if (p.includes("tendência") || p.includes("tendencia")) {
    return "Sua carteira mostra **+18% em ticket médio** nos últimos 60 dias, mas a frequência de recompra caiu 9%. Concentração crescente em segmento A (62% do faturamento). Recomendo diversificar com clientes B em ascensão.";
  }
  return "Boa pergunta! Estou analisando sua carteira… No momento posso ajudar com riscos, oportunidades, plano de meta e tendências. Use os atalhos abaixo ou descreva o que precisa.";
}

function AtlasPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: t }]);
    setInput("");
    setThinking(true);
    setTimeout(() => {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "atlas", content: fakeReply(t) }]);
      setThinking(false);
    }, 700);
  };

  const empty = messages.length === 0;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto h-[calc(100vh-7rem)] flex flex-col">
        {empty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.65_0.2_30)] flex items-center justify-center mb-5 shadow-lg shadow-primary/30">
              <Sparkles className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Olá, eu sou o Atlas.</h1>
            <p className="text-muted-foreground mt-2 max-w-md">
              Seu copiloto de vendas. Posso analisar sua carteira, sugerir ações e ajudar a bater a meta.
              Por onde quer começar?
            </p>
            <div className="grid sm:grid-cols-2 gap-2 w-full max-w-xl mt-8">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => send(s.label)}
                  className="group flex items-center gap-3 p-3.5 rounded-xl border border-border bg-surface hover:border-primary/40 hover:bg-surface-2 text-left transition-all"
                >
                  <s.icon className={cn("h-4 w-4 shrink-0", s.color)} />
                  <span className="text-sm">{s.label}</span>
                  <ArrowUp className="h-3.5 w-3.5 ml-auto rotate-45 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollerRef} className="flex-1 overflow-y-auto py-6 space-y-5">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                {m.role === "atlas" && (
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[oklch(0.65_0.2_30)] flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[80%] text-sm leading-relaxed whitespace-pre-line",
                  m.role === "user"
                    ? "px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground"
                    : "text-foreground",
                )}>
                  {m.content}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[oklch(0.65_0.2_30)] flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-primary-foreground animate-pulse" />
                </div>
                <div className="flex items-center gap-1 pt-2">
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce" />
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pb-4 pt-3">
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="relative rounded-2xl border border-border bg-surface focus-within:border-primary/50 transition-colors shadow-sm"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              rows={1}
              placeholder="Pergunte ao Atlas…"
              className="w-full bg-transparent resize-none px-4 py-3.5 pr-12 text-sm focus:outline-none placeholder:text-muted-foreground max-h-40"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="absolute right-2 bottom-2 h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Atlas pode cometer erros. Confirme dados sensíveis antes de agir.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
