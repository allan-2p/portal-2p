ALTER TABLE public.sap_produtos
  ADD COLUMN IF NOT EXISTS custo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_sugerido numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS potencia text,
  ADD COLUMN IF NOT EXISTS ncm_id uuid REFERENCES public.cpo_ncm(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'sap';

CREATE INDEX IF NOT EXISTS sap_produtos_visibilidade_idx ON public.sap_produtos (visibilidade);

INSERT INTO public.sap_produtos (codigo, descricao, tipo, permissao, ativo, visibilidade, origem, custo, preco_sugerido, potencia, ncm_id)
SELECT
  COALESCE(p.codigo, 'CPO-' || left(replace(p.id::text, '-', ''), 8)),
  p.nome,
  'carregador_veicular',
  'Todos',
  p.ativo,
  'carregadores',
  'manual',
  p.custo,
  p.preco_sugerido,
  p.potencia,
  p.ncm_id
FROM public.cpo_products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.sap_produtos s WHERE s.descricao = p.nome
);