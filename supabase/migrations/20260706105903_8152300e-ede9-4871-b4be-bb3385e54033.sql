
-- 1) instances catalog
CREATE TABLE public.instances (
  id text PRIMARY KEY,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.instances TO authenticated;
GRANT ALL ON public.instances TO service_role;
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instances readable by authenticated" ON public.instances
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "instances writable by admin" ON public.instances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.instances (id, label, sort_order) VALUES
  ('solar', 'Solar', 1),
  ('carregadores', 'Carregadores', 2),
  ('marketing', 'Marketing', 3);

-- 2) user_instance_access
CREATE TABLE public.user_instance_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id text NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, instance_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_instance_access TO authenticated;
GRANT ALL ON public.user_instance_access TO service_role;
ALTER TABLE public.user_instance_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uia read own" ON public.user_instance_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "uia admin write" ON public.user_instance_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) user_feature_permissions
CREATE TABLE public.user_feature_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id text NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, instance_id, feature_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_feature_permissions TO authenticated;
GRANT ALL ON public.user_feature_permissions TO service_role;
ALTER TABLE public.user_feature_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufp read own" ON public.user_feature_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ufp admin write" ON public.user_feature_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Backfill: solar para todo mundo, carregadores + marketing só admin
INSERT INTO public.user_instance_access (user_id, instance_id)
SELECT u.id, 'solar' FROM auth.users u
ON CONFLICT DO NOTHING;

INSERT INTO public.user_instance_access (user_id, instance_id)
SELECT ur.user_id, 'carregadores'
FROM public.user_roles ur WHERE ur.role = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_instance_access (user_id, instance_id)
SELECT ur.user_id, 'marketing'
FROM public.user_roles ur WHERE ur.role = 'admin'
ON CONFLICT DO NOTHING;

-- 5) Trigger para dar acesso solar automático a novos usuários
CREATE OR REPLACE FUNCTION public.grant_default_instance_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_instance_access (user_id, instance_id)
  VALUES (NEW.id, 'solar')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_instance ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_instance
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_default_instance_access();
