/**
 * Formatação de datas em pt-BR sem o "um dia a menos".
 *
 * Datas puras (`YYYY-MM-DD`, como `estimativa_entrega` ou a previsão de
 * despacho do SAP) são interpretadas pelo JS como meia-noite UTC. No fuso de
 * São Paulo (UTC-3) isso vira 21h do dia anterior e a tela mostrava a data
 * errada. Aqui esse formato é ancorado ao MEIO-DIA local, então o dia exibido
 * é sempre o dia gravado. Timestamps completos seguem o comportamento normal.
 */

/** `true` quando o valor é uma data pura `YYYY-MM-DD` (com ou sem sufixo). */
const soData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

/** Converte o valor em `Date`, ancorando datas puras ao meio-dia local. */
export function paraData(v?: string | number | Date | null): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") return new Date(v);
  const s = String(v).trim();
  const d = soData(s) ? new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Data em `dd/mm/aaaa`.
 *
 * Formatação manual de propósito: no runtime de servidor (edge) o ICU pode não
 * ter os dados de `pt-BR` e o `Intl` cai para `en-US`, invertendo dia/mês
 * (08/09 virava 09/08). Montando os campos na mão o formato é sempre BR.
 */
export function fmtDataBR(
  v?: string | number | Date | null,
  fallback = "—",
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = paraData(v);
  if (!d) return fallback;
  if (opts) return d.toLocaleDateString("pt-BR", opts);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Data e hora em `dd/mm/aa, hh:mm`. */
export function fmtDataHoraBR(v?: string | number | Date | null, fallback = "—"): string {
  const d = paraData(v);
  if (!d) return fallback;
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}, ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

