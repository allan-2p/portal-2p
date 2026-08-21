import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CotarFreteData = {
  itens: { codigo: string; quantidade: number; pesoLiquido?: number; nome?: string }[];
  valorNota: number;
  destino: { uf: string; cidade: string; cep: string };
  areaRural?: boolean;
  documento?: string;
  idTransportadora?: string;
  unidade?: "solar" | "carregadores";
};

/** Cota o frete no Fretefy aplicando as regras comerciais da 2P. */
export const cotarFrete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CotarFreteData) => input)
  .handler(async ({ data, context }) => {
    const { cotarFreteFretefy } = await import("./frete.server");
    const { simularSap } = await import("./sap-precos.server");
    const { logIntegrationEvent } = await import("./integration-logs.server");
    const started = Date.now();

    const chave = (c: string) => String(c).replace(/^0+/, "");

    // Fonte única do peso: PESO_LIQUIDO devolvido pela simulação de preço do SAP.
    const simRes = await simularSap(
      data.itens.map((i) => ({ codigo: String(i.codigo), quantidade: Number(i.quantidade || 0) })),
      { ...(data.documento ? { documento: data.documento } : {}) },
    ).catch((e: Error) => ({ valores: new Map(), erros: [] as string[], motivo: e.message }));
    const sim = simRes.valores;
    // Mensagens de negócio do SAP (ex.: CNPJ sem parceiro cadastrado) não podem
    // ser engolidas — sem elas o portal cotaria com peso zerado.
    const sapMsgs = [...simRes.erros, ...(simRes.motivo ? [simRes.motivo] : [])];

    const origem = { peso: "sap" as const };
    const itens = data.itens.map((i) => {
      const qtd = Number(i.quantidade || 0);
      const reg = sim.get(chave(i.codigo));
      const linhaSap = Number(reg?.pesoLiquido ?? 0) || Number(reg?.pesoBruto ?? 0);
      const unit = linhaSap > 0 && qtd > 0 ? linhaSap / qtd : 0;

      return {
        codigo: String(i.codigo),
        nome: String(i.nome ?? ""),
        quantidade: qtd,
        pesoLiquido: unit,
      };
    });
    const cubagem = 0;
    const semPeso = itens.filter((i) => !(i.pesoLiquido > 0)).map((i) => i.nome || i.codigo);

    const { auditarBloqueio, auditarTentativaSap } = await import("./proposta-auditoria.server");
    const auditCtx = {
      doc: data.documento ?? null,
      ...(data.unidade ? { unidade: data.unidade } : {}),
      actorId: context.userId,
      actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
    };
    await auditarTentativaSap(auditCtx, {
      etapa: "frete",
      itens: data.itens.map((i) => ({ codigo: String(i.codigo), quantidade: Number(i.quantidade || 0) })),
      resposta: {
        pesos: itens.map((i) => ({ codigo: i.codigo, peso_unitario: i.pesoLiquido })),
        erros: simRes.erros,
        motivo: simRes.motivo ?? null,
      },
      erros: sapMsgs,
    });

    try {
      if (sapMsgs.length && semPeso.length) {
        const motivo = `SAP recusou a simulação: ${sapMsgs.join(" • ")}`;
        await auditarBloqueio(auditCtx, { etapa: "frete", motivo, dados: { sap: sapMsgs, sem_peso: semPeso } });
        throw new Error(motivo);
      }
      if (semPeso.length) {
        const motivo = `A simulação de preço do SAP não retornou peso para: ${semPeso.join(", ")}. Tente novamente ou verifique o cadastro do material no SAP.`;
        await auditarBloqueio(auditCtx, { etapa: "frete", motivo, dados: { sem_peso: semPeso } });
        throw new Error(motivo);
      }




      const r = await cotarFreteFretefy({
        itens,
        valorNota: Number(data.valorNota || 0),
        destino: data.destino,
        cubagem,
        tipoEntrega: "S",
        ...(data.areaRural !== undefined ? { areaRural: data.areaRural } : {}),
        ...(data.documento !== undefined ? { documento: data.documento } : {}),
        ...(data.idTransportadora !== undefined ? { idTransportadora: data.idTransportadora } : {}),
        ...(data.unidade !== undefined ? { unidade: data.unidade } : {}),
      });
      await logIntegrationEvent({
        slug: "fretefy",
        level: "info",
        event: "cotacao",
        message: `Cotação concluída: ${r.opcoes.length} opção(ões) para ${data.destino.cidade}/${data.destino.uf}. Peso ${r.peso} kg (origem: ${origem.peso === "sap" ? "simulação SAP" : "catálogo de produtos"}).`,
        durationMs: Date.now() - started,
        actorId: context.userId,
        actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
      });
      return { ...r, origemPeso: origem.peso };

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao cotar o frete.";
      await logIntegrationEvent({
        slug: "fretefy",
        level: "error",
        event: "cotacao",
        message: msg,
        durationMs: Date.now() - started,
        actorId: context.userId,
        actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
      });
      throw new Error(msg);
    }
  });

