-- ---------------------------------------------------------------------------
-- Datas por status do pedido (Portal 2P — universal)
-- Rode este script no projeto grupo-2p (SQL Editor).
--
-- Cada status carimba a data em que o pedido ENTROU nele. O portal grava
-- sempre pelo `aplicarTransicao` (checkout, Pix, cron do SAP, webhook da
-- Fretefy, cancelamento), então nenhuma tela precisa preencher isso à mão.
-- ---------------------------------------------------------------------------

alter table public.propostas
  add column if not exists salvo_em                 timestamptz,
  add column if not exists aguardando_pagamento_em  timestamptz,
  add column if not exists processando_em           timestamptz,
  add column if not exists separado_em              timestamptz,
  add column if not exists faturado_em              timestamptz,
  add column if not exists coletado_em              timestamptz,
  add column if not exists entregue_em              timestamptz,
  add column if not exists cancelado_em             timestamptz,
  add column if not exists status_alterado_em       timestamptz;

-- Backfill do que já é conhecido, sem inventar datas:
update public.propostas set salvo_em = created_at where salvo_em is null;

-- Coletado: a coluna legada `enviado_em` já guardava esta data.
update public.propostas
   set coletado_em = enviado_em
 where coletado_em is null and enviado_em is not null;

-- Pedidos já finalizados no checkout: a data de conclusão é a entrada no
-- status seguinte a "Salvo".
update public.propostas
   set aguardando_pagamento_em = finalizado_em
 where aguardando_pagamento_em is null
   and finalizado_em is not null
   and status = 'Aguardando Pagamento';

update public.propostas
   set processando_em = coalesce(processando_em, finalizado_em)
 where finalizado_em is not null
   and processando_em is null
   and status not in ('Salvo', 'Aguardando Pagamento', 'Cancelado');

update public.propostas
   set status_alterado_em = coalesce(status_alterado_em, updated_at);

create index if not exists propostas_status_alterado_em_idx
  on public.propostas (status_alterado_em desc);
