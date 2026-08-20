/**
 * Motor de sincronização de estoque/produtos com o SAP.
 *
 * Usado tanto pelo botão manual (`syncEstoqueProdutos`) quanto pelo cron
 * `/api/public/hooks/estoque-sync`. Quando `userId` é null a execução é do
 * agendador.
 */

export type EstoqueSyncResult = {
  materiais: number;
  containers: number;
  ncmAplicado: number;
  produtos: number;
  espelho: { target: string; ok: boolean; skipped?: boolean; message?: string }[];
  duracaoMs: number;
};

export async function executarSyncEstoque(userId: string | null): Promise<EstoqueSyncResult> {
  const inicio = Date.now();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchEstoqueSap, mapearEstoque } = await import("./sap-estoque.server");
  const { getAllMaterials, classificarTipo } = await import("./sap-produtos.server");

  const { data: run } = await supabaseAdmin
    .from("estoque_sync_runs")
    .insert({ status: "running", triggered_by: userId })
    .select("id")
    .single();

  const finish = async (patch: Record<string, unknown>) => {
    if (run?.id) {
      await supabaseAdmin
        .from("estoque_sync_runs")
        .update({ finished_at: new Date().toISOString(), ...patch })
        .eq("id", run.id);
    }
  };

  try {
    const [itens, catalogo] = await Promise.all([fetchEstoqueSap(), getAllMaterials()]);
    const { estoque, containers } = mapearEstoque(itens);
    const now = new Date().toISOString();

    // ---- estoque: upsert + remoção do que saiu do SAP (sem janela vazia) ----
    for (let i = 0; i < estoque.length; i += 500) {
      const { error } = await supabaseAdmin
        .from("estoque")
        .upsert(
          estoque.slice(i, i + 500).map((r) => ({ ...r, atualizado_em: now })),
          { onConflict: "material" },
        );
      if (error) throw new Error(`estoque: ${error.message}`);
    }
    const materiais = estoque.map((e) => e.material);
    if (materiais.length) {
      await supabaseAdmin.from("estoque").delete().not("material", "in", `(${materiais.join(",")})`);
    }

    // ---- containers: mesmo padrão do estoque (upsert e depois remove ausentes) ----
    for (let i = 0; i < containers.length; i += 500) {
      const { error } = await supabaseAdmin
        .from("containers")
        .upsert(
          containers.slice(i, i + 500).map((c) => ({ ...c, atualizado_em: now })),
          { onConflict: "id_container,material" },
        );
      if (error) throw new Error(`containers: ${error.message}`);
    }
    // Remove só o que não veio nesta carga (comparação por atualizado_em desta execução).
    if (containers.length) {
      await supabaseAdmin.from("containers").delete().lt("atualizado_em", now);
    }

    // ---- produtos consolidados: catálogo + NCM/custo/preço do estoque ----
    const estoqueMap = new Map(estoque.map((e) => [e.material, e]));
    const { data: atuais } = await supabaseAdmin.from("produtos").select("codigo, visibilidade, ativo");
    const atuaisMap = new Map((atuais ?? []).map((r: any) => [r.codigo as string, r]));
    const { data: legado } = await supabaseAdmin.from("sap_produtos").select("codigo, visibilidade, ativo");
    const legadoMap = new Map((legado ?? []).map((r: any) => [r.codigo as string, r]));

    const codigos = new Set<string>([...catalogo.map((c) => c.codigo), ...estoqueMap.keys()]);
    const produtos = Array.from(codigos).map((codigo) => {
      const cat = catalogo.find((c) => c.codigo === codigo);
      const est = estoqueMap.get(codigo);
      const anterior = atuaisMap.get(codigo) ?? legadoMap.get(codigo);
      const descricao = cat?.descricao || est?.descricao || "";
      return {
        codigo,
        descricao,
        unidade: cat?.unidade ?? est?.umb ?? null,
        ncm: est?.ncm ?? cat?.ncm ?? null,
        tipo: descricao ? classificarTipo(descricao) : null,
        grp_mercadorias: est?.grp_mercadorias ?? null,
        custo: est?.cmm ?? 0,
        preco_venda: est?.preco_venda ?? 0,
        visibilidade: (anterior as any)?.visibilidade ?? "solar",
        no_catalogo: !!cat?.liberado,
        ativo: (anterior as any)?.ativo ?? true,
        origem: "sap",
        last_synced_at: now,
      };
    });

    for (let i = 0; i < produtos.length; i += 500) {
      const { error } = await supabaseAdmin
        .from("produtos")
        .upsert(produtos.slice(i, i + 500), { onConflict: "codigo" });
      if (error) throw new Error(`produtos: ${error.message}`);
    }

    // O NCM do SAP também alimenta o catálogo antigo do portal.
    let ncmAplicado = 0;
    for (const p of produtos) {
      if (!p.ncm) continue;
      const { error, count } = await supabaseAdmin
        .from("sap_produtos")
        .update({ ncm_codigo: p.ncm }, { count: "exact" })
        .eq("codigo", p.codigo)
        .is("ncm_codigo", null);
      if (!error) ncmAplicado += count ?? 0;
    }

    const { espelharProdutos } = await import("./produtos-mirror.server");
    const espelho = await espelharProdutos({
      produtos,
      estoque: estoque.map((r) => ({ ...r, atualizado_em: now })),
      containers: containers.map((c) => ({ ...c, atualizado_em: now })),
    });

    await finish({
      status: "success",
      materiais_count: estoque.length,
      containers_count: containers.length,
      ncm_aplicado: ncmAplicado,
    });

    const { logIntegrationEvent } = await import("./integration-logs.server");
    await logIntegrationEvent({
      slug: "sap",
      level: "info",
      event: "sync-estoque",
      message: `Estoque sincronizado: ${estoque.length} materiais, ${containers.length} containers, ${produtos.length} produtos consolidados.`,
      detail: { materiais: estoque.length, containers: containers.length, ncmAplicado, espelho },
      actorId: userId,
    });

    return {
      materiais: estoque.length,
      containers: containers.length,
      ncmAplicado,
      produtos: produtos.length,
      espelho,
      duracaoMs: Date.now() - inicio,
    };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    await finish({ status: "error", error_message: msg.slice(0, 500) });
    const { logIntegrationEvent } = await import("./integration-logs.server");
    await logIntegrationEvent({
      slug: "sap",
      level: "error",
      event: "sync-estoque",
      message: msg.slice(0, 500),
      detail: { duracao_ms: Date.now() - inicio },
      actorId: userId,
    });
    throw new Error(msg);
  }
}

