/**
 * Download dos boletos a prazo (PDFs vindos do SharePoint) pelo detalhe do
 * pedido. O bucket é privado — a URL assinada dura 5 minutos e o acesso
 * respeita a permissão de leitura da proposta.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ propostaId: z.string().min(1), path: z.string().min(1) });

export const baixarBoletoSharepoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<{ url: string; filename: string }> => {
    const db = await import("./propostas-db.server");
    const row = (await db.getProposta(data.propostaId)) as Record<string, any> | null;
    if (!row) throw new Error("Pedido não encontrado.");

    const { assertPodeLer, getPerm } = await import("./object-perms.server");
    const perm = await getPerm(context as any, String(row["organizacao"] ?? "solar"), "propostas");
    assertPodeLer(perm, "propostas");
    const dono = (row["created_by"] as string | null) ?? null;
    if (!perm.view_all && dono && dono !== (context as any).userId) {
      throw new Error("Este pedido pertence a outro consultor.");
    }

    const lista = Array.isArray(row["boletos"]) ? (row["boletos"] as Record<string, any>[]) : [];
    const arquivo = lista.find((b) => String(b["path"]) === data.path);
    if (!arquivo) throw new Error("Boleto não encontrado neste pedido.");

    const { urlBoletoSharepoint } = await import("./boletos-sharepoint.server");
    const filename = String(arquivo["nome"] ?? "boleto.pdf");
    return { url: await urlBoletoSharepoint(data.path, filename), filename };
  });
