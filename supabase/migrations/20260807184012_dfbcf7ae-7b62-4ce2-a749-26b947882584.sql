CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_instance_access(_instance text)
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

CREATE OR REPLACE FUNCTION private.is_internal_staff()
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

DROP POLICY IF EXISTS "cpo_clientes_select" ON public.cpo_clientes;
CREATE POLICY "cpo_clientes_select" ON public.cpo_clientes
  FOR SELECT TO authenticated
  USING (public.is_admin() OR private.has_instance_access('carregadores'));

DROP POLICY IF EXISTS "cpo_products_select" ON public.cpo_products;
CREATE POLICY "cpo_products_select" ON public.cpo_products
  FOR SELECT TO authenticated
  USING (public.is_admin() OR private.has_instance_access('carregadores'));

DROP POLICY IF EXISTS "internal staff read commission_settings" ON public.commission_settings;
CREATE POLICY "internal staff read commission_settings" ON public.commission_settings
  FOR SELECT TO authenticated
  USING (public.is_admin() OR private.is_internal_staff());

DROP FUNCTION IF EXISTS public.has_instance_access(text);
DROP FUNCTION IF EXISTS public.is_internal_staff();