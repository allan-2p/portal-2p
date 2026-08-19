/**
 * De-para entre o SKU comercial usado nos cadastros da calculadora
 * (ex.: `2P-TC4800`) e o material do catálogo SAP (ex.: `200000028`).
 *
 * O SAP só precifica pelo número do material; os cadastros de trilhos,
 * suportes e microinversores guardam o SKU. A descrição do catálogo começa
 * com o SKU ("2P-TC4800 Trilho 2P Alum 6063 4,80M"), então usamos isso como
 * chave de resolução quando o código não bate diretamente.
 */

export type ProdutoCatalogo = { id: string; codigo: string; descricao: string };

export const normCodigo = (c: unknown) =>
  String(c ?? "").trim().toUpperCase().replace(/^0+(?=\d)/, "");

/** Primeiro token da descrição — normalmente o SKU comercial. */
const skuDaDescricao = (d: unknown) =>
  String(d ?? "").trim().toUpperCase().split(/\s+/)[0]?.replace(/[.,;:]+$/, "") ?? "";

export function resolverProduto<T extends ProdutoCatalogo>(
  produtos: T[],
  codigo: string | null | undefined,
): T | undefined {
  const alvo = normCodigo(codigo);
  if (!alvo) return undefined;
  const porCodigo = produtos.find((p) => normCodigo(p.codigo) === alvo);
  if (porCodigo) return porCodigo;
  return produtos.find((p) => skuDaDescricao(p.descricao) === alvo);
}
