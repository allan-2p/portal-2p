import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Largura e altura de uma folha A4 em pixels a 96dpi. */
const A4_LARGURA = 794;
const A4_ALTURA = 1123;
/** Altura útil descontando as margens @page (~10mm em cima e embaixo). */
const A4_UTIL = 1047;

type Analise = {
  paginas: number;
  cortes: number;
  transbordoLargura: boolean;
};

/**
 * Visualizador de proposta em PDF com zoom, contagem de folhas e checagem de
 * conteúdo cortado entre páginas. Compartilhado por Solar e Carregadores.
 */
export function PropostaPdfPreview({
  html,
  titulo = "Prévia da proposta",
  className,
  alturaVisor = "100%",
}: {
  html: string;
  titulo?: string;
  className?: string;
  alturaVisor?: string;
}) {
  const [zoom, setZoom] = useState(0.7);
  const [analise, setAnalise] = useState<Analise>({ paginas: 1, cortes: 0, transbordoLargura: false });
  const areaRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const medir = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const altura = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight ?? 0);
    const paginas = Math.max(1, Math.ceil(altura / A4_UTIL));

    // Blocos que atravessam a divisa de uma folha ficam cortados na impressão.
    let cortes = 0;
    const blocos = doc.querySelectorAll<HTMLElement>("tr, h1, h2, h3, li, img, .bloco, .card, .secao");
    blocos.forEach((el) => {
      const topo = el.offsetTop;
      const base = topo + el.offsetHeight;
      if (el.offsetHeight <= 0 || el.offsetHeight > A4_UTIL) return;
      if (Math.floor(topo / A4_UTIL) !== Math.floor((base - 1) / A4_UTIL)) cortes += 1;
    });

    const transbordoLargura = (doc.body.scrollWidth ?? 0) > A4_LARGURA + 4;
    setAnalise((a) =>
      a.paginas === paginas && a.cortes === cortes && a.transbordoLargura === transbordoLargura
        ? a
        : { paginas, cortes, transbordoLargura },
    );
  }, []);

  // O HTML é regerado a cada edição: remede quando ele muda.
  useEffect(() => {
    const t = setTimeout(medir, 120);
    return () => clearTimeout(t);
  }, [html, medir]);

  const ajustar = useCallback(() => {
    const largura = areaRef.current?.clientWidth ?? 0;
    if (!largura) return;
    const z = Math.min(1.5, Math.max(0.3, (largura - 32) / A4_LARGURA));
    setZoom(Number(z.toFixed(2)));
  }, []);

  useEffect(() => {
    ajustar();
  }, [ajustar]);

  const paginasLabel = useMemo(
    () => `${analise.paginas} ${analise.paginas === 1 ? "folha" : "folhas"} A4`,
    [analise.paginas],
  );

  const ok = analise.cortes === 0 && !analise.transbordoLargura;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border px-2 py-0.5 font-medium tabular-nums">
            {paginasLabel}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
              ok
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-500",
            )}
          >
            {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {ok
              ? "Nada é cortado entre as folhas"
              : analise.transbordoLargura
                ? "Conteúdo mais largo que a folha"
                : `${analise.cortes} ${analise.cortes === 1 ? "bloco pode ser cortado" : "blocos podem ser cortados"}`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))))}
            aria-label="Diminuir zoom"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
            aria-label="Aumentar zoom"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={ajustar}>
            <Maximize2 className="h-3.5 w-3.5" /> Ajustar
          </Button>
        </div>
      </div>

      <div ref={areaRef} className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4" style={{ height: alturaVisor }}>
        <div
          className="relative mx-auto"
          style={{ width: A4_LARGURA * zoom, height: A4_ALTURA * analise.paginas * zoom }}
        >
          <iframe
            ref={iframeRef}
            title={titulo}
            srcDoc={html}
            onLoad={medir}
            style={{
              width: A4_LARGURA,
              height: A4_ALTURA * analise.paginas,
              border: 0,
              background: "#fff",
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              boxShadow: "0 1px 12px rgba(0,0,0,.12)",
            }}
          />
          {/* Marcas de quebra de folha */}
          {Array.from({ length: Math.max(0, analise.paginas - 1) }).map((_, i) => (
            <div
              key={i}
              className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-primary/40"
              style={{ top: A4_UTIL * (i + 1) * zoom }}
            >
              <span className="absolute right-1 -top-5 rounded bg-primary/80 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                folha {i + 2}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
