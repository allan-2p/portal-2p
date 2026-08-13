REVOKE ALL ON FUNCTION public.cpo_conclude_proposal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpo_conclude_proposal(uuid, text, text) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.cpo_conclude_proposal(uuid, text);