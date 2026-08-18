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

/** Gera um número SAP único: 6 dígitos, apenas números. */
async function gerarNumeroSap(supabase: any) {
  const { data, error } = await supabase.rpc("proposta_next_sap_seq");
  if (error) {
    // Fallback seguro caso o RPC não esteja disponível
    return Date.now().toString().slice(-6);
  }
  const n = Number(data ?? 1);
  return String(n % 1000000).padStart(6, "0");
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
    // (atribuirNumeroSapFn). Aqui apenas preservamos o que já existir.
    let numeroSap = data.numeroSap?.trim() || null;
    if (!numeroSap && data.propostaId) {
      const { data: atualSap } = await supabase
        .from("propostas")
        .select("numero_sap")
        .eq("id", data.propostaId)
        .maybeSingle();
      numeroSap = (atualSap as any)?.numero_sap?.trim() || null;
    }


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
      numero: data.numero,
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

    if (data.propostaId) {
      const { data: atual } = await supabase
        .from("propostas")
        .select("consultor_id, consultor_nome, criado_por_nome")
        .eq("id", data.propostaId)
        .maybeSingle();

      const patch: Record<string, unknown> = { ...payload };
      // Preenche o consultor apenas quando a proposta ainda não tem (legado).
      if (!(atual as any)?.consultor_id && !(atual as any)?.consultor_nome) {
        const c = await consultorDoCliente();
        patch["consultor_id"] = c.id;
        patch["consultor_nome"] = c.nome;
      }
      if (!(atual as any)?.criado_por_nome) patch["criado_por_nome"] = nomeAtual;

      const { error } = await supabase
        .from("propostas")
        .update(patch as any)
        .eq("id", data.propostaId);
      if (error) throw new Error(error.message);
      return {
        id: data.propostaId,
        numero: data.numero,
        numeroSap,
        duplicada: false,
        totais: payload.totais,
        consultor: ((atual as any)?.consultor_nome ?? patch["consultor_nome"] ?? null) as string | null,
      };
    }

    const consultor = await consultorDoCliente();

    const { data: inserida, error } = await supabase
      .from("propostas")
      .insert({
        ...payload,
        status: "Salvo",
        created_by: userId,
        criado_por_nome: nomeAtual,
        consultor_id: consultor.id,
        consultor_nome: consultor.nome,
      })
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        const { data: existente } = await supabase
          .from("propostas")
          .select("id")
          .eq("numero", data.numero)
          .maybeSingle();
        return {
          id: existente?.id ?? null,
          numero: data.numero,
          numeroSap,
          duplicada: true,
          totais: payload.totais,
          consultor: consultor.nome,
        };
      }
      throw new Error(error.message);
    }
    return {
      id: inserida.id,
      numero: data.numero,
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
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const { data: atual } = await supabase
      .from("propostas")
      .select("numero_sap")
      .eq("id", data.propostaId)
      .maybeSingle();
    const existente = (atual as any)?.numero_sap?.trim() || null;
    if (existente) return { numeroSap: existente as string };

    const numeroSap = await gerarNumeroSap(supabase);
    const { error } = await supabase
      .from("propostas")
      .update({ numero_sap: numeroSap })
      .eq("id", data.propostaId);
    if (error) throw new Error(error.message);
    return { numeroSap };
  });
