import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SyncRun = {
  id: string;
  job: string;
  instance_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  rows_read: number;
  rows_written: number;
  error: string | null;
};

export type SyncQueueItem = {
  id: string;
  job: string;
  instance_id: string;
  status: string;
  created_at: string;
  error: string | null;
};

/** Últimas execuções do worker + pedidos pendentes na fila. */
export const getSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [runsRes, queueRes] = await Promise.all([
      context.supabase
        .from("sync_runs")
        .select("id,job,instance_id,status,started_at,finished_at,rows_read,rows_written,error")
        .order("started_at", { ascending: false })
        .limit(30),
      context.supabase
        .from("sync_queue")
        .select("id,job,instance_id,status,created_at,error")
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (runsRes.error) throw new Error(runsRes.error.message);
    if (queueRes.error) throw new Error(queueRes.error.message);

    return {
      runs: (runsRes.data ?? []) as SyncRun[],
      queue: (queueRes.data ?? []) as SyncQueueItem[],
    };
  });

/** Enfileira um pedido de sincronização manual (somente admin, via RLS). */
export const requestSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { job: string; instanceId: string }) => ({
    job: String(input.job),
    instanceId: String(input.instanceId),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sync_queue").insert({
      job: data.job,
      instance_id: data.instanceId,
      requested_by: context.userId,
    });
    if (error) {
      throw new Error(
        error.message.includes("row-level")
          ? "Apenas administradores podem solicitar uma sincronização."
          : error.message,
      );
    }
    return { ok: true };
  });
