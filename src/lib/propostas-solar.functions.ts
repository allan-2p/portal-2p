import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { tpOvDoPedido, contribuinteDoFaturamento, documentoDaSimulacao } from "@/lib/sap-tp-ov";
import { finalidadeDaTela } from "@/lib/sap-clientes-map";
import { cnpjValido, cpfValido } from "@/lib/cnpj";

/**
 * Proposta 2P Solar — os valores NUNCA vêm da tela: o servidor recalcula tudo
 * a partir do catálogo e da tabela de preço escolhida (simulação do SAP), e
 * aplica o cupom informado.
 */

export type SalvarPropostaSolarInput = {
  propostaId: string | null;
  propostaNome: string;
  vendidoClienteFinal: boolean;
  /** Escolha tri-state da tela: sim | nao | estoque (usada no StageName do Salesforce). */
  projetoVendido: "sim" | "nao" | "estoque";
  previsaoFechamento: string | null;
  listaPreco: string;
  /** Venda em formato de kit (afeta regras comerciais/fiscais adiante). */
  ehKit: boolean;
  cliente: { nome: string; doc: string; ie: string; telefone: string; email: string };
  uf: string;
  contribuinte: boolean;
  tipoNf: string;
  /** Revenda | Industrialização | Uso e Consumo (exigida ao faturar o cliente final). */
  finalidadeUso: string | null;

  faturarClienteFinal: boolean;
  faturamento: Record<string, string | boolean>;
  formaPagamento: string | null;
  condicaoPagamento: string | null;
  entregaDiferente: boolean;
  entrega: Record<string, string>;
  freteMod: string;
  freteAreaRural: boolean;
  freteValor: number;
  /** Frete bonificado: a 2P absorve o frete (cliente não paga). */
  freteBonificado: boolean;
  transportadora: { id: string; nome: string; documento: string; total: number; prazo: number } | null;
  cupomCodigo: string | null;
  observacoes: string | null;
  /** Observações internas do pedido — não vão para a NF nem para o SAP. */
  observacoesInternas: string | null;
  calculo: Record<string, unknown> | null;
  /** `produtoId` do catálogo e/ou o código SAP do material (fallback). */
  itens: { produtoId: string; codigo: string; qtd: number; valor: number }[];
  /**
   * Trava de preço: o vendedor viu os valores da tela e confirmou os novos
   * preços do SAP. Sem confirmação, qualquer divergência bloqueia o salvamento.
   */
  precosConfirmados: boolean;
};

const money2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

/** Material do kit gerador fotovoltaico injetado quando o kit está ativo. */
export const KIT_FOTOVOLTAICO_MATERIAL = "100000350";
const normCod = (c: string) => String(c ?? "").trim().replace(/^0+(?=\d)/, "");