/** Transportadoras disponíveis para o frete dedicado (valor manual, prazo 2 dias). */
export const listarTransportadorasDedicadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("frete_transportadoras_dedicadas")
      .select("nome, fretefy_transportadora_id, cnpj")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    return (data ?? []).map((t: any) => ({
      id: String(t.fretefy_transportadora_id),
      nome: String(t.nome),
      documento: String(t.cnpj),
    }));
  });

/** Diagnóstico do Fretefy usado no painel de Integrações. */
export const diagnosticarFretefy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cep: string; cidade: string; uf: string; valorNota: number; peso: number }) => input)
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "admin.integracoes", "editar");

    const { cotarFreteFretefy } = await import("./frete.server");
    const started = Date.now();
    try {
      const r = await cotarFreteFretefy({
        itens: [{ codigo: "000000000", quantidade: 1, pesoLiquido: Number(data.peso || 1) }],
        valorNota: Number(data.valorNota || 1000),
        destino: { uf: data.uf, cidade: data.cidade, cep: data.cep },
        peso: Number(data.peso || 1),
        tipoEntrega: "S",
      });
      return {
        ok: true as const,
        durationMs: Date.now() - started,
        opcoes: r.opcoes,
        peso: r.peso,
        valorNotaFinal: r.valorNotaFinal,
        erro: null as string | null,
      };
    } catch (e) {
      return {
        ok: false as const,
        durationMs: Date.now() - started,
        opcoes: [],
        peso: Number(data.peso || 1),
        valorNotaFinal: Number(data.valorNota || 0),
        erro: e instanceof Error ? e.message : "Erro desconhecido.",
      };
    }
  });

export type DedicadaRow = {
  id?: string;
  nome: string;
  fretefy_transportadora_id: string;
  cnpj: string;
  ativo: boolean;
  ordem: number;
};

/** Lista completa (inclusive inativas) para o painel administrativo. */
export const adminListarDedicadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "admin.regras", "visualizar");
    const { data, error } = await context.supabase
      .from("frete_transportadoras_dedicadas")
      .select("id, nome, fretefy_transportadora_id, cnpj, ativo, ordem")
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as DedicadaRow[];
  });

/** Salva a lista inteira (upsert) e remove as excluídas no painel. */
export const adminSalvarDedicadas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { linhas: DedicadaRow[]; removidos: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "admin.regras", "editar");

    const linhas = data.linhas.map((l) => ({
      ...(l.id ? { id: l.id } : {}),
      nome: String(l.nome ?? "").trim(),
      fretefy_transportadora_id: String(l.fretefy_transportadora_id ?? "").trim(),
      cnpj: String(l.cnpj ?? "").replace(/\D/g, ""),
      ativo: !!l.ativo,
      ordem: Number(l.ordem ?? 0),
      updated_at: new Date().toISOString(),
    }));

    for (const l of linhas) {
      if (!l.nome) throw new Error("Todas as transportadoras precisam de nome.");
      if (!l.fretefy_transportadora_id) throw new Error(`Informe o ID Fretefy de ${l.nome}.`);
      if (l.cnpj.length !== 14) throw new Error(`CNPJ inválido em ${l.nome}.`);
    }
    const ids = linhas.map((l) => l.fretefy_transportadora_id);
    const dup = ids.find((v, i) => ids.indexOf(v) !== i);
    if (dup) throw new Error(`ID Fretefy repetido: ${dup}.`);

    if (data.removidos.length) {
      const { error } = await context.supabase
        .from("frete_transportadoras_dedicadas")
        .delete()
        .in("id", data.removidos);
      if (error) throw new Error(error.message);
    }
    if (linhas.length) {
      const { error } = await context.supabase
        .from("frete_transportadoras_dedicadas")
        .upsert(linhas as never, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
