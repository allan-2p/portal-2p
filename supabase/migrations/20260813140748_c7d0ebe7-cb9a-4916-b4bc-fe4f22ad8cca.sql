CREATE TABLE IF NOT EXISTS public.cpo_ncm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL,
  ipi numeric NOT NULL DEFAULT 0.05,
  pis_cofins numeric NOT NULL DEFAULT 0.0925,
  aliq_inter numeric NOT NULL DEFAULT 0.04,
  tem_st boolean NOT NULL DEFAULT false,
  gera_difal boolean NOT NULL DEFAULT true,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cpo_ncm TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cpo_ncm TO authenticated;
GRANT ALL ON public.cpo_ncm TO service_role;

ALTER TABLE public.cpo_ncm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpo_ncm_select_auth" ON public.cpo_ncm
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cpo_ncm_write_admin" ON public.cpo_ncm
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER cpo_ncm_touch BEFORE UPDATE ON public.cpo_ncm
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.cpo_ncm (codigo, descricao, ipi, pis_cofins, aliq_inter, tem_st, gera_difal, observacoes)
VALUES
  ('8504.40.90', 'Carregador veicular DC (NCM atual)', 0.05, 0.0925, 0.04, true, true,
   'ICMS-ST em UFs com convênio quando não for venda para industrialização. DIFAL quando comprador não contribuinte. DIFAL-ST em UF com convênio para uso/consumo ou ativo.'),
  ('8537.10.90', 'Carregador veicular AC 7,4 kW (NCM de importação distinta)', 0.05, 0.0925, 0.04, false, true,
   'NCM importado com alíquotas e regras de DIFAL/ICMS-ST próprias. Revisar antes de faturar.')
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.cpo_products ADD COLUMN IF NOT EXISTS ncm_id uuid REFERENCES public.cpo_ncm(id) ON DELETE SET NULL;

ALTER TABLE public.sap_produtos ADD COLUMN IF NOT EXISTS visibilidade text NOT NULL DEFAULT 'solar';
ALTER TABLE public.sap_produtos DROP CONSTRAINT IF EXISTS sap_produtos_visibilidade_check;
ALTER TABLE public.sap_produtos ADD CONSTRAINT sap_produtos_visibilidade_check
  CHECK (visibilidade IN ('solar','carregadores','ambos'));

UPDATE public.sap_produtos SET visibilidade = 'carregadores' WHERE codigo IN ('200000647','200000645');

ALTER TABLE public.cpo_uf_rates ADD COLUMN IF NOT EXISTS convenio_st boolean NOT NULL DEFAULT false;
UPDATE public.cpo_uf_rates SET convenio_st = true WHERE uf IN ('AC','AL','AP','MT','MG','PR','PE','RJ','SP');

ALTER TABLE public.cpo_config ADD COLUMN IF NOT EXISTS cmv_max numeric NOT NULL DEFAULT 0.605;
ALTER TABLE public.cpo_config ADD COLUMN IF NOT EXISTS pct_gerente numeric NOT NULL DEFAULT 0.005;
ALTER TABLE public.cpo_config ADD COLUMN IF NOT EXISTS pct_indicacao numeric NOT NULL DEFAULT 0.0025;
ALTER TABLE public.cpo_config ADD COLUMN IF NOT EXISTS fator_clt numeric NOT NULL DEFAULT 1.66;