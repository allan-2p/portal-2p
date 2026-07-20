
CREATE TABLE public.marketing_goals (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'un',
  period TEXT NOT NULL DEFAULT 'mensal',
  goal NUMERIC NOT NULL DEFAULT 0,
  real_value NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_goals TO authenticated;
GRANT ALL ON public.marketing_goals TO service_role;

ALTER TABLE public.marketing_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_goals read authenticated"
  ON public.marketing_goals FOR SELECT TO authenticated USING (true);

CREATE POLICY "marketing_goals update admin"
  ON public.marketing_goals FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "marketing_goals insert admin"
  ON public.marketing_goals FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE TRIGGER marketing_goals_touch BEFORE UPDATE ON public.marketing_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.marketing_goals (key, label, unit, period, goal) VALUES
  ('leads_qualificados_mes', 'Leads qualificados (Orgânico)', 'leads', 'mensal', 150),
  ('mql_pago_mes', 'MQL (Tráfego Pago)', 'leads', 'mensal', 250),
  ('novos_pago_mes', 'Novos (Tráfego Pago)', 'clientes', 'mensal', 30),
  ('ig_solar_tri', 'Seguidores Instagram · Solar', 'seguidores', 'trimestral', 30000),
  ('ig_carregadores_tri', 'Seguidores Instagram · Carregadores', 'seguidores', 'trimestral', 10000),
  ('ig_station_tri', 'Seguidores Instagram · Station', 'seguidores', 'trimestral', 3000)
ON CONFLICT (key) DO NOTHING;
