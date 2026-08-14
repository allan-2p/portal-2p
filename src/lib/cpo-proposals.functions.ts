import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CPO_CONFIG_FALLBACK,
  calcularCpo,
  fmtPct,
  type CpoConfig,
  type CpoNcm,
  type CpoProduct,
  type CpoState,
  type CpoUf,
} from "@/lib/cpo";

export type SalvarPropostaInput = {
  propostaId: string | null;
  numero: string;
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
  freteMod: string;
  freteValor: number;
  observacoes: string | null;
  itens: { produtoId: string; qtd: number; valor: number }[];
};

const money2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

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
  return {
    propostaId: input.propostaId ? String(input.propostaId) : null,
    numero: String(input.numero ?? "").trim(),
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
    freteMod: String(input.freteMod ?? "FOB"),
    freteValor: money2(input.freteValor),
    observacoes: input.observacoes ? String(input.observacoes) : null,
    itens,
  };
}

/**
 * Salva/atualiza a proposta recalculando TODOS os totais no servidor a partir
 * do catálogo, alíquotas de UF, NCM e configuração vigentes. A UI nunca define
 * os valores persistidos — ela só envia cliente, itens e frete. Regras de
 * política (MB mínima e CMV máximo) são revalidadas aqui.
 */
export const salvarPropostaCpo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validar)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [cfgRes, ufRes, ncmRes, prodRes] = await Promise.all([
      supabase.from("cpo_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("cpo_uf_rates").select("uf, nome, aliq_interna, fcp, convenio_st"),
      supabase.from("cpo_ncm").select("*"),
      supabase
        .from("sap_produtos")
        .select("id, codigo, descricao, custo, preco_sugerido, ativo, ncm_id, ncm_codigo")
        .in("id", data.itens.map((i) => i.produtoId)),
    ]);
    if (prodRes.error) throw new Error(prodRes.error.message);

    const config: CpoConfig = cfgRes.data
      ? ({ ...CPO_CONFIG_FALLBACK, ...(cfgRes.data as any) } as CpoConfig)
      : CPO_CONFIG_FALLBACK;
    const ufs = ((ufRes.data ?? []) as any[]).map((u) => ({
      uf: u.uf,
      nome: u.nome,
      aliq_interna: Number(u.aliq_interna),
      fcp: Number(u.fcp),
      convenio_st: !!u.convenio_st,
    })) as CpoUf[];
    const ncms = ((ncmRes.data ?? []) as any[]) as CpoNcm[];
    const produtos = ((prodRes.data ?? []) as any[]).map((p) => ({
      id: p.id,
      codigo: p.codigo ?? null,
      nome: p.descricao,
      custo: Number(p.custo ?? 0),
      preco_sugerido: Number(p.preco_sugerido ?? 0),
      ativo: !!p.ativo,
      ncm_id: p.ncm_id ?? null,
      ncm_codigo: p.ncm_codigo ?? null,
    })) as CpoProduct[];

    const faltando = data.itens.filter((i) => !produtos.some((p) => p.id === i.produtoId));
    if (faltando.length) throw new Error("Há itens com produtos inexistentes ou indisponíveis no catálogo.");

    const state: CpoState = {
      nome: data.cliente.nome,
      telefone: data.cliente.telefone,
      email: data.cliente.email,
      doc: data.cliente.doc,
      ie: data.cliente.ie,
      uf: data.uf,
      contribuinte: data.contribuinte,
      regimeTributario: data.regimeTributario ?? null,
      finalidadeUso: data.finalidadeUso as CpoState["finalidadeUso"],
      freteMod: data.freteMod as CpoState["freteMod"],
      freteValor: data.freteValor,
      observacoes: data.observacoes ?? "",
      itens: data.itens.map((i, idx) => ({
        key: String(idx),
        produtoId: i.produtoId,
        qtd: i.qtd,
        valor: i.valor,
        valorManual: true,
      })),
    };

    const d = calcularCpo(state, produtos, ufs, config, ncms);

    if (d.mbPct < config.politica_mb_min)
      throw new Error(
        `MB% de ${fmtPct(d.mbPct)} abaixo da política mínima de ${fmtPct(config.politica_mb_min)}.`,
      );
    if (d.cmvExcedido)
      throw new Error(
        `CMV de ${fmtPct(d.cmv)} acima do limite de ${fmtPct(config.cmv_max)}. Necessária aprovação da diretoria.`,
      );

    const payload = {
      numero: data.numero,
      cliente_nome: data.cliente.nome,
      cliente_telefone: data.cliente.telefone,
      cliente_email: data.cliente.email,
      cliente_doc: data.cliente.doc,
      cliente_ie: data.cliente.ie,
      uf: data.uf,
      contribuinte: data.contribuinte,
      finalidade_uso: data.finalidadeUso,
      frete_mod: data.freteMod,
      frete_valor: data.freteValor,
      observacoes: data.observacoes,
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
        .from("cpo_proposals")
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
        .from("cpo_proposals")
        .update(patch)
        .eq("id", data.propostaId);
      if (error) throw new Error(error.message);
      return {
        id: data.propostaId,
        numero: data.numero,
        duplicada: false,
        totais: payload.totais,
        consultor: ((atual as any)?.consultor_nome ?? patch["consultor_nome"] ?? null) as string | null,
      };
    }

    const consultor = await consultorDoCliente();

    const { data: inserida, error } = await supabase
      .from("cpo_proposals")
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
          .from("cpo_proposals")
          .select("id")
          .eq("numero", data.numero)
          .maybeSingle();
        return {
          id: existente?.id ?? null,
          numero: data.numero,
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
      duplicada: false,
      totais: payload.totais,
      consultor: consultor.nome,
    };
  });
