import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Truck, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cotarFrete } from "@/lib/frete.functions";
import { fmtBRL, type CpoTransportadora } from "@/lib/cpo";
import { cn } from "@/lib/utils";

export type FreteCotacaoItem = { codigo: string; quantidade: number; nome?: string };

type Props = {
  itens: FreteCotacaoItem[];
  valorNota: number;
  destino: { uf: string; cidade: string; cep: string };
  areaRural: boolean;
  documento: string;
  selecionada: CpoTransportadora | null;
  onSelect: (t: CpoTransportadora) => void;
  /** Chamado quando algum dado muda e a cotação anterior deixa de valer. */
  onInvalidate?: () => void;
};

type Opcao = {
  id_transportadora: string;
  transportadora: string;
  transportadoraDocumento: string;
  total: number;
  prazo: number;
  ajustes: string[];
};

/** Cotação de frete CIF, com escolha da transportadora. */
export function FreteCotacao({
  itens,
  valorNota,
  destino,
  areaRural,
  documento,
  selecionada,
  onSelect,
  onInvalidate,
}: Props) {
  const cotar = useServerFn(cotarFrete);
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const cepOk = (destino.cep ?? "").replace(/\D/g, "").length === 8;
  const podeCotar = cepOk && !!destino.cidade && !!destino.uf && itens.length > 0 && valorNota > 0;

  // Assinatura dos dados que mudam a cotação — dispara o cálculo automático.
  const assinatura = JSON.stringify({
    itens: itens.map((i) => [i.codigo, i.quantidade, i.nome ?? ""]),
    valorNota,
    destino,
    areaRural,
    documento,
  });
  const ultima = useRef<string>("");

  useEffect(() => {
    if (ultima.current === assinatura) return;
    // Qualquer mudança que influencie o frete descarta a cotação anterior.
    if (ultima.current) {
      setOpcoes([]);
      onInvalidate?.();
    }
    if (!podeCotar || loading) return;
    ultima.current = assinatura;
    void executar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, podeCotar]);

  async function executar() {
    setLoading(true);
    setErro("");
    try {
      const r = await cotar({
        data: {
          itens: itens.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade })),
          valorNota,
          destino,
          areaRural,
          documento,
          ...(selecionada?.id ? { idTransportadora: selecionada.id } : {}),
        },
      });
      setOpcoes(r.opcoes as Opcao[]);
      const escolhida = (r.opcoes as Opcao[])[r.escolhida];
      if (escolhida) aplicar(escolhida);
    } catch (e) {
      setOpcoes([]);
      setErro(e instanceof Error ? e.message : "Erro ao cotar o frete.");
    } finally {
      setLoading(false);
    }
  }

  function aplicar(o: Opcao) {
    onSelect({
      id: o.id_transportadora,
      nome: o.transportadora,
      documento: o.transportadoraDocumento,
      total: o.total,
      prazo: o.prazo,
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> Cotação de frete
          </p>
          <p className="text-xs text-muted-foreground">
            Origem Itajaí/SC. O cálculo é automático e o valor da nota já considera o frete embutido.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void executar()}
          disabled={!podeCotar || loading}
          className="gap-1.5"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {loading ? "Calculando..." : opcoes.length ? "Recalcular frete" : "Calcular frete"}
        </Button>
      </div>


      {!podeCotar ? (
        <p className="text-xs text-muted-foreground">
          Informe CEP, cidade e UF de entrega e adicione produtos com valor para cotar.
        </p>
      ) : null}

      {erro ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{erro}</span>
        </div>
      ) : null}

      {opcoes.length ? (
        <div className="space-y-2">
          {opcoes.map((o) => {
            const ativa = selecionada?.id === o.id_transportadora;
            return (
              <button
                key={o.id_transportadora + o.transportadora}
                type="button"
                onClick={() => aplicar(o)}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                  ativa ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium truncate">{o.transportadora}</span>
                  <span className="text-sm font-semibold tabular-nums">{fmtBRL(o.total)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span>{o.prazo} dia(s) útil(eis)</span>
                  {o.ajustes.length ? <span className="truncate">{o.ajustes.join(" · ")}</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {selecionada ? (
        <p className="text-xs text-muted-foreground">
          Transportadora escolhida: <b className="text-foreground">{selecionada.nome}</b> ·{" "}
          {fmtBRL(selecionada.total)} · {selecionada.prazo} dia(s).
        </p>
      ) : null}
    </div>
  );
}
