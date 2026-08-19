import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CARREGADORES_CONFIG_FALLBACK,
  calcularCarregadores,
  fmtPct,
  finalidadeUsoDoCadastro,
  type CarregadoresConfig,
  type CarregadoresNcm,
  type CarregadoresProduct,
  type CarregadoresState,
  type CarregadoresUf,
} from "@/lib/carregadores";
import { podeCancelarProposta } from "@/lib/proposta-status";

export type SalvarPropostaInput = {
  propostaId: string | null;
  numero: string;
  /** Nome/identificação da proposta (padrão universal do portal). */
  propostaNome: string | null;
  /** Nº do pedido no SAP. */
  numeroSap: string | null;
  cliente: {
    nome: string;
    telefone: string;
    email: string;
    doc: string;
    ie: string;
  };
  uf: string;
  contribuinte: boolean;
  regimeTributario?: string | null;
  finalidadeUso: string;
  previsaoFechamento: string | null;
  tipoNf: string;
  faturarClienteFinal: boolean;
  faturamento: Record<string, string | boolean>;
  formaPagamento: string | null;
  entregaDiferente: boolean;
  entrega: Record<string, string>;
  freteMod: string;
  freteAreaRural: boolean;
  freteValor: number;
  transportadora: {
    id: string;
    nome: string;
    documento: string;
    total: number;
    prazo: number;
  } | null;
  observacoes: string | null;
  /** Proposta originada de indicação (Carregadores). */
  indicacao: boolean;
  padrinhoId: string | null;
  itens: { produtoId: string; qtd: number; valor: number }[];
};



const money2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** Repositório da tabela `propostas` no banco do Grupo 2P. */
async function repo() {
  return await import("./propostas-db.server");
}

/** Gera um número SAP único: 6 dígitos, apenas números. */
async function gerarNumeroSap() {
  try {
    return await (await repo()).proximoNumeroSap();
  } catch {
    return Date.now().toString().slice(-6);
  }
}


