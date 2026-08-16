ALTER TABLE public.cpo_proposals
  ADD COLUMN IF NOT EXISTS previsao_fechamento date,
  ADD COLUMN IF NOT EXISTS tipo_nf text NOT NULL DEFAULT 'venda',
  ADD COLUMN IF NOT EXISTS faturar_cliente_final boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS entrega_diferente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entrega jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS frete_area_rural boolean NOT NULL DEFAULT false;