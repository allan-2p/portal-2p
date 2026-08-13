CREATE TABLE public.integration_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  event text NOT NULL,
  message text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer,
  actor_id uuid,
  actor_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX integration_logs_slug_created_idx ON public.integration_logs (slug, created_at DESC);
CREATE INDEX integration_logs_level_idx ON public.integration_logs (level);

GRANT SELECT ON public.integration_logs TO authenticated;
GRANT ALL ON public.integration_logs TO service_role;

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read integration logs"
ON public.integration_logs FOR SELECT TO authenticated
USING (public.is_admin());