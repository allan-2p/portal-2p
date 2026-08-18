import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminListCarregadoresProducts, listCarregadoresProductsForProposal } from "@/lib/carregadores-produtos.functions";
import {
  CARREGADORES_CONFIG_FALLBACK,
  type CarregadoresConfig,
  type CarregadoresNcm,
  type CarregadoresProduct,
  type CarregadoresUf,
} from "@/lib/carregadores";

/**
 * Produtos disponíveis para proposta, já com custo — necessário para CMV,
 * margem e comissão. Restrito a usuários autenticados (validado no servidor).
 */
export function useCarregadoresProducts() {
  const list = useServerFn(listCarregadoresProductsForProposal);
  return useQuery({
    queryKey: ["carregadores-products"],
    queryFn: async (): Promise<CarregadoresProduct[]> => (await list()).products,
    staleTime: 60_000,
  });
}


/** Produtos com custo — apenas administradores (validado no servidor). */
export function useCarregadoresProductsAdmin() {
  const list = useServerFn(adminListCarregadoresProducts);
  return useQuery({
    queryKey: ["carregadores-products-admin"],
    queryFn: async (): Promise<CarregadoresProduct[]> => {
      const res = await list();
      return res.products;
    },
    staleTime: 60_000,
  });
}


export function useCarregadoresUfs() {
  return useQuery({
    queryKey: ["carregadores-ufs"],
    queryFn: async (): Promise<CarregadoresUf[]> => {
      const { data, error } = await supabase
        .from("carregadores_uf_rates")
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

export function useCarregadoresNcms() {
  return useQuery({
    queryKey: ["carregadores-ncm"],
    queryFn: async (): Promise<CarregadoresNcm[]> => {
      const { data, error } = await supabase
        .from("carregadores_ncm")
        .select("id, codigo, descricao, ipi, pis_cofins, aliq_inter, tem_st, gera_difal, observacoes, ativo")
        .order("codigo");
      if (error) throw error;
      return (data ?? []).map((n: any) => ({
        id: n.id,
        codigo: n.codigo,
        descricao: n.descricao,
        ipi: Number(n.ipi),
        pis_cofins: Number(n.pis_cofins),
        aliq_inter: Number(n.aliq_inter),
        tem_st: !!n.tem_st,
        gera_difal: !!n.gera_difal,
        observacoes: n.observacoes,
        ativo: !!n.ativo,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

export function useCarregadoresConfig() {
  return useQuery({
    queryKey: ["carregadores-config"],
    queryFn: async (): Promise<CarregadoresConfig> => {
      const { data, error } = await supabase
        .from("carregadores_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return CARREGADORES_CONFIG_FALLBACK;
      const d = data as any;
      return {
        ipi: Number(d.ipi),
        pis_cofins: Number(d.pis_cofins),
        aliq_inter: Number(d.aliq_inter),
        majoracao_sem_ie: Number(d.majoracao_sem_ie),
        politica_mb_min: Number(d.politica_mb_min),
        mb_atencao: Number(d.mb_atencao),
        comissao_base: (d.comissao_base === "VALOR" ? "VALOR" : "MB") as "VALOR" | "MB",
        comissao_pct: Number(d.comissao_pct),
        cmv_max: d.cmv_max != null ? Number(d.cmv_max) : CARREGADORES_CONFIG_FALLBACK.cmv_max,
        pct_gerente: d.pct_gerente != null ? Number(d.pct_gerente) : CARREGADORES_CONFIG_FALLBACK.pct_gerente,
        pct_representante:
          d.pct_representante != null ? Number(d.pct_representante) : CARREGADORES_CONFIG_FALLBACK.pct_representante,

        pct_indicacao: d.pct_indicacao != null ? Number(d.pct_indicacao) : CARREGADORES_CONFIG_FALLBACK.pct_indicacao,
        fator_clt: d.fator_clt != null ? Number(d.fator_clt) : CARREGADORES_CONFIG_FALLBACK.fator_clt,
      };
    },
    staleTime: 60_000,
  });
}


export function useCarregadoresInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["carregadores-products"] });
    qc.invalidateQueries({ queryKey: ["carregadores-products-admin"] });
    qc.invalidateQueries({ queryKey: ["carregadores-ufs"] });
    qc.invalidateQueries({ queryKey: ["carregadores-config"] });
    qc.invalidateQueries({ queryKey: ["carregadores-proposals"] });
  };
}
