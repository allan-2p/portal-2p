/**
 * Sincronização do dono da conta (transferência de carteira).
 *
 * O Salesforce (banco espelho `account_sf`) é a fonte da verdade sobre quem é
 * o vendedor responsável por um cliente. Quando uma conta é transferida de um
 * vendedor para outro, o portal precisa refletir o novo dono em todos os
 * lugares que guardam uma cópia do responsável — hoje, o cadastro universal de
 * clientes (`clientes.created_by`). Registros históricos (propostas, pedidos,
 * tarefas e interações já criadas) continuam com o vendedor anterior.
 */

import type { AccountsInstance } from "./accounts-db.server";
import type { ClienteRow } from "./clientes-db.server";

type Ctx = { supabase: any; userId: string };

export type OwnerSyncResult = {
  verificados: number;
  transferidos: number;
  detalhes: Array<{ cliente: string; doc: string; de: string | null; para: string }>;
};

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Mapa sf_user_id -> { id, nome, email } dos perfis ativos do portal. */
async function perfisPorSfId(supabase: any) {
  const { data } = await supabase
    .from("profiles")
    .select("id, sf_user_id, full_name, email, ativo")
    .not("sf_user_id", "is", null);
  const map = new Map<string, { id: string; nome: string | null; email: string | null }>();
  for (const p of data ?? []) {
    if (!p.sf_user_id || p.ativo === false) continue;
    map.set(p.sf_user_id as string, {
      id: p.id as string,
      nome: (p.full_name as string) ?? (p.email as string) ?? null,
      email: (p.email as string) ?? null,
    });
  }
  return map;
}

async function registrar(
  ctx: Ctx,
  instancia: AccountsInstance,
  info: { cliente: string; doc: string; de: string | null; para: string; paraId: string },
) {
  const { recordModeration } = await import("./moderation-audit.server");
  await recordModeration(ctx, {
    area: "clientes",
    instanceId: instancia,
    action: "transferencia-carteira",
    target: info.doc,
    summary: `Cliente ${info.cliente} transferido para ${info.para}`,
    details: { de: info.de, para: info.para, para_id: info.paraId, origem: "salesforce" },
  });
}

/**
 * Alinha o cadastro de clientes de uma instância com o dono atual da conta no
 * Salesforce. Pode ser restrito a um conjunto de documentos (CNPJ/CPF).
 */
export async function sincronizarDonos(
  ctx: Ctx,
  instancia: AccountsInstance,
  opts: { docs?: string[] } = {},
): Promise<OwnerSyncResult> {
  const accountsDb = await import("./accounts-db.server");
  const clientesDb = await import("./clientes-db.server");

  const filtro = opts.docs ? new Set(opts.docs.map(digits).filter(Boolean)) : null;

  let clientes: ClienteRow[] = [];
  try {
    clientes = await clientesDb.listClientes(instancia);
  } catch (e) {
    if (e instanceof clientesDb.ClientesTableMissing) {
      return { verificados: 0, transferidos: 0, detalhes: [] };
    }
    throw e;
  }
  const porDoc = new Map<string, ClienteRow>();
  for (const c of clientes) {
    const d = digits(c["doc"]);
    if (!d) continue;
    if (filtro && !filtro.has(d)) continue;
    porDoc.set(d, c);
  }
  if (porDoc.size === 0) return { verificados: 0, transferidos: 0, detalhes: [] };

  const [contas, perfis] = await Promise.all([
    accountsDb.fetchAccountsFromDb(instancia),
    perfisPorSfId(ctx.supabase),
  ]);

  const result: OwnerSyncResult = { verificados: porDoc.size, transferidos: 0, detalhes: [] };

  for (const conta of contas) {
    const cnpj = digits((conta.custom_fields as any)?.["CNPJ__c"]);
    if (!cnpj) continue;
    const cliente = porDoc.get(cnpj);
    if (!cliente) continue;
    const dono = conta.owner_id ? perfis.get(conta.owner_id) : undefined;
    if (!dono) continue;
    if ((cliente["created_by"] as string | null) === dono.id) continue;

    await clientesDb.updateCliente(instancia, cliente["id"] as string, {
      created_by: dono.id,
      created_by_nome: dono.nome,
      created_by_email: dono.email,
    });
    const info = {
      cliente: String(cliente["razao_social"] ?? conta.name ?? cnpj),
      doc: cnpj,
      de: (cliente["created_by_nome"] as string | null) ?? null,
      para: dono.nome ?? dono.email ?? "—",
      paraId: dono.id,
    };
    result.transferidos += 1;
    result.detalhes.push({ cliente: info.cliente, doc: info.doc, de: info.de, para: info.para });
    await registrar(ctx, instancia, info);
  }

  return result;
}

/** Sincroniza apenas o cliente de uma conta específica (usado ao abrir o 360). */
export async function sincronizarDonoDaConta(
  ctx: Ctx,
  instancia: AccountsInstance,
  accountId: string,
): Promise<OwnerSyncResult> {
  const vazio: OwnerSyncResult = { verificados: 0, transferidos: 0, detalhes: [] };
  const accountsDb = await import("./accounts-db.server");
  const clientesDb = await import("./clientes-db.server");
  const conta = await accountsDb.fetchAccountById(instancia, accountId);
  const cnpj = digits((conta?.custom_fields as any)?.["CNPJ__c"]);
  if (!conta || !cnpj || !conta.owner_id) return vazio;

  const perfis = await perfisPorSfId(ctx.supabase);
  const dono = perfis.get(conta.owner_id);
  if (!dono) return vazio;

  let cliente: ClienteRow | null = null;
  try {
    const achados = await clientesDb.findClienteByDoc(cnpj);
    cliente = achados.find((a) => a.instancia === instancia)?.cliente ?? null;
  } catch {
    return vazio;
  }
  if (!cliente) return vazio;
  const res: OwnerSyncResult = { verificados: 1, transferidos: 0, detalhes: [] };
  if ((cliente["created_by"] as string | null) === dono.id) return res;

  await clientesDb.updateCliente(instancia, cliente["id"] as string, {
    created_by: dono.id,
    created_by_nome: dono.nome,
    created_by_email: dono.email,
  });
  const info = {
    cliente: String(cliente["razao_social"] ?? conta.name ?? cnpj),
    doc: cnpj,
    de: (cliente["created_by_nome"] as string | null) ?? null,
    para: dono.nome ?? dono.email ?? "—",
    paraId: dono.id,
  };
  res.transferidos = 1;
  res.detalhes.push({ cliente: info.cliente, doc: info.doc, de: info.de, para: info.para });
  await registrar(ctx, instancia, info);
  return res;
}

