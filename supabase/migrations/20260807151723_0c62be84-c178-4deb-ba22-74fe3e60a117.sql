
-- cpo_config
DROP POLICY IF EXISTS cpo_config_all ON public.cpo_config;
CREATE POLICY cpo_config_select ON public.cpo_config FOR SELECT TO authenticated USING (true);
CREATE POLICY cpo_config_admin_write ON public.cpo_config FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- cpo_products
DROP POLICY IF EXISTS cpo_products_all ON public.cpo_products;
CREATE POLICY cpo_products_select ON public.cpo_products FOR SELECT TO authenticated USING (true);
CREATE POLICY cpo_products_admin_write ON public.cpo_products FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- cpo_uf_rates
DROP POLICY IF EXISTS cpo_uf_rates_all ON public.cpo_uf_rates;
CREATE POLICY cpo_uf_rates_select ON public.cpo_uf_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY cpo_uf_rates_admin_write ON public.cpo_uf_rates FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- cpo_proposals: owner or admin
DROP POLICY IF EXISTS cpo_proposals_all ON public.cpo_proposals;
CREATE POLICY cpo_proposals_select ON public.cpo_proposals FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());
CREATE POLICY cpo_proposals_insert ON public.cpo_proposals FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.is_admin());
CREATE POLICY cpo_proposals_update ON public.cpo_proposals FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());
CREATE POLICY cpo_proposals_delete ON public.cpo_proposals FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());
