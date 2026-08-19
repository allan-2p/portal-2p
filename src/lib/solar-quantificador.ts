/**
 * Quantificador 2P Solar — porta fiel da lógica de "Realizar Proposta"
 * (`tipo_calc = 'S'`) da calculadora antiga (`calculadora::tableOrca`,
 * linhas 2326-3000 do PHP).
 *
 * Dado o MÓDULO e as FILEIRAS, quantifica os componentes da estrutura de
 * fixação (trilhos, junções, grampos, fixadores, mini-trilhos, terminais).
 * NÃO calcula preço — o preço vem depois da RFC SAP `ZNFE_OV_SIMULAR`.
 *
 * Unidades: largura/altura/espessura em mm; distância/balanço em METROS.
 * Cada regra carrega o comentário `// php:<linha>` apontando o original.
 *
 * A resolução de SKU (chave lógica -> código do catálogo) é feita aqui a
 * partir dos cadastros do portal: códigos por comprimento no trilho, código
 * do fixador/mini-trilho no suporte e códigos gerais na configuração.
 */

import type { SolarCalcConfig, SolarSuporte, SolarTrilho, Orientacao } from "./solar-calculadora";

export type QuantModulo = { largura: number; altura: number; espessura: number };

export type QuantFileira = {
  trilho: SolarTrilho;
  suporte: SolarSuporte;
  /** Painéis nesta fileira. */
  qtd_paineis: number;
  /** Nº de fileiras idênticas (multiplicador). */
  qtd_fileiras: number;
  orientacao: Orientacao;
  /** Metros — distância entre apoios (fixadores). */
  distancia: number;
  /** Metros — balanço nas pontas. */
  balanco: number;
};

export type QuantContexto = {
  /** 'S' = aceita barras longas (4800); 'N' = só barras curtas. */
  todos_trilhos: "S" | "N";
  /** 1 = microinversor, 2 = otimizador, 3 = string. */
  tipo_gerador: number;
  /** Modelo do microinversor (1..5) quando tipo_gerador = 1. */
  modelo_gerador: number;
  /** Quantidade de microinversores/otimizadores. */
  microinversores: number;
};

export type QuantItem = {
  chave: string;
  codigo: string | null;
  descricao: string;
  quantidade: number;
};

export type QuantResultado = {
  ok: boolean;
  erros: string[];
  avisos: string[];
  /** Painéis por fileira expandidos (para exibição). */
  distribuicao: number[];
  /** Comprimento linear de cada fileira, em mm. */
  comprimentos: number[];
  itens: QuantItem[];
};

/** Folga entre painéis e balanço fixo das pontas (mm). php:2440 */
const FOLGA = 20;
const PONTA = 40;

const ehSmart = (s: SolarSuporte) => !!s.smart || s.usa_barra === false;

/** Comprimento linear necessário da fileira, em mm. php:2440-2444 */
export function calcularNt(f: QuantFileira, m: QuantModulo): number {
  if (f.qtd_fileiras <= 0) return 0;
  const dim = f.orientacao === "R" ? m.largura : m.altura; // R = largura, P = altura
  return f.qtd_paineis * dim + ((f.qtd_paineis - 1) * FOLGA + 2 * PONTA);
}

/** Família de SKU do trilho: reforçado -> trilhoR, light -> trilhoL. php:2448 */
function familiaTrilho(t: SolarTrilho): string {
  if (t.familia === "reforcado") return "trilhoR";
  if (t.familia === "light") return "trilhoL";
  return "trilho";
}

function codigoBarra(t: SolarTrilho, tamanho: number): string | null {
  const map: Record<number, string | null | undefined> = {
    4800: t.cod_4800,
    3600: t.cod_3600,
    2400: t.cod_2400,
    2700: t.cod_2700,
  };
  return map[tamanho] ?? null;
}

