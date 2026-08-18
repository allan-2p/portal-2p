import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  SOLAR_CALC_CONFIG_FALLBACK,
  type SolarCalcConfig,
  type SolarModulo,
  type SolarSuporte,
  type SolarTrilho,
} from "@/lib/solar-calculadora";

export type SolarGerador = {
  id: string;
  legado_id: number | null;
  nome: string;
  exige_microinversor: boolean;
  oculta_microinversor: boolean;
  ativo: boolean;
  ordem: number;
};

export type SolarProduto = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string | null;
  custo: number;
  preco_sugerido: number;
  imagem_path: string | null;
};

export type SolarCupom = {
  id: string;
  codigo: string;
  tipos: string[];
  valor: number;
  percentual: number;
  validade: string;
  reutilizavel: boolean;
  cliente_doc: string | null;
  cliente_nome: string | null;
  usos: number;
  ativo: boolean;
  created_at: string;
};

export function useSolarModulos(incluirInativos = false) {
  return useQuery({
    queryKey: ["solar-modulos", incluirInativos],
    queryFn: async (): Promise<SolarModulo[]> => {
      let q = supabase.from("solar_modulos").select("*").order("ordem");
      if (!incluirInativos) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SolarModulo[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSolarGeradores() {
  return useQuery({
    queryKey: ["solar-geradores"],
    queryFn: async (): Promise<SolarGerador[]> => {
      const { data, error } = await supabase
        .from("solar_geradores")
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as SolarGerador[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSolarTrilhos() {
  return useQuery({
    queryKey: ["solar-trilhos"],
    queryFn: async (): Promise<SolarTrilho[]> => {
      const { data, error } = await supabase
        .from("solar_trilhos")
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as SolarTrilho[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSolarSuportes() {
  return useQuery({
    queryKey: ["solar-suportes"],
    queryFn: async (): Promise<SolarSuporte[]> => {
      const { data, error } = await supabase
        .from("solar_suportes")
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as SolarSuporte[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Combinações válidas trilho → suportes. */
export function useSolarTrilhoSuportes() {
  return useQuery({
    queryKey: ["solar-trilho-suportes"],
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase.from("solar_trilho_suportes").select("*");
      if (error) throw error;
      const mapa: Record<string, string[]> = {};
      for (const r of (data ?? []) as unknown as { trilho_id: string; suporte_id: string }[]) {
        (mapa[r.trilho_id] ??= []).push(r.suporte_id);
      }
      return mapa;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSolarCalcConfig() {
  return useQuery({
    queryKey: ["solar-calc-config"],
    queryFn: async (): Promise<SolarCalcConfig> => {
      const { data, error } = await supabase
        .from("solar_calc_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return SOLAR_CALC_CONFIG_FALLBACK;
      const d = data as any;
      return {
        ...SOLAR_CALC_CONFIG_FALLBACK,
        ...d,
        folga_paineis: Number(d.folga_paineis),
        balanco_ponta: Number(d.balanco_ponta),
        barras_longas: (d.barras_longas ?? SOLAR_CALC_CONFIG_FALLBACK.barras_longas).map(Number),
      } as SolarCalcConfig;
    },
    staleTime: 60_000,
  });
}

/** Catálogo Solar (produtos do SAP visíveis para a unidade). */
export function useSolarProdutos() {
  return useQuery({
    queryKey: ["solar-produtos"],
    queryFn: async (): Promise<SolarProduto[]> => {
      const { data, error } = await supabase
        .from("sap_produtos")
        .select("id, codigo, descricao, tipo, custo, preco_sugerido, imagem_path")
        .in("visibilidade", ["solar", "ambos"])
        .eq("ativo", true)
        .order("descricao");
      if (error) throw error;
      return ((data ?? []) as any[]).map((p) => ({
        id: p.id,
        codigo: p.codigo,
        descricao: p.descricao,
        tipo: p.tipo ?? null,
        custo: Number(p.custo ?? 0),
        preco_sugerido: Number(p.preco_sugerido ?? 0),
        imagem_path: p.imagem_path ?? null,
      }));
    },
    staleTime: 60_000,
  });
}

/** Cupons válidos do Solar. */
export function useSolarCupons() {
  return useQuery({
    queryKey: ["solar-cupons"],
    queryFn: async (): Promise<SolarCupom[]> => {
      const { data, error } = await supabase
        .from("solar_cupons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        ...c,
        valor: Number(c.valor ?? 0),
        percentual: Number(c.percentual ?? 0),
        tipos: (c.tipos ?? []) as string[],
      })) as SolarCupom[];
    },
    staleTime: 30_000,
  });
}

export function useSolarInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of [
      "solar-modulos",
      "solar-geradores",
      "solar-trilhos",
      "solar-suportes",
      "solar-trilho-suportes",
      "solar-calc-config",
      "solar-produtos",
      "solar-cupons",
      "solar-proposals",
    ])
      qc.invalidateQueries({ queryKey: [k] });
  };
}
