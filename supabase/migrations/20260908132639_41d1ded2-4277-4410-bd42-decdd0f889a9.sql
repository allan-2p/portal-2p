CREATE TABLE public.carregadores_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_referencia text NOT NULL,
  lote text NOT NULL,
  previsao_chegada date NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  observacao text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carregadores_lotes_mes_fmt CHECK (mes_referencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT carregadores_lotes_unq UNIQUE (mes_referencia, lote)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carregadores_lotes TO authenticated;
GRANT ALL ON public.carregadores_lotes TO service_role;

ALTER TABLE public.carregadores_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lotes_select_auth" ON public.carregadores_lotes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lotes_admin_write" ON public.carregadores_lotes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_carregadores_lotes_updated_at
  BEFORE UPDATE ON public.carregadores_lotes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS entrega_lote_id uuid NULL REFERENCES public.carregadores_lotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entrega_lote_mes text NULL,
  ADD COLUMN IF NOT EXISTS entrega_lote_nome text NULL;

CREATE INDEX IF NOT EXISTS propostas_entrega_lote_idx ON public.propostas (entrega_lote_id);