function validar(input: any): SalvarPropostaInput {
  if (!input || typeof input !== "object") throw new Error("Dados inválidos.");
  const nome = String(input.cliente?.nome ?? "").trim();
  if (!nome) throw new Error("Informe o nome do cliente.");
  const uf = String(input.uf ?? "").trim().toUpperCase();
  if (uf.length !== 2) throw new Error("UF inválida.");
  const itens = (Array.isArray(input.itens) ? input.itens : [])
    .filter((i: any) => i && typeof i.produtoId === "string" && i.produtoId)
    .map((i: any) => ({
      produtoId: String(i.produtoId),
      qtd: Math.max(0, Number(i.qtd) || 0),
      valor: money2(i.valor),
    }));
  if (!itens.length) throw new Error("Adicione ao menos um produto.");
  const campos = ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "contato", "telefone"];
  const entregaNormalizada: Record<string, string> = {};
  for (const c of campos) entregaNormalizada[c] = String(input.entrega?.[c] ?? "").slice(0, 160);
  if (input.entregaDiferente) {
    if (!entregaNormalizada['logradouro'] || !entregaNormalizada['cidade'])
      throw new Error("Informe o endereço de entrega.");
    if ((entregaNormalizada['uf'] ?? "").toUpperCase() !== uf)
      throw new Error("O endereço de entrega deve estar no mesmo estado do faturamento.");
  }

  const faturarClienteFinal = input.faturarClienteFinal === true;
  const faturamento: Record<string, string | boolean> = {};
  for (const c of [...campos, "doc", "nome", "ie"])
    faturamento[c] = String(input.faturamento?.[c] ?? "").slice(0, 160);
  faturamento['contribuinte'] = !!input.faturamento?.contribuinte;
  if (faturarClienteFinal) {
    const docFat = String(faturamento['doc'] ?? "").replace(/\D/g, "");
    if (!faturamento['nome']) throw new Error("Informe o destinatário do faturamento.");
    if (docFat.length !== 11 && docFat.length !== 14)
      throw new Error("CNPJ/CPF do faturamento inválido.");
    if (!faturamento['logradouro'] || !faturamento['cidade'] || !faturamento['uf'])
      throw new Error("Informe o endereço de faturamento.");
  }

  // Modalidade em branco é aceita em rascunhos; a conclusão do pedido exige a escolha.
  const freteMod = ["FOB", "CIF", "DEDICADO"].includes(String(input.freteMod))
    ? String(input.freteMod)
    : "";
  // FOB (ou sem modalidade): não existe valor de frete na proposta.
  const freteValor = freteMod === "FOB" || freteMod === "" ? 0 : money2(input.freteValor);
  const t = input.transportadora;
  const transportadora =
    freteMod !== "FOB" && freteMod !== "" && t && String(t.nome ?? "").trim()
      ? {
          id: String(t.id ?? ""),
          nome: String(t.nome).slice(0, 120),
          documento: String(t.documento ?? "").slice(0, 20),
          total: money2(t.total),
          prazo: Math.max(0, Math.round(Number(t.prazo) || 0)),
        }
      : null;

  const propostaNome = String(input.propostaNome ?? "").trim().slice(0, 160);
  if (!propostaNome) throw new Error("Informe o nome da proposta.");

  return {
    propostaId: input.propostaId ? String(input.propostaId) : null,
    numero: String(input.numero ?? "").trim(),
    propostaNome,
    numeroSap: input.numeroSap ? String(input.numeroSap).trim().slice(0, 40) : null,

    cliente: {
      nome,
      telefone: String(input.cliente?.telefone ?? ""),
      email: String(input.cliente?.email ?? ""),
      doc: String(input.cliente?.doc ?? ""),
      ie: String(input.cliente?.ie ?? ""),
    },
    uf,
    contribuinte: !!input.contribuinte,
    regimeTributario: input.regimeTributario ?? null,
    finalidadeUso: String(input.finalidadeUso ?? "uso_consumo"),
    previsaoFechamento: /^\d{4}-\d{2}-\d{2}$/.test(String(input.previsaoFechamento ?? ""))
      ? String(input.previsaoFechamento)
      : null,
    tipoNf: ["venda", "triangulacao", "bonificacao"].includes(String(input.tipoNf))
      ? String(input.tipoNf)
      : "venda",
    faturarClienteFinal,
    faturamento,
    formaPagamento: ["boleto_vista", "boleto_prazo", "pix", "cartao_credito"].includes(
      String(input.formaPagamento),
    )
      ? String(input.formaPagamento)
      : null,
    entregaDiferente: !!input.entregaDiferente,
    entrega: entregaNormalizada,
    freteMod,
    freteAreaRural: !!input.freteAreaRural,
    freteValor,
    transportadora,
    observacoes: input.observacoes ? String(input.observacoes) : null,
    indicacao: !!input.indicacao,
    padrinhoId: input.padrinhoId ? String(input.padrinhoId) : null,
    itens,
  };
}


/**
 * Salva/atualiza a proposta recalculando TODOS os totais no servidor a partir
 * do catálogo, alíquotas de UF, NCM e configuração vigentes. A UI nunca define
 * os valores persistidos — ela só envia cliente, itens e frete. Regras de
 * política (MB mínima e CMV máximo) são revalidadas aqui.
 */
