CREATE TABLE public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  trigger_source text NOT NULL DEFAULT 'manual',
  ref_type text,
  ref_id text,
  status text NOT NULL DEFAULT 'running',
  attempt integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  duration_ms integer,
  actor_id uuid,
  actor_email text,
  parent_run_id uuid REFERENCES public.job_runs(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX job_runs_job_started_idx ON public.job_runs (job, started_at DESC);
CREATE INDEX job_runs_status_idx ON public.job_runs (status, started_at DESC);
CREATE INDEX job_runs_ref_idx ON public.job_runs (ref_id);

GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_runs_admin_read" ON public.job_runs
  FOR SELECT TO authenticated
  USING (public.is_admin());