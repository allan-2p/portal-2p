import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Um cartão do mapa mental do cliente. */
export type ClientNoteCard = {
  id: string;
  title?: string;
  text: string;
  color: "amber" | "sky" | "emerald" | "rose" | "violet";
  x: number;
  y: number;
  pinned?: boolean;
  /** ISO da criação do cartão. */
  createdAt?: string;
};

export type ClientNotesPayload = {
  notes: string;
  canvas: ClientNoteCard[];
  updatedAt: string | null;
};

const validAccount = (v: string) => /^[a-zA-Z0-9]{15,18}$/.test(v);

export const getClientNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string; instancia?: string }) => input)
  .handler(async ({ data, context }): Promise<ClientNotesPayload> => {
    const accountId = String(data.accountId ?? "").trim();
    if (!validAccount(accountId)) throw new Error("accountId inválido");
    const instancia = data.instancia === "carregadores" ? "carregadores" : "solar";
    const { data: row, error } = await context.supabase
      .from("client_notes")
      .select("notes, canvas, updated_at")
      .eq("instancia", instancia)
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw error;
    return {
      notes: row?.notes ?? "",
      canvas: (Array.isArray(row?.canvas) ? row?.canvas : []) as ClientNoteCard[],
      updatedAt: row?.updated_at ?? null,
    };
  });

export const saveClientNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      accountId: string;
      accountName?: string;
      instancia?: string;
      notes: string;
      canvas: ClientNoteCard[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const accountId = String(data.accountId ?? "").trim();
    if (!validAccount(accountId)) throw new Error("accountId inválido");
    const instancia = data.instancia === "carregadores" ? "carregadores" : "solar";
    const canvas = (Array.isArray(data.canvas) ? data.canvas : []).slice(0, 200);
    const { error } = await context.supabase.from("client_notes").upsert(
      {
        instancia,
        account_id: accountId,
        account_name: (data.accountName ?? "").slice(0, 200) || null,
        notes: String(data.notes ?? "").slice(0, 20000),
        canvas,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "instancia,account_id" },
    );
    if (error) throw error;
    return { ok: true as const, updatedAt: new Date().toISOString() };
  });
