CREATE TABLE public.salesperson_new_ab_goals (
  sf_user_id text NOT NULL,
  year int NOT NULL,
  quarter int NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  goal int NOT NULL DEFAULT 0 CHECK (goal >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sf_user_id, year, quarter)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salesperson_new_ab_goals TO authenticated;
GRANT ALL ON public.salesperson_new_ab_goals TO service_role;

ALTER TABLE public.salesperson_new_ab_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read new_ab goals"
  ON public.salesperson_new_ab_goals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert new_ab goals"
  ON public.salesperson_new_ab_goals FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update new_ab goals"
  ON public.salesperson_new_ab_goals FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete new_ab goals"
  ON public.salesperson_new_ab_goals FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_new_ab_goals_touch
  BEFORE UPDATE ON public.salesperson_new_ab_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
