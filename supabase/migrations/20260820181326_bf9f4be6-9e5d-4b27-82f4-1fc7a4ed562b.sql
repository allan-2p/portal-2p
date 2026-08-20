CREATE OR REPLACE FUNCTION private.can_read_danfe(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, storage
AS $$
  SELECT _user_id IS NOT NULL AND (
    private.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.propostas p
      WHERE p.created_by = _user_id
        AND p.id::text = (storage.foldername(_object_name))[2]
    )
  )
$$;

REVOKE ALL ON FUNCTION private.can_read_danfe(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION private.can_read_danfe(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "danfes_read_authenticated" ON storage.objects;

CREATE POLICY "danfes_read_owner_or_admin"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'danfes' AND private.can_read_danfe(auth.uid(), name));