
CREATE TABLE public.group_kpi_goals (
  kpi_key text PRIMARY KEY,
  label text NOT NULL,
  period_type text NOT NULL,
  goal numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.group_kpi_goals TO authenticated;
GRANT ALL ON public.group_kpi_goals TO service_role;

ALTER TABLE public.group_kpi_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read group kpi goals"
  ON public.group_kpi_goals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admins can insert group kpi goals"
  ON public.group_kpi_goals FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can update group kpi goals"
  ON public.group_kpi_goals FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_group_kpi_goals_touch
  BEFORE UPDATE ON public.group_kpi_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.group_kpi_goals (kpi_key, label, period_type, goal) VALUES
  ('novos', 'Clientes novos', 'mensal', 40),
  ('novos_reativacoes', 'Novos e reativações', 'mensal', 100),
  ('recorrencia', 'Recorrência', 'trimestral', 115),
  ('retencao', 'Retenção', 'trimestral', 87)
ON CONFLICT (kpi_key) DO NOTHING;
