/**
 * Idioma da sessão SAP.
 *
 * Sem forçar o idioma, o runtime envia `Accept-Language: *` e o SAP abre a
 * sessão em EN — onde textos cadastrados só em PT (ex.: division 10) não
 * existem, derrubando o item com E/157 "Missing text for division ... EN".
 *
 * Receita: header `accept-language: pt-BR` + parâmetro ICF `sap-language=PT`
 * na URL (cinto e suspensório; o gateway repassa o parâmetro).
 */
export const SAP_ACCEPT_LANGUAGE = "pt-BR";

/** Acrescenta `sap-language=PT` à URL do endpoint, sem duplicar. */
export function comIdiomaPT(url: string): string {
  if (!url) return url;
  if (/[?&]sap-language=/i.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "sap-language=PT";
}
