CREATE OR REPLACE FUNCTION public.cpo_next_sap_seq()
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT nextval('public.cpo_proposals_sap_seq');
$$;

REVOKE EXECUTE ON FUNCTION public.cpo_next_sap_seq() FROM anon;
GRANT EXECUTE ON FUNCTION public.cpo_next_sap_seq() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cpo_next_sap_seq() TO service_role;
