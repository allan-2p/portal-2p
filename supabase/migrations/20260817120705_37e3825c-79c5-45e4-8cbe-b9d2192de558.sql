DROP POLICY IF EXISTS client_notes_select_auth ON public.client_notes;
DROP POLICY IF EXISTS client_notes_update_auth ON public.client_notes;

CREATE POLICY client_notes_select_scoped ON public.client_notes
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.user_instance_access uia
    WHERE uia.user_id = auth.uid()
      AND uia.instance_id = client_notes.instancia
  )
);

CREATE POLICY client_notes_update_scoped ON public.client_notes
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR (
    updated_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_instance_access uia
      WHERE uia.user_id = auth.uid()
        AND uia.instance_id = client_notes.instancia
    )
  )
)
WITH CHECK (updated_by = auth.uid());