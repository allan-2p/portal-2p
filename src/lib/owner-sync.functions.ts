import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const instanciaSchema = z.enum(["solar", "carregadores"]);

/**
 * Alinha o cadastro do cliente com o dono atual da conta no Salesforce.
 * Chamado ao abrir o perfil 360: se a conta foi transferida, o portal passa a
 * mostrar o novo vendedor imediatamente.
 */
export const sincronizarDonoContaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ instancia: instanciaSchema, accountId: z.string().min(15).max(18) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { sincronizarDonoDaConta } = await import("./owner-sync.server");
    try {
      return await sincronizarDonoDaConta(context as any, data.instancia, data.accountId);
    } catch {
      return { verificados: 0, transferidos: 0, detalhes: [] };
    }
  });

/** Sincroniza a carteira inteira da instância (somente administradores). */
export const sincronizarDonosFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ instancia: instanciaSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Apenas administradores podem sincronizar a carteira.");
    const { sincronizarDonos } = await import("./owner-sync.server");
    return await sincronizarDonos(context as any, data.instancia);
  });
