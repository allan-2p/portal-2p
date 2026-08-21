ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS kit_fotovoltaico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frete_bonificado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.propostas.kit_fotovoltaico IS 'Venda de kit gerador fotovoltaico: isencao de ICMS/IPI e material 100000350 -> 100000278 no SAP.';
COMMENT ON COLUMN public.propostas.frete_bonificado IS 'Frete absorvido pela 2P: nao entra no total cobrado e vai como CIF BONIFICADO no SAP.';