DROP POLICY IF EXISTS "salesperson_new_ab_goals: scoped read" ON public.salesperson_new_ab_goals;
CREATE POLICY "salesperson_new_ab_goals: scoped read"
ON public.salesperson_new_ab_goals
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR (sf_user_id IN (
    SELECT profiles.sf_user_id FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.sf_user_id IS NOT NULL
  ))
);