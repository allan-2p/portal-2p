import { useEffect, useState } from "react";
import { Check, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConclusaoFase = "salvando" | "integrando" | null;

const PASSOS = [
  { chave: "salvar", rotulo: "Salvando a proposta", detalhe: "Revalidando totais, impostos e margem." },
  { chave: "status", rotulo: "Concluindo o pedido", detalhe: "Aplicando o status e reservando o estoque." },
  { chave: "sap", rotulo: "Criando a ordem de venda no SAP", detalhe: "Enviando itens, frete e parceiros." },
  { chave: "cobranca", rotulo: "Gerando a cobrança", detalhe: "Pix, boleto ou condição a prazo." },
  { chave: "salesforce", rotulo: "Sincronizando com o Salesforce", detalhe: "Atualizando a oportunidade." },
] as const;

const FRASES = [
  "Conectando painéis, carregadores e boas ideias…",
  "Enquanto isso, o sol já aprovou essa proposta.",
  "Transformando watts em negócio fechado.",
  "Carregando a ordem de venda com energia 100% renovável.",
  "SAP aberto, café na mesa, vamos nessa.",
  "O Salesforce também quer saber dessa vitória.",
  "Mais uma proposta saindo do forno — e sem emissão de carbono.",
  "Seu cliente está prestes a economizar muito dinheiro.",
  "Aguenta aí, estamos fazendo mágica (com muita integração).",
  "Da 2P para o mundo: pedido em construção.",
  "Pix no ar, boleto na fila, tudo sob controle.",
  "Quase lá. Respira fundo e não fecha a janela.",
] as const;

/**
 * Overlay bloqueante do "Concluir pedido": cobre a tela inteira enquanto o
 * servidor executa as integrações e mostra em que passo o processo está.
 *
 * A fase "salvando" trava no primeiro passo; ao entrar em "integrando" os
 * passos seguintes avançam em ritmo próprio (o servidor devolve tudo em uma
 * única chamada) e o último nunca é marcado como concluído até o resultado
 * chegar e o overlay fechar.
 */
export function ConclusaoProgresso({ fase }: { fase: ConclusaoFase }) {
  const aberto = fase !== null;
  const [ativo, setAtivo] = useState(0);
  const [fraseIdx, setFraseIdx] = useState(0);

  useEffect(() => {
    if (!aberto) {
      setAtivo(0);
      setFraseIdx(0);
      return;
    }
    if (fase === "salvando") {
      setAtivo(0);
      return;
    }
    setAtivo((a) => (a < 1 ? 1 : a));
    const t = setInterval(() => {
      setAtivo((a) => (a < PASSOS.length - 1 ? a + 1 : a));
      setFraseIdx((i) => (i + 1) % FRASES.length);
    }, 2600);
    return () => clearInterval(t);
  }, [aberto, fase]);

  // Trava o scroll do documento enquanto o pedido está sendo concluído.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Concluindo o pedido"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onKeyDown={(e) => e.preventDefault()}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold">Concluindo o pedido…</p>
            <p className="text-xs text-muted-foreground">
              Isso pode levar alguns segundos. As integrações estão sendo executadas.
            </p>
          </div>
        </div>

        <p
          key={fraseIdx}
          className="mt-4 text-center text-sm font-medium text-primary animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          {FRASES[fraseIdx]}
        </p>

        <div className="mt-5 space-y-2">
          {PASSOS.map((p, i) => {
            const feito = i < ativo;
            const atual = i === ativo;
            return (
              <div
                key={p.chave}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-2 transition-all duration-300",
                  atual ? "border-primary/50 bg-primary/5" : "border-border/60",
                  !feito && !atual && "opacity-45",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                    feito
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : atual
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {feito ? <Check className="h-3 w-3" /> : atual ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className={cn("text-sm", atual ? "font-medium" : "")}>{p.rotulo}</p>
                  <p className="text-[11px] text-muted-foreground">{p.detalhe}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Não feche nem recarregue esta janela até finalizar — o pedido está sendo processado.</span>
        </div>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="conclusao-bar h-full w-1/3 rounded-full bg-primary/70" />
        </div>
      </div>
    </div>
  );
}
