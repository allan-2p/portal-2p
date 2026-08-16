import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET_PRODUTOS = "produtos";

/** URLs assinadas (bucket privado) das fotos de produto, por caminho. */
export function useImagensPorPath(paths: (string | null | undefined)[]) {
  const limpos = Array.from(new Set(paths.filter((p): p is string => !!p))).sort();
  return useQuery({
    queryKey: ["produto-imagens-path", limpos],
    enabled: limpos.length > 0,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET_PRODUTOS)
        .createSignedUrls(limpos, 60 * 60);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      return map;
    },
  });
}

/** Fotos de produto a partir dos códigos SAP (usado onde só há o snapshot do item). */
export function useImagensPorCodigo(codigos: (string | null | undefined)[]) {
  const limpos = Array.from(new Set(codigos.filter((c): c is string => !!c))).sort();
  return useQuery({
    queryKey: ["produto-imagens-codigo", limpos],
    enabled: limpos.length > 0,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sap_produtos")
        .select("codigo, imagem_path")
        .in("codigo", limpos);
      if (error) throw error;
      const paths = (data ?? [])
        .map((r) => (r as { imagem_path?: string | null }).imagem_path)
        .filter((p): p is string => !!p);
      if (paths.length === 0) return {} as Record<string, string>;
      const assinadas = await supabase.storage
        .from(BUCKET_PRODUTOS)
        .createSignedUrls(paths, 60 * 60);
      const porPath: Record<string, string> = {};
      for (const d of assinadas.data ?? []) if (d.path && d.signedUrl) porPath[d.path] = d.signedUrl;
      const map: Record<string, string> = {};
      for (const r of data ?? []) {
        const row = r as { codigo: string; imagem_path?: string | null };
        const url = row.imagem_path ? porPath[row.imagem_path] : undefined;
        if (url) map[row.codigo] = url;
      }
      return map;
    },
  });
}