function validar(input: unknown): SalvarPropostaSolarInput {
  const i = (input ?? {}) as any;
  const propostaNome = String(i.propostaNome ?? "").trim().slice(0, 160);
  if (!propostaNome) throw new Error("Informe o nome da proposta.");
  const nome = String(i.cliente?.nome ?? "").trim();
  if (!nome) throw new Error("Selecione o cliente.");
  const uf = String(i.uf ?? "").trim().toUpperCase();
  if (uf.length !== 2) throw new Error("UF inválida.");

  // Item válido = tem `produtoId` do catálogo OU o código SAP do material. A
  // tela às vezes não consegue casar o item com o catálogo (catálogo ainda
  // carregando, SKU comercial etc.) — nesse caso o servidor resolve pelo código.
  const itens = (Array.isArray(i.itens) ? i.itens : [])
    .map((x: any) => ({
      produtoId: String(x?.produtoId ?? "").trim(),
      codigo: String(x?.codigo ?? "").trim(),
      qtd: Math.max(0, Number(x?.qtd) || 0),
      valor: money2(x?.valor),
    }))
    .filter((x: any) => (x.produtoId || x.codigo) && x.qtd > 0);
  if (!itens.length) throw new Error("Adicione ao menos um produto.");



  const projetoVendido = ["sim", "nao", "estoque"].includes(String(i.projetoVendido))
    ? (String(i.projetoVendido) as "sim" | "nao" | "estoque")
    : i.vendidoClienteFinal === true
      ? "sim"
      : "nao";
  const vendidoClienteFinal = projetoVendido === "sim" || i.vendidoClienteFinal === true;
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

  // Finalidade de uso: no Solar só é exigida quando o pedido fatura o cliente
  // final — é ele que entra como parceiro no SAP e define CFOP/IE. Aceita tanto
  // o rótulo ("Uso e Consumo") quanto o slug ("uso_consumo"), nunca um default.
  
  let finalidadeUso = finalidadeDaTela(i.finalidadeUso);
  const faturarClienteFinal = i.faturarClienteFinal === true;
  if (faturarClienteFinal) {
    const docFat = String(faturamento['doc'] ?? "").replace(/\D/g, "");
    if (!String(faturamento['nome'] ?? "").trim()) throw new Error("Informe o destinatário do faturamento.");
    if (docFat.length !== 11 && docFat.length !== 14) throw new Error("CNPJ/CPF do faturamento inválido.");
    if (!faturamento['logradouro'] || !faturamento['cidade'])
      throw new Error("Informe o endereço de faturamento do cliente final.");
    if (String(faturamento['uf'] ?? "").trim().length !== 2)
      throw new Error("Informe a UF do endereço de faturamento do cliente final.");
    // Dígitos verificadores obrigatórios. CPF nunca é contribuinte e a
    // finalidade é sempre Uso e Consumo (não se exige a seleção na tela);
    // CNPJ contribuinte precisa de IE e continua exigindo a finalidade.
    if (docFat.length === 11) {
      if (!cpfValido(docFat)) throw new Error("CPF do faturamento inválido.");
      faturamento['contribuinte'] = false;
      finalidadeUso = "Uso e Consumo";
    } else {
      if (!cnpjValido(docFat)) throw new Error("CNPJ do faturamento inválido.");
      if (!finalidadeUso)
        throw new Error("Informe a finalidade de uso (Revenda, Industrialização ou Uso e Consumo).");
      if (faturamento['contribuinte'] && !String(faturamento['ie'] ?? "").trim())
        throw new Error("Cliente final marcado como contribuinte: informe a inscrição estadual.");
    }
  }


  const freteMod = ["FOB", "CIF", "DEDICADO"].includes(String(i.freteMod)) ? String(i.freteMod) : "";
  const tipoNfRaw = String(i.tipoNf ?? "").trim().toLowerCase();
  if (!tipoNfRaw || !["venda", "triangulacao", "bonificacao"].includes(tipoNfRaw))
    throw new Error("Selecione o tipo de nota fiscal da operação.");
  const tipoNfNorm = tipoNfRaw;
  const t = i.transportadora;

  return {
    propostaId: i.propostaId ? String(i.propostaId) : null,
    propostaNome,
    vendidoClienteFinal,
    projetoVendido,
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
    tipoNf: tipoNfNorm,
    finalidadeUso,
    faturarClienteFinal,

    faturamento,
    // Bonificação não tem cobrança, mas o SAP exige condição de pagamento na OV:
    // grava boleto à vista (ZTERM 2P00), como fazia a plataforma antiga.
    formaPagamento:
      tipoNfNorm === "bonificacao"
        ? "boleto_vista"
        : ["boleto_vista", "boleto_prazo", "pix", "cartao_credito", "financiamento"].includes(String(i.formaPagamento))
          ? String(i.formaPagamento)
          : null,
    condicaoPagamento:
      tipoNfNorm === "bonificacao" ? null : i.condicaoPagamento ? String(i.condicaoPagamento).trim().toUpperCase() : null,
    entregaDiferente: !!i.entregaDiferente,
    entrega,
    freteMod,
    freteAreaRural: !!i.freteAreaRural,
    freteValor: freteMod === "FOB" || freteMod === "" ? 0 : money2(i.freteValor),
    // Bonificar só faz sentido com CIF/DEDICADO — em FOB o cliente contrata o frete.
    freteBonificado: i.freteBonificado === true && (freteMod === "CIF" || freteMod === "DEDICADO"),
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
    observacoesInternas: i.observacoesInternas ? String(i.observacoesInternas) : null,
    calculo: i.calculo && typeof i.calculo === "object" ? (i.calculo as Record<string, unknown>) : null,
    itens,
    precosConfirmados: i.precosConfirmados === true,
  };
}

