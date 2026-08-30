/**
 * Persistência das mensagens do Atlas.
 *
 * Grava com o cliente autenticado do usuário (RLS aplica), guardando as
 * `parts` do AI SDK e um texto plano para busca/preview na lista de conversas.
 */
import type { UIMessage } from "ai";

export function textoDaMensagem(msg: UIMessage): string {
  return (msg.parts ?? [])
    .map((p: any) => (p?.type === "text" ? String(p.text ?? "") : ""))
    .join("")
    .trim();
}

export async function salvarMensagem(
  ctx: { supabase: any; userId: string },
  threadId: string,
  msg: UIMessage | undefined,
): Promise<void> {
  if (!msg?.role) return;
  if (msg.role !== "user" && msg.role !== "assistant") return;
  const texto = textoDaMensagem(msg);

  const { error } = await ctx.supabase.from("atlas_mensagens").insert({
    thread_id: threadId,
    user_id: ctx.userId,
    role: msg.role,
    parts: (msg.parts ?? []) as never,
    texto: texto || null,
    sdk_message_id: msg.id ?? null,
  });
  if (error) {
    console.error("[atlas] falha ao salvar mensagem:", error.message);
    return;
  }

  const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() };
  if (msg.role === "user" && texto) {
    const { data: thread } = await ctx.supabase
      .from("atlas_threads")
      .select("titulo")
      .eq("id", threadId)
      .maybeSingle();
    if (!thread?.titulo || thread.titulo === "Nova conversa") {
      patch["titulo"] = texto.slice(0, 60);
    }
  }
  await ctx.supabase.from("atlas_threads").update(patch as never).eq("id", threadId);
}
