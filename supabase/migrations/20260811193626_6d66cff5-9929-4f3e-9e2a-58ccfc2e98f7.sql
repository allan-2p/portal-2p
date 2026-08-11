CREATE TABLE public.sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job text NOT NULL,
  instance_id text NOT NULL DEFAULT 'solar',
  status text NOT NULL DEFAULT 'running',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  rows_read integer NOT NULL DEFAULT 0,
  rows_written integer NOT NULL DEFAULT 0,
  error text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_runs_job_started ON public.sync_runs (job, instance_id, started_at DESC);

GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_runs_select_authenticated" ON public.sync_runs
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.sync_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job text NOT NULL,
  instance_id text NOT NULL DEFAULT 'solar',
  status text NOT NULL DEFAULT 'pending',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid,
  picked_at timestamp with time zone,
  finished_at timestamp with time zone,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_queue_pending ON public.sync_queue (status, created_at) WHERE status = 'pending';

GRANT SELECT, INSERT ON public.sync_queue TO authenticated;
GRANT ALL ON public.sync_queue TO service_role;

ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_queue_select_authenticated" ON public.sync_queue
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sync_queue_insert_admin" ON public.sync_queue
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND requested_by = auth.uid());

CREATE TRIGGER sync_queue_touch BEFORE UPDATE ON public.sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.sync_state (
  job text NOT NULL,
  instance_id text NOT NULL DEFAULT 'solar',
  cursor_value text,
  last_success_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (job, instance_id)
);

GRANT SELECT ON public.sync_state TO authenticated;
GRANT ALL ON public.sync_state TO service_role;

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_state_select_authenticated" ON public.sync_state
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER sync_state_touch BEFORE UPDATE ON public.sync_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();