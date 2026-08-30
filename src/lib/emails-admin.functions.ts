import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EmailEnviado = {
  id: string;
  messageId: string | null;
  template: string;
  destinatario: string;
  status: string;
  erro: string | null;
  criadoEm: string;
  /** Nº da tentativa deste par template + destinatário (1 = primeira). */
  tentativa: number;
  /** Destinatário descadastrado/bloqueado na plataforma de envio. */
  descadastrado: boolean;
  motivoDescadastro: string | null;
};

const Filtros = z.object({
  busca: z.string().trim().max(120).optional(),
  status: z.string().trim().max(30).optional(),
  template: z.string().trim().max(60).optional(),
  limite: z.number().int().min(10).max(500).optional(),
});

async function assertAdmin(ctx: { supabase: any }) {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  if (error || !data) throw new Error("Forbidden: admin role required");
}

export const listarEmailsEnviados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Filtros.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const limite = data.limite ?? 200;
    let q = supabaseAdmin
      .from("email_send_log")
      .select("id,message_id,template_name,recipient_email,status,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(limite);

    if (data.status) q = q.eq("status", data.status);
    if (data.template) q = q.eq("template_name", data.template);
    if (data.busca) {
      const b = `%${data.busca}%`;
      q = q.or(`recipient_email.ilike.${b},template_name.ilike.${b}`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const lista = (rows ?? []) as Record<string, any>[];
    const emails = Array.from(
      new Set(lista.map((r) => String(r["recipient_email"] ?? "").toLowerCase()).filter(Boolean)),
    );

    let supressos = new Map<string, string>();
    if (emails.length) {
      const { data: sup } = await supabaseAdmin
        .from("suppressed_emails")
        .select("email,reason")
        .in("email", emails);
      supressos = new Map(
        ((sup ?? []) as Record<string, any>[]).map((r) => [
          String(r["email"] ?? "").toLowerCase(),
          String(r["reason"] ?? ""),
        ]),
      );
    }

    // Numeração de tentativas: a lista vem do mais novo para o mais antigo.
    const contador = new Map<string, number>();
    const ordemAntiga = [...lista].reverse();
    const tentativas = new Map<string, number>();
    for (const r of ordemAntiga) {
      const chave = `${r["template_name"]}|${String(r["recipient_email"]).toLowerCase()}`;
      const n = (contador.get(chave) ?? 0) + 1;
      contador.set(chave, n);
      tentativas.set(String(r["id"]), n);
    }

    const out: EmailEnviado[] = lista.map((r) => {
      const destinatario = String(r["recipient_email"] ?? "");
      const motivo = supressos.get(destinatario.toLowerCase()) ?? null;
      return {
        id: String(r["id"]),
        messageId: r["message_id"] ? String(r["message_id"]) : null,
        template: String(r["template_name"] ?? ""),
        destinatario,
        status: String(r["status"] ?? ""),
        erro: r["error_message"] ? String(r["error_message"]) : null,
        criadoEm: String(r["created_at"]),
        tentativa: tentativas.get(String(r["id"])) ?? 1,
        descadastrado: Boolean(motivo),
        motivoDescadastro: motivo,
      };
    });

    return { emails: out };
  });

/** Lista os rótulos de template já usados, para o filtro da tela. */
export const listarTemplatesEmail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_send_log")
      .select("template_name")
      .order("created_at", { ascending: false })
      .limit(1000);
    const nomes = Array.from(
      new Set(((data ?? []) as Record<string, any>[]).map((r) => String(r["template_name"] ?? ""))),
    )
      .filter(Boolean)
      .sort();
    return { templates: nomes };
  });
