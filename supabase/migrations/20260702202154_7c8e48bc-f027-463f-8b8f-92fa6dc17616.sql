
CREATE TABLE public.salesperson_goals (
  sf_user_id text PRIMARY KEY,
  monthly_goal numeric(14,2) NOT NULL DEFAULT 0,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salesperson_goals TO authenticated;
GRANT ALL ON public.salesperson_goals TO service_role;

ALTER TABLE public.salesperson_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Goals: authenticated read"
  ON public.salesperson_goals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Goals: admin manage"
  ON public.salesperson_goals FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER salesperson_goals_touch_updated_at
  BEFORE UPDATE ON public.salesperson_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
