-- 1) cpo_metas: metas individuais só para o dono ou admin
DROP POLICY IF EXISTS "cpo_metas_select_authenticated" ON public.cpo_metas;
CREATE POLICY "cpo_metas_select_own_or_admin" ON public.cpo_metas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- 2) cpo_products: exclusão explicitamente restrita a admin
DROP POLICY IF EXISTS "cpo_products_delete_admin" ON public.cpo_products;
CREATE POLICY "cpo_products_delete_admin" ON public.cpo_products
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 3) Configuração de perfis / instâncias / metas do grupo: apenas staff interno
DROP POLICY IF EXISTS "profile_features_read_auth" ON public.permission_profile_features;
CREATE POLICY "profile_features_read_internal" ON public.permission_profile_features
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated can read profile instances" ON public.permission_profile_instances;
CREATE POLICY "profile_instances_read_internal" ON public.permission_profile_instances
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_read_auth" ON public.permission_profiles;
CREATE POLICY "permission_profiles_read_internal" ON public.permission_profiles
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "instances readable by authenticated" ON public.instances;
CREATE POLICY "instances_read_internal" ON public.instances
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "authenticated read view_variants" ON public.view_variants;
CREATE POLICY "view_variants_read_internal" ON public.view_variants
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "authenticated can read group kpi goals" ON public.group_kpi_goals;
CREATE POLICY "group_kpi_goals_read_internal" ON public.group_kpi_goals
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

-- 4) Produtos / estoque / containers: dados de custo apenas para staff interno
DROP POLICY IF EXISTS "produtos leitura interna" ON public.produtos;
CREATE POLICY "produtos_read_internal" ON public.produtos
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "estoque leitura interna" ON public.estoque;
CREATE POLICY "estoque_read_internal" ON public.estoque
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "containers leitura interna" ON public.containers;
CREATE POLICY "containers_read_internal" ON public.containers
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "estoque runs leitura interna" ON public.estoque_sync_runs;
CREATE POLICY "estoque_sync_runs_read_internal" ON public.estoque_sync_runs
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

-- 5) sap_produtos: custo e preço sugerido apenas para staff interno
DROP POLICY IF EXISTS "sap_produtos_select_auth" ON public.sap_produtos;
CREATE POLICY "sap_produtos_select_internal" ON public.sap_produtos
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());
