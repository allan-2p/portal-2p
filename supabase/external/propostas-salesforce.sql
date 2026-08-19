-- ---------------------------------------------------------------------------
-- Pedido no Salesforce (Opportunity) — retorno gravado na proposta.
-- Rode este script no projeto único grupo-2p (SQL Editor).
-- ---------------------------------------------------------------------------

alter table public.propostas
  add column if not exists sf_opp_id text,          -- Id da Opportunity
  add column if not exists sf_account_id text,      -- Id da Account usada
  add column if not exists sf_status text,          -- 'sincronizado' | 'erro'
  add column if not exists sf_mensagem text,        -- última mensagem/erro
  add column if not exists sf_enviado_em timestamptz;

create index if not exists propostas_sf_opp_id_idx on public.propostas (sf_opp_id);
create index if not exists propostas_sf_status_idx on public.propostas (sf_status);
