
-- Regras de comissão (Vendido, Novos A/B) e equipe por vendedor.
-- Estrutura simples chave/valor para facilitar edição via UI e evoluções futuras.
CREATE TABLE public.commission_settings (
  id text PRIMARY KEY,
  config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.commission_settings TO authenticated;
GRANT ALL ON public.commission_settings TO service_role;

ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read commission_settings"
  ON public.commission_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admins manage commission_settings"
  ON public.commission_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER commission_settings_touch
  BEFORE UPDATE ON public.commission_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed padrão com os valores enviados pelo usuário.
INSERT INTO public.commission_settings (id, config) VALUES
  ('vendido_tiers', jsonb_build_object(
    'tiers', jsonb_build_array(
      jsonb_build_object('min', 70,  'max', 80),
      jsonb_build_object('min', 80,  'max', 90),
      jsonb_build_object('min', 90,  'max', 100),
      jsonb_build_object('min', 100, 'max', 110),
      jsonb_build_object('min', 110, 'max', null)
    ),
    'pre_vendas', jsonb_build_array(0.30, 0.40, 0.50, 0.60, 0.70),
    'carteira',   jsonb_build_array(0.155, 0.165, 0.185, 0.230, 0.260)
  )),
  ('novos_values', jsonb_build_object(
    'pre_vendas', jsonb_build_object('A', 100, 'B', 50),
    'carteira',   jsonb_build_object('A', 200, 'B', 100)
  )),
  ('salesperson_equipe', jsonb_build_object(
    '005U400000FDLnbIAH', 'carteira',
    '005Dn000007GxFcIAK', 'carteira',
    '005Dn000007GxFrIAK', 'carteira',
    '005U400000B5NYjIAN', 'carteira'
  ));