export const salvarPropostaCarregadores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validar)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [cfgRes, ufRes, ncmRes, prodRes] = await Promise.all([
      supabase.from("carregadores_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("carregadores_uf_rates").select("uf, nome, aliq_interna, fcp, convenio_st"),
      supabase.from("carregadores_ncm").select("*"),
      supabase
        .from("sap_produtos")
        .select("id, codigo, descricao, custo, preco_sugerido, ativo, ncm_id, ncm_codigo")
        .in("id", data.itens.map((i) => i.produtoId)),
    ]);
    if (prodRes.error) throw new Error(prodRes.error.message);

    const config: CarregadoresConfig = cfgRes.data
      ? ({ ...CARREGADORES_CONFIG_FALLBACK, ...(cfgRes.data as any) } as CarregadoresConfig)
      : CARREGADORES_CONFIG_FALLBACK;
    const ufs = ((ufRes.data ?? []) as any[]).map((u) => ({
      uf: u.uf,
      nome: u.nome,
      aliq_interna: Number(u.aliq_interna),
      fcp: Number(u.fcp),
      convenio_st: !!u.convenio_st,
    })) as CarregadoresUf[];
    const ncms = ((ncmRes.data ?? []) as any[]) as CarregadoresNcm[];
    const produtos = ((prodRes.data ?? []) as any[]).map((p) => ({
      id: p.id,
      codigo: p.codigo ?? null,
      nome: p.descricao,
      custo: Number(p.custo ?? 0),
      preco_sugerido: Number(p.preco_sugerido ?? 0),
      ativo: !!p.ativo,
      ncm_id: p.ncm_id ?? null,
      ncm_codigo: p.ncm_codigo ?? null,
    })) as CarregadoresProduct[];

    const faltando = data.itens.filter((i) => !produtos.some((p) => p.id === i.produtoId));
    if (faltando.length) throw new Error("Há itens com produtos inexistentes ou indisponíveis no catálogo.");

    // Finalidade de uso: SEMPRE a do cadastro atual do cliente (o vendedor não
    // escolhe na proposta). Propostas antigas são migradas neste momento.
    let finalidadeUso = data.finalidadeUso as CarregadoresState["finalidadeUso"];
    const docDigitos = (data.cliente.doc ?? "").replace(/\D/g, "");
    if (docDigitos.length >= 11) {
      try {
        const db = await import("./clientes-db.server");
        const achados = await db.findClienteByDoc(docDigitos);
        const cad = achados[0]?.cliente ?? null;
        if (cad) finalidadeUso = finalidadeUsoDoCadastro(cad["finalidade"] as string | null);
      } catch {
        /* cadastro indisponível: mantém o valor recebido */
      }
    }

    const state: CarregadoresState = {
      propostaNome: data.propostaNome ?? "",
      numeroSap: data.numeroSap ?? "",
      nome: data.cliente.nome,

      telefone: data.cliente.telefone,
      email: data.cliente.email,
      doc: data.cliente.doc,
      ie: data.cliente.ie,
      uf: data.uf,
      contribuinte: data.contribuinte,
      regimeTributario: data.regimeTributario ?? null,
      finalidadeUso,
      indicacao: data.indicacao,
      padrinhoId: data.padrinhoId,
      padrinhoNome: "",
      previsaoFechamento: data.previsaoFechamento ?? "",
      tipoNf: data.tipoNf as CarregadoresState["tipoNf"],
      faturarClienteFinal: data.faturarClienteFinal,
      faturamento: data.faturamento as unknown as CarregadoresState["faturamento"],
      formaPagamento: (data.formaPagamento ?? "") as CarregadoresState["formaPagamento"],
      entregaDiferente: data.entregaDiferente,
      entrega: data.entrega as unknown as CarregadoresState["entrega"],
      freteMod: data.freteMod as CarregadoresState["freteMod"],
      freteAreaRural: data.freteAreaRural,
      freteValor: data.freteValor,
      transportadora: data.transportadora,

      observacoes: data.observacoes ?? "",
      itens: data.itens.map((i, idx) => ({
        key: String(idx),
        produtoId: i.produtoId,
        qtd: i.qtd,
        valor: i.valor,
        valorManual: true,
      })),
    };

    const d = calcularCarregadores(state, produtos, ufs, config, ncms);

    if (d.mbPct < config.politica_mb_min)
      throw new Error(
        `MB% de ${fmtPct(d.mbPct)} abaixo da política mínima de ${fmtPct(config.politica_mb_min)}.`,
      );
    if (d.cmvExcedido)
      throw new Error(
        `CMV de ${fmtPct(d.cmv)} acima do limite de ${fmtPct(config.cmv_max)}. Necessária aprovação da diretoria.`,
      );

    // Nº SAP: a proposta nasce SEM número. Ele só é atribuído na conclusão
    // (atribuirNumeroSapFn). O cliente nunca envia esse dado — só preservamos
    // o que já estiver gravado no banco.
    let numeroSap: string | null = null;
    let numeroExistente: string | null = null;
    if (data.propostaId) {
      const atualSap = await (await repo()).getProposta(data.propostaId, "numero_sap, numero");
      numeroSap = (atualSap as any)?.numero_sap?.trim() || null;
      numeroExistente = (atualSap as any)?.numero?.trim() || null;
    }

    // Nº da proposta: sequencial no servidor (6 dígitos, a partir de 050000).
    const numeroProposta = data.propostaId
      ? (numeroExistente ?? data.numero)
      : await (await repo()).proximoNumeroProposta("carregadores");



    // Padrinho da indicação: valida o vínculo e fotografa o nome na proposta.
    let padrinhoId: string | null = null;
    let padrinhoNome: string | null = null;
    if (data.indicacao && data.padrinhoId) {
      const { data: pad } = await supabase
        .from("carregadores_padrinhos")
        .select("id, nome")
        .eq("id", data.padrinhoId)
        .maybeSingle();
      if (!pad) throw new Error("Padrinho da indicação não encontrado.");
      padrinhoId = (pad as any).id as string;
      padrinhoNome = (pad as any).nome as string;
    }
    if (data.indicacao && !padrinhoId) throw new Error("Selecione ou cadastre o padrinho da indicação.");

    const payload = {
      numero: numeroProposta,
      nome: data.propostaNome,
      numero_sap: numeroSap,
      cliente_nome: data.cliente.nome,

      cliente_telefone: data.cliente.telefone,
      cliente_email: data.cliente.email,
      cliente_doc: data.cliente.doc,
      cliente_ie: data.cliente.ie,
      uf: data.uf,
      contribuinte: data.contribuinte,
      finalidade_uso: finalidadeUso,
      previsao_fechamento: data.previsaoFechamento,
      tipo_nf: data.tipoNf,
      faturar_cliente_final: data.faturarClienteFinal,
      faturamento: data.faturarClienteFinal ? data.faturamento : {},
      forma_pagamento: data.formaPagamento,
      entrega_diferente: data.entregaDiferente,
      entrega: data.entrega,
      frete_mod: data.freteMod,
      frete_area_rural: data.freteMod === "CIF" ? data.freteAreaRural : false,
      frete_valor: data.freteValor,
      transportadora: data.transportadora?.nome ?? null,
      transportadora_documento: data.transportadora?.documento ?? null,
      transportadora_id: data.transportadora?.id ?? null,
      frete_prazo: data.transportadora?.prazo ?? null,
      observacoes: data.observacoes,

      indicacao: data.indicacao,
      padrinho_id: data.indicacao ? padrinhoId : null,
      padrinho_nome: data.indicacao ? padrinhoNome : null,
      itens: data.itens.map((i) => {
        const p = produtos.find((x) => x.id === i.produtoId)!;
        return {
          produtoId: i.produtoId,
          codigo: p.codigo ?? null,
          nome: p.nome,
          qtd: i.qtd,
          valor: i.valor,
          valorManual: true,
        };
      }),
      totais: {
        valorTotal: d.valorTotalProposta,
        valor: d.valor,
        icms: d.icms,
        icmsRate: d.icmsRate,
        ipi: d.ipiValor,
        pisCofins: d.pisCofins,
        rl: d.rl,
        custo: 0,
        mb: d.mb,
        mbPct: d.mbPct,
        comissao: d.comValor,
      },
    };

    // Consultor da proposta: fotografado do cadastro do cliente no momento da
    // criação. Depois disso nunca muda, mesmo que o cadastro seja reatribuído.
    async function consultorDoCliente() {
      const doc = (data.cliente.doc ?? "").replace(/\D/g, "");
      if (!doc) return { id: null as string | null, nome: null as string | null };
      try {
        const db = await import("./clientes-db.server");
        const achados = await db.findClienteByDoc(doc);
        const alvo =
          achados.find((a) => a.instancia === "carregadores")?.cliente ?? achados[0]?.cliente;
        if (!alvo) return { id: null, nome: null };
        return {
          id: (alvo["created_by"] as string | null) ?? null,
          nome: (alvo["created_by_nome"] as string | null) ?? null,
        };
      } catch {
        return { id: null, nome: null };
      }
    }

    const { data: perfilAtual } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const nomeAtual = (perfilAtual as any)?.full_name ?? (perfilAtual as any)?.email ?? null;

    const db = await repo();

    if (data.propostaId) {
      const atual = await db.getProposta(
        data.propostaId,
        "consultor_id,consultor_nome,criado_por_nome",
      );

      const patch: Record<string, unknown> = { ...payload };
      // Preenche o consultor apenas quando a proposta ainda não tem (legado).
      if (!(atual as any)?.consultor_id && !(atual as any)?.consultor_nome) {
        const c = await consultorDoCliente();
        patch["consultor_id"] = c.id;
        patch["consultor_nome"] = c.nome;
      }
      if (!(atual as any)?.criado_por_nome) patch["criado_por_nome"] = nomeAtual;

      await db.atualizarProposta(data.propostaId, patch);
      return {
        id: data.propostaId,
        numero: numeroProposta,
        numeroSap,
        duplicada: false,
        totais: payload.totais,
        consultor: ((atual as any)?.consultor_nome ?? patch["consultor_nome"] ?? null) as string | null,
      };
    }

    const consultor = await consultorDoCliente();

    let inserida: { id: string } | null = null;
    try {
      inserida = (await db.inserirProposta({
        ...payload,
        organizacao: "carregadores",
        status: "Salvo",
        created_by: userId,
        criado_por_nome: nomeAtual,
        consultor_id: consultor.id,
        consultor_nome: consultor.nome,
      })) as { id: string };
    } catch (e) {
      const err = e as Error & { status?: number; body?: string };
      if (err.status === 409 || /duplicate key|23505/i.test(err.body ?? err.message)) {
        const existente = await db.getPropostaPorNumero(numeroProposta);
        return {
          id: existente?.id ?? null,
          numero: numeroProposta,
          numeroSap,
          duplicada: true,
          totais: payload.totais,
          consultor: consultor.nome,
        };
      }
      throw err;
    }
    return {
      id: inserida!.id,
      numero: numeroProposta,
      numeroSap,
      duplicada: false,
      totais: payload.totais,
      consultor: consultor.nome,
    };
  });

