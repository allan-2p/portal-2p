-- Travas do catálogo: campos definidos à mão na Gestão de Produtos nunca são
-- sobrescritos pelas sincronizações do SAP.
--
-- Rodar no editor SQL do projeto grupo-2p (e também no Lovable Cloud, caso o
-- catálogo volte a ser lido de lá).

ALTER TABLE public.sap_produtos
  ADD COLUMN IF NOT EXISTS campos_manuais text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.sap_produtos.campos_manuais IS
  'Campos editados manualmente (descricao, custo, preco_sugerido, imagem_path). As sincronizações do SAP não gravam esses campos.';

-- Backfill: o que já foi ajustado à mão continua protegido.
UPDATE public.sap_produtos
   SET campos_manuais = (
        SELECT array_agg(DISTINCT c) FROM unnest(
          campos_manuais
          || CASE WHEN COALESCE(custo, 0) > 0 THEN ARRAY['custo'] ELSE ARRAY[]::text[] END
          || CASE WHEN imagem_path IS NOT NULL THEN ARRAY['imagem_path'] ELSE ARRAY[]::text[] END
        ) AS c
      )
 WHERE COALESCE(custo, 0) > 0 OR imagem_path IS NOT NULL;
