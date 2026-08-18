import { registrarConclusaoFn, listarConclusoesFn } from "@/lib/propostas.functions";

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

/** Registra uma tentativa de conclusão (o log fica no banco do Grupo 2P). */
export async function registrarConclusao(input: {
  propostaId?: string | null;
  numero?: string | null;
  status?: string | null;
  resultado: ConclusaoResultado;
  origem?: string;
  detalhe?: string | null;
}) {
  try {
    await registrarConclusaoFn({ data: input });
  } catch {
    // auditoria nunca deve quebrar o fluxo de conclusão
  }
}

export async function listarConclusoes(limit = 100): Promise<ConclusaoLogRow[]> {
  return (await listarConclusoesFn({ data: { limit } })) as unknown as ConclusaoLogRow[];
}
