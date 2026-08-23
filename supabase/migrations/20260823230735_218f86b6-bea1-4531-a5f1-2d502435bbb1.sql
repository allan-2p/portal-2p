REVOKE ALL ON FUNCTION public.can_manage_all_propostas(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_proposta(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_all_propostas(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_proposta(uuid, uuid) TO authenticated, service_role;