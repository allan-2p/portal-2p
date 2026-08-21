/**
 * Download dos documentos da NF do pedido (DANFE, XML da NF-e, boleto).
 *
 * Só quem pode ler a proposta baixa o arquivo — o bucket é privado e a URL
 * assinada dura 5 minutos. Cada download vira uma execução em `job_runs`
 * (quem baixou, quando, qual documento).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  propostaId: z.string().min(1),
  tipo: z.enum(["danfe", "xml", "boleto"]),
});

export type DocumentoNfResposta = {
  url: string;
  filename: string;
  inline: boolean;
  tipo: "danfe" | "xml" | "boleto";
};

export const baixarDocumentoNf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<DocumentoNfResposta> => {
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

    const { obterDocumentoNf } = await import("./nf-documentos.server");
    const { runJob } = await import("./job-runs.server");
    const r = await runJob(
      {
        job: "nf.documento",
        trigger: "portal",
        refType: "proposta",
        refId: data.propostaId,
        payload: { tipo: data.tipo, numero: row["numero"] ?? null, nf_numero: row["nf_numero"] ?? null },
        actorId: (context as any).userId ?? null,
        actorEmail: ((context as any).claims?.email as string | undefined) ?? null,
      },
      () => obterDocumentoNf(data.propostaId, data.tipo, row),
    );
    if (!r.ok) throw new Error(r.error);

    const doc = r.result;
    return { url: doc.url, filename: doc.filename, inline: doc.inline, tipo: doc.tipo };
  });
