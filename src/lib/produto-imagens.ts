import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET_PRODUTOS = "produtos";

/** Validade da URL assinada (bucket privado). */
const TTL_SEG = 60 * 60;
/** Margem para não servir URL prestes a expirar. */
const MARGEM_MS = 5 * 60 * 1000;

type Entrada = { url: string; expiraEm: number };

/**
 * Cache de URLs assinadas por caminho, compartilhado por todas as telas.
 * Evita reassinar a mesma foto a cada navegação (e mantém a URL estável, para o
 * navegador reaproveitar o cache HTTP da imagem).
 */
const cache = new Map<string, Entrada>();

/**
 * Miniatura WebP (320px, ~2 KB) gerada a partir do original em `skus/`.
 * O acervo original soma ~44 MB em PNG; as miniaturas somam ~430 KB.
 */
export function caminhoMiniatura(path: string) {
  const nome = path.split("/").pop() ?? path;
  return `thumbs/${nome.replace(/\.[^.]+$/, "")}.webp`;
}

/**
 * Assina apenas os caminhos que ainda não estão em cache e devolve o mapa
 * caminho original → URL da miniatura (com fallback para o arquivo original
 * quando a miniatura ainda não existe).
 */
async function assinar(paths: string[]) {
  const agora = Date.now();
  const alvo = new Map<string, string>(); // original → miniatura
  for (const p of paths) alvo.set(p, caminhoMiniatura(p));

  const faltando = Array.from(new Set(alvo.values())).filter((p) => {
    const e = cache.get(p);
    return !e || e.expiraEm - MARGEM_MS < agora;
  });

  const assinarLote = async (lista: string[]) => {
    if (!lista.length) return;
    const { data, error } = await supabase.storage
      .from(BUCKET_PRODUTOS)
      .createSignedUrls(lista, TTL_SEG);
    if (error) throw error;
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) cache.set(d.path, { url: d.signedUrl, expiraEm: agora + TTL_SEG * 1000 });
    }
  };

  await assinarLote(faltando);

  // Sem miniatura (foto recém-enviada): cai para o original.
  const semThumb = paths.filter((p) => !cache.get(alvo.get(p)!));
  if (semThumb.length) {
    await assinarLote(semThumb);
    for (const p of semThumb) alvo.set(p, p);
  }

  const map: Record<string, string> = {};
  for (const p of paths) {
    const e = cache.get(alvo.get(p)!);
    if (e) map[p] = e.url;
  }
  return map;
}

/** URLs assinadas (bucket privado) das fotos de produto, por caminho. */
export function useImagensPorPath(paths: (string | null | undefined)[]) {
  const limpos = Array.from(new Set(paths.filter((p): p is string => !!p))).sort();
  return useQuery({
    queryKey: ["produto-imagens-path", limpos],
    enabled: limpos.length > 0,
    staleTime: 45 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: () => assinar(limpos),
  });
}

/** Cache de código SAP → caminho da foto, para não repetir a consulta ao catálogo. */
const porCodigo = new Map<string, string | null>();

/** Fotos de produto a partir dos códigos SAP (usado onde só há o snapshot do item). */
export function useImagensPorCodigo(codigos: (string | null | undefined)[]) {
  const limpos = Array.from(new Set(codigos.filter((c): c is string => !!c))).sort();
  return useQuery({
    queryKey: ["produto-imagens-codigo", limpos],
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

      const porPath = await assinar(Array.from(new Set(paths)));
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
