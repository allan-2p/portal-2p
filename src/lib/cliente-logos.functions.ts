import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const docSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((v) => v.replace(/\D/g, ""));

/** Logomarca do cliente guardada como data URL (limite ~600KB). */
export const getClienteLogo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ doc: docSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("cliente_logos")
      .select("doc, data_url, updated_at")
      .eq("doc", data.doc)
      .maybeSingle();
    return row ?? null;
  });

export const saveClienteLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        doc: docSchema,
        dataUrl: z
          .string()
          .max(900_000)
          .regex(/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/, "Formato de imagem inválido."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cliente_logos").upsert(
      {
        doc: data.doc,
        data_url: data.dataUrl,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "doc" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClienteLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ doc: docSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cliente_logos").delete().eq("doc", data.doc);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