/**
 * Atribui o Nº SAP a uma proposta no momento da conclusão.
 * Idempotente: se a proposta já tiver número, devolve o existente.
 */
export const atribuirNumeroSapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { propostaId?: unknown })?.propostaId;
    if (typeof id !== "string" || !id) throw new Error("Proposta inválida.");
    return { propostaId: id };
  })
  .handler(async ({ data }) => {
    const db = await repo();
    const atual = await db.getProposta(data.propostaId, "numero_sap");
    const existente = (atual as any)?.numero_sap?.trim() || null;
    if (existente) return { numeroSap: existente as string };

    const numeroSap = await gerarNumeroSap();
    await db.atualizarProposta(data.propostaId, { numero_sap: numeroSap });
    return { numeroSap };
  });

// ---------------------------------------------------------------------------
// Leitura/escrita das propostas (banco do Grupo 2P — sempre via servidor)
// ---------------------------------------------------------------------------

/** Lista propostas de uma organização. */
export const listarPropostasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { organizacao?: unknown; select?: unknown; statusIn?: unknown };
    return {
      organizacao: typeof i.organizacao === "string" ? i.organizacao : undefined,
      select: typeof i.select === "string" ? i.select : undefined,
      statusIn: Array.isArray(i.statusIn) ? i.statusIn.map(String) : undefined,
    };
  })
  .handler(async ({ data }) => {
    const db = await repo();
    return await db.listarPropostas(data);
  });

