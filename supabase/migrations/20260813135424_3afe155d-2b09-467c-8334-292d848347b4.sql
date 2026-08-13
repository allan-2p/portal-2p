CREATE TABLE public.permission_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_profiles TO authenticated;
GRANT ALL ON public.permission_profiles TO service_role;
ALTER TABLE public.permission_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_auth" ON public.permission_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_admin_all" ON public.permission_profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER permission_profiles_touch BEFORE UPDATE ON public.permission_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.permission_profile_features (
  profile_id uuid NOT NULL REFERENCES public.permission_profiles(id) ON DELETE CASCADE,
  instance_id text NOT NULL REFERENCES public.instances(id),
  feature_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, instance_id, feature_key)
);
GRANT SELECT ON public.permission_profile_features TO authenticated;
GRANT ALL ON public.permission_profile_features TO service_role;
ALTER TABLE public.permission_profile_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile_features_read_auth" ON public.permission_profile_features FOR SELECT TO authenticated USING (true);
CREATE POLICY "profile_features_admin_all" ON public.permission_profile_features FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.user_permission_profiles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.permission_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_id)
);
GRANT SELECT ON public.user_permission_profiles TO authenticated;
GRANT ALL ON public.user_permission_profiles TO service_role;
ALTER TABLE public.user_permission_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_profiles_read_own_or_admin" ON public.user_permission_profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "user_profiles_admin_all" ON public.user_permission_profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.permission_profiles (name, description, is_system) VALUES
  ('Moderador', 'Acesso de moderação configurável (telas específicas liberadas pelo administrador).', true),
  ('Gestor', 'Acompanha resultados e times, sem acesso administrativo.', true),
  ('Vendedor', 'Acesso operacional do time comercial.', true);