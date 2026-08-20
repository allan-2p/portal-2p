-- ---------------------------------------------------------------------------
-- Motor de notas fiscais (ZNFE_OV_CONSULTAR) — colunas de avanço de status.
-- Rode este script no projeto grupo-2p (SQL Editor).
-- ---------------------------------------------------------------------------

alter table public.propostas
  add column if not exists separado_em timestamptz,
  add column if not exists faturado_em timestamptz,
  add column if not exists enviado_em timestamptz,
  add column if not exists nf_numero text,
  add column if not exists nf_serie text,
  add column if not exists nf_chave text,
  add column if not exists danfe_path text,
  -- frete bonificado: envia INCO2 = "CIF BONIFICADO" e o frete vira desconto
  add column if not exists frete_bonificado boolean not null default false,
  -- condição de pagamento escolhida (boleto a prazo) — alimenta ZTERM e T_PAGTO
  add column if not exists condicao_pagamento_codigo text,
  add column if not exists condicao_pagamento_descricao text;

create index if not exists propostas_nf_numero_idx on public.propostas (nf_numero);
create index if not exists propostas_status_sap_ov_idx on public.propostas (status, sap_ov_numero);
