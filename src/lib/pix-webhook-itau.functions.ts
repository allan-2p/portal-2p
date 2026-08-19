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
    return await consultarWebhookPix();
  });

/** Cadastra/atualiza o webhook Pix no Itaú (PUT /webhook/{chave}). */
export const cadastrarWebhookPixFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CadastroWebhookInput) => input)
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.logs.jobs", "editar");
    const { cadastrarWebhookPix } = await import("@/lib/pix-webhook-itau.server");
    return await cadastrarWebhookPix(data.webhookUrl);
  });

/** Remove o webhook Pix cadastrado no Itaú. */
export const excluirWebhookPixFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.logs.jobs", "editar");
    const { excluirWebhookPix } = await import("@/lib/pix-webhook-itau.server");
    return await excluirWebhookPix();
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
