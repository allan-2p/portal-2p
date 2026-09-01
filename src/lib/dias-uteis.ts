/**
 * Soma de dias úteis — mesma regra da plataforma antiga.
 *
 * Usada na estimativa de entrega: ao entrar em "Coletado", o pedido ganha
 * `data da coleta + prazo do frete em dias ÚTEIS`. Sábado e domingo são
 * pulados; feriados NÃO são considerados (a antiga também não considerava,
 * e mudar isso deslocaria todas as estimativas herdadas).
 */

/** `YYYY-MM-DD` de uma data, sem depender do fuso do servidor. */
export function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * Soma `dias` dias úteis a `base` (um dia por vez, pulando sábado/domingo).
 * Prazo zero/negativo devolve a própria data-base.
 */
export function adicionarDiasUteis(base: Date | string, dias: number): string {
  const d = new Date(typeof base === "string" ? `${base.slice(0, 10)}T12:00:00Z` : base.toISOString());
  let restantes = Math.max(0, Math.floor(Number(dias) || 0));
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) restantes--;
  }
  return isoDate(d);
}