/** Resumo de pagamento (Pix/boleto) dos pedidos de uma organização. */
export const listarPagamentosFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const org = (input as { organizacao?: unknown })?.organizacao;
    return { organizacao: typeof org === "string" ? org : undefined };
  })
  .handler(async ({ data }) => {
    const db = await repo();
    return await db.listarPagamentos(data.organizacao);
  });


/** Carrega uma proposta pelo id. */
export const obterPropostaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { id?: unknown })?.id;
    if (typeof id !== "string" || !id) throw new Error("Proposta inválida.");
    return { id };
  })
  .handler(async ({ data }) => {
    const db = await repo();
    return await db.getProposta(data.id);
  });

/**
 * Atualiza o status da proposta.
 *
 * O status é governado pela máquina de estados (checkout, crons SAP, webhook
 * Fretefy). A única transição humana é o cancelamento — qualquer outra
 * alteração manual é recusada.
 */
export const atualizarStatusPropostaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { id?: unknown; status?: unknown };
    if (typeof i.id !== "string" || !i.id) throw new Error("Proposta inválida.");
    if (typeof i.status !== "string" || !i.status) throw new Error("Status inválido.");
    return { id: i.id, status: i.status };
  })
  .handler(async ({ data }) => {
    const db = await repo();
    const atual = await db.getProposta(data.id);
    const de = String((atual as Record<string, unknown> | null)?.["status"] ?? "Salvo");

    if (data.status !== "Cancelado") {
      throw new Error(
        "O status é definido automaticamente pelo processo (pagamento, SAP e transporte). Só o cancelamento é manual.",
      );
    }
    if (!podeCancelarProposta(de)) {
      throw new Error(`Não é possível cancelar um pedido com status "${de}".`);
    }

    await db.atualizarProposta(data.id, { status: "Cancelado" });
    return { ok: true };
  });

