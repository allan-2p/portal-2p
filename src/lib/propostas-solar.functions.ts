import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { tpOvDoPedido, contribuinteDoFaturamento } from "@/lib/sap-tp-ov";

/**
 * Proposta 2P Solar — os valores NUNCA vêm da tela: o servidor recalcula tudo
 * a partir do catálogo e da tabela de preço escolhida (simulação do SAP), e
 * aplica o cupom informado.
 */

export type SalvarPropostaSolarInput = {
  propostaId: string | null;
  propostaNome: string;
  vendidoClienteFinal: boolean;
  previsaoFechamento: string | null;
  listaPreco: string;
  /** Venda em formato de kit (afeta regras comerciais/fiscais adiante). */
  ehKit: boolean;
  cliente: { nome: string; doc: string; ie: string; telefone: string; email: string };
  uf: string;
  contribuinte: boolean;
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
  transportadora: { id: string; nome: string; documento: string; total: number; prazo: number } | null;
  cupomCodigo: string | null;
  observacoes: string | null;
  calculo: Record<string, unknown> | null;
  itens: { produtoId: string; qtd: number }[];
};

const money2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const normCod = (c: string) => String(c ?? "").trim().replace(/^0+(?=\d)/, "");

function validar(input: unknown): SalvarPropostaSolarInput {
  const i = (input ?? {}) as any;
  const propostaNome = String(i.propostaNome ?? "").trim().slice(0, 160);
  if (!propostaNome) throw new Error("Informe o nome da proposta.");
  const nome = String(i.cliente?.nome ?? "").trim();
  if (!nome) throw new Error("Selecione o cliente.");
  const uf = String(i.uf ?? "").trim().toUpperCase();
  if (uf.length !== 2) throw new Error("UF inválida.");

  const itens = (Array.isArray(i.itens) ? i.itens : [])
    .filter((x: any) => x && typeof x.produtoId === "string" && x.produtoId)
    .map((x: any) => ({ produtoId: String(x.produtoId), qtd: Math.max(0, Number(x.qtd) || 0) }))
    .filter((x: any) => x.qtd > 0);
  if (!itens.length) throw new Error("Adicione ao menos um produto.");

  const vendidoClienteFinal = i.vendidoClienteFinal === true;
  const previsao = /^\d{4}-\d{2}-\d{2}$/.test(String(i.previsaoFechamento ?? ""))
    ? String(i.previsaoFechamento)
    : null;
  if (vendidoClienteFinal && !previsao)
    throw new Error("Informe a previsão de fechamento (projeto vendido ao cliente final).");

  const campos = ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "contato", "telefone"];
  const entrega: Record<string, string> = {};
  for (const c of campos) entrega[c] = String(i.entrega?.[c] ?? "").slice(0, 160);
  if (i.entregaDiferente && (!entrega['logradouro'] || !entrega['cidade']))
    throw new Error("Informe o endereço de entrega.");

  const faturamento: Record<string, string | boolean> = {};
  for (const c of [...campos, "doc", "nome", "ie"])
    faturamento[c] = String(i.faturamento?.[c] ?? "").slice(0, 160);
  faturamento['contribuinte'] = !!i.faturamento?.contribuinte;

  const freteMod = ["FOB", "CIF", "DEDICADO"].includes(String(i.freteMod)) ? String(i.freteMod) : "";
  const t = i.transportadora;

  return {
    propostaId: i.propostaId ? String(i.propostaId) : null,
    propostaNome,
    vendidoClienteFinal,
    previsaoFechamento: previsao,
    listaPreco: /^\d{2}$/.test(String(i.listaPreco)) ? String(i.listaPreco) : "01",
    ehKit: i.ehKit === true,
    cliente: {
      nome,
      doc: String(i.cliente?.doc ?? ""),
      ie: String(i.cliente?.ie ?? ""),
      telefone: String(i.cliente?.telefone ?? ""),
      email: String(i.cliente?.email ?? ""),
    },
    uf,
    contribuinte: !!i.contribuinte,
    tipoNf: ["venda", "triangulacao", "bonificacao"].includes(String(i.tipoNf)) ? String(i.tipoNf) : "venda",
    faturarClienteFinal: i.faturarClienteFinal === true,
    faturamento,
    formaPagamento: ["boleto_vista", "boleto_prazo", "pix", "cartao_credito"].includes(String(i.formaPagamento))
      ? String(i.formaPagamento)
      : null,
    condicaoPagamento: i.condicaoPagamento ? String(i.condicaoPagamento).trim().toUpperCase() : null,
    entregaDiferente: !!i.entregaDiferente,
    entrega,
    freteMod,
    freteAreaRural: !!i.freteAreaRural,
    freteValor: freteMod === "FOB" || freteMod === "" ? 0 : money2(i.freteValor),
    transportadora:
      freteMod !== "FOB" && freteMod !== "" && t && String(t.nome ?? "").trim()
        ? {
            id: String(t.id ?? ""),
            nome: String(t.nome).slice(0, 120),
            documento: String(t.documento ?? "").slice(0, 20),
            total: money2(t.total),
            prazo: Math.max(0, Math.round(Number(t.prazo) || 0)),
          }
        : null,
    cupomCodigo: i.cupomCodigo ? String(i.cupomCodigo).trim().slice(0, 40) : null,
    observacoes: i.observacoes ? String(i.observacoes) : null,
    calculo: i.calculo && typeof i.calculo === "object" ? (i.calculo as Record<string, unknown>) : null,
    itens,
  };
}

