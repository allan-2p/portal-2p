-- ---------------------------------------------------------------------------
-- Ordem de venda no SAP (ZNFE_OV_CRIAR) — retorno gravado na proposta.
-- Rode este script no projeto único grupo-2p (SQL Editor).
-- ---------------------------------------------------------------------------

alter table public.propostas
  add column if not exists sap_ov_numero text,        -- VBELN devolvido pelo SAP
  add column if not exists sap_ov_status text,        -- 'criada' | 'erro'
  add column if not exists sap_ov_mensagem text,      -- última mensagem do SAP
  add column if not exists sap_ov_enviado_em timestamptz;

create index if not exists propostas_sap_ov_numero_idx on public.propostas (sap_ov_numero);
create index if not exists propostas_sap_ov_status_idx on public.propostas (sap_ov_status);