/** Exclui uma proposta (somente administrador do sistema). */
export const excluirPropostaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { id?: unknown })?.id;
    if (typeof id !== "string" || !id) throw new Error("Proposta inválida.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roles) throw new Error("Apenas o administrador do sistema pode excluir propostas.");
    const db = await repo();
    await db.excluirProposta(data.id);
    return { ok: true };
  });

/**
 * Conclui o pedido com trava idempotente (só conclui se ainda estiver "Salvo")
 * e grava a auditoria. Substitui o antigo RPC `concluir_proposta`.
 */
export const concluirPropostaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { id?: unknown; status?: unknown; origem?: unknown; etapa?: unknown };
    if (typeof i.id !== "string" || !i.id) throw new Error("Proposta inválida.");
    if (typeof i.status !== "string" || !i.status) throw new Error("Status inválido.");
    return {
      id: i.id,
      status: i.status,
      origem: typeof i.origem === "string" ? i.origem : "portal",
      etapa: typeof i.etapa === "number" ? i.etapa : null,
    };
  })
  .handler(async ({ data, context }) => {
    const { runJob } = await import("@/lib/job-runs.server");
    type CobrancaOut = {
      gerada: boolean;
      meio: string | null;
      motivo: string | null;
      erro: string | null;
      txid: string | null;
      linhaDigitavel: string | null;
      vencimento: string | null;
      pixCopiaCola: string | null;
    };
    type SapOvOut = {
      enviado: boolean;
      ok: boolean;
      vbeln: string | null;
      mensagem: string | null;
      motivo: string | null;
    };
    type ConclusaoOut = {
      id: string;
      status: string;
      already_concluded: boolean;
      cobranca: CobrancaOut | null;
      sapOv: SapOvOut | null;
    };
    const executar = async (): Promise<ConclusaoOut> => {
    const { supabase, userId } = context as any;
    const db = await repo();

    const { data: perfil } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const actor = {
      actor_id: userId as string,
      actor_email: (perfil as any)?.email ?? null,
      actor_nome: (perfil as any)?.full_name ?? (perfil as any)?.email ?? null,
      origem: data.origem,
    };

    const row = await db.getProposta(data.id);
    if (!row) {
      await db.registrarConclusaoLog({
        ...actor,
        proposta_id: data.id,
        resultado: "erro",
        detalhe: "Proposta não encontrada",
      });
      throw new Error("Proposta não encontrada");
    }

    const base = { ...actor, proposta_id: row.id, numero: row["numero"] ?? null };

    if (data.etapa !== 4) {
      await db.registrarConclusaoLog({
        ...base,
        status: row["status"],
        resultado: "bloqueada",
        detalhe: `Conclusão fora da etapa 4 (Finalização): etapa recebida = ${data.etapa ?? "nenhuma"}`,
      });
      throw new Error("Conclua o pedido apenas na etapa 4 (Finalização).");
    }

    const itens = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
    const totais = (row["totais"] ?? {}) as Record<string, number>;
    let erro: string | null = null;
    if (!String(row["cliente_nome"] ?? "").trim()) erro = "Cliente não informado.";
    else if (!String(row["uf"] ?? "").trim()) erro = "UF de faturamento não informada.";
    else if (!String(row["finalidade_uso"] ?? "").trim()) erro = "Finalidade de uso não informada.";
    else if (!String(row["frete_mod"] ?? "").trim()) erro = "Modalidade de frete não informada.";
    else if (Number(row["frete_valor"] ?? 0) < 0) erro = "Valor de frete inválido.";
    else if (!itens.length) erro = "A proposta não possui itens.";
    else if (itens.some((i) => Number(i?.qtd ?? 0) <= 0)) erro = "Existe item com quantidade inválida.";
    else if (itens.some((i) => Number(i?.valor ?? 0) <= 0)) erro = "Existe item sem valor unitário.";
    else if (Number(totais["valorTotal"] ?? 0) <= 0) erro = "Total da proposta inválido.";

    if (erro) {
      await db.registrarConclusaoLog({ ...base, status: row["status"], resultado: "bloqueada", detalhe: erro });
      throw new Error(erro);
    }

    if (row["status"] !== "Salvo") {
      await db.registrarConclusaoLog({
        ...base,
        status: row["status"],
        resultado: "duplicada",
        detalhe: "Tentativa repetida de conclusão",
      });
      return { id: row.id, status: row["status"] as string, already_concluded: true, cobranca: null, sapOv: null };
    }

    const atualizada = await db.atualizarProposta(
      row.id,
      {
        status: data.status,
        finalizado_por: userId,
        finalizado_por_nome: actor.actor_nome,
        finalizado_em: new Date().toISOString(),
      },
      { status: "eq.Salvo" },
    );

    if (!atualizada) {
      await db.registrarConclusaoLog({
        ...base,
        status: row["status"],
        resultado: "duplicada",
        detalhe: "Tentativa repetida de conclusão",
      });
      return { id: row.id, status: row["status"] as string, already_concluded: true, cobranca: null, sapOv: null };
    }

    await db.registrarConclusaoLog({ ...base, status: data.status, resultado: "concluida" });

    // Cobrança automática (boleto à vista ou Pix). Falha aqui não trava o pedido.
    let cobranca: CobrancaOut | null = null;
    try {
      const { gerarCobrancaCheckout } = await import("@/lib/pagamentos-cobranca.server");
      const r = await gerarCobrancaCheckout(row.id);
      cobranca = {
        gerada: r.gerada,
        meio: r.meio ?? null,
        motivo: r.motivo ?? null,
        erro: r.erro ?? null,
        txid: r.txid ?? null,
        linhaDigitavel: r.linhaDigitavel ?? null,
        vencimento: r.vencimento ?? null,
        pixCopiaCola: r.pixCopiaCola ?? null,
      };
      if (cobranca.erro) {
        await db.registrarConclusaoLog({
          ...base,
          status: data.status,
          resultado: "cobranca_falhou",
          detalhe: String(cobranca.erro).slice(0, 500),
        });
      }
    } catch (e) {
      cobranca = {
        gerada: false,
        meio: null,
        motivo: null,
        erro: (e as Error).message,
        txid: null,
        linhaDigitavel: null,
        vencimento: null,
        pixCopiaCola: null,
      };
    }

    // Ordem de venda no SAP (ZNFE_OV_CRIAR). Falha aqui não desfaz o pedido:
    // fica registrada e pode ser reprocessada pelo job "sap.ov-criar".
    let sapOv: SapOvOut | null = null;
    try {
      const { criarOrdemVendaSap } = await import("@/lib/sap-ov.server");
      const r = await criarOrdemVendaSap(row.id);
      sapOv = {
        enviado: r.enviado,
        ok: r.ok,
        vbeln: r.vbeln,
        mensagem: r.mensagem,
        motivo: r.motivo ?? null,
      };
      if (!r.ok) {
        await db.registrarConclusaoLog({
          ...base,
          status: data.status,
          resultado: "sap_ov_falhou",
          detalhe: String(r.mensagem ?? "Falha ao criar a ordem de venda no SAP.").slice(0, 500),
        });
      }
    } catch (e) {
      sapOv = { enviado: false, ok: false, vbeln: null, mensagem: (e as Error).message, motivo: null };
    }

    return { id: row.id, status: data.status, already_concluded: false, cobranca, sapOv };
    };

    // Monitoramento: cada finalização vira uma execução auditável em job_runs.
    const run = await runJob(
      {
        job: "checkout.finalizar",
        trigger: "portal",
        refType: "proposta",
        refId: data.id,
        payload: { id: data.id, status: data.status, etapa: data.etapa, origem: data.origem },
        actorId: (context as any).userId ?? null,
      },
      executar,
    );
    if (!run.ok) throw new Error(run.error);
    return run.result;
  });