/**
 * Reserva local pós-OV: soma a quantidade do pedido em `qtd_pend_faturar`,
 * espelhando a reserva feita no SAP até o próximo sync (que sobrescreve com o
 * valor oficial). Best effort — nunca desfaz a ordem de venda.
 */
export async function reservarEstoquePedido(
  itens: { codigo: string; qtd: number }[],
): Promise<{ materiais: number; erro?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const agregado = new Map<string, number>();
    for (const i of itens) {
      const cod = String(i?.codigo ?? "").trim();
      const qtd = Number(i?.qtd ?? 0);
      if (!cod || !(qtd > 0)) continue;
      agregado.set(cod, (agregado.get(cod) ?? 0) + qtd);
    }
    if (!agregado.size) return { materiais: 0 };

    const codigos = [...agregado.keys()];
    const { data } = await supabaseAdmin
      .from("estoque")
      .select("material, qtd_pend_faturar")
      .in("material", codigos);

    let alterados = 0;
    for (const row of data ?? []) {
      const atual = Number((row as any).qtd_pend_faturar ?? 0);
      const add = agregado.get((row as any).material as string) ?? 0;
      const { error } = await supabaseAdmin
        .from("estoque")
        .update({ qtd_pend_faturar: atual + add })
        .eq("material", (row as any).material);
      if (!error) alterados++;
    }
    return { materiais: alterados };
  } catch (e) {
    return { materiais: 0, erro: (e as Error).message };
  }
}
