CREATE OR REPLACE FUNCTION private.is_internal_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND COALESCE(p.is_external, false) = false
  );
$$;

DROP POLICY IF EXISTS "Avatars: authenticated read" ON storage.objects;
CREATE POLICY "Avatars: owner or staff read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR private.is_internal_staff(auth.uid())
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "top20 read authenticated" ON storage.objects;
CREATE POLICY "top20 read staff"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'top20'
  AND (
    private.is_internal_staff(auth.uid())
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  )
);