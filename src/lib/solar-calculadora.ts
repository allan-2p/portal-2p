/**
 * Calculadora 2P — motor de quantificação de estruturas (somente 2P Solar).
 *
 * Entrada: módulo (dimensões), quantidade de painéis, orientação, número de
 * fileiras, trilho e suporte escolhidos. Saída: lista de componentes com
 * quantidades (trilhos/barras, grampos, terminais, junções e fixadores).
 *
 * Todas as constantes usadas aqui vêm de `solar_calc_config` (moderação →
 * 2P Solar → Regras de Propostas → Calculadora 2P) e podem ser ajustadas sem
 * alterar o código.
 */

export type SolarModulo = {
  id: string;
  nome: string;
  largura: number | null;
  altura: number | null;
  espessura: number | null;
  personalizado: boolean;
  ativo: boolean;
  ordem: number;
};

export type SolarTrilho = {
  id: string;
  legado_id: number | null;
  nome: string;
  familia: string;
  codigo_sap: string | null;
  laje: boolean;
  orientacao_fixa: string | null;
  suporte_fixo_legado: number | null;
  ativo: boolean;
  ordem: number;
  /** Códigos de produto por comprimento de barra (de-para do quantificador). */
  cod_4800?: string | null;
  cod_3600?: string | null;
  cod_2400?: string | null;
  cod_2700?: string | null;
};

export type SolarSuporte = {
  id: string;
  legado_id: number | null;
  nome: string;
  codigo_sap: string | null;
  /** Fixadores sempre em múltiplos deste número (ex.: par de suportes). */
  multiplo: number;
  /** Suportes de laje/solo não consomem barra de trilho extra. */
  usa_barra: boolean;
  ativo: boolean;
  ordem: number;
  /** Telhado Smart / mini-trilho (não usa barras 2P-TC). */
  smart?: boolean;
  /** Código complementar do fixador (ex.: 2P-LPM10). */
  cod_extra?: string | null;
  /** Código do mini-trilho usado nos suportes Smart. */
  cod_mini_trilho?: string | null;
};

export type SolarCalcConfig = {
  folga_paineis: number;
  balanco_ponta: number;
  barras_longas: number[];
  barra_curta_padrao: number;
  barra_curta_larga: number;
  largura_limite: number;
  altura_min: number;
  largura_min: number;
  espessura_min: number;
  espessura_max: number;
  limite_paineis_todos_trilhos: number;
  cod_grampo_intermediario: string;
  cod_grampo_final: string;
  cod_terminal_aterramento: string;
  cod_juncao: string;
  cod_kit_parafuso_smart: string;
  cod_terminal_m8: string;
  cod_terminal_zmi: string;
  cod_terminal_zmil: string;
};

export const SOLAR_CALC_CONFIG_FALLBACK: SolarCalcConfig = {
  folga_paineis: 20,
  balanco_ponta: 40,
  barras_longas: [6650, 4800, 3600],
  barra_curta_padrao: 2400,
  barra_curta_larga: 2700,
  largura_limite: 1200,
  altura_min: 1500,
  largura_min: 800,
  espessura_min: 30,
  espessura_max: 35,
  limite_paineis_todos_trilhos: 50,
  cod_grampo_intermediario: "2P-GI35",
  cod_grampo_final: "2P-GFA",
  cod_terminal_aterramento: "2P-GAT",
  cod_juncao: "2P-J100",
  cod_kit_parafuso_smart: "100000052",
  cod_terminal_m8: "2P-M8",
  cod_terminal_zmi: "2P-ZMI",
  cod_terminal_zmil: "2P-ZMIL",
};


/** Retrato (painel em pé) ou Paisagem (painel deitado). */
export type Orientacao = "R" | "P";

export type CalcInput = {
  modulo: Pick<SolarModulo, "largura" | "altura" | "espessura" | "nome">;
  paineis: number;
  fileiras: number;
  orientacao: Orientacao;
  trilho: SolarTrilho | null;
  suporte: SolarSuporte | null;
  config: SolarCalcConfig;
};

export type CalcComponente = {
  chave: string;
  codigo: string | null;
  descricao: string;
  quantidade: number;
  detalhe?: string;
};

