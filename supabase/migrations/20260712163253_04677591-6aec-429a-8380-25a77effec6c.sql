DROP POLICY IF EXISTS "scoped read" ON public.salesperson_new_ab_goals;

CREATE POLICY "scoped read"
ON public.salesperson_new_ab_goals
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gerente'::app_role)
  OR public.has_role(auth.uid(), 'diretor'::app_role)
  OR sf_user_id IN (SELECT sf_user_id FROM public.profiles WHERE id = auth.uid())
);