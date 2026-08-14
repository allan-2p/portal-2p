-- 1. cliente_logos: apenas equipe interna, com autoria registrada
DROP POLICY IF EXISTS "Autenticados gravam logos" ON public.cliente_logos;
DROP POLICY IF EXISTS "Autenticados atualizam logos" ON public.cliente_logos;
DROP POLICY IF EXISTS "Autenticados removem logos" ON public.cliente_logos;
DROP POLICY IF EXISTS "Autenticados leem logos" ON public.cliente_logos;

CREATE POLICY "cliente_logos_select_staff" ON public.cliente_logos
FOR SELECT TO authenticated
USING (public.is_admin() OR private.is_internal_staff());

CREATE POLICY "cliente_logos_insert_staff" ON public.cliente_logos
FOR INSERT TO authenticated
WITH CHECK ((public.is_admin() OR private.is_internal_staff()) AND updated_by = auth.uid());

CREATE POLICY "cliente_logos_update_staff" ON public.cliente_logos
FOR UPDATE TO authenticated
USING (public.is_admin() OR private.is_internal_staff())
WITH CHECK ((public.is_admin() OR private.is_internal_staff()) AND updated_by = auth.uid());

CREATE POLICY "cliente_logos_delete_staff" ON public.cliente_logos
FOR DELETE TO authenticated
USING (public.is_admin() OR private.is_internal_staff());

-- 2. Configuração fiscal/preço: leitura restrita à equipe interna
DROP POLICY IF EXISTS "cpo_ncm_select_auth" ON public.cpo_ncm;
CREATE POLICY "cpo_ncm_select_staff" ON public.cpo_ncm
FOR SELECT TO authenticated
USING (public.is_admin() OR private.is_internal_staff());

DROP POLICY IF EXISTS "cpo_uf_rates_select" ON public.cpo_uf_rates;
CREATE POLICY "cpo_uf_rates_select_staff" ON public.cpo_uf_rates
FOR SELECT TO authenticated
USING (public.is_admin() OR private.is_internal_staff());

DROP POLICY IF EXISTS "cpo_config_select" ON public.cpo_config;
CREATE POLICY "cpo_config_select_staff" ON public.cpo_config
FOR SELECT TO authenticated
USING (public.is_admin() OR private.is_internal_staff());

-- 3. user_activity_log: somente o servidor (service role) grava
DROP POLICY IF EXISTS "Users can insert their own activity" ON public.user_activity_log;
REVOKE INSERT ON public.user_activity_log FROM authenticated;
GRANT ALL ON public.user_activity_log TO service_role;