export type CalcResultado = {
  ok: boolean;
  erros: string[];
  avisos: string[];
  /** Painéis por fileira (a última pode ter menos). */
  distribuicao: number[];
  /** Comprimento linear de cada fileira, em mm. */
  comprimentos: number[];
  componentes: CalcComponente[];
};

const ceil = (n: number) => Math.ceil(Number.isFinite(n) ? n : 0);

/**
 * Distribui os painéis entre as fileiras da forma mais equilibrada possível.
 * Ex.: 22 painéis em 4 fileiras -> [6, 6, 5, 5].
 */
export function distribuirPaineis(paineis: number, fileiras: number): number[] {
  const f = Math.max(1, Math.floor(fileiras));
  const p = Math.max(0, Math.floor(paineis));
  const base = Math.floor(p / f);
  const resto = p % f;
  return Array.from({ length: f }, (_, i) => base + (i < resto ? 1 : 0)).filter((n) => n > 0);
}

/**
 * Comprimento linear de uma fileira, em mm:
 *   n * lado + (n - 1) * folga + 2 * balanço
 * onde `lado` é a largura do módulo em retrato e a altura em paisagem.
 */
export function comprimentoFileira(
  n: number,
  lado: number,
  cfg: Pick<SolarCalcConfig, "folga_paineis" | "balanco_ponta">,
): number {
  if (n <= 0) return 0;
  return n * lado + (n - 1) * cfg.folga_paineis + 2 * cfg.balanco_ponta;
}

/**
 * Combinação de barras para cobrir um comprimento, usando primeiro as barras
 * longas disponíveis e completando com a barra curta.
 */
export function barrasParaComprimento(
  comprimento: number,
  cfg: SolarCalcConfig,
  larga: boolean,
): { tamanho: number; qtd: number }[] {
  const curta = larga ? cfg.barra_curta_larga : cfg.barra_curta_padrao;
  const tamanhos = [...cfg.barras_longas].sort((a, b) => b - a);
  const out: { tamanho: number; qtd: number }[] = [];
  let restante = comprimento;
  for (const t of tamanhos) {
    if (restante <= 0) break;
    const qtd = Math.floor(restante / t);
    if (qtd > 0) {
      out.push({ tamanho: t, qtd });
      restante -= qtd * t;
    }
  }
  if (restante > 0) {
    const menor = tamanhos[tamanhos.length - 1] ?? curta;
    if (restante <= curta) out.push({ tamanho: curta, qtd: 1 });
    else out.push({ tamanho: menor, qtd: ceil(restante / menor) });
  }
  // Agrupa tamanhos repetidos
  const mapa = new Map<number, number>();
  for (const b of out) mapa.set(b.tamanho, (mapa.get(b.tamanho) ?? 0) + b.qtd);
  return [...mapa.entries()]
    .map(([tamanho, qtd]) => ({ tamanho, qtd }))
    .sort((a, b) => b.tamanho - a.tamanho);
}

/** Valida as dimensões do módulo contra os limites configurados. */
export function validarModulo(
  m: CalcInput["modulo"],
  cfg: SolarCalcConfig,
): { erros: string[]; avisos: string[] } {
  const erros: string[] = [];
  const avisos: string[] = [];
  const largura = Number(m.largura ?? 0);
  const altura = Number(m.altura ?? 0);
  const espessura = Number(m.espessura ?? 0);
  if (!largura || !altura || !espessura) erros.push("Informe largura, altura e espessura do módulo.");
  if (largura && largura < cfg.largura_min) erros.push(`Largura mínima de ${cfg.largura_min} mm.`);
  if (altura && altura < cfg.altura_min) erros.push(`Altura mínima de ${cfg.altura_min} mm.`);
  if (espessura && (espessura < cfg.espessura_min || espessura > cfg.espessura_max))
    erros.push(`Espessura fora da faixa suportada (${cfg.espessura_min}–${cfg.espessura_max} mm).`);
  if (largura > cfg.largura_limite)
    avisos.push(
      `Módulo largo (> ${cfg.largura_limite} mm): a barra curta usada passa a ser de ${cfg.barra_curta_larga} mm.`,
    );
  return { erros, avisos };
}