/**
 * Espelhamento no Salesforce: entra na fila (`sf_status = 'pendente'`) e é
 * processado pelo cron em segundo plano — salvar não espera a integração.
 */
const SALESFORCE_PENDENTE = {
  sf_status: "pendente",
  sf_mensagem: "Na fila de envio ao Salesforce.",
} as const;

export const salvarPropostaSolar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validar)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const SELECT_PRODUTO = "id, codigo, descricao, preco_sugerido, imagem_path, ativo";
    const ids = [...new Set(data.itens.map((i) => i.produtoId).filter(Boolean))];
    const codigos = [...new Set(data.itens.filter((i) => !i.produtoId).map((i) => normCod(i.codigo)).filter(Boolean))];

    const [porId, porCodigo] = await Promise.all([
      ids.length
        ? supabase.from("sap_produtos").select(SELECT_PRODUTO).in("id", ids)
        : Promise.resolve({ data: [], error: null } as any),
      codigos.length
        ? supabase.from("sap_produtos").select(SELECT_PRODUTO).in("codigo", codigos)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (porId.error) throw new Error(porId.error.message);
    if (porCodigo.error) throw new Error(porCodigo.error.message);

    const produtos = [...((porId.data ?? []) as any[]), ...((porCodigo.data ?? []) as any[])].filter(
      (p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx,
    );

    // Itens que vieram só com o código SAP passam a apontar para o catálogo.
    const naoResolvidos: string[] = [];
    for (const item of data.itens) {
      if (item.produtoId) {
        if (!produtos.some((p) => p.id === item.produtoId)) naoResolvidos.push(item.codigo || item.produtoId);
        continue;
      }
      const achado = produtos.find((p) => normCod(p.codigo) === normCod(item.codigo));
      if (!achado) naoResolvidos.push(item.codigo);
      else item.produtoId = String(achado.id);
    }
    if (naoResolvidos.length)
      throw new Error(
        `Há itens que não estão no catálogo do portal: ${[...new Set(naoResolvidos)].slice(0, 8).join(", ")}.`,
      );


    // Kit fotovoltaico: o servidor é a autoridade — o kit-base entra sempre com
    // quantidade 1 e não pode ser removido nem alterado pela tela.
    if (data.ehKit) {
      const { data: kitRow } = await supabase
        .from("sap_produtos")
        .select("id, codigo, descricao, preco_sugerido, imagem_path, ativo")
        .eq("codigo", KIT_FOTOVOLTAICO_MATERIAL)
        .maybeSingle();
      if (!kitRow)
        throw new Error(
          `O material do kit (${KIT_FOTOVOLTAICO_MATERIAL}) não está no catálogo. Sincronize os produtos do SAP antes de vender kit fotovoltaico.`,
        );
      const kit = kitRow as any;
      if (!produtos.some((p) => p.id === kit.id)) produtos.push(kit);
      const jaTem = data.itens.find((i) => i.produtoId === kit.id);
      if (jaTem) jaTem.qtd = 1;
      else data.itens.push({ produtoId: String(kit.id), codigo: String(kit.codigo ?? ""), qtd: 1 });
    } else {
      // Sem kit, o kit-base não pode ser vendido avulso pela tela.
      const kitNaLista = produtos.find((p) => normCod(p.codigo) === KIT_FOTOVOLTAICO_MATERIAL);
      if (kitNaLista)
        throw new Error("O item de kit gerador só pode ser vendido com o kit fotovoltaico ativo.");
    }

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

    // Preço = impostos do parceiro faturado. Cliente final ainda não existe no
    // SAP: simula com o cliente fake da UF do faturamento (mesma regra da
    // precificação interativa), senão o SAP devolve "Não existe mestre de
    // clientes para emissor ordem" e o salvamento trava.
    const finalContribuinte = contribuinteDoFaturamento({
      contribuinte: data.contribuinte,
      faturarClienteFinal: data.faturarClienteFinal,
      faturamento: data.faturamento as { contribuinte?: unknown; doc?: unknown },
      clienteDoc: data.cliente.doc,
    });
    const { documentoSimulacaoComFake } = await import("./clientes-fakes.server");
    const { documento: docSimulacao, empresaCnpj } = await documentoSimulacaoComFake({
      faturarClienteFinal: data.faturarClienteFinal,
      triangulacao: String(data.tipoNf ?? "").toLowerCase().startsWith("triangul"),
      ufFaturamento: String(data.faturamento['uf'] ?? ""),
      finalContribuinte,
      documentoReal: documentoDaSimulacao({
        faturarClienteFinal: data.faturarClienteFinal,
        faturamento: data.faturamento as { doc?: unknown },
        clienteDoc: data.cliente.doc,
      }),
      clienteDoc: String(data.cliente.doc ?? ""),
    });

    const { precos, avisos, fallback } = await precosSolar(
      data.itens.map((i) => {
        const p = produtos.find((x) => x.id === i.produtoId)!;
        return { codigo: String(p.codigo), quantidade: i.qtd };
      }),
      {
        documento: docSimulacao,
        ...(empresaCnpj ? { empresaCnpj } : {}),
        listaPreco: data.listaPreco,
        tipoOv: tpOvDoPedido(data.tipoNf, finalContribuinte),
        kitFotovoltaico: data.ehKit,
        sugeridos,
        auditoria: { ...auditCtx, etapa: "salvar", doc: docSimulacao },
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

    // ------------------------------------------------------------------
    // Trava de preço: o valor que o vendedor viu na tela é o valor gravado.
    // Se a simulação do SAP devolver preço diferente (mudança de condição de
    // preço entre a montagem e o salvamento), o salvamento é BLOQUEADO com a
    // lista "de → para". Só grava quando o vendedor confirma explicitamente.
    // ------------------------------------------------------------------
    if (!data.precosConfirmados) {
      const divergentes: string[] = [];
      for (const i of data.itens) {
        const p = produtos.find((x) => x.id === i.produtoId)!;
        const cod = normCod(p.codigo);
        const novo = money2(precos[cod] ?? 0);
        const visto = money2(i.valor);
        if (visto > 0 && novo > 0 && Math.abs(novo - visto) >= 0.01) {
          const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          divergentes.push(`${p.descricao ?? cod} (${cod}): ${brl(visto)} → ${brl(novo)}`);
        }
      }
      if (divergentes.length) {
        const motivo =
          `PRECO_ALTERADO: a tabela ${data.listaPreco} mudou no SAP depois da montagem da proposta. ` +
          `${divergentes.slice(0, 8).join(" • ")}. ` +
          `A proposta NÃO foi salva: revise os preços e confirme para gravar com os novos valores.`;
        await auditarBloqueio(auditCtx, {
          etapa: "salvar",
          motivo,
          dados: { divergentes, precos, lista_preco: data.listaPreco },
        });
        throw new Error(motivo);
      }
    }


    const itens = data.itens.map((i) => {
      const p = produtos.find((x) => x.id === i.produtoId)!;
      const cod = normCod(p.codigo);
      // Preço vem SÓ do SAP — nunca do preço sugerido do catálogo.
      const valor = money2(precos[cod] ?? 0);
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
      const motivo = `O SAP não devolveu preço para: ${semPreco.slice(0, 8).join(", ")}. A proposta não foi salva — corrija a condição de preço no SAP (tabela ${data.listaPreco}) e tente de novo.`;

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
    // Bonificado: o frete continua gravado (o SAP precisa do valor para lançar
    // o desconto), mas não entra no total cobrado do cliente.
    const freteCobrado = data.freteBonificado ? 0 : freteValor;
    const valorTotal = money2(subtotal - (cupom?.desconto ?? 0) + freteCobrado);

    const { resolverCondicaoPagamento } = await import("./condicoes-pagamento.server");
    const cond = await resolverCondicaoPagamento(supabase, data.condicaoPagamento);
    const repo = await import("./propostas-db.server");
    const rowAtual = data.propostaId ? await repo.getProposta(data.propostaId) : null;
    if (rowAtual) {
      // Grupo com pedido fechado: as variações restantes são somente leitura.
      const { assertGrupoEditavel } = await import("./proposta-variacoes.server");
      await assertGrupoEditavel(rowAtual as any, "salvar");
    }
    const numeroProposta = data.propostaId
      ? ((rowAtual?.["numero"] as string) ?? "")
      : await repo.proximoNumeroProposta("solar");


    const totais = {
      subtotal,
      desconto: cupom?.desconto ?? 0,
      frete: freteValor,
      freteCobrado,
      freteBonificado: data.freteBonificado,
      valorTotal,
      cupom: cupom?.codigo ?? null,
      listaPreco: data.listaPreco,
      ehKit: data.ehKit,
      vendidoClienteFinal: data.vendidoClienteFinal,
      projetoVendido: data.projetoVendido,
    };
    // Finalidade de uso:
    //  - pedido faturado ao CLIENTE FINAL → vale o que foi preenchido na tela
    //    (esse parceiro normalmente não tem cadastro no portal, principalmente
    //    quando é CPF; é a tela que define CFOP/IE no cadastro do SAP);
    //  - pedido normal → sempre a do cadastro do cliente.
    const { finalidadeUsoDoCadastro } = await import("./carregadores");
    let finalidadeUso = finalidadeUsoDoCadastro(data.finalidadeUso);
    if (!data.faturarClienteFinal) {
      const docFinalidade = (data.cliente.doc ?? "").replace(/\D/g, "");
      if (docFinalidade.length >= 11) {
        try {
          const db = await import("./clientes-db.server");
          const cad = (await db.findClienteByDoc(docFinalidade))[0]?.cliente ?? null;
          if (cad) finalidadeUso = finalidadeUsoDoCadastro(cad["finalidade"] as string | null);
        } catch {
          /* cadastro indisponível: mantém o valor recebido */
        }
      }
    }

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
      finalidade_uso: finalidadeUso,

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
      frete_bonificado: data.freteBonificado,
      kit_fotovoltaico: data.ehKit,
      transportadora: data.transportadora?.nome ?? null,
      transportadora_documento: data.transportadora?.documento ?? null,
      transportadora_id: data.transportadora?.id ?? null,
      frete_prazo: data.transportadora?.prazo ?? null,
      observacoes: data.observacoes,
      observacoes_internas: data.observacoesInternas,
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
        // Histórico é imutável: sempre apaga o registro anterior e grava de novo.
        await supabase.from("solar_cupom_usos").delete().eq("proposta_id", propostaId);
        if (!cupom) return;
        await supabase.from("solar_cupom_usos").insert({
          codigo: cupom.codigo,
          proposta_numero: numeroProposta,
          cliente_nome: data.cliente.nome,
          cliente_doc: data.cliente.doc,
          desconto: cupom.desconto,
          frete_gratis: cupom.freteGratis,
          valor_total: valorTotal,
          cupom_id: cupom.id,
          proposta_id: propostaId,
          user_id: userId,
          user_nome: nomeAtual,
        });
      } catch {
        /* histórico é auditoria: não bloqueia o salvamento */
      }
    };


    if (data.propostaId) {
      // Variação não favorita não entra na fila do Salesforce.
      const naoFavorita =
        !!String(rowAtual?.["variacao_grupo"] ?? "").trim() && rowAtual?.["variacao_favorita"] !== true;
      const sf = naoFavorita
        ? {
            sf_status: "nao_favorita",
            sf_mensagem: "Variação não favorita — o Salesforce acompanha a favorita do grupo.",
          }
        : SALESFORCE_PENDENTE;
      // Cupom em paralelo: é auditoria e não precisa segurar a resposta.
      await Promise.all([
        repo.atualizarProposta(data.propostaId, { ...payload, ...sf }),
        registrarUsoCupom(data.propostaId),
      ]);
      return { id: data.propostaId, numero: numeroProposta, totais };
    }



    // Consultor: fotografado do cadastro do cliente no momento da criação.
    const { consultorDoClientePorDoc } = await import("./consultor-sap.server");
    const doCliente = await consultorDoClientePorDoc(data.cliente.doc, "solar");
    const consultorId: string | null = doCliente.id;
    const consultorNome: string | null = doCliente.nome;

    let inserida: { id: string };
    try {
      inserida = (await repo.inserirProposta({
        ...payload,
        ...SALESFORCE_PENDENTE,
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



    return { id: inserida.id, numero: numeroProposta, totais };
  });
