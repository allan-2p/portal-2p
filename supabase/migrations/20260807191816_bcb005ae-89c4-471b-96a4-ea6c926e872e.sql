
-- 1. Restrict client records to their creator or admins
DROP POLICY IF EXISTS cpo_clientes_select ON public.cpo_clientes;
CREATE POLICY cpo_clientes_select ON public.cpo_clientes
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.is_admin());

-- 2. Hide internal cost columns of products from non-admins (column-level privileges)
REVOKE SELECT ON public.cpo_products FROM authenticated;
GRANT SELECT (id, nome, potencia, ativo, created_at, updated_at) ON public.cpo_products TO authenticated;

CREATE OR REPLACE VIEW public.cpo_products_admin
WITH (security_barrier = true) AS
  SELECT id, nome, potencia, custo, preco_sugerido, ativo, created_at, updated_at
  FROM public.cpo_products
  WHERE public.is_admin();

GRANT SELECT ON public.cpo_products_admin TO authenticated;
