-- Boletos a prazo publicados pelo financeiro no SharePoint.
-- Rodar no banco do Grupo 2P (SQL editor do projeto npzlinbglznnnwxxcawh).
--
-- boletos:            [{ nome, path, atualizado_em, tamanho }] gravado pelo cron
-- boletos_avisados_em: data do e-mail "Boletos 2P - Pedido X com NF:Y" (avisa 1x)

alter table public.propostas
  add column if not exists boletos jsonb,
  add column if not exists boletos_avisados_em timestamptz;

create index if not exists propostas_boletos_pendentes_idx
  on public.propostas (forma_pagamento, boletos_avisados_em)
  where nf_numero is not null;
