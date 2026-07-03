
-- Add Salesforce link + external flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sf_user_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_sf_user_id ON public.profiles(sf_user_id);

-- Extend invites so we can preseed SF link, external flag, and avatar
ALTER TABLE public.user_invites
  ADD COLUMN IF NOT EXISTS sf_user_id text,
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Update handle_new_user to propagate the new fields to the profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invite public.user_invites%ROWTYPE;
  v_role app_role;
BEGIN
  SELECT * INTO v_invite FROM public.user_invites WHERE email = NEW.email AND accepted_at IS NULL LIMIT 1;

  INSERT INTO public.profiles (id, email, full_name, cargo, equipe, sf_user_id, is_external, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(v_invite.full_name, NEW.raw_user_meta_data->>'full_name'),
    v_invite.cargo,
    v_invite.equipe,
    v_invite.sf_user_id,
    COALESCE(v_invite.is_external, false),
    v_invite.avatar_url
  );

  v_role := COALESCE(v_invite.role, 'vendedor'::app_role);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;

  IF v_invite.id IS NOT NULL THEN
    UPDATE public.user_invites SET accepted_at = now() WHERE id = v_invite.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
