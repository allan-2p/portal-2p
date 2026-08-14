CREATE OR REPLACE FUNCTION public.cpo_next_sap_seq()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('public.cpo_proposals_sap_seq');
$$;

GRANT EXECUTE ON FUNCTION public.cpo_next_sap_seq() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cpo_next_sap_seq() TO service_role;
