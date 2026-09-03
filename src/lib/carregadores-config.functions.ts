import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/guards.server";
import { recordModeration } from "@/lib/moderation-audit.server";

export const updateCarregadoresMargemMinima = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ margemMinima: z.number().min(0).max(1) })
      .parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ margemMinima: number }> => {
    await requireFeature(context, {
      instance: "carregadores",
      feature: "carregadores.regras",
      action: "moderar",
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atual, error: readError } = await supabaseAdmin
      .from("carregadores_config")
      .select("politica_mb_min")
      .eq("id", 1)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!atual) throw new Error("Configuração de Carregadores não encontrada.");

    const anterior = Number(atual.politica_mb_min ?? 0);
    const { error } = await supabaseAdmin
      .from("carregadores_config")
      .update({ politica_mb_min: data.margemMinima })
      .eq("id", 1);
    if (error) throw new Error(error.message);

    await recordModeration(context, {
      area: "carregadores_regras",
      instanceId: "carregadores",
      action: "atualizou",
      target: "Margem bruta mínima",
      summary: `Margem mínima alterada de ${(anterior * 100).toFixed(2)}% para ${(data.margemMinima * 100).toFixed(2)}%`,
      details: {
        de: anterior,
        para: data.margemMinima,
      },
    });

    return { margemMinima: data.margemMinima };
  });