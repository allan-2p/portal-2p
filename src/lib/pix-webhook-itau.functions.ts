import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CadastroWebhookInput = { webhookUrl: string };

/** Consulta o webhook Pix cadastrado no Itaú para a chave da conta. */
export const consultarWebhookPixFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.logs.jobs", "visualizar");
    const { consultarWebhookPix } = await import("@/lib/pix-webhook-itau.server");
    try {
      return { ok: true as const, data: await consultarWebhookPix() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao consultar o webhook no Itaú.";
      if (error instanceof Error && error.name === "ItauIndisponivel") {
        return { ok: false as const, retryable: true, message };
      }
      throw error;
    }
  });

/** Cadastra/atualiza o webhook Pix no Itaú (PUT /webhook/{chave}). */
export const cadastrarWebhookPixFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CadastroWebhookInput) => input)
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.logs.jobs", "editar");
    const { cadastrarWebhookPix } = await import("@/lib/pix-webhook-itau.server");
    try {
      return { ok: true as const, data: await cadastrarWebhookPix(data.webhookUrl) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao cadastrar o webhook no Itaú.";
      if (error instanceof Error && error.name === "ItauIndisponivel") {
        return { ok: false as const, retryable: true, message };
      }
      throw error;
    }
  });

/** Remove o webhook Pix cadastrado no Itaú. */
export const excluirWebhookPixFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.logs.jobs", "editar");
    const { excluirWebhookPix } = await import("@/lib/pix-webhook-itau.server");
    try {
      return { ok: true as const, data: await excluirWebhookPix() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao remover o webhook no Itaú.";
      if (error instanceof Error && error.name === "ItauIndisponivel") {
        return { ok: false as const, retryable: true, message };
      }
      throw error;
    }
  });

/** URL sugerida para cadastro (com token no caminho, por causa do sufixo /pix). */
export const urlWebhookPixFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.logs.jobs", "visualizar");
    const { urlSugerida } = await import("@/lib/pix-webhook-itau.server");
    return urlSugerida();
  });
