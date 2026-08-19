CREATE TABLE public.frete_regras_config (
  id integer PRIMARY KEY DEFAULT 1,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT frete_regras_config_singleton CHECK (id = 1)
);

GRANT SELECT ON public.frete_regras_config TO authenticated;
GRANT INSERT, UPDATE ON public.frete_regras_config TO authenticated;
GRANT ALL ON public.frete_regras_config TO service_role;

ALTER TABLE public.frete_regras_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frete_regras leitura autenticada"
  ON public.frete_regras_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "frete_regras escrita admin"
  ON public.frete_regras_config FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "frete_regras update admin"
  ON public.frete_regras_config FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER frete_regras_config_touch
  BEFORE UPDATE ON public.frete_regras_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.frete_regras_config (id, config) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;