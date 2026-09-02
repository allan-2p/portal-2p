-- Banco Grupo 2P — colunas da PERDA de oportunidade.
--
-- O portal permite "dar perda" numa proposta ainda em rascunho ("Salvo"),
-- gravando o motivo (picklist igual à do Salesforce `Loss_Reason__c`) e a
-- descrição escrita pelo vendedor (`Descri_o_do_Motivo_de_Perda__c`). Sem
-- estas colunas a gravação falha no PostgREST
-- ("column propostas.motivo_perda does not exist").
--
-- Rodar no SQL Editor do projeto grupo-2p.

ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS motivo_perda     text,
  ADD COLUMN IF NOT EXISTS motivo_perda_obs text,
  ADD COLUMN IF NOT EXISTS perdida_em       timestamptz;

CREATE INDEX IF NOT EXISTS propostas_perdida_em_idx ON public.propostas (perdida_em);

COMMENT ON COLUMN public.propostas.motivo_perda IS
  'Picklist do Salesforce Loss_Reason__c. "Oportunidade Mecanicamente Perdida" só pode ser gravada por Administrador do Sistema.';
COMMENT ON COLUMN public.propostas.motivo_perda_obs IS
  'Descrição da perda escrita pelo vendedor (8 a 500 caracteres). Vai para Descri_o_do_Motivo_de_Perda__c no Salesforce.';
COMMENT ON COLUMN public.propostas.perdida_em IS
  'Quando a oportunidade foi marcada como perdida no portal (StageName = Oportunidade Perdida).';
