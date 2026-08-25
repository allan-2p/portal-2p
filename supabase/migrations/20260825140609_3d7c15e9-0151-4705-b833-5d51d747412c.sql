-- 1) Padrinhos: created_by definido pelo servidor
ALTER TABLE public.carregadores_padrinhos ALTER COLUMN created_by SET DEFAULT auth.uid();
UPDATE public.carregadores_padrinhos SET created_by = COALESCE(created_by, '00000000-0000-0000-0000-000000000000'::uuid) WHERE created_by IS NULL;

DROP POLICY IF EXISTS "Padrinhos: cadastro interno" ON public.carregadores_padrinhos;
CREATE POLICY "Padrinhos: cadastro interno"
ON public.carregadores_padrinhos FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND private.is_internal_staff()
);

DROP POLICY IF EXISTS "Padrinhos: leitura escopo" ON public.carregadores_padrinhos;
CREATE POLICY "Padrinhos: leitura escopo"
ON public.carregadores_padrinhos FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR created_by = (SELECT auth.uid())
  OR (
    private.is_internal_staff()
    AND EXISTS (
      SELECT 1 FROM public.user_instance_access uia
      WHERE uia.user_id = (SELECT auth.uid()) AND uia.instance_id = 'carregadores'
    )
  )
);

-- 2) Catalogo/config Solar + mapeamento Salesforce: leitura só para staff interno
DROP POLICY IF EXISTS "solar_trilhos leitura" ON public.solar_trilhos;
CREATE POLICY "solar_trilhos leitura" ON public.solar_trilhos FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR private.is_internal_staff());

DROP POLICY IF EXISTS "solar_suportes leitura" ON public.solar_suportes;
CREATE POLICY "solar_suportes leitura" ON public.solar_suportes FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR private.is_internal_staff());

DROP POLICY IF EXISTS "solar_modulos leitura" ON public.solar_modulos;
CREATE POLICY "solar_modulos leitura" ON public.solar_modulos FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR private.is_internal_staff());

DROP POLICY IF EXISTS "solar_geradores leitura" ON public.solar_geradores;
CREATE POLICY "solar_geradores leitura" ON public.solar_geradores FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR private.is_internal_staff());

DROP POLICY IF EXISTS "solar_micro_read" ON public.solar_microinversores;
CREATE POLICY "solar_micro_read" ON public.solar_microinversores FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR private.is_internal_staff());

DROP POLICY IF EXISTS "solar_trilho_suportes leitura" ON public.solar_trilho_suportes;
CREATE POLICY "solar_trilho_suportes leitura" ON public.solar_trilho_suportes FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR private.is_internal_staff());

DROP POLICY IF EXISTS "solar_calc_config leitura" ON public.solar_calc_config;
CREATE POLICY "solar_calc_config leitura" ON public.solar_calc_config FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR private.is_internal_staff());

DROP POLICY IF EXISTS "Usuários autenticados podem ver o mapeamento" ON public.salesforce_field_map;
CREATE POLICY "salesforce_field_map leitura" ON public.salesforce_field_map FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR private.is_internal_staff());

REVOKE SELECT ON public.solar_trilhos, public.solar_suportes, public.solar_modulos,
  public.solar_geradores, public.solar_microinversores, public.solar_trilho_suportes,
  public.solar_calc_config, public.salesforce_field_map, public.carregadores_padrinhos FROM anon;

-- 3) Usos de cupom: vinculo obrigatorio ao usuario e sem UPDATE
DROP POLICY IF EXISTS "solar_cupom_usos insere" ON public.solar_cupom_usos;
CREATE POLICY "solar_cupom_usos insere" ON public.solar_cupom_usos FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE UPDATE ON public.solar_cupom_usos FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.solar_cupom_usos FROM anon;
