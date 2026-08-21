/**
 * Regra universal do portal para "quem é vendedor/consultor".
 *
 * Um usuário só aparece em qualquer filtro/seleção de vendedores quando:
 *  - está ativo;
 *  - está marcado como consultor (`profiles.is_consultor`);
 *  - tem código SAP cadastrado (`profiles.numero_sap`);
 *  - pertence à organização daquela tela (ou à organização "grupo", que é
 *    transversal — ex.: diretoria que atende as duas unidades).
 *
 * Vendedor da Solar não aparece em Carregadores/Station e vice-versa.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const OrganizacaoConsultor = z.enum(["solar", "carregadores", "station"]);
export type OrganizacaoConsultor = z.infer<typeof OrganizacaoConsultor>;

export type ConsultorPortal = {
  id: string;
  nome: string;
  email: string;
  organizacao: string;
  numero_sap: string;
  sf_user_id: string | null;
};

const Input = z.object({ organizacao: OrganizacaoConsultor });

export const listConsultoresPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<{ records: ConsultorPortal[] }> => {
    const { data: rows, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, organizacao, numero_sap, sf_user_id")
      .eq("ativo", true)
      .eq("is_consultor", true)
      .in("organizacao", [data.organizacao, "grupo"])
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);

    const records = (rows ?? [])
      .filter((p: any) => String(p.numero_sap ?? "").trim() !== "")
      .map((p: any) => ({
        id: p.id as string,
        nome: (p.full_name || p.email || "—") as string,
        email: (p.email ?? "") as string,
        organizacao: String(p.organizacao ?? ""),
        numero_sap: String(p.numero_sap ?? "").trim(),
        sf_user_id: (p.sf_user_id ?? null) as string | null,
      }));
    return { records };
  });
