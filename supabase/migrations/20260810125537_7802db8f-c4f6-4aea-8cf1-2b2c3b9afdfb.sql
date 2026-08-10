CREATE TABLE public.permission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  instance_id text NOT NULL,
  user_ids uuid[] NOT NULL DEFAULT '{}',
  feature_keys text[] NOT NULL DEFAULT '{}',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_state jsonb NOT NULL DEFAULT '[]'::jsonb,
  undone_at timestamptz,
  undone_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_audit_log TO authenticated;
GRANT ALL ON public.permission_audit_log TO service_role;

ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read permission audit log"
ON public.permission_audit_log FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert permission audit log"
ON public.permission_audit_log FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update permission audit log"
ON public.permission_audit_log FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX permission_audit_log_created_at_idx ON public.permission_audit_log (created_at DESC);