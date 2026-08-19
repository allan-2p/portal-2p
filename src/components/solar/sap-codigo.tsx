import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normCodigo, resolverProduto, type ProdutoCatalogo } from "@/lib/solar-sku";

type Item = ProdutoCatalogo & { ativo: boolean };

/** Catálogo SAP completo — usado para validar os de-para da Calculadora 2P. */
export function useSapCatalogoCodigos() {
  return useQuery({
    queryKey: ["sap-catalogo-codigos"],
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from("sap_produtos")
        .select("id, codigo, descricao, ativo")
        .order("descricao");
      if (error) throw error;
      return ((data ?? []) as any[]).map((p) => ({
        id: p.id,
        codigo: p.codigo,
        descricao: p.descricao ?? "",
        ativo: !!p.ativo,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

const tokens = (s: string) =>
  String(s ?? "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 2);

/** Melhor material do catálogo para um código que não resolve. */
export function sugerirMaterial(
  produtos: Item[],
  codigo: string | null | undefined,
  nomeRef?: string,
): Item | undefined {
  const alvo = tokens(`${codigo ?? ""} ${nomeRef ?? ""}`);
  if (!alvo.length) return undefined;
  let melhor: { item: Item; score: number } | undefined;
  for (const p of produtos) {
    const desc = `${p.codigo} ${p.descricao}`.toUpperCase();
    let score = 0;
    for (const t of alvo) if (desc.includes(t)) score += t.length;
    if (score > 0 && (!melhor || score > melhor.score)) melhor = { item: p, score };
  }
  return melhor && melhor.score >= 3 ? melhor.item : undefined;
}

/**
 * Mostra um código de de-para. Fica vermelho quando o código não existe no
 * catálogo SAP e sugere o material mais provável pela descrição.
 */
export function SapCodigoCell({
  codigo,
  nomeRef,
  produtos,
}: {
  codigo: string | null | undefined;
  nomeRef?: string;
  produtos: Item[];
}) {
  if (!normCodigo(codigo)) return <span className="text-muted-foreground">—</span>;

  const achado = resolverProduto(produtos, codigo);
  if (achado) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span>{codigo}</span>
        <span className="text-muted-foreground font-sans">({achado.codigo})</span>
      </span>
    );
  }

  const sugestao = sugerirMaterial(produtos, codigo, nomeRef);
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-destructive font-semibold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {codigo}
      </span>
      <span className="text-[11px] text-destructive/80">
        {sugestao
          ? `Sem material no SAP. Sugestão: ${sugestao.codigo} — ${sugestao.descricao}`
          : "Sem material correspondente no catálogo SAP."}
      </span>
    </span>
  );
}

/** Aviso agregado no topo da tela. */
export function SapDeParaResumo({ pendencias }: { pendencias: string[] }) {
  if (!pendencias.length) return null;
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" />
        {pendencias.length} código(s) sem material no catálogo SAP
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Esses itens entram na proposta sem preço. Corrija o de-para para o número do material SAP.
      </p>
      <ul className="mt-2 text-xs text-destructive/90 list-disc pl-5 space-y-0.5">
        {pendencias.slice(0, 12).map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
