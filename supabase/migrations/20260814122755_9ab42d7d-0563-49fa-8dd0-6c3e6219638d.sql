ALTER TABLE public.user_invites ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.permission_profiles(id) ON DELETE SET NULL;

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

  INSERT INTO public.profiles (id, email, full_name, cargo, equipe, sf_user_id, is_external, avatar_url, regime_contratacao, organizacao)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(v_invite.full_name, NEW.raw_user_meta_data->>'full_name'),
    v_invite.cargo,
    v_invite.equipe,
    v_invite.sf_user_id,
    COALESCE(v_invite.is_external, false),
    v_invite.avatar_url,
    COALESCE(v_invite.regime_contratacao, 'CLT'),
    COALESCE(v_invite.organizacao, 'solar')
  );

  IF v_invite.profile_id IS NOT NULL THEN
    INSERT INTO public.user_permission_profiles (user_id, profile_id)
    VALUES (NEW.id, v_invite.profile_id)
    ON CONFLICT DO NOTHING;
  ELSE
    v_role := COALESCE(v_invite.role, 'vendedor'::app_role);
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_invite.id IS NOT NULL THEN
    UPDATE public.user_invites SET accepted_at = now() WHERE id = v_invite.id;
  END IF;

  RETURN NEW;
END;
$function$;