/** Quantifica UMA fileira -> componentes lógicos com quantidade. */
function quantificarFileira(
  f: QuantFileira,
  m: QuantModulo,
  ctx: QuantContexto,
  cfg: SolarCalcConfig,
  primeira: boolean,
): QuantItem[] {
  const out: QuantItem[] = [];
  const add = (chave: string, codigo: string | null, descricao: string, q: number) => {
    if (q > 0) out.push({ chave, codigo, descricao, quantidade: q });
  };
  const qf = f.qtd_fileiras;


  // Trilhos solo/paisagem (legado 4 e 5) não usam distância/balanço. php:2408-2411
  let distancia = f.distancia;
  let balanco = f.balanco;
  if (f.trilho.legado_id === 4 || f.trilho.legado_id === 5) {
    distancia = 0;
    balanco = 0;
  }

  const nt = calcularNt(f, m);
  const larguraEstreita = m.largura <= cfg.largura_limite; // php:2474-2483
  const barraCurta = larguraEstreita ? cfg.barra_curta_padrao : cfg.barra_curta_larga;
  const fam = familiaTrilho(f.trilho);

  let trilho_4800 = 0;
  let trilho_curto = 0;

  if (!ehSmart(f.suporte)) {
    // ===================== TELHADO COM TRILHO (2P-TC) =====================

    // Barra longa 4800 — só com todos_trilhos = 'S' e módulo estreito. php:2511-2564
    if (ctx.todos_trilhos === "S" && larguraEstreita) {
      trilho_4800 = Math.round(nt / 4800) * 2 * qf; // *2 = 2 trilhos por linha (topo + base)
    }

    // Resíduo por trilho após as barras de 4800. php:2488
    const ult = qf > 0 ? nt - (trilho_4800 * 4800) / (2 * qf) : nt;

    if (ctx.todos_trilhos === "S" && larguraEstreita) {
      // Branch A — resto em barras curtas. php:2526-2529 / 2551-2554
      trilho_curto = Math.ceil(((nt - (trilho_4800 / 2) * 4800) / barraCurta) * 2) * qf;
    } else if (ult < 1200) {
      // Branch B — só barras curtas. php:2586-2606
      trilho_curto = Math.ceil(ult / barraCurta) * qf;
    } else {
      trilho_curto = Math.abs(Math.ceil(Math.ceil((ult * 2) / barraCurta)) * qf);
    }
    trilho_curto = Math.max(0, trilho_curto);

    add(`${fam}_4800`, codigoBarra(f.trilho, 4800), `${f.trilho.nome} — barra 4800 mm`, trilho_4800);
    add(
      `${fam}_${barraCurta}`,
      codigoBarra(f.trilho, barraCurta),
      `${f.trilho.nome} — barra ${barraCurta} mm`,
      trilho_curto,
    );

    // Junção / emenda (2P-J). php:2611-2621
    const somaTrilhos = trilho_4800 + trilho_curto;
    if (somaTrilhos > 2) {
      add(
        "juncao",
        cfg.cod_juncao,
        "Junção de trilho",
        (Math.ceil(somaTrilhos / (2 * qf)) * 2 - 2) * qf,
      );
    }

    // Grampos. php:2622-2655
    if (m.espessura >= cfg.espessura_min && m.espessura <= cfg.espessura_max) {
      add(
        "grampo_intermediario",
        cfg.cod_grampo_intermediario,
        "Grampo intermediário",
        (f.qtd_paineis - 1) * 2 * qf,
      );
      add("grampo_final", cfg.cod_grampo_final, "Grampo final", 4 * qf);
    }
    add("terminal_aterramento", cfg.cod_terminal_aterramento, "Terminal de aterramento", qf);

    // Fixadores por suporte. php:2656-2696
    const mult = Math.max(1, f.suporte.multiplo || 2);
    const base =
      distancia > 0
        ? Math.ceil(Math.ceil((nt - 2 * balanco * 1000) / (distancia * 1000) + 1) * qf)
        : 2 * qf;
    let fix = base * mult;
    if (fix <= 4 && mult !== 1) fix = 4; // piso de 4 (exceto laje/multiplo 1). php:2686
    add(`fixador_sup${f.suporte.legado_id ?? f.suporte.id}`, f.suporte.codigo_sap, f.suporte.nome, fix);

    // Extras do suporte: 2P-LPM10 (sup. 4/19) e 2P-PSI250+LPM10-45 (sup. 7). php:2692-2696
    if (f.suporte.cod_extra) {
      add(
        `fixador_extra_${f.suporte.legado_id ?? f.suporte.id}`,
        f.suporte.cod_extra,
        `${f.suporte.nome} — complemento`,
        base * 2,
      );
    }
  } else {
    // ===================== TELHADO SMART / MINI-TRILHO =====================
    // Não usa barras 2P-TC; os grampos alimentam tot_grampo. php:2794-2909
    let totGrampo = 0;
    if (m.espessura >= cfg.espessura_min && m.espessura <= cfg.espessura_max) {
      const inter = (f.qtd_paineis - 1) * 2 * qf;
      const fim = 4 * qf;
      add("grampo_intermediario", cfg.cod_grampo_intermediario, "Grampo intermediário", inter);
      add("grampo_final", cfg.cod_grampo_final, "Grampo final", fim);
      totGrampo = inter + fim; // soma grampos EXCETO GAT. php:2853-2859
    }

    // 1ª fileira com microinversor no suporte legado 9 (modelos 1..4):
    // GAT, mini-trilho e kit somam +microinversores. php:2808-2867
    const extraMicro =
      primeira &&
      (f.suporte.legado_id ?? 0) === 9 &&
      ctx.tipo_gerador === 1 &&
      [1, 2, 3, 4].includes(ctx.modelo_gerador)
        ? ctx.microinversores
        : 0;

    add(
      "terminal_aterramento",
      cfg.cod_terminal_aterramento,
      "Terminal de aterramento",
      qf + extraMicro,
    );

    // mini-trilho + kit parafuso = tot_grampo. php:2861-2909
    add(
      "mini_trilho",
      f.suporte.cod_mini_trilho ?? f.suporte.codigo_sap,
      `${f.suporte.nome} — mini trilho`,
      totGrampo + extraMicro,
    );
    add("kit_parafuso_smart", cfg.cod_kit_parafuso_smart, "Kit parafuso Smart", totGrampo + extraMicro);
  }


  // Terminais de microinversor (uma vez por projeto; ver quantificarProjeto). php:2720-2735
  if ((ctx.tipo_gerador === 1 && ctx.modelo_gerador === 5) || ctx.tipo_gerador === 2) {
    add("terminal_m8", cfg.cod_terminal_m8, "Terminal M8", ctx.microinversores);
  } else if (
    (f.suporte.legado_id ?? 0) !== 13 &&
    ctx.tipo_gerador !== 3 &&
    ctx.tipo_gerador !== 2
  ) {
    const q =
      ctx.tipo_gerador === 1 && [1, 2, 3].includes(ctx.modelo_gerador)
        ? ctx.microinversores * 2
        : ctx.microinversores;
    add("terminal_zmi", cfg.cod_terminal_zmi, "Terminal ZMI", q);
  }

  return out;
}

