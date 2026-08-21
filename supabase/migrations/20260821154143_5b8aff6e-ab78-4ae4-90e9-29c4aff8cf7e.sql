ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS sf_opp_id text,
  ADD COLUMN IF NOT EXISTS sf_account_id text,
  ADD COLUMN IF NOT EXISTS sf_status text,
  ADD COLUMN IF NOT EXISTS sf_mensagem text,
  ADD COLUMN IF NOT EXISTS sf_enviado_em timestamptz;

CREATE INDEX IF NOT EXISTS propostas_sf_opp_id_idx ON public.propostas (sf_opp_id);