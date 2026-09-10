ALTER TABLE public.sap_produtos
  ADD COLUMN IF NOT EXISTS campos_manuais text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.sap_produtos.campos_manuais IS
  'Campos editados manualmente (descricao, custo, preco_sugerido, imagem_path). As sincronizações do SAP não gravam esses campos.';

UPDATE public.sap_produtos
   SET campos_manuais = (
        SELECT COALESCE(array_agg(DISTINCT c), '{}'::text[]) FROM unnest(
          campos_manuais
          || CASE WHEN COALESCE(custo, 0) > 0 THEN ARRAY['custo'] ELSE ARRAY[]::text[] END
          || CASE WHEN imagem_path IS NOT NULL THEN ARRAY['imagem_path'] ELSE ARRAY[]::text[] END
        ) AS c
      )
 WHERE COALESCE(custo, 0) > 0 OR imagem_path IS NOT NULL;