/** Registra uma tentativa de conclusão (auditoria do portal). */
export const registrarConclusaoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => (input ?? {}) as Record<string, unknown>)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: perfil } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const db = await repo();
    await db.registrarConclusaoLog({
      proposta_id: (data["propostaId"] as string) ?? null,
      numero: (data["numero"] as string) ?? null,
      status: (data["status"] as string) ?? null,
      resultado: String(data["resultado"] ?? "tentativa"),
      origem: String(data["origem"] ?? "portal"),
      actor_id: userId,
      actor_email: (perfil as any)?.email ?? null,
      actor_nome: (perfil as any)?.full_name ?? (perfil as any)?.email ?? null,
      detalhe: (data["detalhe"] as string) ?? null,
    });
    return { ok: true };
  });

/** Lista o log de conclusões. */
export const listarConclusoesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({
    limit: Math.min(Math.max(Number((input as any)?.limit ?? 100) || 100, 1), 500),
  }))
  .handler(async ({ data }) => {
    const db = await repo();
    return await db.listarConclusaoLog(data.limit);
  });

/**
 * Reenvia (ou valida) a ordem de venda no SAP para um pedido já concluído.
 * Usado no painel de integrações quando o envio automático do checkout falha.
 */
export const criarOrdemVendaSapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { propostaId?: unknown; testrun?: unknown; forcar?: unknown };
    if (typeof i.propostaId !== "string" || !i.propostaId) throw new Error("Proposta inválida.");
    return { propostaId: i.propostaId, testrun: Boolean(i.testrun), forcar: Boolean(i.forcar) };
  })
  .handler(async ({ data, context }) => {
    const { runJob } = await import("@/lib/job-runs.server");
    const run = await runJob(
      {
        job: "sap.ov-criar",
        trigger: "manual",
        refType: "proposta",
        refId: data.propostaId,
        payload: { propostaId: data.propostaId, testrun: data.testrun, forcar: data.forcar },
        actorId: (context as any).userId ?? null,
      },
      async () => {
        const { criarOrdemVendaSap } = await import("@/lib/sap-ov.server");
        const r = await criarOrdemVendaSap(data.propostaId, {
          testrun: data.testrun,
          forcar: data.forcar,
        });
        if (!r.ok && r.enviado) throw new Error(r.mensagem ?? "Falha ao criar a ordem de venda no SAP.");
        return {
          enviado: r.enviado,
          ok: r.ok,
          vbeln: r.vbeln,
          mensagem: r.mensagem,
          motivo: r.motivo ?? null,
          testrun: r.testrun,
        };
      },
    );
    if (!run.ok) throw new Error(run.error);
    return run.result;
  });
