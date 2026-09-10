/**
 * Ponte de leitura/escrita do catálogo para o NAVEGADOR.
 *
 * O catálogo (produtos, estoque, calculadora Solar) está saindo do Lovable
 * Cloud para o grupo-2p. O navegador não pode falar direto com o grupo-2p —
 * o token de login é do Lovable e não vale lá —, então toda consulta passa
 * por estas server functions, que usam a conexão de serviço definida em
 * `catalogo-db.server.ts` (Lovable ou grupo-2p, conforme `CATALOGO_DB`).
 *
 * Segurança: só as tabelas do catálogo entram na lista permitida; leitura
 * exige sessão e escrita exige permissão de moderação/gestão do catálogo.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyFeature } from "@/lib/guards.server";
import { catalogoDb } from "@/lib/catalogo-db.server";

/** Tabelas que a ponte aceita — nada fora daqui é acessível pelo navegador. */
export const TABELAS_CATALOGO = [
  "sap_produtos",
  "sap_catalogo_sap",
  "estoque",
  "containers",
  "produtos",
  "solar_modulos",
  "solar_geradores",
  "solar_microinversores",
  "solar_trilhos",
  "solar_suportes",
  "solar_trilho_suportes",
  "solar_calc_config",
  "solar_cupons",
  "solar_cupom_usos",
  "carregadores_ncm",
  "carregadores_config",
  "carregadores_uf_rates",
] as const;

export type TabelaCatalogo = (typeof TABELAS_CATALOGO)[number];

const valor = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const filtroSchema = z.object({
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "is", "in", "ilike"]),
  coluna: z.string().max(80),
  valor: z.union([valor, z.array(valor)]),
});

const selectSchema = z.object({
  tabela: z.enum(TABELAS_CATALOGO),
  colunas: z.string().max(2000).default("*"),
  filtros: z.array(filtroSchema).max(20).default([]),
  ordem: z.string().max(80).optional(),
  ascendente: z.boolean().default(true),
  limite: z.number().int().positive().max(10000).optional(),
  unico: z.enum(["nenhum", "maybeSingle", "single"]).default("nenhum"),
});

function aplicarFiltros(query: any, filtros: z.infer<typeof filtroSchema>[]) {
  let q = query;
  for (const f of filtros) {
    if (f.op === "in") q = q.in(f.coluna, (Array.isArray(f.valor) ? f.valor : [f.valor]) as any);
    else if (f.op === "is") q = q.is(f.coluna, f.valor as any);
    else q = (q as any)[f.op](f.coluna, f.valor as any);
  }
  return q;
}

/** Consulta de leitura no catálogo (exige sessão). */
export const catalogoSelect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => selectSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await catalogoDb();
    let q: any = db.from(data.tabela).select(data.colunas);
    q = aplicarFiltros(q, data.filtros);
    if (data.ordem) q = q.order(data.ordem, { ascending: data.ascendente });
    if (data.limite) q = q.limit(data.limite);
    if (data.unico === "maybeSingle") q = q.maybeSingle();
    if (data.unico === "single") q = q.single();
    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);
    return (linhas ?? null) as any;
  });

/** Só quem modera/gerencia o catálogo pode gravar. */
async function exigirGestaoCatalogo(context: unknown) {
  await requireAnyFeature(context as any, [
    { instance: "solar", feature: "admin.objetos.produtos", action: "moderar" },
    { instance: "carregadores", feature: "admin.objetos.produtos", action: "moderar" },
    { instance: "carregadores", feature: "carregadores.produtos", action: "moderar" },
  ]);
}

const linhasSchema = z.array(z.record(z.string(), z.any())).min(1).max(2000);

/** Inserção/atualização em lote (upsert quando vier `onConflict`). */
export const catalogoUpsert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tabela: z.enum(TABELAS_CATALOGO),
        linhas: linhasSchema,
        onConflict: z.string().max(120).optional(),
        retornar: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirGestaoCatalogo(context);
    const db = await catalogoDb();
    const base: any = db.from(data.tabela);
    const q = data.onConflict
      ? base.upsert(data.linhas, { onConflict: data.onConflict })
      : base.insert(data.linhas);
    const { data: linhas, error } = data.retornar ? await q.select() : await q;
    if (error) throw new Error(error.message);
    return (linhas ?? null) as any;
  });

/** Atualização por filtro. */
export const catalogoUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tabela: z.enum(TABELAS_CATALOGO),
        valores: z.record(z.string(), z.any()),
        filtros: z.array(filtroSchema).min(1).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirGestaoCatalogo(context);
    const db = await catalogoDb();
    const q = aplicarFiltros(db.from(data.tabela).update(data.valores as any), data.filtros);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remoção por filtro (nunca sem filtro). */
export const catalogoDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tabela: z.enum(TABELAS_CATALOGO),
        filtros: z.array(filtroSchema).min(1).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirGestaoCatalogo(context);
    const db = await catalogoDb();
    const q = aplicarFiltros(db.from(data.tabela).delete(), data.filtros);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
