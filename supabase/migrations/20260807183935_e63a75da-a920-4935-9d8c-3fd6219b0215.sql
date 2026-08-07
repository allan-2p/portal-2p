-- Helper: acesso a uma instância (unidade) do portal
CREATE OR REPLACE FUNCTION public.has_instance_access(_instance text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_instance_access
    WHERE user_id = auth.uid() AND instance_id = _instance
  );
$$;

-- Helper: colaborador interno ativo
CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND ativo = true AND is_external = false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_instance_access(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_internal_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_instance_access(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, service_role;

-- cpo_clientes: PII apenas para a unidade Carregadores
DROP POLICY IF EXISTS "cpo_clientes_select" ON public.cpo_clientes;
CREATE POLICY "cpo_clientes_select" ON public.cpo_clientes
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_instance_access('carregadores'));

-- cpo_products: custo interno apenas para a unidade Carregadores
DROP POLICY IF EXISTS "cpo_products_select" ON public.cpo_products;
CREATE POLICY "cpo_products_select" ON public.cpo_products
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_instance_access('carregadores'));

-- commission_settings: apenas colaboradores internos ativos
DROP POLICY IF EXISTS "authenticated read commission_settings" ON public.commission_settings;
CREATE POLICY "internal staff read commission_settings" ON public.commission_settings
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_internal_staff());