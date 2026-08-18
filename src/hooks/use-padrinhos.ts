import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Padrinho = {
  id: string;
  nome: string;
  doc: string | null;
  telefone: string | null;
  email: string | null;
};

/** Padrinhos (indicação) cadastrados — usados nas propostas de Carregadores. */
export function usePadrinhos() {
  return useQuery({
    queryKey: ["carregadores-padrinhos"],
    staleTime: 60_000,
    queryFn: async (): Promise<Padrinho[]> => {
      const { data, error } = await supabase
        .from("carregadores_padrinhos")
        .select("id,nome,doc,telefone,email")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Padrinho[];
    },
  });
}

export function useCriarPadrinho() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nome: string;
      doc?: string;
      telefone?: string;
      email?: string;
    }): Promise<Padrinho> => {
      const nome = input.nome.trim();
      if (!nome) throw new Error("Informe o nome do padrinho.");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre novamente.");
      const { data, error } = await supabase
        .from("carregadores_padrinhos")
        .insert({
          nome: nome.slice(0, 160),
          doc: input.doc?.replace(/\D/g, "").slice(0, 14) || null,
          telefone: input.telefone?.trim().slice(0, 40) || null,
          email: input.email?.trim().slice(0, 160) || null,
          created_by: uid,
        })
        .select("id,nome,doc,telefone,email")
        .single();
      if (error) throw new Error(error.message);
      return data as Padrinho;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carregadores-padrinhos"] }),
  });
}
