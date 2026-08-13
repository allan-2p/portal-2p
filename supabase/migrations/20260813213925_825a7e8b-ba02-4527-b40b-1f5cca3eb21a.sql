CREATE TABLE public.permission_profile_instances (
  profile_id uuid NOT NULL REFERENCES public.permission_profiles(id) ON DELETE CASCADE,
  instance_id text NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, instance_id)
);

GRANT SELECT ON public.permission_profile_instances TO authenticated;
GRANT ALL ON public.permission_profile_instances TO service_role;

ALTER TABLE public.permission_profile_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read profile instances"
ON public.permission_profile_instances FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage profile instances"
ON public.permission_profile_instances FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Instâncias já implícitas pelas telas configuradas em cada perfil
INSERT INTO public.permission_profile_instances (profile_id, instance_id)
SELECT DISTINCT f.profile_id, f.instance_id
FROM public.permission_profile_features f
JOIN public.instances i ON i.id = f.instance_id
ON CONFLICT DO NOTHING;