DROP POLICY IF EXISTS "solar_cupons leitura" ON public.solar_cupons;
CREATE POLICY "solar_cupons leitura escopo" ON public.solar_cupons FOR SELECT TO authenticated
USING (
  is_admin()
  OR auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM public.user_instance_access uia WHERE uia.user_id = auth.uid() AND uia.instance_id = 'solar')
);

DROP POLICY IF EXISTS "Padrinhos: leitura interna" ON public.carregadores_padrinhos;
CREATE POLICY "Padrinhos: leitura escopo" ON public.carregadores_padrinhos FOR SELECT TO authenticated
USING (
  is_admin()
  OR auth.uid() = created_by
  OR (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_external = false)
    AND EXISTS (SELECT 1 FROM public.user_instance_access uia WHERE uia.user_id = auth.uid() AND uia.instance_id = 'carregadores')
  )
);