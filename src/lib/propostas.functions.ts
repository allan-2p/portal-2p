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
  condicaoPagamento: string | null;
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
    condicaoPagamento: input.condicaoPagamento
      ? String(input.condicaoPagamento).trim().toUpperCase()
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
/**
 * Espelha a proposta no Salesforce sempre que ela é salva/atualizada.
 * Nunca lança: uma falha de integração não pode perder a gravação.
 */
async function sincronizarSalesforceAoSalvar(propostaId: string) {
  try {
    const { sincronizarPedidoSalesforceSeguro } = await import("@/lib/salesforce-pedidos.server");
    await sincronizarPedidoSalesforceSeguro(propostaId);
  } catch {
    /* registrado no integration_logs pela própria integração */
  }
}

/** Backfill: sincroniza no Salesforce as propostas já existentes (admin). */
export const sincronizarPropostasSalesforceLoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { organizacao?: unknown; somentePendentes?: unknown };
    return {
      organizacao: typeof i.organizacao === "string" ? i.organizacao : undefined,
      somentePendentes: Boolean(i.somentePendentes),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: admin } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!admin) throw new Error("Apenas o administrador pode sincronizar em lote.");

    const { sincronizarPropostasSalesforceLote } = await import("@/lib/salesforce-pedidos.server");
    return await sincronizarPropostasSalesforceLote({
      ...(data.organizacao ? { organizacao: data.organizacao } : {}),
      somentePendentes: data.somentePendentes,
    });
  });

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
      condicaoPagamento: data.condicaoPagamento ?? "",
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

    // Nº SAP (VBELN): nasce no SAP, nunca no portal. Aqui é só leitura de
    // `sap_ov_numero` para exibir/imprimir; nada é gerado nem gravado.
    let numeroSap: string | null = null;
    let numeroExistente: string | null = null;
    if (data.propostaId) {
      const atualSap = await (await repo()).getProposta(data.propostaId, "sap_ov_numero, numero");
      numeroSap = String((atualSap as any)?.sap_ov_numero ?? "").trim() || null;
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
    const { resolverCondicaoPagamento } = await import("./condicoes-pagamento.server");
    const cond = await resolverCondicaoPagamento(supabase, data.condicaoPagamento);

    const payload = {

      numero: numeroProposta,
      nome: data.propostaNome,
      // `numero_sap` NÃO é escrito pelo portal: só o SAP define o VBELN.
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
      condicao_pagamento_codigo: cond.codigo,
      condicao_pagamento_descricao: cond.descricao,
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
      await sincronizarSalesforceAoSalvar(data.propostaId);
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
    await sincronizarSalesforceAoSalvar(inserida!.id);
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
 * Nº SAP (VBELN) de uma proposta — apenas LEITURA.
 * O número nasce no SAP (resposta da ZNFE_OV_CRIAR ou auto-recuperação via
 * ZNFE_OV_CONSULTAR) e é gravado em `sap_ov_numero` por `sap-ov.server.ts`.
 * O portal nunca gera, incrementa ou reserva esse número.
 */
export const consultarNumeroSapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { propostaId?: unknown })?.propostaId;
    if (typeof id !== "string" || !id) throw new Error("Proposta inválida.");
    return { propostaId: id };
  })
  .handler(async ({ data }) => {
    const db = await repo();
    const atual = await db.getProposta(data.propostaId, "sap_ov_numero, sap_ov_status, sap_ov_mensagem");
    return {
      numeroSap: (String((atual as any)?.sap_ov_numero ?? "").trim() || null) as string | null,
      status: ((atual as any)?.sap_ov_status ?? null) as string | null,
      mensagem: ((atual as any)?.sap_ov_mensagem ?? null) as string | null,
    };
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
  .handler(async ({ data, context }) => {
    const db = await repo();
    const { assertPodeLer, filtrarPorDono, getPerm } = await import("./object-perms.server");
    const perm = await getPerm(context as any, data.organizacao ?? "solar", "propostas");
    assertPodeLer(perm, "propostas");
    const rows = await db.listarPropostas(data);
    return filtrarPorDono(rows as any[], perm, (context as any).userId);
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
  .handler(async ({ data, context }) => {
    const db = await repo();
    const prop = (await db.getProposta(data.id)) as Record<string, any> | null;
    if (!prop) return prop;
    const { assertPodeLer, getPerm } = await import("./object-perms.server");
    const inst = String(prop["organizacao"] ?? "solar");
    const perm = await getPerm(context as any, inst, "propostas");
    assertPodeLer(perm, "propostas");
    const dono = (prop["created_by"] as string | null) ?? null;
    if (!perm.view_all && dono && dono !== (context as any).userId) {
      throw new Error("Esta proposta pertence a outro consultor.");
    }
    return prop;
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
  .handler(async ({ data, context }) => {
    const db = await repo();
    const atual = (await db.getProposta(data.id)) as Record<string, any> | null;
    const de = String(atual?.["status"] ?? "Salvo");

    const { assertPodeEditar, getPerm } = await import("./object-perms.server");
    const perm = await getPerm(context as any, String(atual?.["organizacao"] ?? "solar"), "propostas");
    assertPodeEditar(perm, "propostas", (atual?.["created_by"] as string | null) ?? null, (context as any).userId);

    if (data.status !== "Cancelado") {
      throw new Error(
        "O status é definido automaticamente pelo processo (pagamento, SAP e transporte). Só o cancelamento é manual.",
      );
    }
    if (!podeCancelarProposta(de)) {
      throw new Error(`Não é possível cancelar um pedido com status "${de}".`);
    }

    const { aplicarTransicao } = await import("@/lib/proposta-transicao.server");
    const t = await aplicarTransicao(data.id, "Cancelado", "humano", { de });
    if (!t.ok) throw new Error(t.motivo ?? "Não foi possível cancelar o pedido.");
    await sincronizarSalesforceAoSalvar(data.id);
    return { ok: true };
  });

/** Exclui uma proposta (exige "Excluir" em Propostas; de outro consultor, "Modify All Records"). */
export const excluirPropostaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { id?: unknown })?.id;
    if (typeof id !== "string" || !id) throw new Error("Proposta inválida.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const db = await repo();
    const atual = (await db.getProposta(data.id)) as Record<string, any> | null;
    const { assertPodeExcluir, getPerm } = await import("./object-perms.server");
    const perm = await getPerm(context as any, String(atual?.["organizacao"] ?? "solar"), "propostas");
    assertPodeExcluir(perm, "propostas", (atual?.["created_by"] as string | null) ?? null, (context as any).userId);
    // Pedido que já foi ao SAP não é apagado: o par NROPED↔VBELN precisa
    // sobreviver para a auditoria e para o cron de NFs. Vira "Cancelado".
    const vbeln = String(atual?.["sap_ov_numero"] ?? "").trim();
    if (vbeln) {
      await db.atualizarProposta(data.id, { status: "Cancelado" });
      return {
        ok: true,
        cancelada: true,
        aviso: `A ordem ${vbeln} continua no SAP — solicite o cancelamento ao time (VA02). O pedido ${atual?.["numero"] ?? ""} foi marcado como Cancelado no portal.`,
      };
    }
    await db.excluirProposta(data.id);
    return { ok: true, cancelada: false, aviso: null as string | null };

  });


/**
 * Conclui o pedido com trava idempotente (só conclui se ainda estiver "Salvo")
 * e grava a auditoria. Substitui o antigo RPC `concluir_proposta`.
 */
export const concluirPropostaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { id?: unknown; origem?: unknown; etapa?: unknown };
    if (typeof i.id !== "string" || !i.id) throw new Error("Proposta inválida.");
    // O status de destino NÃO vem do cliente: é derivado da forma de pagamento
    // no servidor (ver `statusDestino` abaixo).
    return {
      id: i.id,
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
    type SalesforceOut = {
      enviado: boolean;
      ok: boolean;
      opportunityId: string | null;
      mensagem: string | null;
      motivo: string | null;
    };
    type ConclusaoOut = {
      id: string;
      status: string;
      already_concluded: boolean;
      cobranca: CobrancaOut | null;
      sapOv: SapOvOut | null;
      salesforce: SalesforceOut | null;
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

    // Finalização é a etapa 5 do wizard. Aceita 4 por compatibilidade com o
    // wizard antigo (4 passos), que ainda pode estar aberto em abas do consultor.
    if (data.etapa !== 5 && data.etapa !== 4) {
      await db.registrarConclusaoLog({
        ...base,
        status: row["status"],
        resultado: "bloqueada",
        detalhe: `Conclusão fora da etapa 5 (Finalização): etapa recebida = ${data.etapa ?? "nenhuma"}`,
      });
      throw new Error("Conclua o pedido apenas na etapa 5 (Finalização).");
    }


    const itens = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
    const totais = (row["totais"] ?? {}) as Record<string, number>;
    let erro: string | null = null;
    const emailCliente = String(row["cliente_email"] ?? "").trim();
    // Finalidade de uso: sempre obrigatória em Carregadores; no Solar só quando
    // o pedido fatura o cliente final (é ele quem entra como parceiro no SAP).
    const org = String(row["organizacao"] ?? "solar");
    const exigeFinalidade = org !== "solar" || row["faturar_cliente_final"] === true;
    if (!String(row["cliente_nome"] ?? "").trim()) erro = "Cliente não informado.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailCliente))
      erro = "Informe um e-mail válido do cliente (usado para cobrança e avisos de boleto).";
    else if (!String(row["uf"] ?? "").trim()) erro = "UF de faturamento não informada.";
    else if (exigeFinalidade && !String(row["finalidade_uso"] ?? "").trim())
      erro = "Finalidade de uso não informada.";
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
      return { id: row.id, status: row["status"] as string, already_concluded: true, cobranca: null, sapOv: null, salesforce: null };
    }

    // Status de destino derivado da forma de pagamento (nunca da UI): todas as
    // formas suportadas (Pix, boleto à vista/a prazo e cartão) entram como
    // "Aguardando Pagamento"; o avanço vem do pagamento, do cron do SAP ou da
    // confirmação manual.
    const statusDestino = "Aguardando Pagamento";
    const { transicaoPermitida } = await import("@/lib/proposta-status");
    if (!transicaoPermitida(String(row["status"]), statusDestino, "checkout")) {
      const detalhe = `Transição inválida: ${row["status"]} → ${statusDestino}.`;
      await db.registrarConclusaoLog({ ...base, status: row["status"], resultado: "bloqueada", detalhe });
      throw new Error(detalhe);
    }

    const atualizada = await db.atualizarProposta(
      row.id,
      {
        status: statusDestino,
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
      return { id: row.id, status: row["status"] as string, already_concluded: true, cobranca: null, sapOv: null, salesforce: null };
    }

    await db.registrarConclusaoLog({ ...base, status: statusDestino, resultado: "concluida" });


    // Ordem de venda no SAP (ZNFE_OV_CRIAR). Falha aqui não desfaz o pedido:
    // fica registrada e pode ser reprocessada pelo job "sap.ov-criar".
    //
    // Pix: a OV só é criada quando o pagamento é confirmado (webhook/reconsulta),
    // igual à plataforma legada — aqui o pedido apenas aguarda o pagamento.
    //
    // Boleto: a OV vem ANTES da cobrança. Se o SAP recusar o pedido, emitir o
    // boleto primeiro deixaria uma cobrança órfã no Itaú, cobrada de um pedido
    // que não existe no ERP.
    const aguardaPix = String((row as any)["forma_pagamento"] ?? "") === "pix";
    let sapOv: SapOvOut | null = null;
    if (aguardaPix) {
      sapOv = {
        enviado: false,
        ok: true,
        vbeln: null,
        mensagem: null,
        motivo: "Pix: a ordem de venda será criada automaticamente na confirmação do pagamento.",
      };
    } else {
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
            status: statusDestino,
            resultado: "sap_ov_falhou",
            detalhe: String(r.mensagem ?? "Falha ao criar a ordem de venda no SAP.").slice(0, 500),
          });
        }
      } catch (e) {
        sapOv = { enviado: false, ok: false, vbeln: null, mensagem: (e as Error).message, motivo: null };
      }
    }

    // Cobrança automática (boleto à vista ou Pix). Falha aqui não trava o pedido.
    let cobranca: CobrancaOut | null = null;
    const semOv = !aguardaPix && !(sapOv?.ok ?? false);
    if (semOv) {
      cobranca = {
        gerada: false,
        meio: null,
        motivo:
          "Cobrança não emitida: a ordem de venda não foi criada no SAP. Reprocesse a OV e a cobrança sai em seguida.",
        erro: null,
        txid: null,
        linhaDigitavel: null,
        vencimento: null,
        pixCopiaCola: null,
      };
    } else {
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
            status: statusDestino,
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
    }


    // Pedido no Salesforce (Opportunity). Falha aqui não desfaz o pedido:
    // fica registrada e pode ser reenviada pelo job "salesforce.pedido".
    let salesforce: SalesforceOut | null = null;
    try {
      const { sincronizarPedidoSalesforce } = await import("@/lib/salesforce-pedidos.server");
      const r = await sincronizarPedidoSalesforce(row.id);
      salesforce = {
        enviado: r.enviado,
        ok: r.ok,
        opportunityId: r.opportunityId,
        mensagem: r.mensagem,
        motivo: r.motivo ?? null,
      };
      if (!r.ok) {
        await db.registrarConclusaoLog({
          ...base,
          status: statusDestino,
          resultado: "salesforce_falhou",
          detalhe: String(r.mensagem ?? "Falha ao enviar o pedido ao Salesforce.").slice(0, 500),
        });
      }
    } catch (e) {
      salesforce = { enviado: false, ok: false, opportunityId: null, mensagem: (e as Error).message, motivo: null };
    }

    // Kit fotovoltaico: avisa produção/logística (não bloqueia o pedido).
    if (row["kit_fotovoltaico"]) {
      const { avisarKitFotovoltaico } = await import("@/lib/kit-aviso.server");
      await avisarKitFotovoltaico({ ...row, sap_ov_numero: sapOv?.vbeln ?? row["sap_ov_numero"] });
    }

    return { id: row.id, status: statusDestino, already_concluded: false, cobranca, sapOv, salesforce };
    };

    // Monitoramento: cada finalização vira uma execução auditável em job_runs.
    const run = await runJob(
      {
        job: "checkout.finalizar",
        trigger: "portal",
        refType: "proposta",
        refId: data.id,
        payload: { id: data.id, etapa: data.etapa, origem: data.origem },
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

/** Reenvia (ou atualiza) o pedido no Salesforce — painel de integrações. */
export const sincronizarPedidoSalesforceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { propostaId?: unknown; forcar?: unknown };
    if (typeof i.propostaId !== "string" || !i.propostaId) throw new Error("Proposta inválida.");
    return { propostaId: i.propostaId, forcar: Boolean(i.forcar) };
  })
  .handler(async ({ data, context }) => {
    const { runJob } = await import("@/lib/job-runs.server");
    const run = await runJob(
      {
        job: "salesforce.pedido",
        trigger: "manual",
        refType: "proposta",
        refId: data.propostaId,
        payload: { propostaId: data.propostaId, forcar: data.forcar },
        actorId: (context as any).userId ?? null,
      },
      async () => {
        const { sincronizarPedidoSalesforce } = await import("@/lib/salesforce-pedidos.server");
        const r = await sincronizarPedidoSalesforce(data.propostaId, { forcar: data.forcar });
        if (!r.ok) throw new Error(r.mensagem ?? "Falha ao enviar o pedido ao Salesforce.");
        return { ...r };
      },
    );
    if (!run.ok) throw new Error(run.error);
    return run.result;
  });

export type PedidoIntegracoesStatus = {
  id: string;
  numero: string | null;
  cliente_nome: string | null;
  status: string | null;
  organizacao: string | null;
  sap: { numero: string | null; status: string | null; mensagem: string | null; enviado_em: string | null };
  salesforce: {
    opportunityId: string | null;
    accountId: string | null;
    status: string | null;
    mensagem: string | null;
    enviado_em: string | null;
  };
  /** Cobrança Itaú (boleto à vista ou Pix) emitida para o pedido. */
  cobranca: {
    forma: string | null;
    meio: string | null;
    status: string | null;
    valor: number | null;
    vencimento: string | null;
    linhaDigitavel: string | null;
    codigoBarras: string | null;
    nossoNumero: string | null;
    pixCopiaCola: string | null;
    url: string | null;
    atualizado_em: string | null;
    /** Última mensagem registrada na auditoria de cobrança. */
    mensagem: string | null;
    /** Emissão automática é aplicável a esta forma de pagamento? */
    aplicavel: boolean;
  };
  /** Validação prévia antes de enviar a ordem ao SAP. */
  validacao: { ok: boolean; pendencias: string[]; avisos: string[] };
};


/** Situação das integrações (SAP + Salesforce) de um pedido. */
export const statusIntegracoesPedidoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { propostaId?: unknown };
    if (typeof i.propostaId !== "string" || !i.propostaId) throw new Error("Proposta inválida.");
    return { propostaId: i.propostaId };
  })
  .handler(async ({ data }): Promise<PedidoIntegracoesStatus> => {
    const db = await repo();
    const { validarPedidoParaSap, enriquecerVendedorSap } = await import("@/lib/sap-ov.server");
    const bruto = await db.getProposta(data.propostaId);
    if (!bruto) throw new Error("Proposta não encontrada.");
    const row = await enriquecerVendedorSap(bruto as Record<string, any>);
    const s = (k: string) => {
      const v = (row as Record<string, any>)[k];
      return v === undefined || v === null || v === "" ? null : String(v);
    };
    // Última mensagem da auditoria de cobrança (o banco de propostas é externo
    // e não tem coluna de erro; o histórico fica em integration_logs).
    let cobrancaMensagem: string | null = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: logs } = await supabaseAdmin
        .from("integration_logs")
        .select("message, created_at")
        .eq("slug", "pagamento.cobranca")
        .contains("detail", { proposta_id: String(row["id"]) })
        .order("created_at", { ascending: false })
        .limit(1);
      cobrancaMensagem = (logs?.[0]?.message as string | undefined) ?? null;
    } catch {
      cobrancaMensagem = null;
    }

    const forma = s("forma_pagamento");
    const valorPag = Number((row as Record<string, any>)["pagamento_valor"] ?? 0);

    return {
      id: String(row["id"]),
      numero: s("numero"),
      cliente_nome: s("cliente_nome"),
      status: s("status"),
      organizacao: s("organizacao"),
      sap: {
        numero: s("sap_ov_numero"),
        status: s("sap_ov_status"),
        mensagem: s("sap_ov_mensagem"),
        enviado_em: s("sap_ov_enviado_em"),
      },
      salesforce: {
        opportunityId: s("sf_opp_id"),
        accountId: s("sf_account_id"),
        status: s("sf_status"),
        mensagem: s("sf_mensagem"),
        enviado_em: s("sf_enviado_em"),
      },
      cobranca: {
        forma,
        meio: s("pagamento_meio"),
        status: s("pagamento_status"),
        valor: valorPag > 0 ? valorPag : null,
        vencimento: s("pagamento_vencimento"),
        linhaDigitavel: s("pagamento_linha_digitavel"),
        codigoBarras: s("pagamento_codigo_barras"),
        nossoNumero: s("pagamento_nosso_numero"),
        pixCopiaCola: s("pagamento_pix_copia_cola"),
        url: s("pagamento_url"),
        atualizado_em: s("pagamento_atualizado_em"),
        mensagem: cobrancaMensagem,
        aplicavel: forma === "boleto_vista" || forma === "pix",
      },
      validacao: validarPedidoParaSap(row as Record<string, any>),
    };
  });

