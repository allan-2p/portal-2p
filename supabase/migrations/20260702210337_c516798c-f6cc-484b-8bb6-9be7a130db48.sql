DROP POLICY IF EXISTS "Profiles: autenticados veem todos" ON public.profiles;

CREATE POLICY "Profiles: admin/gestor/diretoria veem todos"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'diretoria'::app_role)
);