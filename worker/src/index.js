// Orquestrador do worker: agenda o sync periódico e consome a fila do portal.
//
// Uso:
//   node --env-file=.env src/index.js                 # loop contínuo (produção)
//   node --env-file=.env src/index.js --once          # roda todos os jobs uma vez e sai
//   node --env-file=.env src/index.js --once --instance=solar

import { INSTANCES, portalConfig, schedule } from "./env.js";
import { createRest } from "./rest.js";
import { JOB as ACCOUNTS_JOB, runAccountsSync } from "./jobs/accounts.js";

const portal = createRest(portalConfig());

const JOBS = {
  [ACCOUNTS_JOB]: runAccountsSync,
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function readCursor(job, instance) {
  const rows = await portal.select(
    "sync_state",
    `job=eq.${job}&instance_id=eq.${instance}&select=cursor_value`,
  );
  return rows?.[0]?.cursor_value ?? null;
}

async function writeCursor(job, instance, cursor) {
  await portal.upsert(
    "sync_state",
    [{ job, instance_id: instance, cursor_value: cursor, last_success_at: new Date().toISOString() }],
    "job,instance_id",
  );
}

export async function runJob(job, instance, { full = false } = {}) {
  const fn = JOBS[job];
  if (!fn) throw new Error(`Job desconhecido: ${job}`);

  const [run] = await portal.insert("sync_runs", [
    { job, instance_id: instance, status: "running" },
  ]);
  log(`▶ ${job} [${instance}]${full ? " (carga total)" : ""}`);

  try {
    const cursor = full ? null : await readCursor(job, instance);
    const result = await fn(instance, cursor);
    if (result.cursor) await writeCursor(job, instance, result.cursor);
    await portal.patch("sync_runs", `id=eq.${run.id}`, {
      status: "success",
      finished_at: new Date().toISOString(),
      rows_read: result.read,
      rows_written: result.written,
    });
    log(`✔ ${job} [${instance}] ${result.written} registros`);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await portal.patch("sync_runs", `id=eq.${run.id}`, {
      status: "error",
      finished_at: new Date().toISOString(),
      error: message.slice(0, 1000),
    });
    log(`✖ ${job} [${instance}] ${message}`);
    throw err;
  }
}

async function runAll(instances) {
  for (const instance of instances) {
    for (const job of Object.keys(JOBS)) {
      try {
        await runJob(job, instance);
      } catch {
        /* já registrado em sync_runs */
      }
    }
  }
}

async function drainQueue() {
  const pending = await portal.select(
    "sync_queue",
    "status=eq.pending&select=id,job,instance_id,params&order=created_at.asc&limit=5",
  );
  for (const item of pending ?? []) {
    await portal.patch("sync_queue", `id=eq.${item.id}`, {
      status: "running",
      picked_at: new Date().toISOString(),
    });
    try {
      await runJob(item.job, item.instance_id, { full: item.params?.full === true });
      await portal.patch("sync_queue", `id=eq.${item.id}`, {
        status: "done",
        finished_at: new Date().toISOString(),
      });
    } catch (err) {
      await portal.patch("sync_queue", `id=eq.${item.id}`, {
        status: "error",
        finished_at: new Date().toISOString(),
        error: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
      });
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const instances = arg("instance") ? [arg("instance")] : INSTANCES;

  if (args.includes("--once")) {
    const job = arg("job");
    if (job) {
      for (const i of instances) await runJob(job, i, { full: args.includes("--full") });
    } else {
      await runAll(instances);
    }
    return;
  }

  log(`Worker iniciado · sync a cada ${schedule.syncIntervalMs / 60000} min · fila a cada ${schedule.queuePollMs / 1000}s`);
  await runAll(instances);
  setInterval(() => void runAll(instances).catch((e) => log("erro no ciclo:", e)), schedule.syncIntervalMs);
  setInterval(() => void drainQueue().catch((e) => log("erro na fila:", e)), schedule.queuePollMs);
}

main().catch((err) => {
  log("falha fatal:", err);
  process.exit(1);
});
