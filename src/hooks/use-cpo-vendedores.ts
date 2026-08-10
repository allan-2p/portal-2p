import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseVendedores } from "@/components/vendedor-names-filter";

/**
 * Lista de usuários do portal (vendedores) para filtrar registros
 * de Carregadores por quem criou/é dono do registro.
 */
export function useCpoVendedores() {
  const q = useQuery({
    queryKey: ["cpo-vendedores"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null; email: string }[];
    },
  });

  return useMemo(() => {
    const rows = q.data ?? [];
    const byId = new Map<string, string>();
    rows.forEach((r) => byId.set(r.id, (r.full_name || r.email || "—").trim()));
    const names = Array.from(new Set(Array.from(byId.values()))).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
    const nameOf = (id: string | null | undefined) => (id ? byId.get(id) ?? "—" : "—");
    /** Retorna true quando o registro passa no filtro (valor do VendedorNamesFilter). */
    const matches = (value: string, id: string | null | undefined) => {
      const selected = parseVendedores(value);
      if (selected.length === 0) return true;
      return selected.includes(nameOf(id));
    };
    return { names, nameOf, matches, isLoading: q.isLoading };
  }, [q.data, q.isLoading]);
}
