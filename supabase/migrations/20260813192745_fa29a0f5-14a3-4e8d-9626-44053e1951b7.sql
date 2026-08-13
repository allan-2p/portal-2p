GRANT SELECT ON public.sap_produtos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sap_produtos TO authenticated;
GRANT ALL ON public.sap_produtos TO service_role;