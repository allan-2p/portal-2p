import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPodeLer, getPerm } from "./object-perms.server";

const schema = z.object({
  instancia: z.enum(["solar", "carregadores"]),
  sfAccountId: z.string().trim().max(20).optional().nullable(),
  doc: z.string().trim().max(20).optional().nullable(),
});

/** Histórico de propostas/pedidos do cliente, direto do banco do Grupo 2P. */
export const getDossieClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const perm = await getPerm(context as any, data.instancia, "contas");
    assertPodeLer(perm, "contas");
    const { carregarDossieCliente } = await import("./cliente-dossie.server");
    return carregarDossieCliente({
      instancia: data.instancia,
      sfAccountId: data.sfAccountId ?? null,
      doc: data.doc ?? null,
    });
  });
