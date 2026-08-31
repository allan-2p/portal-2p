import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const validarId = (input: unknown) => {
  const i = (input ?? {}) as { id?: unknown };
  if (typeof i.id !== "string" || !i.id) throw new Error("Proposta inválida.");
  return { id: i.id };
};

async function permProposta(context: any, org: string) {
  const { getPerm } = await import("./object-perms.server");
  return getPerm(context, org || "solar", "propostas");
}

/** Duplica a proposta como nova variação do mesmo número (60123 → 60123-B). */
export const criarVariacaoPropostaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarId)
  .handler(async ({ data, context }) => {
    const db = await import("./propostas-db.server");
    const origem = (await db.getProposta(data.id)) as Record<string, any> | null;
    if (!origem) throw new Error("Proposta não encontrada.");

    const { assertPodeCriar, assertPodeEditar } = await import("./object-perms.server");
    const perm = await permProposta(context, String(origem["organizacao"] ?? "solar"));
    assertPodeCriar(perm, "propostas");
    assertPodeEditar(perm, "propostas", (origem["created_by"] as string | null) ?? null, (context as any).userId);

    const { supabase, userId } = context as any;
    const { data: perfil } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    const { criarVariacao } = await import("./proposta-variacoes.server");
    return criarVariacao(data.id, {
      userId,
      nome: (perfil as any)?.full_name ?? (perfil as any)?.email ?? null,
    });
  });

/** Define qual variação do grupo é a favorita (a que vai ao Salesforce). */
export const marcarVariacaoFavoritaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarId)
  .handler(async ({ data, context }) => {
    const db = await import("./propostas-db.server");
    const row = (await db.getProposta(data.id)) as Record<string, any> | null;
    if (!row) throw new Error("Variação não encontrada.");

    const { assertPodeEditar } = await import("./object-perms.server");
    const perm = await permProposta(context, String(row["organizacao"] ?? "solar"));
    assertPodeEditar(perm, "propostas", (row["created_by"] as string | null) ?? null, (context as any).userId);

    const { trocarFavorita } = await import("./proposta-variacoes.server");
    const nova = await trocarFavorita(data.id);

    // Reenvia o grupo ao Salesforce na mesma Opportunity.
    try {
      const { sincronizarPedidoSalesforce } = await import("./salesforce-pedidos.server");
      await sincronizarPedidoSalesforce(data.id);
    } catch {
      /* a fila reprocessa */
    }
    return { ok: true, id: nova.id };
  });

/** Lista as variações do grupo de uma proposta (para o painel de comparação). */
export const listarVariacoesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarId)
  .handler(async ({ data }) => {
    const { irmasPorId } = await import("./proposta-variacoes.server");
    const irmas = await irmasPorId(data.id);
    return irmas.map((r) => ({
      id: r.id,
      numero: String(r["numero"] ?? ""),
      nome: (r["nome"] as string | null) ?? null,
      status: String(r["status"] ?? "Salvo"),
      variacao_sufixo: (r["variacao_sufixo"] as string | null) ?? null,
      variacao_favorita: r["variacao_favorita"] === true,
      variacao_grupo: (r["variacao_grupo"] as string | null) ?? null,
      itens: Array.isArray(r["itens"]) ? (r["itens"] as any[]) : [],
      totais: (r["totais"] ?? {}) as Record<string, any>,
      forma_pagamento: (r["forma_pagamento"] as string | null) ?? null,
      frete_valor: Number(r["frete_valor"] ?? 0),
      updated_at: (r["updated_at"] as string | null) ?? null,
      created_at: (r["created_at"] as string | null) ?? null,
    }));
  });

export type VariacaoResumo = Awaited<ReturnType<typeof listarVariacoesFn>>[number];
