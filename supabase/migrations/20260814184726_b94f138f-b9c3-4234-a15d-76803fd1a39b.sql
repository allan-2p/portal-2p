CREATE SEQUENCE IF NOT EXISTS public.cpo_proposals_sap_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;

GRANT USAGE, SELECT ON SEQUENCE public.cpo_proposals_sap_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cpo_proposals_sap_seq TO service_role;
