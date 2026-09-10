/**
 * Fotos do catálogo pelo servidor.
 *
 * O acervo de fotos acompanha o catálogo na mudança para o grupo-2p, e o
 * navegador não tem crachá válido lá. Então quem assina, envia e apaga é o
 * servidor: a tela só recebe links temporários.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { catalogoDb } from "@/lib/catalogo-db.server";
import { exigirGestaoCatalogo } from "@/lib/catalogo-rest.functions";

export const BUCKET_PRODUTOS = "produtos";

const caminho = z.string().min(1).max(300);

/** Links de leitura temporários para as fotos pedidas. */
export const fotosAssinarLeitura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ caminhos: z.array(caminho).min(1).max(500), segundos: z.number().int().positive().max(86_400).default(3600) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await catalogoDb();
    const { data: urls, error } = await db.storage
      .from(BUCKET_PRODUTOS)
      .createSignedUrls(data.caminhos, data.segundos);
    if (error) throw new Error(error.message);
    return (urls ?? []).map((u) => ({ path: u.path ?? null, signedUrl: u.signedUrl ?? null }));
  });

/** Endereço temporário para a tela enviar o arquivo direto ao acervo. */
export const fotosUrlUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caminho }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirGestaoCatalogo(context);
    const db = await catalogoDb();
    const { data: assinado, error } = await db.storage
      .from(BUCKET_PRODUTOS)
      .createSignedUploadUrl(data.caminho, { upsert: true });
    if (error || !assinado) throw new Error(error?.message ?? "Não foi possível preparar o envio da foto.");
    return { url: assinado.signedUrl };
  });

/** Apaga fotos (original e miniatura). */
export const fotosRemover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caminhos: z.array(caminho).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirGestaoCatalogo(context);
    const db = await catalogoDb();
    const { error } = await db.storage.from(BUCKET_PRODUTOS).remove(data.caminhos);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
