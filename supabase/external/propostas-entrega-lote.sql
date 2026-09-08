-- Banco Grupo 2P — mês/lote de chegada da mercadoria (2P Carregadores).
--
-- Ao fechar o pedido de carregadores o vendedor escolhe o lote de chegada.
-- A lista de lotes vive no banco do portal (public.carregadores_lotes); aqui
-- guardamos apenas o id e o rótulo fotografado no momento do fechamento.
--
-- Rodar no SQL Editor do projeto grupo-2p.

ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS entrega_lote_id   uuid,
  ADD COLUMN IF NOT EXISTS entrega_lote_mes  text,
  ADD COLUMN IF NOT EXISTS entrega_lote_nome text;

CREATE INDEX IF NOT EXISTS propostas_entrega_lote_idx ON public.propostas (entrega_lote_id);

COMMENT ON COLUMN public.propostas.entrega_lote_id IS
  'Id do lote em public.carregadores_lotes (banco do portal). Sem FK: bancos diferentes.';
COMMENT ON COLUMN public.propostas.entrega_lote_mes IS 'Mês de referência do lote (AAAA-MM).';
COMMENT ON COLUMN public.propostas.entrega_lote_nome IS 'Nome do lote fotografado no fechamento.';
