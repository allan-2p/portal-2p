CREATE TABLE public.user_extra_features (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id text NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (user_id, instance_id, feature_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_extra_features TO authenticated;
GRANT ALL ON public.user_extra_features TO service_role;

ALTER TABLE public.user_extra_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own extra features"
ON public.user_extra_features FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins manage extra features insert"
ON public.user_extra_features FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage extra features update"
ON public.user_extra_features FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage extra features delete"
ON public.user_extra_features FOR DELETE TO authenticated
USING (public.is_admin());