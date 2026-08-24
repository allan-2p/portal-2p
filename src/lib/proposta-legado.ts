/**
 * Dados da migração da plataforma antiga guardados na proposta.
 *
 * A renumeração de 2026 passou as 26 propostas existentes para 100001–100026 e
 * guardou o número original em `totais.numeroAnterior`. Propostas importadas da
 * plataforma antiga trazem `totais.origem = 'plataforma_antiga'` e números na
 * faixa 10001–53059 — elas seguem o mesmo ciclo de status, o mesmo cron (pela
 * OV) e os mesmos botões de NF.
 */

/** Faixa de números da plataforma antiga (também existentes no SAP). */
export const NUMERO_LEGADO_MIN = 10001;
export const NUMERO_LEGADO_MAX = 53059;

const texto = (v: unknown): string => String(v ?? "").trim();

function totais(p: Record<string, any> | null | undefined): Record<string, any> {
  const t = p?.["totais"];
  return t && typeof t === "object" ? (t as Record<string, any>) : {};
}

/** Nº anterior (antes da renumeração), sem zeros à esquerda. */
export function numeroAnterior(p: Record<string, any> | null | undefined): string {
  const v = texto(totais(p)["numeroAnterior"] ?? totais(p)["numero_anterior"]);
  return v.replace(/^0+(?=\d)/, "");
}

/** Origem da proposta registrada na migração (ex.: 'plataforma_antiga'). */
export function origemProposta(p: Record<string, any> | null | undefined): string {
  return texto(totais(p)["origem"]);
}

/** Proposta veio da plataforma antiga? */
export function ehPlataformaAntiga(p: Record<string, any> | null | undefined): boolean {
  if (origemProposta(p) === "plataforma_antiga") return true;
  const n = Number(texto(p?.["numero"]).replace(/\D/g, "")) || 0;
  return n >= NUMERO_LEGADO_MIN && n <= NUMERO_LEGADO_MAX;
}

/**
 * Proposta importada que já tem OV no SAP: não recalcular preços nem reenviar
 * a ordem de venda.
 */
export function bloqueiaReenvioSap(p: Record<string, any> | null | undefined): boolean {
  return ehPlataformaAntiga(p) && Boolean(texto(p?.["sap_ov_numero"]) || texto(p?.["numero_sap"]));
}
