ALTER TABLE public.permission_profiles ADD COLUMN IF NOT EXISTS is_full_access boolean NOT NULL DEFAULT false;

INSERT INTO public.permission_profiles (name, description, is_system, is_full_access)
SELECT 'Administrador do Sistema', 'Acesso total ao portal, sem exceções.', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.permission_profiles WHERE name = 'Administrador do Sistema');

INSERT INTO public.permission_profile_instances (profile_id, instance_id)
SELECT p.id, i.id FROM public.permission_profiles p CROSS JOIN public.instances i
WHERE p.name = 'Administrador do Sistema'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_permission_profiles (user_id, profile_id)
SELECT pr.id, p.id
FROM public.profiles pr
CROSS JOIN public.permission_profiles p
WHERE p.name = 'Administrador do Sistema'
  AND (pr.full_name ILIKE '%Allan%Rocha%')
ON CONFLICT DO NOTHING;