-- 1) Arquivo legado de clientes IM: escrita restrita a administradores
CREATE POLICY "cpo_clientes_im_legado_admin_write"
  ON public.carregadores_clientes_im_legado
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2) log_retention_runs: gravação apenas por jobs privilegiados (service role)
REVOKE INSERT, UPDATE, DELETE ON public.log_retention_runs FROM authenticated, anon;
GRANT ALL ON public.log_retention_runs TO service_role;

-- 3) rate_limit_hits: tabela interna, sem acesso pela API
REVOKE ALL ON public.rate_limit_hits FROM authenticated, anon;
GRANT ALL ON public.rate_limit_hits TO service_role;

-- 4) user_invites: convites permanecem restritos a administradores
REVOKE ALL ON public.user_invites FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_invites TO authenticated;
GRANT ALL ON public.user_invites TO service_role;

-- 5) Funções SECURITY DEFINER que não devem ser chamadas por usuários logados
REVOKE EXECUTE ON FUNCTION public.apply_log_retention() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reservar_estoque_pendente(jsonb) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.portal_cron_post(text, jsonb) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_user_role_from_profiles(uuid) FROM authenticated, anon, PUBLIC;

-- Funções de gatilho: nunca precisam ser chamadas diretamente pela API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_default_instance_access() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_sync_user_role() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.profiles_block_sensitive_self_update() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.solar_cupom_usos_sync_contador() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.carregadores_padrinhos_lock_owner() FROM authenticated, anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_log_retention() TO service_role;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_pendente(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_cron_post(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_user_role_from_profiles(uuid) TO service_role;