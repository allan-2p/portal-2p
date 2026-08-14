REVOKE ALL ON FUNCTION public.sync_user_role_from_profiles(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_sync_user_role() FROM PUBLIC, anon, authenticated;