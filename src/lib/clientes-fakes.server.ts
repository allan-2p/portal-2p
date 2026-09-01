/**
 * Clientes "fake" por UF usados APENAS na simulação de preços do SAP.
 *
 * Regra herdada da plataforma antiga (`calculadora.php:736-755`): quando a nota
 * sai para o cliente final, ele ainda não existe no cadastro do SAP (só é
 * cadastrado no fechamento do pedido). Simular com o documento dele devolve
 * "Não existe mestre de clientes para emissor ordem" e nada é precificado.
 * A antiga simula com um cliente fake cadastrado no SAP por estado — os
 * impostos saem corretos porque dependem da UF, não do CNPJ específico.
 *
 * Tabela `public.clientes_fakes` no banco do Grupo 2P (27 registros, uf PK).
 */

import { grupo2pRest } from "./grupo2p-db.server";

export type ClienteFake = { uf: string; cnpj: string; cpf: string };

const cache = new Map<string, ClienteFake | null>();

export async function clienteFakeDaUf(uf: unknown): Promise<ClienteFake | null> {
  const sigla = String(uf ?? "").trim().toUpperCase();
  if (sigla.length !== 2) return null;
  if (cache.has(sigla)) return cache.get(sigla) ?? null;
  try {
    const { ok, text } = await grupo2pRest(
      `clientes_fakes?uf=eq.${encodeURIComponent(sigla)}&select=uf,cnpj,cpf&limit=1`,
    );
    if (!ok) return null;
    const linha = (JSON.parse(text) as any[])[0];
    const fake: ClienteFake | null = linha
      ? {
          uf: sigla,
          cnpj: String(linha.cnpj ?? "").replace(/\D/g, ""),
          cpf: String(linha.cpf ?? "").replace(/\D/g, ""),
        }
      : null;
    cache.set(sigla, fake);
    return fake;
  } catch {
    return null;
  }
}
