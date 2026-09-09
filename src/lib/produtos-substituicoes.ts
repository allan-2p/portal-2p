/**
 * Substituição de códigos de material descontinuados.
 *
 * Quando o SAP troca um material por outro (mesmo item, código novo), as
 * propostas já salvas continuam com o código antigo e voltariam a subir assim
 * para o SAP. Este mapa é aplicado na leitura e na gravação das propostas, de
 * modo que qualquer pedido em aberto é atualizado sozinho.
 */
export const SUBSTITUICOES_PRODUTO: Record<string, { codigo: string; descricao: string }> = {
  // 2P-KIT PARAFUSOS SMART "N" (inativo) -> 2P-KIT PARAFUSOS SMART
  "100000052": { codigo: "100000210", descricao: "2P-KIT PARAFUSOS SMART" },
};

const norm = (v: unknown) => String(v ?? "").trim().replace(/^0+(?=\d)/, "");

/** Código vigente para um material (o próprio código quando não há troca). */
export function codigoVigente(codigo: unknown): string {
  const c = norm(codigo);
  return SUBSTITUICOES_PRODUTO[c]?.codigo ?? c;
}

/** Aplica as substituições numa lista de itens de proposta. Devolve a mesma
 * referência quando nada muda, para não invalidar caches à toa. */
export function aplicarSubstituicoesItens<T = any>(itens: T): T {
  if (!Array.isArray(itens)) return itens;
  let mudou = false;
  const novos = itens.map((item: any) => {
    if (!item || typeof item !== "object") return item;
    const de = SUBSTITUICOES_PRODUTO[norm(item.codigo)];
    if (!de) return item;
    mudou = true;
    const descricaoAtual = String(item.descricao ?? item.nome ?? "");
    return {
      ...item,
      codigo: de.codigo,
      ...(item.descricao !== undefined ? { descricao: de.descricao } : {}),
      ...(item.nome !== undefined ? { nome: de.descricao } : {}),
      ...(descricaoAtual ? {} : {}),
    };
  });
  return (mudou ? novos : itens) as T;
}

/** Aplica as substituições no JSON `itens` de uma linha de proposta. */
export function aplicarSubstituicoesProposta<T extends Record<string, any> | null | undefined>(
  row: T,
): T {
  if (!row || typeof row !== "object" || !Array.isArray((row as any).itens)) return row;
  const itens = aplicarSubstituicoesItens((row as any).itens);
  if (itens === (row as any).itens) return row;
  return { ...(row as any), itens } as T;
}
