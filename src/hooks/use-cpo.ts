import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminListCpoProducts } from "@/lib/cpo-products.functions";
import { CPO_CONFIG_FALLBACK, type CpoConfig, type CpoProduct, type CpoUf } from "@/lib/cpo";

export function useCpoProducts() {
  return useQuery({
    queryKey: ["cpo-products"],
    queryFn: async (): Promise<CpoProduct[]> => {
      const { data, error } = await supabase
        .from("cpo_products")
        .select("id, nome, potencia, ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        potencia: p.potencia,
        // custo é dado interno restrito a administradores
        custo: 0,
        ativo: p.ativo,
      }));
    },
    staleTime: 60_000,
  });
}

/** Produtos com custo — apenas administradores (validado no servidor). */
export function useCpoProductsAdmin() {
  const list = useServerFn(adminListCpoProducts);
  return useQuery({
    queryKey: ["cpo-products-admin"],
    queryFn: async (): Promise<CpoProduct[]> => {
      const res = await list();
      return res.products;
    },
    staleTime: 60_000,
  });
}


export function useCpoUfs() {
  return useQuery({
    queryKey: ["cpo-ufs"],
    queryFn: async (): Promise<CpoUf[]> => {
      const { data, error } = await supabase
        .from("cpo_uf_rates")
        .select("uf, nome, aliq_interna, fcp")
        .order("uf");
      if (error) throw error;
      return (data ?? []).map((u) => ({
        uf: u.uf,
        nome: u.nome,
        aliq_interna: Number(u.aliq_interna),
        fcp: Number(u.fcp),
      }));
    },
    staleTime: 5 * 60_000,
  });
}

export function useCpoConfig() {
  return useQuery({
    queryKey: ["cpo-config"],
    queryFn: async (): Promise<CpoConfig> => {
      const { data, error } = await supabase
        .from("cpo_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return CPO_CONFIG_FALLBACK;
      return {
        ipi: Number(data.ipi),
        pis_cofins: Number(data.pis_cofins),
        aliq_inter: Number(data.aliq_inter),
        majoracao_sem_ie: Number(data.majoracao_sem_ie),
        politica_mb_min: Number(data.politica_mb_min),
        mb_atencao: Number(data.mb_atencao),
        comissao_base: (data.comissao_base === "VALOR" ? "VALOR" : "MB") as "VALOR" | "MB",
        comissao_pct: Number(data.comissao_pct),
      };
    },
    staleTime: 60_000,
  });
}

export function useCpoInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["cpo-products"] });
    qc.invalidateQueries({ queryKey: ["cpo-products-admin"] });
    qc.invalidateQueries({ queryKey: ["cpo-ufs"] });
    qc.invalidateQueries({ queryKey: ["cpo-config"] });
    qc.invalidateQueries({ queryKey: ["cpo-proposals"] });
  };
}
