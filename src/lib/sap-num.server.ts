/**
 * Parser numérico central das respostas do SAP + detector de ambiguidade
 * milhar/decimal.
 *
 * Contexto do incidente: o SAP devolve decimais com PONTO ("8.856" = 8,856 kg,
 * campos QUAN têm 3 casas). Um parser que trate o ponto como separador de
 * milhar transforma 8,856 kg em 8.856 kg — erro de 1000×, que já inflou peso de
 * frete e saldos de estoque.
 *
 * Regra: ponto só é milhar quando existe vírgula decimal na mesma string
 * ("1.234,56"). Toda string do formato `\d+\.\d{3}` (sem vírgula) é
 * AMBÍGUA — interpretada como decimal, mas registrada para alerta.
 */

export type SuspeitaNumerica = {
  /** Nome do campo do SAP (ex.: PESO_LIQUIDO, EST_LIVRE_1000). */
  campo: string;
  /** Texto exatamente como veio do SAP. */
  bruto: string;
  /** Valor adotado (leitura decimal). */
  interpretado: number;
  /** Valor que sairia se o ponto fosse lido como milhar — o risco de 1000×. */
  seFosseMilhar: number;
  motivo: "ponto-com-3-digitos";
};

/** Ponto seguido de exatamente 3 dígitos e sem vírgula: decimal ou milhar? */
const AMBIGUO = /^-?\d+\.\d{3}$/;

const MAX_SUSPEITAS = 200;
let suspeitas: SuspeitaNumerica[] = [];

/** Zera o coletor antes de uma chamada ao SAP. */
export function iniciarColetaNumerica(): void {
  suspeitas = [];
}

/** Lê e limpa as suspeitas acumuladas desde o último `iniciarColetaNumerica`. */
export function coletarSuspeitasNumericas(): SuspeitaNumerica[] {
  const out = suspeitas;
  suspeitas = [];
  return out;
}

function registrar(s: SuspeitaNumerica) {
  if (suspeitas.length < MAX_SUSPEITAS) suspeitas.push(s);
}

/**
 * Converte um número do SAP. Aceita negativo com sinal no fim ("123-").
 * `campo` é opcional e serve apenas para o log de ambiguidade.
 */
export function numSap(v: unknown, campo?: string): number {
  if (v == null) return 0;
  let s = String(v).trim().replace(/\s/g, "");
  if (!s) return 0;
  if (s.endsWith("-")) s = "-" + s.slice(0, -1);
  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return 0;

  const temVirgula = s.includes(",");
  const n = parseFloat(temVirgula ? s.replace(/\./g, "").replace(",", ".") : s);
  const valor = Number.isFinite(n) ? n : 0;

  if (!temVirgula && AMBIGUO.test(s)) {
    const milhar = parseFloat(s.replace(/\./g, ""));
    registrar({
      campo: campo ?? "?",
      bruto: String(v).trim().slice(0, 40),
      interpretado: valor,
      seFosseMilhar: Number.isFinite(milhar) ? milhar : 0,
      motivo: "ponto-com-3-digitos",
    });
  }

  return valor;
}

/**
 * Registra em `integration_logs` (nível warn) as leituras ambíguas de uma
 * chamada ao SAP. Best effort: nunca derruba a operação principal.
 */
export async function alertarSuspeitasNumericas(
  contexto: string,
  extra?: Record<string, unknown>,
): Promise<number> {
  const lista = coletarSuspeitasNumericas();
  if (!lista.length) return 0;
  try {
    const { logIntegrationEvent } = await import("./integration-logs.server");
    await logIntegrationEvent({
      slug: "sap",
      level: "warn",
      event: "num-ambiguo",
      message: `${lista.length} valor(es) do SAP com ponto seguido de 3 dígitos em ${contexto} — lidos como decimal (risco de leitura 1000× maior).`,
      detail: { contexto, total: lista.length, amostra: lista.slice(0, 20), ...(extra ?? {}) },
    });
  } catch {
    /* observabilidade não pode quebrar a integração */
  }
  console.warn(`[sap:num-ambiguo] ${contexto}: ${lista.length} valor(es)`, lista.slice(0, 5));
  return lista.length;
}

/**
 * Compara os valores novos com os já gravados e aponta variações próximas de
 * 1000× (para mais ou para menos) — assinatura clássica do bug de milhar.
 */
export function detectarSaltosDeEscala(
  novos: Map<string, number>,
  anteriores: Map<string, number>,
  toleranciaPct = 0.05,
): { chave: string; antes: number; depois: number; fator: number }[] {
  const out: { chave: string; antes: number; depois: number; fator: number }[] = [];
  for (const [chave, depois] of novos) {
    const antes = anteriores.get(chave);
    if (!antes || !depois) continue;
    const fator = depois / antes;
    const perto = (f: number, alvo: number) => Math.abs(f - alvo) / alvo <= toleranciaPct;
    if (perto(fator, 1000) || perto(fator, 1 / 1000)) {
      out.push({ chave, antes, depois, fator: Number(fator.toFixed(4)) });
    }
  }
  return out;
}
