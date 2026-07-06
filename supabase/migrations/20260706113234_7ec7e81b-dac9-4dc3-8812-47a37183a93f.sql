ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo_tipo text;

CREATE TABLE public.view_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen text NOT NULL,
  role app_role,
  cargo text,
  instance_id text,
  variant_key text NOT NULL,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (screen, role, cargo, instance_id)
);
GRANT SELECT ON public.view_variants TO authenticated;
GRANT ALL ON public.view_variants TO service_role;
ALTER TABLE public.view_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read view_variants"
  ON public.view_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage view_variants"
  ON public.view_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER view_variants_touch BEFORE UPDATE ON public.view_variants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.user_view_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  screen text NOT NULL,
  variant_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, screen)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_view_preferences TO authenticated;
GRANT ALL ON public.user_view_preferences TO service_role;
ALTER TABLE public.user_view_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user manages own view prefs"
  ON public.user_view_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_view_prefs_touch BEFORE UPDATE ON public.user_view_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();