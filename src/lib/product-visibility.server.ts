import { listarPropostas } from "./propostas-db.server";

const ABERTAS = ["Salvo", "Enviada"];

/** Conta propostas de Carregadores em aberto que já usam o produto. */
export async function countOpenProposalsWithProduct(productId: string): Promise<number> {
  try {
    const rows = await listarPropostas({
      organizacao: "carregadores",
      select: "id,itens",
      statusIn: ABERTAS,
      limit: 1000,
    });
    return rows.filter((p: any) => {
      const itens = Array.isArray(p.itens) ? p.itens : [];
      return itens.some(
        (i: any) => i?.produto_id === productId || i?.produtoId === productId || i?.id === productId,
      );
    }).length;
  } catch {
    return 0;
  }
}
