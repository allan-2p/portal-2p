
DROP POLICY IF EXISTS "hidden_salespeople: authenticated read" ON public.hidden_salespeople;
CREATE POLICY "hidden_salespeople: privileged read" ON public.hidden_salespeople
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'diretoria')
  );

DROP POLICY IF EXISTS "Authenticated can read goals" ON public.salesperson_goals;
CREATE POLICY "salesperson_goals: scoped read" ON public.salesperson_goals
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'diretoria')
    OR sf_user_id IN (SELECT sf_user_id FROM public.profiles WHERE id = auth.uid() AND sf_user_id IS NOT NULL)
  );
