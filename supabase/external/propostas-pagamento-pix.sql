-- ---------------------------------------------------------------------------
-- Campos de pagamento (Pix / boleto) nas propostas universais
-- Rode este script no projeto único grupo-2p (SQL Editor).
-- ---------------------------------------------------------------------------

alter table public.propostas
  add column if not exists pagamento_meio text,                 -- 'pix' | 'boleto'
  add column if not exists pagamento_status text,               -- 'pago' | 'expirado' | 'cancelado'
  add column if not exists pagamento_txid text,                 -- txid da cobrança no PSP
  add column if not exists pagamento_e2eid text,                -- endToEndId do Pix liquidado
  add column if not exists pagamento_valor numeric,
  add column if not exists pagamento_atualizado_em timestamptz,
  add column if not exists pago_em timestamptz,
  -- Cobrança emitida no checkout (boleto à vista / Pix)
  add column if not exists pagamento_vencimento date,
  add column if not exists pagamento_nosso_numero text,
  add column if not exists pagamento_linha_digitavel text,
  add column if not exists pagamento_codigo_barras text,
  add column if not exists pagamento_url text,
  add column if not exists pagamento_pix_copia_cola text;

create index if not exists propostas_pagamento_txid_idx on public.propostas (pagamento_txid);
create index if not exists propostas_pagamento_status_idx on public.propostas (pagamento_status);