/** Quantifica o PROJETO inteiro (todas as fileiras) e soma por componente. */
export function quantificarProjeto(
  fileiras: QuantFileira[],
  modulo: QuantModulo,
  ctx: QuantContexto,
  cfg: SolarCalcConfig,
): QuantResultado {
  const erros: string[] = [];
  const avisos: string[] = [];

  if (!modulo.largura || !modulo.altura || !modulo.espessura)
    erros.push("Informe largura, altura e espessura do módulo.");
  if (modulo.largura && modulo.largura < cfg.largura_min)
    erros.push(`Largura mínima de ${cfg.largura_min} mm.`);
  if (modulo.altura && modulo.altura < cfg.altura_min)
    erros.push(`Altura mínima de ${cfg.altura_min} mm.`);
  if (
    modulo.espessura &&
    (modulo.espessura < cfg.espessura_min || modulo.espessura > cfg.espessura_max)
  )
    avisos.push(
      `Espessura fora da faixa ${cfg.espessura_min}–${cfg.espessura_max} mm: grampos não serão quantificados.`,
    );
  if (!fileiras.length) erros.push("Adicione ao menos uma fileira.");

  fileiras.forEach((f, i) => {
    if (!f.trilho) erros.push(`Fileira ${i + 1}: selecione o trilho.`);
    if (!f.suporte) erros.push(`Fileira ${i + 1}: selecione o suporte.`);
    if (f.qtd_paineis < 1) erros.push(`Fileira ${i + 1}: informe os módulos por fileira.`);
    if (f.qtd_fileiras < 1) erros.push(`Fileira ${i + 1}: informe a quantidade de fileiras.`);
  });

  if (erros.length)
    return { ok: false, erros: [...new Set(erros)], avisos, distribuicao: [], comprimentos: [], itens: [] };

  // todos_trilhos é forçado a 'S' acima do limite configurado. php:2377
  const totalPaineis = fileiras.reduce((s, f) => s + f.qtd_paineis * f.qtd_fileiras, 0);
  const ctxFinal: QuantContexto =
    totalPaineis > cfg.limite_paineis_todos_trilhos ? { ...ctx, todos_trilhos: "S" } : ctx;
  if (totalPaineis > cfg.limite_paineis_todos_trilhos && ctx.todos_trilhos !== "S")
    avisos.push(
      `Acima de ${cfg.limite_paineis_todos_trilhos} painéis: barras longas liberadas automaticamente.`,
    );

  const acc = new Map<string, QuantItem>();
  const distribuicao: number[] = [];
  const comprimentos: number[] = [];
  // Terminais de microinversor são calculados UMA vez no projeto. php:!isset(qtd)
  const feito = { terminal_m8: false, terminal_zmi: false };

  fileiras.forEach((f, idx) => {
    for (let k = 0; k < f.qtd_fileiras; k++) distribuicao.push(f.qtd_paineis);
    comprimentos.push(calcularNt(f, modulo));

    for (const c of quantificarFileira(f, modulo, ctxFinal, cfg, idx === 0)) {

      if (c.chave === "terminal_m8" || c.chave === "terminal_zmi") {
        if (feito[c.chave]) continue;
        feito[c.chave] = true;
      }
      const at = acc.get(c.chave);
      if (at) at.quantidade += c.quantidade;
      else acc.set(c.chave, { ...c });
    }
  });


  const itens = [...acc.values()].filter((i) => i.quantidade > 0);
  const semCodigo = itens.filter((i) => !i.codigo).map((i) => i.descricao);
  if (semCodigo.length)
    avisos.push(`Sem código de produto cadastrado: ${[...new Set(semCodigo)].join(", ")}.`);

  return { ok: true, erros: [], avisos: [...new Set(avisos)], distribuicao, comprimentos, itens };
}

