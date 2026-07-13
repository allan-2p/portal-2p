
CREATE TABLE public.salesperson_bonus_goals (
  sf_user_id text PRIMARY KEY,
  bonus_text text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salesperson_bonus_goals TO authenticated;
GRANT ALL ON public.salesperson_bonus_goals TO service_role;

ALTER TABLE public.salesperson_bonus_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped read bonus goals" ON public.salesperson_bonus_goals
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gerente'::app_role)
  OR private.has_role(auth.uid(), 'diretor'::app_role)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.sf_user_id = salesperson_bonus_goals.sf_user_id)
);

CREATE POLICY "Admin write bonus goals" ON public.salesperson_bonus_goals
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_bonus_goals BEFORE UPDATE ON public.salesperson_bonus_goals
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
