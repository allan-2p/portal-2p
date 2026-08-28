import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET_PRODUTOS = "produtos";

/** Validade da URL assinada (bucket privado). */
const TTL_SEG = 60 * 60;
/** Margem para não servir URL prestes a expirar. */
const MARGEM_MS = 5 * 60 * 1000;
/** Largura padrão das miniaturas — o original chega a 3 MB por arquivo. */
export const LARGURA_MINIATURA = 160;

type Entrada = { url: string; expiraEm: number };

/**
 * Cache de URLs assinadas por `caminho|largura`, compartilhado por todas as telas.
 * Evita reassinar a mesma foto a cada navegação (e mantém a URL estável, para o
 * navegador reaproveitar o cache HTTP da imagem).
 */
const cache = new Map<string, Entrada>();

function chave(path: string, largura: number) {
  return `${path}|${largura}`;
}

/**
 * Assina apenas os caminhos que ainda não estão em cache e devolve o mapa
 * caminho → URL. As imagens são redimensionadas no servidor de storage.
 */
async function assinar(paths: string[], largura: number) {
  const agora = Date.now();
  const faltando = paths.filter((p) => {
    const e = cache.get(chave(p, largura));
    return !e || e.expiraEm - MARGEM_MS < agora;
  });

  if (faltando.length) {
    const { data, error } = await supabase.storage
      .from(BUCKET_PRODUTOS)
      .createSignedUrls(faltando, TTL_SEG, {
        transform: { width: largura, resize: "contain", quality: 70 },
      });
    if (error) throw error;
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) {
        cache.set(chave(d.path, largura), {
          url: d.signedUrl,
          expiraEm: agora + TTL_SEG * 1000,
        });
      }
    }
  }

  const map: Record<string, string> = {};
  for (const p of paths) {
    const e = cache.get(chave(p, largura));
    if (e) map[p] = e.url;
  }
  return map;
}

/** URLs assinadas (bucket privado) das fotos de produto, por caminho. */
export function useImagensPorPath(
  paths: (string | null | undefined)[],
  largura = LARGURA_MINIATURA,
) {
  const limpos = Array.from(new Set(paths.filter((p): p is string => !!p))).sort();
  return useQuery({
    queryKey: ["produto-imagens-path", largura, limpos],
    enabled: limpos.length > 0,
    staleTime: 45 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: () => assinar(limpos, largura),
  });
}

/** Cache de código SAP → caminho da foto, para não repetir a consulta ao catálogo. */
const porCodigo = new Map<string, string | null>();

/** Fotos de produto a partir dos códigos SAP (usado onde só há o snapshot do item). */
export function useImagensPorCodigo(
  codigos: (string | null | undefined)[],
  largura = LARGURA_MINIATURA,
) {
  const limpos = Array.from(new Set(codigos.filter((c): c is string => !!c))).sort();
  return useQuery({
    queryKey: ["produto-imagens-codigo", largura, limpos],
    enabled: limpos.length > 0,
    staleTime: 45 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      const desconhecidos = limpos.filter((c) => !porCodigo.has(c));
      if (desconhecidos.length) {
        const { data, error } = await supabase
          .from("sap_produtos")
          .select("codigo, imagem_path")
          .in("codigo", desconhecidos);
        if (error) throw error;
        for (const c of desconhecidos) porCodigo.set(c, null);
        for (const r of data ?? []) {
          const row = r as { codigo: string; imagem_path?: string | null };
          porCodigo.set(row.codigo, row.imagem_path ?? null);
        }
      }

      const paths = limpos
        .map((c) => porCodigo.get(c))
        .filter((p): p is string => !!p);
      if (paths.length === 0) return {} as Record<string, string>;

      const porPath = await assinar(Array.from(new Set(paths)), largura);
      const map: Record<string, string> = {};
      for (const c of limpos) {
        const path = porCodigo.get(c);
        const url = path ? porPath[path] : undefined;
        if (url) map[c] = url;
      }
      return map;
    },
  });
}
