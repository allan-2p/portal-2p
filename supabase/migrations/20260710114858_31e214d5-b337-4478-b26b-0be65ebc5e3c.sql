CREATE TABLE public.salesperson_retention_goals (
  sf_user_id text NOT NULL,
  year int NOT NULL,
  quarter int NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  goal int NOT NULL DEFAULT 0 CHECK (goal >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sf_user_id, year, quarter)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salesperson_retention_goals TO authenticated;
GRANT ALL ON public.salesperson_retention_goals TO service_role;

ALTER TABLE public.salesperson_retention_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped read retention goals" ON public.salesperson_retention_goals
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gerente')
  OR public.has_role(auth.uid(), 'diretor')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.sf_user_id = salesperson_retention_goals.sf_user_id)
);

CREATE POLICY "Admin write retention goals" ON public.salesperson_retention_goals
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_retention_goals BEFORE UPDATE ON public.salesperson_retention_goals
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();