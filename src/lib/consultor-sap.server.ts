/**
 * Consultor do cliente — campo canônico único.
 *
 * O par `clientes.consultor_sap` (código SAP) + `clientes.consultor_nome` é a
 * única fonte do consultor de um cadastro: a lista mostra esse par, o
 * formulário edita esse par e o SAP envia/recebe esse par (campo VENDEDOR no
 * cadastro e sap_vendedor_codigo na OV).
 */

export type ConsultorPortal = { id: string; nome: string; sap: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `consultor_id`/`created_by` só aceitam uuid de usuário do portal. */
export const idDeUsuario = (v: string | null | undefined) => (v && UUID_RE.test(v) ? v : null);

const codigo = (v: unknown) => String(v ?? "").trim();

/**
 * Consultores cadastrados no portal: usuários com código SAP + o de-para
 * oficial em `consultores_sap` (consultores que existem no SAP mas ainda não
 * têm login). Dedupe pelo código SAP, preferindo o usuário do portal.
 */
export async function listarConsultoresPortal(instancia: "solar" | "carregadores"): Promise<ConsultorPortal[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: perfis }, { data: cadastro }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, numero_sap, ativo, is_consultor, organizacao")
      .eq("ativo", true)
      .eq("is_consultor", true)
      .in("organizacao", [instancia, "grupo"])
      .order("full_name", { ascending: true }),
    supabaseAdmin
      .from("consultores_sap")
      .select("codigo_sap, nome, profile_id, ativo, organizacao")
      .eq("ativo", true)
      .in("organizacao", [instancia, "grupo"])
      .order("nome", { ascending: true }),
  ]);

  const porSap = new Map<string, ConsultorPortal>();
  for (const p of (perfis ?? []) as any[]) {
    const sap = codigo(p.numero_sap);
    if (sap) porSap.set(sap, { id: p.id as string, nome: (p.full_name || p.email || "—") as string, sap });
  }
  for (const c of (cadastro ?? []) as any[]) {
    const sap = codigo(c.codigo_sap);
    if (!sap || porSap.has(sap)) continue;
    porSap.set(sap, { id: (c.profile_id as string | null) ?? sap, nome: String(c.nome ?? "—"), sap });
  }
  return [...porSap.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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
  if (!p) {
    const { data: cad } = await supabaseAdmin
      .from("consultores_sap")
      .select("codigo_sap, nome, profile_id")
      .eq("codigo_sap", alvo)
      .limit(1);
    const c: any = cad?.[0];
    if (!c) return null;
    return {
      id: (c.profile_id as string | null) ?? alvo,
      nome: String(c.nome ?? "—"),
      sap: alvo,
      email: null,
      sfUserId: null,
    };
  }
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
