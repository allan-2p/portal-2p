import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Lotes de chegada de mercadoria (2P Carregadores). Ao fechar o pedido o
 * consultor escolhe em qual mês/lote a mercadoria chega; a lista é mantida em
 * Moderação › Carregadores (futuramente virá do SAP).
 */
export type LoteRow = {
  id?: string;
  mes_referencia: string; // YYYY-MM
  lote: string;
  previsao_chegada: string | null; // YYYY-MM-DD
  ativo: boolean;
  ordem: number;
  observacao: string | null;
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-03" → "mar/2026". */
export function fmtMesReferencia(mes: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes ?? ""));
  if (!m) return String(mes ?? "—");
  return `${MESES[Number(m[2]) - 1] ?? m[2]}/${m[1]}`;
}

export function rotuloLote(l: Pick<LoteRow, "mes_referencia" | "lote">): string {
  return `${fmtMesReferencia(l.mes_referencia)} · ${l.lote}`;
}

/** Lotes ativos, para o consultor escolher ao fechar o pedido. */
export const listarLotesAtivos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("carregadores_lotes")
      .select("id, mes_referencia, lote, previsao_chegada, ativo, ordem, observacao")
      .eq("ativo", true)
      .order("mes_referencia", { ascending: true })
      .order("ordem", { ascending: true })
      .order("lote", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LoteRow[];
  });

/**
 * Opções de chegada para a proposta: containers de carregadores em trânsito
 * (mês da remessa + identificação do container) somados aos lotes cadastrados
 * manualmente em Moderação.
 */
export type OpcaoEntrega = {
  id: string | null; // id do lote cadastrado (quando houver)
  mes_referencia: string; // AAAA-MM
  lote: string;
  previsao_chegada: string | null;
  origem: "container" | "cadastro";
};

export const listarOpcoesEntrega = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpcaoEntrega[]> => {
    const [{ data: produtos }, { data: containers }, { data: lotes }] = await Promise.all([
      context.supabase.from("produtos").select("codigo, visibilidade").in("visibilidade", ["carregadores", "ambos"]),
      context.supabase.from("containers").select("id_container, material, dt_remessa").not("dt_remessa", "is", null),
      context.supabase
        .from("carregadores_lotes")
        .select("id, mes_referencia, lote, previsao_chegada")
        .eq("ativo", true),
    ]);

    const codigos = new Set((produtos ?? []).map((p: any) => String(p.codigo)));
    const mapa = new Map<string, OpcaoEntrega>();

    for (const c of (containers ?? []) as any[]) {
      if (!codigos.has(String(c.material))) continue;
      const data = String(c.dt_remessa ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
      const mes = data.slice(0, 7);
      const lote = String(c.id_container ?? "").trim();
      if (!lote) continue;
      const chave = `${mes}|${lote.toLowerCase()}`;
      const atual = mapa.get(chave);
      if (!atual || (atual.previsao_chegada ?? "9999") > data) {
        mapa.set(chave, { id: null, mes_referencia: mes, lote, previsao_chegada: data, origem: "container" });
      }
    }

    for (const l of (lotes ?? []) as any[]) {
      const mes = String(l.mes_referencia ?? "");
      const lote = String(l.lote ?? "").trim();
      if (!/^\d{4}-\d{2}$/.test(mes) || !lote) continue;
      const chave = `${mes}|${lote.toLowerCase()}`;
      if (mapa.has(chave)) {
        mapa.set(chave, { ...mapa.get(chave)!, id: String(l.id) });
        continue;
      }
      mapa.set(chave, {
        id: String(l.id),
        mes_referencia: mes,
        lote,
        previsao_chegada: l.previsao_chegada ? String(l.previsao_chegada).slice(0, 10) : null,
        origem: "cadastro",
      });
    }

    return [...mapa.values()].sort(
      (a, b) => a.mes_referencia.localeCompare(b.mes_referencia) || a.lote.localeCompare(b.lote),
    );
  });

export const adminListarLotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "carregadores.regras", "visualizar");
    const { data, error } = await context.supabase
      .from("carregadores_lotes")
      .select("id, mes_referencia, lote, previsao_chegada, ativo, ordem, observacao")
      .order("mes_referencia", { ascending: true })
      .order("ordem", { ascending: true })
      .order("lote", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LoteRow[];
  });

export const adminSalvarLotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { linhas: LoteRow[]; removidos: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "carregadores.regras", "editar");

    const linhas = data.linhas.map((l, i) => ({
      ...(l.id ? { id: l.id } : {}),
      mes_referencia: String(l.mes_referencia ?? "").trim(),
      lote: String(l.lote ?? "").trim().slice(0, 60),
      previsao_chegada: l.previsao_chegada ? String(l.previsao_chegada).slice(0, 10) : null,
      ativo: !!l.ativo,
      ordem: Number.isFinite(Number(l.ordem)) ? Number(l.ordem) : i + 1,
      observacao: l.observacao ? String(l.observacao).trim().slice(0, 300) : null,
      updated_at: new Date().toISOString(),
    }));

    for (const l of linhas) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(l.mes_referencia))
        throw new Error(`Mês de referência inválido${l.lote ? ` em ${l.lote}` : ""} (use AAAA-MM).`);
      if (!l.lote) throw new Error(`Informe o nome do lote de ${fmtMesReferencia(l.mes_referencia)}.`);
      if (l.previsao_chegada && !/^\d{4}-\d{2}-\d{2}$/.test(l.previsao_chegada))
        throw new Error(`Previsão de chegada inválida em ${l.lote}.`);
    }
    const chaves = linhas.map((l) => `${l.mes_referencia}|${l.lote.toLowerCase()}`);
    const dup = chaves.find((v, i) => chaves.indexOf(v) !== i);
    if (dup) throw new Error(`Lote repetido no mesmo mês: ${dup.split("|")[1]}.`);

    if (data.removidos.length) {
      const { error } = await context.supabase.from("carregadores_lotes").delete().in("id", data.removidos);
      if (error) throw new Error(error.message);
    }
    if (linhas.length) {
      const { error } = await context.supabase
        .from("carregadores_lotes")
        .upsert(linhas as never, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
