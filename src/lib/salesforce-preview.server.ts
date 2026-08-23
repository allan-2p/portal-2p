/**
 * Prévia do payload enviado ao Salesforce, sem enviar nada: pega um registro
 * real do portal (cliente ou proposta) e aplica o mapeamento configurado.
 */

import { montarPayload, type MapeamentoItem, type SfObjeto } from "./salesforce-campos";
import { carregarMapeamento } from "./salesforce-campos.server";

const so = (v: unknown) => String(v ?? "").trim();

export type SfValor = string | number | boolean | null;

export type PreviewResultado = {
  objeto: SfObjeto;
  registro: { id: string | null; rotulo: string } | null;
  payload: Record<string, SfValor>;
  linhas: { chave: string; rotulo: string; sfField: string | null; valor: SfValor; enviado: boolean }[];
  aviso: string | null;
};

/** Converte os valores para tipos serializáveis pelo RPC. */
function normalizar(r: ReturnType<typeof montarPayload>) {
  const val = (v: unknown): SfValor =>
    v === null || v === undefined
      ? null
      : typeof v === "number" || typeof v === "boolean" || typeof v === "string"
        ? v
        : String(v);
  return {
    payload: Object.fromEntries(Object.entries(r.payload).map(([k, v]) => [k, val(v)])) as Record<string, SfValor>,
    linhas: r.linhas.map((l) => ({ ...l, valor: val(l.valor) })),
  };
}

async function amostraCliente(id: string | null): Promise<Record<string, any> | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin.from("clientes").select("*").limit(1);
  q = id ? q.eq("id", id) : q.order("updated_at", { ascending: false, nullsFirst: false });
  const { data } = await q;
  return (data?.[0] as Record<string, any>) ?? null;
}

async function ownerSfId(userId: unknown): Promise<string | null> {
  const id = so(userId);
  if (!id) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles").select("sf_user_id").eq("id", id).maybeSingle();
    return so((data as any)?.sf_user_id) || null;
  } catch {
    return null;
  }
}

export async function montarPreview(
  objeto: SfObjeto,
  registroId: string | null,
  itens: MapeamentoItem[] | null,
): Promise<PreviewResultado> {
  const overrides = itens ?? (await carregarMapeamento(objeto));

  if (objeto === "Account") {
    const c = await amostraCliente(registroId);
    if (!c)
      return { objeto, registro: null, payload: {}, linhas: [], aviso: "Nenhum cadastro de cliente encontrado para a prévia." };
    const owner = await ownerSfId(c["created_by"] ?? c["owner_id"]);
    const row = { ...c, owner_sf_id: c["sf_owner_id"] ?? owner ?? null };
    const bruto = montarPayload(objeto, row, overrides);
    const { payload, linhas } = normalizar(bruto);
    return {
      objeto,
      registro: { id: so(c["id"]) || null, rotulo: so(c["razao_social"]) || so(c["doc"]) || "Cliente" },
      payload,
      linhas,
      aviso: null,
    };
  }

  const db = await import("./propostas-db.server");
  const row = registroId
    ? await db.getProposta(registroId)
    : (await db.listarPropostas({ select: "*", limit: 1 }))[0] ?? null;
  if (!row)
    return { objeto, registro: null, payload: {}, linhas: [], aviso: "Nenhuma proposta encontrada para a prévia." };

  const r = row as Record<string, any>;
  const owner = await ownerSfId(r["created_by"]);
  const enriquecido = { ...r, _owner_id: owner, _account_id: so(r["sf_account_id"]) || null };
  const { payload, linhas } = normalizar(montarPayload("Opportunity", enriquecido, overrides));
  return {
    objeto,
    registro: { id: so(r["id"]) || null, rotulo: [so(r["numero"]), so(r["cliente_nome"])].filter(Boolean).join(" · ") },
    payload,
    linhas,
    aviso: so(r["sf_account_id"]) ? null : "Esta proposta ainda não tem conta vinculada — o AccountId é resolvido no envio.",
  };
}
