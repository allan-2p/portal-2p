
-- Recreate salesperson_goals as per-month
DROP TABLE IF EXISTS public.salesperson_goals CASCADE;

CREATE TABLE public.salesperson_goals (
  sf_user_id text NOT NULL,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  monthly_goal numeric(14,2) NOT NULL DEFAULT 0,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sf_user_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salesperson_goals TO authenticated;
GRANT ALL ON public.salesperson_goals TO service_role;

ALTER TABLE public.salesperson_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read goals"
  ON public.salesperson_goals FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert goals"
  ON public.salesperson_goals FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update goals"
  ON public.salesperson_goals FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete goals"
  ON public.salesperson_goals FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_salesperson_goals_updated
  BEFORE UPDATE ON public.salesperson_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_salesperson_goals_period ON public.salesperson_goals(year, month);