/**
 * Emissão / reemissão manual da cobrança do pedido (boleto à vista ou Pix).
 * Usada pela tela de Integrações quando a emissão automática do checkout falha.
 */
export const gerarCobrancaPedidoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { propostaId?: unknown; forcar?: unknown };
    if (typeof i.propostaId !== "string" || !i.propostaId) throw new Error("Proposta inválida.");
    return { propostaId: i.propostaId, forcar: i.forcar === true };
  })
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims?: { email?: string } };
    const { gerarCobrancaCheckout } = await import("@/lib/pagamentos-cobranca.server");
    const r = await gerarCobrancaCheckout(data.propostaId, {
      forcar: data.forcar,
      ator: { id: userId, email: claims?.email ?? null },
    });
    return {
      gerada: r.gerada,
      meio: r.meio ?? null,
      motivo: r.motivo ?? null,
      erro: r.erro ?? null,
      txid: r.txid ?? null,
      linhaDigitavel: r.linhaDigitavel ?? null,
      vencimento: r.vencimento ?? null,
      pixCopiaCola: r.pixCopiaCola ?? null,
    };
  });


/**
 * Confirmação manual de pagamento (boleto a prazo e cartão de crédito, que não
 * têm baixa automática pelo Itaú).
 *
 * Restrita a admin/gerente/diretor, auditada em `propostas_conclusao_log` e
 * limitada à transição "Aguardando Pagamento" → "Processando".
 */
