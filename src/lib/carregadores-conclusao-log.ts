import { supabase } from "@/integrations/supabase/client";

export type ConclusaoResultado = "concluida" | "duplicada" | "erro" | "tentativa";

export type ConclusaoLogRow = {
  id: string;
  proposta_id: string | null;
  numero: string | null;
  status: string | null;
  resultado: string;
  origem: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_nome: string | null;
  detalhe: string | null;
  created_at: string;
};

/** Registra uma tentativa de conclusão (as conclusões via RPC já são gravadas no banco). */
export async function registrarConclusao(input: {
  propostaId?: string | null;
  numero?: string | null;
  status?: string | null;
  resultado: ConclusaoResultado;
  origem?: string;
  detalhe?: string | null;
}) {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    await supabase.from("propostas_conclusao_log").insert({
      proposta_id: input.propostaId ?? null,
      numero: input.numero ?? null,
      status: input.status ?? null,
      resultado: input.resultado,
      origem: input.origem ?? "portal",
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      actor_nome: (user?.user_metadata?.["full_name"] as string | undefined) ?? null,
      detalhe: input.detalhe ?? null,
    });
  } catch {
    // auditoria nunca deve quebrar o fluxo de conclusão
  }
}

export async function listarConclusoes(limit = 100): Promise<ConclusaoLogRow[]> {
  const { data, error } = await supabase
    .from("propostas_conclusao_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ConclusaoLogRow[];
}
