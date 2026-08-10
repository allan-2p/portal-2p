CREATE TABLE public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  event text NOT NULL,
  detail text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_activity_log TO authenticated;
GRANT ALL ON public.user_activity_log TO service_role;

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own activity"
ON public.user_activity_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read activity log"
ON public.user_activity_log FOR SELECT TO authenticated
USING (public.is_admin());

CREATE INDEX user_activity_log_created_at_idx ON public.user_activity_log (created_at DESC);
CREATE INDEX user_activity_log_user_idx ON public.user_activity_log (user_id, created_at DESC);