/**
 * Alíquotas oficiais de PIS+COFINS. O SAP devolve só os VALORES (arredondados a
 * centavos), então a alíquota derivada oscila (9,26%, 9,27%) em itens baratos.
 * Quando a diferença é só de arredondamento, usamos a alíquota oficial.
 *
 * Módulo client-safe: também é usado na exibição (PDF/detalhe) para normalizar
 * snapshots antigos gravados antes da correção no cálculo.
 */
export const PIS_COFINS_OFICIAIS = [0, 0.0365, 0.0925];

export function encaixarPisCofins(bruta: number): number | null {
  if (!Number.isFinite(bruta) || bruta < 0) return null;
  const alvo = PIS_COFINS_OFICIAIS.find((a) => Math.abs(bruta - a) <= 0.0015);
  return alvo ?? Math.round(bruta * 1e6) / 1e6;
}

/** Normaliza um valor possivelmente nulo vindo do snapshot da proposta. */
export function normalizarPisCofins(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return encaixarPisCofins(n);
}