/** Pendência de de/para: componente que o cálculo geraria sem código de produto. */
export type PendenciaDePara = {
  chave: string;
  descricao: string;
  /** Onde o código precisa ser cadastrado. */
  origem: "Trilhos" | "Suportes" | "Configuração da calculadora";
  /** Campo exato que está vazio. */
  campo: string;
};

/** Traduz a chave do componente no campo de cadastro que está sem código. */
function campoDePara(chave: string): Pick<PendenciaDePara, "origem" | "campo"> {
  if (/_4800$/.test(chave)) return { origem: "Trilhos", campo: "Código SAP da barra 4.800 mm" };
  if (/_3600$/.test(chave)) return { origem: "Trilhos", campo: "Código SAP da barra 3.600 mm" };
  if (/_2700$/.test(chave)) return { origem: "Trilhos", campo: "Código SAP da barra 2.700 mm" };
  if (/_2400$/.test(chave)) return { origem: "Trilhos", campo: "Código SAP da barra 2.400 mm" };
  if (chave.startsWith("fixador_extra_")) return { origem: "Suportes", campo: "Código complemento" };
  if (chave.startsWith("fixador_sup")) return { origem: "Suportes", campo: "Código SAP" };
  if (chave === "mini_trilho") return { origem: "Suportes", campo: "Código do mini trilho" };
  const cfgCampos: Record<string, string> = {
    juncao: "Código da junção",
    grampo_intermediario: "Código do grampo intermediário",
    grampo_final: "Código do grampo final",
    terminal_aterramento: "Código do terminal de aterramento",
    kit_parafuso_smart: "Código do kit parafuso Smart",
    terminal_m8: "Código do terminal M8",
    terminal_zmi: "Código do terminal ZMI",
  };
  return {
    origem: "Configuração da calculadora",
    campo: cfgCampos[chave] ?? `Código de ${chave}`,
  };
}

/**
 * Pré-checagem do de/para: simula a quantificação e devolve os componentes que
 * sairiam sem código de produto, apontando o cadastro/campo a preencher.
 * Retorna lista vazia quando os inputs ainda não permitem quantificar.
 */
export function pendenciasDePara(
  fileiras: QuantFileira[],
  modulo: QuantModulo,
  ctx: QuantContexto,
  cfg: SolarCalcConfig,
): PendenciaDePara[] {
  const r = quantificarProjeto(fileiras, modulo, ctx, cfg);
  if (!r.ok) return [];
  const vistos = new Set<string>();
  const out: PendenciaDePara[] = [];
  for (const i of r.itens) {
    if (i.codigo && String(i.codigo).trim()) continue;
    if (vistos.has(i.chave)) continue;
    vistos.add(i.chave);
    out.push({ chave: i.chave, descricao: i.descricao, ...campoDePara(i.chave) });
  }
  return out;
}

