import { useMemo } from "react";
import { parseVendedores } from "@/components/vendedor-names-filter";
import { useConsultores } from "@/hooks/use-consultores";

/**
 * Vendedores de uma unidade (organização) para filtrar registros por dono.
 * Só entram consultores da própria organização (regra universal do portal).
 */
export function useVendedoresOrg(organizacao: "solar" | "carregadores" | "station") {
  const q = useConsultores(organizacao);

  return useMemo(() => {
    const rows = q.data ?? [];
    const byId = new Map<string, string>();
    rows.forEach((r) => byId.set(r.id, r.nome.trim()));
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
    /** IDs (created_by) dos vendedores selecionados — null quando é "todos". */
    const idsDe = (value: string): string[] | null => {
      const selected = parseVendedores(value);
      if (selected.length === 0) return null;
      const ids: string[] = [];
      byId.forEach((nome, id) => { if (selected.includes(nome)) ids.push(id); });
      return ids;
    };
    return { names, nameOf, matches, idsDe, isLoading: q.isLoading };
  }, [q.data, q.isLoading]);
}

/** Atalho para a unidade Carregadores. */
export function useCarregadoresVendedores() {
  return useVendedoresOrg("carregadores");
}
