-- solar_calc_config: escrita apenas admin
DROP POLICY IF EXISTS "solar_calc_config insere" ON public.solar_calc_config;
DROP POLICY IF EXISTS "solar_calc_config atualiza" ON public.solar_calc_config;
CREATE POLICY "solar_calc_config insere (admin)" ON public.solar_calc_config
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "solar_calc_config atualiza (admin)" ON public.solar_calc_config
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- solar_cupons: edição apenas admin ou criador
DROP POLICY IF EXISTS "solar_cupons atualiza" ON public.solar_cupons;
CREATE POLICY "solar_cupons atualiza (admin/criador)" ON public.solar_cupons
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR auth.uid() = created_by)
  WITH CHECK (public.is_admin() OR auth.uid() = created_by);

-- solar_geradores
DROP POLICY IF EXISTS "solar_geradores insere" ON public.solar_geradores;
DROP POLICY IF EXISTS "solar_geradores atualiza" ON public.solar_geradores;
CREATE POLICY "solar_geradores insere (admin)" ON public.solar_geradores
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "solar_geradores atualiza (admin)" ON public.solar_geradores
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- solar_modulos
DROP POLICY IF EXISTS "solar_modulos insere" ON public.solar_modulos;
DROP POLICY IF EXISTS "solar_modulos atualiza" ON public.solar_modulos;
CREATE POLICY "solar_modulos insere (admin)" ON public.solar_modulos
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "solar_modulos atualiza (admin)" ON public.solar_modulos
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- solar_suportes
DROP POLICY IF EXISTS "solar_suportes insere" ON public.solar_suportes;
DROP POLICY IF EXISTS "solar_suportes atualiza" ON public.solar_suportes;
CREATE POLICY "solar_suportes insere (admin)" ON public.solar_suportes
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "solar_suportes atualiza (admin)" ON public.solar_suportes
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- solar_trilhos
DROP POLICY IF EXISTS "solar_trilhos insere" ON public.solar_trilhos;
DROP POLICY IF EXISTS "solar_trilhos atualiza" ON public.solar_trilhos;
CREATE POLICY "solar_trilhos insere (admin)" ON public.solar_trilhos
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "solar_trilhos atualiza (admin)" ON public.solar_trilhos
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- solar_trilho_suportes
DROP POLICY IF EXISTS "solar_trilho_suportes insere" ON public.solar_trilho_suportes;
DROP POLICY IF EXISTS "solar_trilho_suportes atualiza" ON public.solar_trilho_suportes;
DROP POLICY IF EXISTS "solar_trilho_suportes exclui" ON public.solar_trilho_suportes;
CREATE POLICY "solar_trilho_suportes insere (admin)" ON public.solar_trilho_suportes
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "solar_trilho_suportes atualiza (admin)" ON public.solar_trilho_suportes
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "solar_trilho_suportes exclui (admin)" ON public.solar_trilho_suportes
  FOR DELETE TO authenticated USING (public.is_admin());