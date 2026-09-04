-- ---------------------------------------------------------------------------
-- Fretefy: marcação de envio do documento da NF à carga.
-- Usada para retry idempotente (só reenvia enquanto nf_fretefy_em IS NULL).
-- ---------------------------------------------------------------------------
ALTER TABLE public.propostas ADD COLUMN IF NOT EXISTS nf_fretefy_em timestamptz;
COMMENT ON COLUMN public.propostas.nf_fretefy_em IS 'Data/hora do último envio bem-sucedido (HTTP 200) do documento da NF à Fretefy.';
CREATE INDEX IF NOT EXISTS propostas_nf_fretefy_em_idx ON public.propostas (nf_fretefy_em) WHERE nf_fretefy_em IS NULL;