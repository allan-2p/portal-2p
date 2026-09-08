/**
 * Reconfirmação server-side do SUFRAMA.
 *
 * A tela nunca decide sozinha se a venda é para a Zona Franca de Manaus: no
 * salvamento o servidor relê a inscrição do cadastro do cliente (que só é
 * preenchida pela consulta pública do CNPJ) e decide de novo.
 */

import { statusSuframa, type StatusSuframa } from "./suframa";

export type SuframaCliente = {
  suframa: string | null;
  suframa_situacao: string | null;
  status: StatusSuframa;
  aplicado: boolean;
};

const VAZIO: SuframaCliente = {
  suframa: null,
  suframa_situacao: null,
  status: "sem",
  aplicado: false,
};

/**
 * Lê o SUFRAMA do cadastro do cliente pelo documento.
 *
 * Quando a nota sai contra o cliente final (`faturarClienteFinal`), quem vale é
 * o SUFRAMA DELE: o benefício acompanha o destinatário da NF. Procuramos a
 * inscrição no próprio bloco de faturamento (preenchido pela consulta do CNPJ
 * na tela), depois no cadastro e, por último, na consulta pública.
 */
export async function suframaDoCliente(
  doc: string,
  opts: {
    faturarClienteFinal?: boolean;
    faturamento?: Record<string, unknown> | null;
  } = {},
): Promise<SuframaCliente> {
  const alvo = opts.faturarClienteFinal
    ? String(opts.faturamento?.["doc"] ?? "")
    : String(doc ?? "");
  const digits = alvo.replace(/\D/g, "");
  if (digits.length !== 14) return VAZIO;

  const decidir = (suframa: unknown, situacao: unknown): SuframaCliente | null => {
    const numero = String(suframa ?? "").replace(/\D/g, "");
    if (!numero) return null;
    const status = statusSuframa({ doc: digits, suframa, suframa_situacao: situacao });
    return {
      suframa: numero,
      suframa_situacao: (situacao as string | null) ?? null,
      status,
      aplicado: status === "aprovado",
    };
  };

  // 1) Dados já trazidos na tela para o cliente final.
  if (opts.faturarClienteFinal) {
    const direto = decidir(opts.faturamento?.["suframa"], opts.faturamento?.["suframa_situacao"]);
    if (direto) return direto;
  }

  // 2) Cadastro de clientes.
  try {
    const { findClienteByDoc } = await import("./clientes-db.server");
    const achados = await findClienteByDoc(digits);
    const cliente = achados[0]?.cliente as Record<string, unknown> | undefined;
    const doCadastro = cliente ? decidir(cliente["suframa"], cliente["suframa_situacao"]) : null;
    if (doCadastro) return doCadastro;
    if (!opts.faturarClienteFinal) return VAZIO;
  } catch {
    if (!opts.faturarClienteFinal) return VAZIO;
  }

  // 3) Cliente final fora do cadastro: consulta pública do CNPJ.
  try {
    const { enrichCnpj } = await import("./cnpj-enrich.server");
    const e = await enrichCnpj(digits);
    return decidir(e?.suframa, e?.suframa_situacao) ?? VAZIO;
  } catch {
    return VAZIO;
  }
}
