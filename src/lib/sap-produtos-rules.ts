/**
 * Regras de classificação por prefixo da descrição (espelha o legado da calculadora).
 * Módulo client-safe: usado tanto na sincronização (servidor) quanto na auditoria (UI).
 *
 * A ordem importa: vence a PRIMEIRA regra que casar (o legado avaliava em cascata).
 */
export type TipoRegra = { prefixo: string; tipo: string };

export const TIPO_LABELS: Record<string, string> = {
  trilho_reforcado: "Trilhos Reforçados",
  trilho_light: "Trilhos Light",
  trilho: "Trilhos",
  juncao: "Junções",
  grampo: "Grampos",
  smart10: "Smart10",
  carregador_veicular: "Carregador Veicular",
  acessorio: "Acessórios",
  fixadores: "Fixadores",
};

/** Ordem de exibição do catálogo (equivalente à ordenação da calculadora). */
export const TIPO_ORDEM: Record<string, number> = {
  trilho: 1,
  trilho_reforcado: 2,
  trilho_light: 3,
  juncao: 4,
  grampo: 5,
  smart10: 6,
  carregador_veicular: 7,
  fixadores: 8,
  acessorio: 9,
};

export const TIPO_PREFIXOS: TipoRegra[] = [
  { prefixo: "2P-TCR", tipo: "trilho_reforcado" },
  { prefixo: "2P-TCL", tipo: "trilho_light" },
  { prefixo: "2P-T", tipo: "trilho" },
  { prefixo: "2P-J", tipo: "juncao" },
  // Exceções do grupo "2P-G": G304 e GAN são fixadores, o restante é grampo.
  { prefixo: "2P-G304", tipo: "fixadores" },
  { prefixo: "2P-GAN", tipo: "fixadores" },
  { prefixo: "2P-G", tipo: "grampo" },
  { prefixo: "2P-LMET", tipo: "fixadores" },
  { prefixo: "2P-P", tipo: "fixadores" },
  { prefixo: "2P-Z", tipo: "fixadores" },
  { prefixo: "2P-X", tipo: "fixadores" },
  { prefixo: "2P-S", tipo: "fixadores" },
  { prefixo: "2P-L", tipo: "fixadores" },
  { prefixo: "2P-MT", tipo: "smart10" },
  { prefixo: "CARREGADOR VEICULAR", tipo: "carregador_veicular" },
];

export const TIPO_FALLBACK = "acessorio";

function normalizar(descricao: string): string {
  return (descricao || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export type ClassificacaoDetalhe = {
  tipo: string;
  /** Rótulo amigável do tipo. */
  tipoDescricao: string;
  /** Prefixo que casou, ou null quando caiu no fallback. */
  prefixo: string | null;
  /** Outros prefixos que também casariam com tipo diferente — regras ambíguas. */
  concorrentes: string[];
  /** true quando nenhuma regra casou e o item foi para "Acessórios". */
  fallback: boolean;
  /** Descrição normalizada usada na comparação. */
  normalizada: string;
};

/** Classifica pela primeira regra que casa (cascata), respeitando as exceções acima. */
export function classificarDetalhado(descricao: string): ClassificacaoDetalhe {
  const d = normalizar(descricao);
  const matches = TIPO_PREFIXOS.filter((r) => d.includes(normalizar(r.prefixo)));

  if (matches.length === 0) {
    return {
      tipo: TIPO_FALLBACK,
      tipoDescricao: TIPO_LABELS[TIPO_FALLBACK]!,
      prefixo: null,
      concorrentes: [],
      fallback: true,
      normalizada: d,
    };
  }

  const winner = matches[0]!;
  return {
    tipo: winner.tipo,
    tipoDescricao: TIPO_LABELS[winner.tipo] ?? winner.tipo,
    prefixo: winner.prefixo,
    concorrentes: matches.slice(1).filter((r) => r.tipo !== winner.tipo).map((r) => r.prefixo),
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

/** Valida o conjunto de regras: prefixos vazios, duplicidades e sombreamentos. */
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

  // Sombreamento: uma regra anterior mais genérica engole uma posterior mais específica.
  regras.forEach((a, i) => {
    regras.slice(i + 1).forEach((b) => {
      const pa = normalizar(a.prefixo);
      const pb = normalizar(b.prefixo);
      if (pa && pb && pa !== pb && pb.includes(pa) && a.tipo !== b.tipo) {
        problemas.push({
          nivel: "aviso",
          prefixo: b.prefixo,
          mensagem: `"${a.prefixo}" (${a.tipo}) vem antes e engloba "${b.prefixo}" (${b.tipo}); mova a regra mais específica para cima.`,
        });
      }
    });
  });

  return problemas;
}
