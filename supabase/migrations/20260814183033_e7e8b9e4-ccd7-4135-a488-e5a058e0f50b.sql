DROP POLICY IF EXISTS "Authenticated can read integration alert settings" ON public.integration_alert_settings;
CREATE POLICY "Internal staff read integration alert settings"
  ON public.integration_alert_settings FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "marketing_goals read authenticated" ON public.marketing_goals;
CREATE POLICY "marketing_goals read internal staff"
  ON public.marketing_goals FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

DROP POLICY IF EXISTS "sap_sync_select_auth" ON public.sap_produtos_sync_runs;
CREATE POLICY "sap_sync_select_internal"
  ON public.sap_produtos_sync_runs FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.user_activity_log FROM authenticated, anon;
GRANT ALL ON public.user_activity_log TO service_role;