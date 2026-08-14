-- 1) Integra as permissões individuais restantes ao(s) perfil(is) do usuário
INSERT INTO public.permission_profile_features (profile_id, instance_id, feature_key)
SELECT DISTINCT upp.profile_id, ufp.instance_id, ufp.feature_key
FROM public.user_feature_permissions ufp
JOIN public.user_permission_profiles upp ON upp.user_id = ufp.user_id
WHERE ufp.allowed = true
ON CONFLICT DO NOTHING;

-- 2) Remove definitivamente a estrutura de permissões por usuário
DROP TABLE IF EXISTS public.user_feature_permissions CASCADE;
DROP TABLE IF EXISTS public.permission_audit_log CASCADE;