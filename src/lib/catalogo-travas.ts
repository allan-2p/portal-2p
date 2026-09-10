/**
 * Travas do catálogo: o que foi definido à mão nunca é desfeito por sincronização.
 *
 * `sap_produtos.campos_manuais` guarda a lista de campos editados na Gestão de
 * Produtos (nome, custo, preço sugerido, foto). Qualquer rotina que grave
 * dados vindos do SAP precisa remover esses campos do payload — status
 * (`ativo_override`) e visibilidade (`visibilidade_override`) já têm coluna
 * própria e seguem a mesma regra.
 */

export const CAMPOS_TRAVAVEIS = ["descricao", "custo", "preco_sugerido", "imagem_path"] as const;
export type CampoTravavel = (typeof CAMPOS_TRAVAVEIS)[number];

/** Campos travados da linha (tolerante a banco sem a coluna). */
export function camposTravados(row: unknown): Set<string> {
  const v = (row as any)?.campos_manuais;
  return new Set(Array.isArray(v) ? v.map((c) => String(c)) : []);
}

/** União dos campos já travados com os que acabaram de ser editados. */
export function unirCamposTravados(atuais: unknown, novos: string[]): string[] {
  const set = camposTravados({ campos_manuais: atuais });
  for (const c of novos) if ((CAMPOS_TRAVAVEIS as readonly string[]).includes(c)) set.add(c);
  return [...set].sort();
}

/** Remove do payload de sincronização tudo que foi definido à mão. */
export function semCamposTravados<T extends Record<string, unknown>>(payload: T, row: unknown): T {
  const travados = camposTravados(row);
  if (travados.size === 0) return payload;
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) if (!travados.has(k)) saida[k] = v;
  return saida as T;
}