export const confirmarPagamentoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as { propostaId?: unknown; observacao?: unknown };
    if (typeof i.propostaId !== "string" || !i.propostaId) throw new Error("Proposta inválida.");
    return {
      propostaId: i.propostaId,
      observacao: typeof i.observacao === "string" ? i.observacao.slice(0, 300) : "",
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: papeis } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const podeConfirmar = (papeis ?? []).some((p: any) =>
      ["admin", "gerente", "diretor"].includes(String(p?.role)),
    );
    if (!podeConfirmar)
      throw new Error("Apenas admin, gerente ou diretor podem confirmar o pagamento manualmente.");

    const { data: perfil } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const nomeAtor = (perfil as any)?.full_name ?? (perfil as any)?.email ?? userId;

    const db = await repo();
    const row = await db.getProposta(data.propostaId);
    if (!row) throw new Error("Proposta não encontrada.");

    const { transicaoPermitida } = await import("@/lib/proposta-status");
    if (!transicaoPermitida(String(row["status"] ?? ""), "Processando", "humano"))
      throw new Error(
        `Só é possível confirmar o pagamento de um pedido em "Aguardando Pagamento" (atual: ${row["status"]}).`,
      );

    const atualizada = await db.atualizarProposta(
      row.id,
      { status: "Processando" },
      { status: "eq.Aguardando Pagamento" },
    );
    if (!atualizada) throw new Error("O pedido mudou de status enquanto a confirmação era registrada.");

    const detalhe = `Pagamento confirmado manualmente por ${nomeAtor}${
      data.observacao ? ` — ${data.observacao}` : ""
    }`;
    await db.registrarConclusaoLog({
      proposta_id: row.id,
      numero: (row["numero"] as string) ?? null,
      status: "Processando",
      resultado: "pagamento_confirmado_manual",
      origem: "portal",
      actor_id: userId,
      actor_email: (perfil as any)?.email ?? null,
      actor_nome: nomeAtor,
      detalhe: detalhe.slice(0, 500),
    });

    const { logIntegrationEvent } = await import("@/lib/integration-logs.server");
    await logIntegrationEvent({
      slug: "pagamentos",
      event: "confirmacao-manual",
      level: "warn",
      message: detalhe.slice(0, 500),
      detail: { proposta_id: row.id, numero: row["numero"] ?? null, forma_pagamento: row["forma_pagamento"] ?? null },
    });

    const dono = String(row["created_by"] ?? "");
    if (dono) {
      const { criarNotificacao } = await import("@/lib/notificacoes.server");
      await criarNotificacao({
        user_id: dono,
        tipo: "pagamento",
        titulo: `Pagamento confirmado — pedido ${row["numero"] ?? ""}`,
        descricao: detalhe,
        ref_tipo: "proposta",
        ref_id: row.id,
        chave: `pagamento-manual:${row.id}`,
      });
    }

    return { ok: true, status: "Processando" as const };
  });
