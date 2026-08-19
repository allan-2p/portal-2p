import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificacaoDTO = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  ref_tipo: string | null;
  ref_id: string | null;
  lida: boolean;
  created_at: string;
};

/** Notificações do usuário logado (mais recentes primeiro). */
export const listarMinhasNotificacoesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificacaoDTO[]> => {
    // O sino é opcional: sem sessão válida devolvemos lista vazia em vez de
    // estourar 401/500 (que derrubava a tela durante SSR/rota pública).
    const { getRequest } = await import("@tanstack/react-start/server");
    const token = getRequest()?.headers?.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return [];

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return [];
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    });
    const { data: userRes } = await supabase.auth.getUser(token);
    const userId = userRes?.user?.id;
    if (!userId) return [];

    const { data, error } = await supabase
      .from("notificacoes")
      .select("id,tipo,titulo,descricao,link,ref_tipo,ref_id,lida_em,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return [];
    return (data ?? []).map((r: any) => ({
      id: r.id,
      tipo: r.tipo,
      titulo: r.titulo,
      descricao: r.descricao,
      link: r.link,
      ref_tipo: r.ref_tipo,
      ref_id: r.ref_id,
      lida: Boolean(r.lida_em),
      created_at: r.created_at,
    }));
  });

/** Marca notificações como lidas (todas, ou apenas os ids informados). */
export const marcarNotificacoesLidasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids?: string[] } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("notificacoes")
      .update({ lida_em: new Date().toISOString() } as any)
      .eq("user_id", userId)
      .is("lida_em", null);
    if (data.ids?.length) q = q.in("id", data.ids);
    const { error } = await q;
    return { ok: !error };
  });
