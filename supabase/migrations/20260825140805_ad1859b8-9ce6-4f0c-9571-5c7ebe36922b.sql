DROP POLICY IF EXISTS "solar_cupom_usos exclui (admin)" ON public.solar_cupom_usos;
CREATE POLICY "solar_cupom_usos exclui" ON public.solar_cupom_usos FOR DELETE TO authenticated
USING ((SELECT public.is_admin()) OR user_id = (SELECT auth.uid()));