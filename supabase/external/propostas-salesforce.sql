-- Banco EXTERNO do Grupo 2P (não é o banco do portal).
-- Documentação do schema exigido pelo vínculo Salesforce das propostas.
-- Já aplicado manualmente no banco 2P — este arquivo é apenas referência.
--
-- Sem estas colunas o portal não consegue guardar o ID da oportunidade e
-- recria o registro no Salesforce a cada envio (PGRST204 na auditoria).

ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS sf_opp_id      text,
  ADD COLUMN IF NOT EXISTS sf_account_id  text,
  ADD COLUMN IF NOT EXISTS sf_status      text,
  ADD COLUMN IF NOT EXISTS sf_mensagem    text,
  ADD COLUMN IF NOT EXISTS sf_enviado_em  timestamptz;

CREATE INDEX IF NOT EXISTS propostas_sf_opp_id_idx ON public.propostas (sf_opp_id);
CREATE INDEX IF NOT EXISTS propostas_sf_status_idx ON public.propostas (sf_status);
