REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO service_role;