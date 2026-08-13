CREATE TABLE public.moderation_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  instance_id text NOT NULL DEFAULT 'grupo',
  action text NOT NULL,
  target text,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  actor_email text,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.moderation_audit_log TO authenticated;
GRANT ALL ON public.moderation_audit_log TO service_role;

ALTER TABLE public.moderation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read moderation audit"
  ON public.moderation_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Authenticated insert own moderation audit"
  ON public.moderation_audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE INDEX moderation_audit_log_created_idx ON public.moderation_audit_log (created_at DESC);
CREATE INDEX moderation_audit_log_area_idx ON public.moderation_audit_log (area, created_at DESC);