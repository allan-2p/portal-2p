import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CREDITO_CONCLUSOES,
  CREDITO_PRIORIDADES,
  CREDITO_STATUS,
  creditoVencido,
  type CreditoAnalise,
  type CreditoHistoricoSf,
  type CreditoVigente,
} from "@/lib/credito";

const SELECT =
  "id, numero, instancia, cliente_doc, cliente_nome, cliente_id, status, prioridade, conclusao, " +
  "restricao, condicao_solicitada, condicao_aprovada, credito_solicitado, credito_aprovado, serasa, " +
  "validade, observacoes_vendedor, observacoes_financeiro, proposta_id, proposta_numero, " +
  "solicitado_por, solicitado_em, analista_id, concluido_em, contato_nome, contato_email, " +
  "contato_telefone, empresa_secundaria, empresa_secundaria_nome, empresa_secundaria_doc, anexos, " +
  "responsavel_analise, autorizacao_diretoria";

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function mapRow(r: any, nomes: Map<string, string>): CreditoAnalise {
  return {
    id: r.id,
    numero: r.numero,
    instancia: r.instancia,
    clienteDoc: r.cliente_doc,
    clienteNome: r.cliente_nome ?? null,
    clienteId: r.cliente_id ?? null,
    status: r.status,
    prioridade: r.prioridade,
    conclusao: r.conclusao ?? null,
    restricao: r.restricao ?? null,
    condicaoSolicitada: r.condicao_solicitada ?? null,
    condicaoAprovada: r.condicao_aprovada ?? null,
    creditoSolicitado: num(r.credito_solicitado),
    creditoAprovado: num(r.credito_aprovado),
    serasa: num(r.serasa),
    validade: r.validade ?? null,
    observacoesVendedor: r.observacoes_vendedor ?? null,
    observacoesFinanceiro: r.observacoes_financeiro ?? null,
    propostaId: r.proposta_id ?? null,
    propostaNumero: r.proposta_numero ?? null,
    solicitadoPor: r.solicitado_por ?? null,
    solicitadoPorNome: nomes.get(r.solicitado_por) ?? null,
    solicitadoEm: r.solicitado_em,
    analistaId: r.analista_id ?? null,
    analistaNome: r.analista_id ? (nomes.get(r.analista_id) ?? null) : null,
    concluidoEm: r.concluido_em ?? null,
    contatoNome: r.contato_nome ?? null,
    contatoEmail: r.contato_email ?? null,
    contatoTelefone: r.contato_telefone ?? null,
    empresaSecundaria: !!r.empresa_secundaria,
    empresaSecundariaNome: r.empresa_secundaria_nome ?? null,
    empresaSecundariaDoc: r.empresa_secundaria_doc ?? null,
    anexos: Array.isArray(r.anexos) ? r.anexos : [],
    responsavelAnalise: r.responsavel_analise ?? null,
    autorizacaoDiretoria: r.autorizacao_diretoria ?? null,
  };
}

async function nomesDe(supabase: any, rows: any[]): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(rows.flatMap((r) => [r.solicitado_por, r.analista_id]).filter(Boolean)),
  );
  const mapa = new Map<string, string>();
  if (!ids.length) return mapa;
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  for (const p of data ?? []) mapa.set(p.id, p.full_name || p.email || "—");
  return mapa;
}

/** Só quem tem o acesso `financeiro.credito` (ou admin) decide crédito. */
async function assertAnalista(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_feature", {
    _user_id: ctx.userId,
    _key: "financeiro.credito",
  });
  if (error || !data) {
    throw new Error("Somente o Financeiro (acesso Análise de Crédito) pode analisar esta solicitação.");
  }
}

