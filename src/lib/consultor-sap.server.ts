/**
 * Consultor do cliente — campo canônico único.
 *
 * O par `clientes.consultor_sap` (código SAP) + `clientes.consultor_nome` é a
 * única fonte do consultor de um cadastro: a lista mostra esse par, o
 * formulário edita esse par e o SAP envia/recebe esse par (campo VENDEDOR no
 * cadastro e sap_vendedor_codigo na OV).
 */

export type ConsultorPortal = { id: string; nome: string; sap: string };

const codigo = (v: unknown) => String(v ?? "").trim();

/** Consultores cadastrados no portal (ativos, marcados como consultor e com código SAP). */
export async function listarConsultoresPortal(instancia: "solar" | "carregadores"): Promise<ConsultorPortal[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, numero_sap, ativo, is_consultor, organizacao")
    .eq("ativo", true)
    .eq("is_consultor", true)
    .in("organizacao", [instancia, "grupo"])
    .order("full_name", { ascending: true });
  return (data ?? [])
    .filter((p: any) => codigo(p.numero_sap) !== "")
    .map((p: any) => ({ id: p.id as string, nome: (p.full_name || p.email || "—") as string, sap: codigo(p.numero_sap) }));
}

/** Consultor do portal com esse código SAP (ou `null` quando o código é só importado). */
export async function consultorPorSap(sap: string | null | undefined): Promise<(ConsultorPortal & { email: string | null; sfUserId: string | null }) | null> {
  const alvo = codigo(sap);
  if (!alvo) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, numero_sap, sf_user_id")
    .eq("numero_sap", alvo)
    .limit(1);
  const p: any = data?.[0];
  if (!p) return null;
  return {
    id: p.id as string,
    nome: (p.full_name || p.email || "—") as string,
    sap: codigo(p.numero_sap),
    email: (p.email as string | null) ?? null,
    sfUserId: (p.sf_user_id as string | null) ?? null,
  };
}

/** Consultor de um cadastro de cliente, sempre pelo par canônico. */
export function consultorDoCadastro(cliente: Record<string, any> | null | undefined) {
  return {
    sap: codigo(cliente?.["consultor_sap"]) || null,
    nome: String(cliente?.["consultor_nome"] ?? "").trim() || null,
    id: (cliente?.["consultor_id"] as string | null) ?? (cliente?.["created_by"] as string | null) ?? null,
  };
}

/** Par canônico do cliente pelo documento — usado pelas propostas/OV. */
export async function consultorDoClientePorDoc(
  doc: string,
  instancia?: "solar" | "carregadores",
): Promise<{ sap: string | null; nome: string | null; id: string | null }> {
  const limpo = String(doc ?? "").replace(/\D/g, "");
  if (!limpo) return { sap: null, nome: null, id: null };
  try {
    const db = await import("./clientes-db.server");
    const achados = await db.findClienteByDoc(limpo);
    const alvo =
      (instancia ? achados.find((a) => a.instancia === instancia)?.cliente : undefined) ??
      achados[0]?.cliente;
    return consultorDoCadastro(alvo);
  } catch {
    return { sap: null, nome: null, id: null };
  }
}
