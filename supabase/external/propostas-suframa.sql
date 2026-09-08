-- Banco Grupo 2P — venda para a Zona Franca de Manaus (SUFRAMA).
--
-- A inscrição SUFRAMA vem da consulta pública do CNPJ (cadastro do cliente) e
-- é fotografada na proposta: número, situação e se o benefício foi aplicado no
-- cálculo (sem PIS/COFINS, sem IPI, ICMS 4% importado / isento nacional).
--
-- Rodar no SQL Editor do projeto grupo-2p.

ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS suframa           text,
  ADD COLUMN IF NOT EXISTS suframa_situacao  text,
  ADD COLUMN IF NOT EXISTS suframa_aplicado  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS propostas_suframa_aplicado_idx
  ON public.propostas (suframa_aplicado) WHERE suframa_aplicado;

COMMENT ON COLUMN public.propostas.suframa IS 'Inscrição SUFRAMA do cliente no momento da proposta.';
COMMENT ON COLUMN public.propostas.suframa_situacao IS 'Situação da inscrição SUFRAMA na consulta do CNPJ.';
COMMENT ON COLUMN public.propostas.suframa_aplicado IS
  'Proposta calculada com o benefício da Zona Franca de Manaus (sem PIS/COFINS, sem IPI, ICMS 4% importado).';