/** Espelha a proposta no Salesforce ao salvar. Nunca lança. */
async function espelharNoSalesforce(propostaId: string) {
  try {
    const { sincronizarPedidoSalesforceSeguro } = await import("./salesforce-pedidos.server");
    await sincronizarPedidoSalesforceSeguro(propostaId);
  } catch {
    /* falha fica registrada no log de integrações */
  }
}

export const salvarPropostaSolar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validar)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: prodRows, error: prodErr } = await supabase
      .from("sap_produtos")
      .select("id, codigo, descricao, preco_sugerido, imagem_path, ativo")
      .in("id", data.itens.map((i) => i.produtoId));
    if (prodErr) throw new Error(prodErr.message);
    const produtos = (prodRows ?? []) as any[];
    if (produtos.length !== new Set(data.itens.map((i) => i.produtoId)).size)
      throw new Error("Há itens com produtos indisponíveis no catálogo.");

    const sugeridos: Record<string, number> = {};
    for (const p of produtos) sugeridos[normCod(p.codigo)] = Number(p.preco_sugerido ?? 0);

    const { precosSolar } = await import("./solar-precos.server");
    const { auditarBloqueio } = await import("./proposta-auditoria.server");
    const auditCtx = {
      propostaId: data.propostaId ?? null,
      doc: data.cliente.doc.replace(/\D/g, ""),
      clienteNome: data.cliente.nome ?? null,
      unidade: "solar" as const,
      actorId: userId,
      actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
    };

    const { precos, avisos, fallback } = await precosSolar(
      data.itens.map((i) => {
        const p = produtos.find((x) => x.id === i.produtoId)!;
        return { codigo: String(p.codigo), quantidade: i.qtd };
      }),
      {
        documento: data.cliente.doc.replace(/\D/g, ""),
        listaPreco: data.listaPreco,
        tipoOv: tpOvDoPedido(
          data.tipoNf,
          contribuinteDoFaturamento({
            contribuinte: data.contribuinte,
            faturarClienteFinal: data.faturarClienteFinal,
            faturamento: data.faturamento as { contribuinte?: unknown },
          }),
        ),
        sugeridos,
        auditoria: { ...auditCtx, etapa: "salvar" },
      },
    );

    // O SAP recusou a precificação (ex.: CNPJ sem parceiro cadastrado). Nunca
    // gravar a proposta com valores zerados — o erro precisa aparecer.
    if (avisos.length) {
      const motivo = `SAP não precificou os itens: ${avisos.join(" • ")}`;
      await auditarBloqueio(auditCtx, {
        etapa: "salvar",
        motivo,
        dados: { avisos, precos, fallback, lista_preco: data.listaPreco },
      });
      throw new Error(motivo);
    }

    const itens = data.itens.map((i) => {
      const p = produtos.find((x) => x.id === i.produtoId)!;
      const cod = normCod(p.codigo);
      const valor = money2(precos[cod] ?? sugeridos[cod] ?? 0);
      return {
        produtoId: i.produtoId,
        codigo: p.codigo ?? null,
        nome: p.descricao,
        qtd: i.qtd,
        valor,
        total: money2(valor * i.qtd),
        valorManual: false,
      };
    });

    const semPreco = itens.filter((i) => !(i.valor > 0)).map((i) => i.nome || i.codigo);
    if (semPreco.length) {
      const motivo = `Sem preço no SAP nem preço sugerido no catálogo para: ${semPreco.slice(0, 8).join(", ")}.`;
      await auditarBloqueio(auditCtx, {
        etapa: "salvar",
        motivo,
        dados: { sem_preco: semPreco, precos, fallback, sugeridos },
      });
      throw new Error(motivo);
    }



    const subtotal = money2(itens.reduce((s, i) => s + i.total, 0));

    // Cupom: validado no servidor (existe, ativo e dentro da validade).
    let cupom: { id: string; codigo: string; desconto: number; freteGratis: boolean } | null = null;
    if (data.cupomCodigo) {
      const { data: c } = await supabase
        .from("solar_cupons")
        .select("*")
        .ilike("codigo", data.cupomCodigo.trim())
        .eq("ativo", true)
        .maybeSingle();
      if (!c) throw new Error("Cupom inválido ou inativo.");
      const row = c as any;
      const hoje = new Date(new Date().toDateString());
      if (row.validade_inicio && new Date(`${row.validade_inicio}T00:00:00`) > hoje)
        throw new Error(
          `Cupom ainda não está válido (início em ${new Date(`${row.validade_inicio}T00:00:00`).toLocaleDateString("pt-BR")}).`,
        );
      if (new Date(`${row.validade}T00:00:00`) < hoje) throw new Error("Cupom expirado.");
      // Usos reais = histórico registrado, desconsiderando a própria proposta em edição.
      let q = supabase
        .from("solar_cupom_usos")
        .select("id", { count: "exact", head: true })
        .eq("cupom_id", row.id);
      if (data.propostaId) q = q.neq("proposta_id", data.propostaId);
      const { count } = await q;
      const usos = Math.max(Number(count ?? 0), 0);
      if (!row.reutilizavel && usos > 0) throw new Error("Cupom já utilizado.");
      if (row.limite_usos != null && usos >= Number(row.limite_usos))
        throw new Error(`Cupom atingiu o limite de ${row.limite_usos} uso(s).`);
      const docCupom = String(row.cliente_doc ?? "").replace(/\D/g, "");
      if (docCupom && docCupom !== data.cliente.doc.replace(/\D/g, ""))
        throw new Error("Cupom válido apenas para outro cliente.");
      const tipos = (row.tipos ?? []) as string[];
      let desconto = 0;
      if (tipos.includes("percentual")) desconto += subtotal * (Number(row.percentual ?? 0) / 100);
      if (tipos.includes("valor")) desconto += Number(row.valor ?? 0);
      cupom = {
        id: row.id as string,
        codigo: row.codigo,
        desconto: money2(Math.min(desconto, subtotal)),
        freteGratis: tipos.includes("frete"),
      };
    }


    const freteValor = cupom?.freteGratis ? 0 : data.freteValor;
    const valorTotal = money2(subtotal - (cupom?.desconto ?? 0) + freteValor);

    const { resolverCondicaoPagamento } = await import("./condicoes-pagamento.server");
    const cond = await resolverCondicaoPagamento(supabase, data.condicaoPagamento);
    const repo = await import("./propostas-db.server");
    const numeroProposta = data.propostaId
      ? ((await repo.getProposta(data.propostaId, "numero"))?.["numero"] as string) ?? ""
      : await repo.proximoNumeroProposta("solar");

    const totais = {
      subtotal,
      desconto: cupom?.desconto ?? 0,
      frete: freteValor,
      valorTotal,
      cupom: cupom?.codigo ?? null,
      listaPreco: data.listaPreco,
      ehKit: data.ehKit,
      vendidoClienteFinal: data.vendidoClienteFinal,
    };

    const payload: Record<string, unknown> = {
      numero: numeroProposta,
      nome: data.propostaNome,
      cliente_nome: data.cliente.nome,
      cliente_telefone: data.cliente.telefone,
      cliente_email: data.cliente.email,
      cliente_doc: data.cliente.doc,
      cliente_ie: data.cliente.ie,
      uf: data.uf,
      contribuinte: data.contribuinte,
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
      frete_valor: freteValor,
      transportadora: data.transportadora?.nome ?? null,
      transportadora_documento: data.transportadora?.documento ?? null,
      transportadora_id: data.transportadora?.id ?? null,
      frete_prazo: data.transportadora?.prazo ?? null,
      observacoes: data.observacoes,
      itens,
      totais: { ...totais, calculo: data.calculo },
    };

    const { data: perfil } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const nomeAtual = (perfil as any)?.full_name ?? (perfil as any)?.email ?? null;

    /** Histórico de uso do cupom: 1 registro por proposta, removido se o cupom sair. */
    const registrarUsoCupom = async (propostaId: string) => {
      try {
        let limpar = supabase.from("solar_cupom_usos").delete().eq("proposta_id", propostaId);
        if (cupom) limpar = limpar.neq("cupom_id", cupom.id);
        await limpar;
        if (!cupom) return;
        const { data: existente } = await supabase
          .from("solar_cupom_usos")
          .select("id")
          .eq("proposta_id", propostaId)
          .eq("cupom_id", cupom.id)
          .maybeSingle();
        const registro = {
          codigo: cupom.codigo,
          proposta_numero: numeroProposta,
          cliente_nome: data.cliente.nome,
          cliente_doc: data.cliente.doc,
          desconto: cupom.desconto,
          frete_gratis: cupom.freteGratis,
          valor_total: valorTotal,
        };
        if (existente) {
          await supabase.from("solar_cupom_usos").update(registro).eq("id", (existente as any).id);
        } else {
          await supabase.from("solar_cupom_usos").insert({
            ...registro,
            cupom_id: cupom.id,
            proposta_id: propostaId,
            user_id: userId,
            user_nome: nomeAtual,
          });
        }
      } catch {
        /* histórico é auditoria: não bloqueia o salvamento */
      }
    };

    if (data.propostaId) {
      await repo.atualizarProposta(data.propostaId, payload);
      await registrarUsoCupom(data.propostaId);
      await espelharNoSalesforce(data.propostaId);
      return { id: data.propostaId, numero: numeroProposta, totais };
    }


    // Consultor: fotografado do cadastro do cliente no momento da criação.
    let consultorId: string | null = null;
    let consultorNome: string | null = null;
    try {
      const db = await import("./clientes-db.server");
      const achados = await db.findClienteByDoc(data.cliente.doc.replace(/\D/g, ""));
      const alvo = achados.find((a) => a.instancia === "solar")?.cliente ?? achados[0]?.cliente;
      if (alvo) {
        consultorId = (alvo["created_by"] as string | null) ?? null;
        consultorNome = (alvo["created_by_nome"] as string | null) ?? null;
      }
    } catch {
      /* cadastro indisponível */
    }

    let inserida: { id: string };
    try {
      inserida = (await repo.inserirProposta({
        ...payload,
        organizacao: "solar",
        status: "Salvo",
        created_by: userId,
        criado_por_nome: nomeAtual,
        consultor_id: consultorId,
        consultor_nome: consultorNome,
      })) as { id: string };
      if (!inserida?.id) throw new Error("O banco não devolveu o identificador da proposta.");
    } catch (error) {
      await auditarBloqueio(auditCtx, {
        etapa: "salvar.persistencia",
        motivo: error instanceof Error ? error.message : "Falha desconhecida ao gravar a proposta Solar.",
        dados: { numero: numeroProposta, organizacao: "solar", total: valorTotal, itens: itens.length },
      });
      throw error;
    }

    await registrarUsoCupom(inserida.id);
    await espelharNoSalesforce(inserida.id);


    return { id: inserida.id, numero: numeroProposta, totais };
  });