/** Lista as análises do portal. Sem filtro, devolve as mais recentes. */
export const listCreditoAnalises = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: { doc?: string; status?: string[]; instancia?: string; limite?: number }) => input ?? {},
  )
  .handler(async ({ data, context }): Promise<CreditoAnalise[]> => {
    let q = (context.supabase as any)
      .from("credito_analises")
      .select(SELECT)
      .order("solicitado_em", { ascending: false })
      .limit(Math.min(Math.max(Number(data.limite) || 300, 1), 1000));
    const doc = soDigitos(data.doc);
    if (doc) q = q.eq("cliente_doc", doc);
    if (data.status?.length) q = q.in("status", data.status);
    if (data.instancia) q = q.eq("instancia", data.instancia);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const nomes = await nomesDe(context.supabase, rows ?? []);
    return (rows ?? []).map((r: any) => mapRow(r, nomes));
  });

/** Abre uma solicitação de crédito a partir do cadastro do cliente. */
export const solicitarCredito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      instancia: "solar" | "carregadores";
      clienteDoc: string;
      clienteNome?: string | null;
      clienteId?: string | null;
      creditoSolicitado?: number | null;
      condicaoSolicitada?: string | null;
      prioridade?: string | null;
      observacoesVendedor?: string | null;
      contatoNome?: string | null;
      contatoEmail?: string | null;
      contatoTelefone?: string | null;
      empresaSecundaria?: boolean | null;
      empresaSecundariaNome?: string | null;
      empresaSecundariaDoc?: string | null;
      anexos?: { path: string; nome: string; tamanho?: number | null; tipo?: string | null }[] | null;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<{ ok: true; id: string; numero: string }> => {
    const doc = soDigitos(data.clienteDoc);
    if (doc.length !== 11 && doc.length !== 14) throw new Error("CNPJ/CPF do cliente inválido.");
    const prioridade = CREDITO_PRIORIDADES.includes(data.prioridade as any)
      ? (data.prioridade as string)
      : "Normal";

    const contatoNome = data.contatoNome?.trim() || "";
    if (!contatoNome) throw new Error("Informe o contato principal do cliente.");
    const obsVendedor = data.observacoesVendedor?.trim() || "";
    if (!obsVendedor) throw new Error("As observações do vendedor são obrigatórias.");

    const temSecundaria = !!data.empresaSecundaria;
    const secNome = data.empresaSecundariaNome?.trim() || "";
    const secDoc = soDigitos(data.empresaSecundariaDoc);
    if (temSecundaria) {
      if (!secNome) throw new Error("Informe o nome da empresa secundária.");
      if (secDoc.length !== 11 && secDoc.length !== 14) {
        throw new Error("CNPJ/CPF da empresa secundária inválido.");
      }
    }

    const { data: abertas, error: eAbertas } = await (context.supabase as any)
      .from("credito_analises")
      .select("numero")
      .eq("cliente_doc", doc)
      .in("status", ["Análise Solicitada", "Em Andamento"])
      .limit(1);
    if (eAbertas) throw new Error(eAbertas.message);
    if (abertas?.length) {
      throw new Error(`Este cliente já tem a análise ${abertas[0].numero} em aberto no Financeiro.`);
    }

    const { data: row, error } = await (context.supabase as any)
      .from("credito_analises")
      .insert({
        instancia: data.instancia === "carregadores" ? "carregadores" : "solar",
        cliente_doc: doc,
        cliente_nome: data.clienteNome?.trim() || null,
        cliente_id: data.clienteId || null,
        prioridade,
        credito_solicitado: num(data.creditoSolicitado),
        condicao_solicitada: data.condicaoSolicitada?.trim() || null,
        observacoes_vendedor: obsVendedor,
        contato_nome: contatoNome,
        contato_email: data.contatoEmail?.trim() || null,
        contato_telefone: data.contatoTelefone?.trim() || null,
        empresa_secundaria: temSecundaria,
        empresa_secundaria_nome: temSecundaria ? secNome : null,
        empresa_secundaria_doc: temSecundaria ? secDoc : null,
        anexos: (data.anexos ?? []).map((a) => ({
          path: String(a.path),
          nome: String(a.nome),
          tamanho: a.tamanho ?? null,
          tipo: a.tipo ?? null,
        })),
        solicitado_por: context.userId,
      })
      .select("id, numero")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id, numero: row.numero };
  });
    return { ok: true, id: row.id, numero: row.numero };
  });

