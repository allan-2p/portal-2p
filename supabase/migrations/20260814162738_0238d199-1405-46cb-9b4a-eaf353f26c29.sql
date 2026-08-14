DROP POLICY IF EXISTS sap_produtos_delete_admin ON public.sap_produtos;
REVOKE DELETE ON public.sap_produtos FROM authenticated;