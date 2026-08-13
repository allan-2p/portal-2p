import { useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CpoProduct } from "@/lib/cpo";

import foto1 from "@/assets/carregadores/home-5_2p-carregadores.png.asset.json";
import foto2 from "@/assets/carregadores/produtos-2_2p-carregadores.png.asset.json";
import foto3 from "@/assets/carregadores/revendedores-2_2p-carregadores.png.asset.json";
import foto4 from "@/assets/carregadores/revendedores-3_2p-carregadores.png.asset.json";

const FOTOS = [foto2.url, foto4.url, foto3.url, foto1.url];

/** Foto estável por produto (hash simples do id/código). */
function fotoDoProduto(chave: string) {
  let h = 0;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  return FOTOS[h % FOTOS.length];
}

type Props = {
  produtos: CpoProduct[];
  onSelecionar?: (produtoId: string) => void;
  className?: string;
};

/**
 * Vitrine dos modelos de carregadores no cabeçalho da proposta.
 * Mostra foto, nome, código e potência de cada produto ativo.
 */
export function CpoCatalogoModelos({ produtos, onSelecionar, className }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lista = useMemo(() => produtos.filter((p) => p.ativo), [produtos]);

  if (lista.length === 0) return null;

  function scroll(dir: -1 | 1) {
    scrollRef.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  }

  return (
    <div className={cn("glass rounded-2xl p-4 space-y-3 overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-primary/15 text-primary grid place-items-center">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Modelos 2P Carregadores</h2>
            <p className="text-xs text-muted-foreground">
              {lista.length} modelos disponíveis · clique para adicionar à proposta
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scroll(-1)} aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scroll(1)} aria-label="Próximo">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {lista.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelecionar?.(p.id)}
            className="group relative shrink-0 w-[240px] snap-start text-left rounded-xl border border-border bg-surface/40 overflow-hidden transition-all hover:border-primary/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="relative h-[130px] overflow-hidden bg-muted">
              <img
                src={fotoDoProduto(p.codigo || p.id)}
                alt={`Carregador ${p.nome}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/10 to-transparent" />
              {p.potencia ? (
                <span className="absolute top-2 right-2 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold px-2 py-0.5">
                  {p.potencia}
                </span>
              ) : null}
            </div>
            <div className="p-3 space-y-1">
              <p className="text-sm font-semibold leading-snug line-clamp-2">{p.nome}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground font-mono">{p.codigo ?? "—"}</span>
                {onSelecionar ? (
                  <span className="text-[11px] text-primary font-semibold inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus className="h-3 w-3" /> Adicionar
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
