-- Banco Grupo 2P — colunas do cancelamento de pedido.
--
-- O portal grava o motivo (picklist igual à do Salesforce
-- `Motivo_de_cancelamento__c`) e a Descrição do Cancelamento escrita pelo
-- vendedor. Sem estas colunas o cancelamento falha no PostgREST
-- ("column propostas.motivo_cancelamento does not exist").
--
-- Rodar no SQL Editor do projeto grupo-2p.

ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento_obs text;

COMMENT ON COLUMN public.propostas.motivo_cancelamento IS
  'Picklist do Salesforce Motivo_de_cancelamento__c (Pedido Incorreto, Problema Com Pagamento, Pedido Duplicado, Erro de Emissão de NF, Erro Interno, Desistiu da Compra, Teste Interno).';
COMMENT ON COLUMN public.propostas.motivo_cancelamento_obs IS
  'Descrição do Cancelamento escrita pelo vendedor (8 a 500 caracteres). Vai para Descri_o_do_Motivo_de_Perda__c no Salesforce e para o e-mail de aviso.';
