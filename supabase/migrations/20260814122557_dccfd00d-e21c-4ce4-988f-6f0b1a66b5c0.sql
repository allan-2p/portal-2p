-- 1) Renomear perfis
UPDATE public.permission_profiles SET name = 'Diretor' WHERE name = 'Diretor | Grupo 2P';
UPDATE public.permission_profiles SET name = 'Analista de Marketing' WHERE name = 'Analista de Marketing | Grupo 2P';

-- 2) Criar perfil Farmer Carregadores (espelha o Closer Carregadores)
INSERT INTO public.permission_profiles (name, description, is_system, is_full_access)
SELECT 'Consultor | Farmer | 2P Carregadores', 'Carteira de clientes 2P Carregadores', false, false
WHERE NOT EXISTS (SELECT 1 FROM public.permission_profiles WHERE name = 'Consultor | Farmer | 2P Carregadores');

INSERT INTO public.permission_profile_instances (profile_id, instance_id)
SELECT dst.id, i.instance_id
  FROM public.permission_profiles dst
  JOIN public.permission_profiles src ON src.name = 'Consultor | Closer | 2P Carregadores'
  JOIN public.permission_profile_instances i ON i.profile_id = src.id
 WHERE dst.name = 'Consultor | Farmer | 2P Carregadores'
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_profile_features (profile_id, instance_id, feature_key)
SELECT dst.id, f.instance_id, f.feature_key
  FROM public.permission_profiles dst
  JOIN public.permission_profiles src ON src.name = 'Consultor | Closer | 2P Carregadores'
  JOIN public.permission_profile_features f ON f.profile_id = src.id
 WHERE dst.name = 'Consultor | Farmer | 2P Carregadores'
ON CONFLICT DO NOTHING;

-- 3) Ingrid Vieira -> Analista de Marketing
INSERT INTO public.user_permission_profiles (user_id, profile_id)
SELECT p.id, pp.id
  FROM public.profiles p, public.permission_profiles pp
 WHERE p.email = 'ingrid.vieira@2pgroup.com.br' AND pp.name = 'Analista de Marketing'
ON CONFLICT DO NOTHING;

-- 4) Papel derivado do perfil
CREATE OR REPLACE FUNCTION public.sync_user_role_from_profiles(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role app_role;
BEGIN
  SELECT CASE
           WHEN bool_or(pp.is_full_access) THEN 'admin'::app_role
           WHEN bool_or(pp.name ILIKE '%diretor%') THEN 'diretor'::app_role
           WHEN bool_or(pp.name ILIKE '%marketing%') THEN 'marketing'::app_role
           ELSE 'vendedor'::app_role
         END
    INTO v_role
    FROM public.user_permission_profiles up
    JOIN public.permission_profiles pp ON pp.id = up.profile_id
   WHERE up.user_id = _user_id;

  IF v_role IS NULL THEN
    DELETE FROM public.user_roles WHERE user_id = _user_id;
    RETURN;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> v_role;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_user_role_from_profiles(OLD.user_id);
    RETURN OLD;
  END IF;
  PERFORM public.sync_user_role_from_profiles(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_permission_profiles_sync_role ON public.user_permission_profiles;
CREATE TRIGGER user_permission_profiles_sync_role
AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_user_role();

-- 5) Sincronizar todos os usuários existentes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.user_permission_profiles LOOP
    PERFORM public.sync_user_role_from_profiles(r.user_id);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.sync_user_role_from_profiles(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_sync_user_role() FROM anon, authenticated;