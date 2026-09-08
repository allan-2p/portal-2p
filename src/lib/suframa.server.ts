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
 * `faturarClienteFinal` derruba o benefício: a nota sai contra outro
 * destinatário, que não é o inscrito na SUFRAMA.
 */
export async function suframaDoCliente(
  doc: string,
  opts: { faturarClienteFinal?: boolean } = {},
): Promise<SuframaCliente> {
  const digits = String(doc ?? "").replace(/\D/g, "");
  if (digits.length !== 14) return VAZIO;
  try {
    const { findClienteByDoc } = await import("./clientes-db.server");
    const achados = await findClienteByDoc(digits);
    const cliente = achados[0]?.cliente as Record<string, unknown> | undefined;
    if (!cliente) return VAZIO;
    const fonte = {
      doc: digits,
      suframa: cliente["suframa"],
      suframa_situacao: cliente["suframa_situacao"],
    };
    const status = statusSuframa(fonte);
    return {
      suframa: (cliente["suframa"] as string | null) ?? null,
      suframa_situacao: (cliente["suframa_situacao"] as string | null) ?? null,
      status,
      aplicado: status === "aprovado" && opts.faturarClienteFinal !== true,
    };
  } catch {
    return VAZIO;
  }
}
