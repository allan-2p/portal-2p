ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_consultor boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET is_consultor = true WHERE coalesce(numero_sap, '') <> '';

CREATE TABLE IF NOT EXISTS public.permission_profile_object_perms (
  profile_id uuid NOT NULL REFERENCES public.permission_profiles(id) ON DELETE CASCADE,
  instance_id text NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  can_read boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  view_all boolean NOT NULL DEFAULT false,
  modify_all boolean NOT NULL DEFAULT false,
  view_all_fields boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, instance_id, object_key),
  CONSTRAINT permission_profile_object_perms_object_chk
    CHECK (object_key IN ('contas','contatos','propostas','pedidos','tarefas'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_profile_object_perms TO authenticated;
GRANT ALL ON public.permission_profile_object_perms TO service_role;

ALTER TABLE public.permission_profile_object_perms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "object_perms_read_internal" ON public.permission_profile_object_perms
  FOR SELECT TO authenticated
  USING (private.is_internal_staff() OR public.is_admin());

CREATE POLICY "object_perms_admin_all" ON public.permission_profile_object_perms
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER object_perms_touch
  BEFORE UPDATE ON public.permission_profile_object_perms
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed preservando o comportamento atual de cada perfil
INSERT INTO public.permission_profile_object_perms
  (profile_id, instance_id, object_key, can_read, can_create, can_edit, can_delete, view_all, modify_all, view_all_fields)
SELECT p.id,
       i.id,
       o.k,
       true,
       p.is_full_access OR p.name NOT ILIKE '%marketing%',
       p.is_full_access OR p.name NOT ILIKE '%marketing%',
       p.is_full_access OR p.name ILIKE '%diretor%' OR p.name ILIKE '%gerente%',
       p.is_full_access OR p.name ILIKE '%diretor%' OR p.name ILIKE '%gerente%',
       p.is_full_access OR p.name ILIKE '%diretor%',
       p.is_full_access OR p.name ILIKE '%diretor%' OR p.name ILIKE '%gerente%'
  FROM public.permission_profiles p
 CROSS JOIN public.instances i
 CROSS JOIN (VALUES ('contas'),('contatos'),('propostas'),('pedidos'),('tarefas')) AS o(k)
 WHERE i.id IN ('solar','carregadores')
ON CONFLICT DO NOTHING;