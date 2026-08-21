/**
 * Tipo de ordem no SAP (TP_OV) — regra única para simulação de preço e criação
 * da ordem de venda, igual à plataforma antiga.
 *
 * - ZV2P: venda para contribuinte (CNPJ com Inscrição Estadual). Padrão.
 * - ZC2P: venda para não contribuinte (CPF ou CNPJ sem IE / consumidor final).
 * - VBON: bonificação (tipo de NF = Bonificação) — sobrescreve tudo.
 *
 * `contribuinte` deve refletir a IE do parceiro que será faturado: quando a
 * nota vai para o cliente final, usa-se `faturamento.contribuinte`; caso
 * contrário, o próprio cliente da proposta.
 */
export type TpOv = "ZV2P" | "ZC2P" | "VBON";

export function tpOvDoPedido(tipoNf: unknown, contribuinte: unknown): TpOv {
  const t = String(tipoNf ?? "").toLowerCase();
  if (t === "bonificacao" || t.startsWith("bonifica")) return "VBON";
  return contribuinte === true ? "ZV2P" : "ZC2P";
}

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * Contribuinte do parceiro faturado (cliente final quando houver).
 *
 * Regra de origem (igual à plataforma antiga):
 * - faturado CPF (11 dígitos) → NUNCA contribuinte (sempre ZC2P), mesmo que a
 *   tela tenha marcado o checkbox;
 * - CNPJ → usa a informação de IE do parceiro faturado.
 */
export function contribuinteDoFaturamento(input: {
  contribuinte?: unknown;
  faturarClienteFinal?: unknown;
  faturamento?: { contribuinte?: unknown; doc?: unknown } | null;
  /** Documento do cliente da proposta (usado quando não há cliente final). */
  clienteDoc?: unknown;
}): boolean {
  if (input.faturarClienteFinal === true) {
    if (digitos(input.faturamento?.doc).length === 11) return false;
    return input.faturamento?.contribuinte === true;
  }
  if (digitos(input.clienteDoc).length === 11) return false;
  return input.contribuinte === true;
}

