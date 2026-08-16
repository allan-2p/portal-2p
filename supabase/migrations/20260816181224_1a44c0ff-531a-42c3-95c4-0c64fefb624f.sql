DROP POLICY IF EXISTS "cpo_clientes_delete" ON public.cpo_clientes;
CREATE POLICY "cpo_clientes_delete_admin" ON public.cpo_clientes FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "cpo_proposals_delete" ON public.cpo_proposals;
CREATE POLICY "cpo_proposals_delete_admin" ON public.cpo_proposals FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "cpo_tasks_delete_own_or_admin" ON public.cpo_tasks;
CREATE POLICY "cpo_tasks_delete_admin" ON public.cpo_tasks FOR DELETE TO authenticated USING (public.is_admin());