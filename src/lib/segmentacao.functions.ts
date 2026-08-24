import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPodeLer, getPerm } from "./object-perms.server";

const schema = z.object({
  instancia: z.enum(["solar", "carregadores"]).default("solar"),
  periodo: z.enum(["mes", "tri"]).default("mes"),
});

/**
 * Perfil de Cliente / Segmentação — dados do banco do Grupo 2P (tabela
 * `clientes` + espelho `opportunity_sf`). Sem chamadas à API do Salesforce.
 */
export const getSegmentacaoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const perm = await getPerm(context as any, data.instancia, "contas");
    assertPodeLer(perm, "contas");
    let consultorSap: string | null = null;
    if (!perm.view_all) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("numero_sap")
        .eq("id", context.userId)
        .maybeSingle();
      consultorSap = String(prof?.numero_sap ?? "").trim() || null;
    }
    const { calcularSegmentacao } = await import("./segmentacao.server");
    return calcularSegmentacao({
      instance: data.instancia,
      periodo: data.periodo,
      donoId: perm.view_all ? null : context.userId,
      consultorSap,
    });
  });