/** Cancela a própria solicitação enquanto ela não foi analisada. */
export const cancelarCredito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await (context.supabase as any)
      .from("credito_analises")
      .update({ status: "Cancelada" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Financeiro assume/atualiza/conclui a análise. */
export const analisarCredito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      status: string;
      prioridade?: string | null;
      conclusao?: string | null;
      restricao?: boolean | null;
      condicaoAprovada?: string | null;
      creditoAprovado?: number | null;
      serasa?: number | null;
      validade?: string | null;
      observacoesFinanceiro?: string | null;
      responsavelAnalise?: string | null;
      autorizacaoDiretoria?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAnalista(context);
    if (!CREDITO_STATUS.includes(data.status as any)) throw new Error("Status inválido.");
    const concluida = data.status === "Análise Concluída";
    if (concluida && !CREDITO_CONCLUSOES.includes(data.conclusao as any)) {
      throw new Error("Para concluir, informe a conclusão (Liberado ou Negado).");
    }
    if (concluida && data.conclusao === "Liberado" && num(data.creditoAprovado) == null) {
      throw new Error("Informe o crédito aprovado para liberar o cliente.");
    }
    if (concluida && !(data.responsavelAnalise?.trim())) {
      throw new Error("Informe quem foi o responsável pela análise.");
    }

    const patch: Record<string, unknown> = {
      status: data.status,
      analista_id: context.userId,
      conclusao: concluida ? data.conclusao : null,
      restricao: data.restricao ?? null,
      condicao_aprovada: concluida ? (data.condicaoAprovada?.trim() || null) : null,
      credito_aprovado: concluida && data.conclusao === "Liberado" ? num(data.creditoAprovado) : null,
      serasa: num(data.serasa),
      validade: concluida && data.conclusao === "Liberado" ? (data.validade || null) : null,
      observacoes_financeiro: data.observacoesFinanceiro?.trim() || null,
      responsavel_analise: data.responsavelAnalise?.trim() || null,
      autorizacao_diretoria: data.autorizacaoDiretoria?.trim() || null,
      concluido_em: concluida ? new Date().toISOString() : null,
    };
    if (data.prioridade && CREDITO_PRIORIDADES.includes(data.prioridade as any)) {
      patch["prioridade"] = data.prioridade;
    }

    const { error } = await (context.supabase as any)
      .from("credito_analises")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Limite vigente do cliente: última análise concluída como Liberado, sem
 * validade vencida. É o que libera condição a prazo no checkout.
 */
export const getCreditoVigente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { doc: string }) => input)
  .handler(async ({ data, context }): Promise<CreditoVigente | null> => {
    const doc = soDigitos(data.doc);
    if (!doc) return null;
    const { data: rows, error } = await (context.supabase as any)
      .from("credito_analises")
      .select("id, numero, credito_aprovado, condicao_aprovada, validade, concluido_em")
      .eq("cliente_doc", doc)
      .eq("status", "Análise Concluída")
      .eq("conclusao", "Liberado")
      .order("concluido_em", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    const valida = (rows ?? []).find((r: any) => !creditoVencido(r.validade));
    if (!valida) return null;
    return {
      analiseId: valida.id,
      numero: valida.numero,
      limite: num(valida.credito_aprovado),
      condicaoAprovada: valida.condicao_aprovada ?? null,
      validade: valida.validade ?? null,
      concluidoEm: valida.concluido_em ?? null,
    };
  });

/** Histórico do objeto de Análise de Crédito no Salesforce (somente leitura). */
export const getCreditoHistoricoSf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { doc: string }) => input)
  .handler(async ({ data }): Promise<{ registros: CreditoHistoricoSf[]; erro: string | null }> => {
    try {
      const { historicoCreditoSalesforce } = await import("./credito.server");
      return { registros: await historicoCreditoSalesforce(data.doc), erro: null };
    } catch (err) {
      return { registros: [], erro: (err as Error)?.message ?? "Falha ao consultar o Salesforce." };
    }
  });
