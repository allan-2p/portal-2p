/**
 * Regras de classificação por prefixo da descrição (espelha o legado tbl_prj_prd_calc).
 * Módulo client-safe: usado tanto na sincronização (servidor) quanto na auditoria (UI).
 */
export type TipoRegra = { prefixo: string; tipo: string };

export const TIPO_PREFIXOS: TipoRegra[] = [
  { prefixo: "MOD", tipo: "Módulo" },
  { prefixo: "PAINEL", tipo: "Módulo" },
  { prefixo: "INV", tipo: "Inversor" },
  { prefixo: "MICRO", tipo: "Microinversor" },
  { prefixo: "EST", tipo: "Estrutura" },
  { prefixo: "ESTRUT", tipo: "Estrutura" },
  { prefixo: "CAB", tipo: "Cabo" },
  { prefixo: "CONECTOR", tipo: "Conector" },
  { prefixo: "STR", tipo: "String Box" },
  { prefixo: "BAT", tipo: "Bateria" },
  { prefixo: "CARR", tipo: "Carregador" },
  { prefixo: "WALLBOX", tipo: "Carregador" },
  { prefixo: "SERV", tipo: "Serviço" },
  { prefixo: "FRETE", tipo: "Frete" },
];

export const TIPO_FALLBACK = "Outros";

function normalizar(descricao: string): string {
  return (descricao || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export type ClassificacaoDetalhe = {
  tipo: string;
  /** Prefixo que casou, ou null quando caiu no fallback. */
  prefixo: string | null;
  /** Prefixos que também casariam (mais curtos) — indicam regras ambíguas. */
  concorrentes: string[];
  /** true quando nenhuma regra casou e o item foi para "Outros". */
  fallback: boolean;
  /** Descrição normalizada usada na comparação. */
  normalizada: string;
};

/**
 * Classifica com "longest prefix wins": o prefixo mais específico vence,
 * evitando que uma regra curta (EST) roube itens de uma mais longa (ESTRUT).
 */
export function classificarDetalhado(descricao: string): ClassificacaoDetalhe {
  const d = normalizar(descricao);
  const matches = TIPO_PREFIXOS.filter((r) => d.startsWith(normalizar(r.prefixo))).sort(
    (a, b) => b.prefixo.length - a.prefixo.length,
  );

  if (matches.length === 0) {
    return { tipo: TIPO_FALLBACK, prefixo: null, concorrentes: [], fallback: true, normalizada: d };
  }

  const winner = matches[0]!;
  return {
    tipo: winner.tipo,
    prefixo: winner.prefixo,
    concorrentes: matches
      .slice(1)
      .filter((r) => r.tipo !== winner.tipo)
      .map((r) => r.prefixo),
    fallback: false,
    normalizada: d,
  };
}

export function classificarTipo(descricao: string): string {
  return classificarDetalhado(descricao).tipo;
}

export type RegraProblema = {
  nivel: "erro" | "aviso";
  prefixo: string;
  mensagem: string;
};

/** Valida o conjunto de regras: duplicidades, conflitos e sombreamentos. */
export function validarRegras(regras: TipoRegra[] = TIPO_PREFIXOS): RegraProblema[] {
  const problemas: RegraProblema[] = [];
  const vistos = new Map<string, string>();

  for (const r of regras) {
    const p = normalizar(r.prefixo);
    if (!p) {
      problemas.push({ nivel: "erro", prefixo: r.prefixo, mensagem: "Prefixo vazio." });
      continue;
    }
    if (!r.tipo?.trim()) {
      problemas.push({ nivel: "erro", prefixo: r.prefixo, mensagem: "Tipo vazio." });
    }
    const anterior = vistos.get(p);
    if (anterior !== undefined) {
      problemas.push({
        nivel: anterior === r.tipo ? "aviso" : "erro",
        prefixo: r.prefixo,
        mensagem:
          anterior === r.tipo
            ? "Prefixo duplicado com o mesmo tipo (regra redundante)."
            : `Prefixo duplicado com tipos diferentes: "${anterior}" e "${r.tipo}".`,
      });
    } else {
      vistos.set(p, r.tipo);
    }
  }

  for (const a of regras) {
    for (const b of regras) {
      if (a === b) continue;
      const pa = normalizar(a.prefixo);
      const pb = normalizar(b.prefixo);
      if (pa && pb && pa !== pb && pb.startsWith(pa) && a.tipo !== b.tipo) {
        problemas.push({
          nivel: "aviso",
          prefixo: b.prefixo,
          mensagem: `"${a.prefixo}" (${a.tipo}) é prefixo de "${b.prefixo}" (${b.tipo}); vale o prefixo mais específico.`,
        });
      }
    }
  }

  return problemas;
}
