ALTER TABLE public.permission_profiles
  ADD COLUMN IF NOT EXISTS default_instance text,
  ADD COLUMN IF NOT EXISTS default_route text;

ALTER TABLE public.permission_profiles
  DROP CONSTRAINT IF EXISTS permission_profiles_default_instance_chk;
ALTER TABLE public.permission_profiles
  ADD CONSTRAINT permission_profiles_default_instance_chk
  CHECK (default_instance IS NULL OR default_instance IN ('solar','carregadores','marketing'));