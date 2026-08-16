ALTER TABLE public.cpo_proposals
  ADD COLUMN IF NOT EXISTS faturamento jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS transportadora text,
  ADD COLUMN IF NOT EXISTS transportadora_documento text,
  ADD COLUMN IF NOT EXISTS transportadora_id text,
  ADD COLUMN IF NOT EXISTS frete_prazo integer;

ALTER TABLE public.cpo_proposals ALTER COLUMN faturar_cliente_final SET DEFAULT false;
ALTER TABLE public.cpo_proposals ALTER COLUMN frete_mod SET DEFAULT 'CIF';