/** Executa a quantificação completa da estrutura. */
export function calcularEstrutura(input: CalcInput): CalcResultado {
  const { modulo, paineis, fileiras, orientacao, trilho, suporte, config: cfg } = input;
  const { erros, avisos } = validarModulo(modulo, cfg);

  if (!paineis || paineis < 1) erros.push("Informe a quantidade de painéis.");
  if (!fileiras || fileiras < 1) erros.push("Informe a quantidade de fileiras.");
  if (!trilho) erros.push("Selecione o tipo de trilho.");
  if (!suporte) erros.push("Selecione o tipo de fixação/suporte.");
  if (paineis > cfg.limite_paineis_todos_trilhos)
    avisos.push(
      `Acima de ${cfg.limite_paineis_todos_trilhos} painéis: confira a disponibilidade do trilho escolhido.`,
    );

  if (erros.length)
    return { ok: false, erros, avisos, distribuicao: [], comprimentos: [], componentes: [] };

  const largura = Number(modulo.largura);
  const altura = Number(modulo.altura);
  const orient: Orientacao = (trilho?.orientacao_fixa as Orientacao) || orientacao;
  const lado = orient === "P" ? altura : largura;
  const larga = largura > cfg.largura_limite;

  const distribuicao = distribuirPaineis(paineis, fileiras);
  const comprimentos = distribuicao.map((n) => comprimentoFileira(n, lado, cfg));

  // Duas linhas de trilho por fileira de painéis.
  const LINHAS_POR_FILEIRA = 2;

  const barras = new Map<number, number>();
  let juncoes = 0;
  let fixadores = 0;

  comprimentos.forEach((c) => {
    const combinacao = barrasParaComprimento(c, cfg, larga);
    const barrasPorLinha = combinacao.reduce((s, b) => s + b.qtd, 0);
    for (const b of combinacao)
      barras.set(b.tamanho, (barras.get(b.tamanho) ?? 0) + b.qtd * LINHAS_POR_FILEIRA);
    juncoes += Math.max(0, barrasPorLinha - 1) * LINHAS_POR_FILEIRA;

    // Fixadores: um a cada `largura_limite` de trilho, no mínimo 2 por linha,
    // sempre arredondado para o múltiplo do suporte escolhido.
    const bruto = Math.max(2, ceil(c / cfg.largura_limite) + 1);
    const mult = Math.max(1, suporte?.multiplo ?? 2);
    fixadores += ceil(bruto / mult) * mult * LINHAS_POR_FILEIRA;
  });

  const grampoIntermediario = distribuicao.reduce((s, n) => s + Math.max(0, n - 1), 0) * LINHAS_POR_FILEIRA;
  const grampoFinal = distribuicao.length * 2 * LINHAS_POR_FILEIRA;
  const terminais = distribuicao.length;

  const componentes: CalcComponente[] = [];

  if (suporte?.usa_barra !== false) {
    for (const [tamanho, qtd] of [...barras.entries()].sort((a, b) => b[0] - a[0])) {
      componentes.push({
        chave: `trilho-${tamanho}`,
        codigo: trilho?.codigo_sap ?? null,
        descricao: `${trilho?.nome ?? "Trilho"} — barra ${tamanho} mm`,
        quantidade: qtd,
      });
    }
    if (juncoes > 0)
      componentes.push({
        chave: "juncao",
        codigo: cfg.cod_juncao,
        descricao: "Junção de trilho",
        quantidade: juncoes,
      });
  }

  componentes.push({
    chave: "suporte",
    codigo: suporte?.codigo_sap ?? null,
    descricao: suporte?.nome ?? "Fixação",
    quantidade: fixadores,
    detalhe: `Múltiplo de ${Math.max(1, suporte?.multiplo ?? 2)}`,
  });
  componentes.push({
    chave: "grampo-intermediario",
    codigo: cfg.cod_grampo_intermediario,
    descricao: "Grampo intermediário",
    quantidade: grampoIntermediario,
  });
  componentes.push({
    chave: "grampo-final",
    codigo: cfg.cod_grampo_final,
    descricao: "Grampo final",
    quantidade: grampoFinal,
  });
  componentes.push({
    chave: "terminal-aterramento",
    codigo: cfg.cod_terminal_aterramento,
    descricao: "Terminal de aterramento",
    quantidade: terminais,
  });

  return {
    ok: true,
    erros: [],
    avisos,
    distribuicao,
    comprimentos,
    componentes: componentes.filter((c) => c.quantidade > 0),
  };
}
