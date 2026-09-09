import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PedidosParadosDados } from "./pedidos-parados.server";

export type { PedidoParado, PedidosParadosDados } from "./pedidos-parados.server";

/** Lista pedidos sem atualização no portal + último status recebido do SAP. */
export const listarPedidosParadosFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { horas?: number; limite?: number } | undefined) => ({
    horas: Number(input?.horas ?? 24),
    limite: Number(input?.limite ?? 25),
  }))
  .handler(async ({ data, context }): Promise<PedidosParadosDados> => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "admin.integracoes", "visualizar");
    const { listarPedidosParados } = await import("./pedidos-parados.server");
    return listarPedidosParados(data);
  });

/** Força a sincronização de um pedido específico com o SAP. */
export const sincronizarPedidoParadoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { propostaId: string }) => {
    const propostaId = String(input?.propostaId ?? "").trim();
    if (!propostaId) throw new Error("Pedido inválido.");
    return { propostaId };
  })
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "admin.integracoes", "editar");
    const { sincronizarPedidoNf } = await import("./sap-nfs.server");
    const r = await sincronizarPedidoNf(data.propostaId);
    return { de: r.de, para: r.para ?? null, nf: r.nf ?? null };
  });
