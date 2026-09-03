/**
 * Fonte ÚNICA de verdade para "contribuinte do ICMS".
 *
 * Regra fiscal: contribuinte = tem Inscrição Estadual **E** a IE está
 * HABILITADA na consulta (CNPJá/SEFAZ). Sem IE, ou IE baixada/suspensa/isenta
 * ⇒ NÃO contribuinte. CPF nunca é contribuinte.
 *
 * Este booleano, uma vez decidido, é o que vale para gravação, preço, PDF,
 * exibição, TP_OV (ZV2P/ZC2P) e ICMSTAXPAY (01/09). Nenhum outro ponto do
 * sistema deve reinferir contribuinte por mera presença de IE.
 */

export type FonteContribuinte = {
  ie_habilitada?: unknown;
  ie_situacao?: unknown;
  ie?: unknown;
  doc?: unknown;
};

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Situação textual da IE indica habilitação? (fallback de retrocompatibilidade) */
export function ieSituacaoHabilitada(situacao: unknown): boolean {
  return String(situacao ?? "").trim().toLowerCase() === "habilitada";
}

/**
 * Deriva contribuinte de um enriquecimento de CNPJ ou de um blob já gravado.
 *
 * - `ie_habilitada` booleano decide sozinho (dado novo, canônico);
 * - sem ele, cai para `ie_situacao === 'Habilitada'` (registros antigos);
 * - sem nenhum dos dois, cai para presença de IE (legado puro) — só na LEITURA.
 */
export function contribuinteDeEnrich(e: FonteContribuinte | null | undefined): boolean {
  if (!e) return false;
  if (digitos(e.doc).length === 11) return false; // CPF nunca é contribuinte
  if (typeof e.ie_habilitada === "boolean") return e.ie_habilitada;
  if (e.ie_situacao != null && String(e.ie_situacao).trim() !== "") {
    return ieSituacaoHabilitada(e.ie_situacao);
  }
  const ie = String(e.ie ?? "").trim();
  return ie !== "" && ie.toUpperCase() !== "ISENTO";
}

/** Versão estrita: só aceita o dado novo. Usada na validação do servidor. */
export function temDecisaoFiscal(e: FonteContribuinte | null | undefined): boolean {
  return typeof e?.ie_habilitada === "boolean";
}
