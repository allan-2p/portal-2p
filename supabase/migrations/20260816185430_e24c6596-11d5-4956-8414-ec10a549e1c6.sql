CREATE OR REPLACE FUNCTION private.is_internal_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT _user_id IS NOT NULL
     AND _user_id = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = _user_id
         AND COALESCE(p.ativo, false) = true
         AND COALESCE(p.is_external, false) = false
     );
$function$;

GRANT EXECUTE ON FUNCTION private.is_internal_staff(uuid) TO authenticated, service_role;