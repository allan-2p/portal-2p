-- Arquivo dos logs de atividade
CREATE TABLE public.user_activity_log_archive (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid,
  email text,
  event text NOT NULL,
  detail text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_archive_created ON public.user_activity_log_archive (created_at DESC);
CREATE INDEX idx_activity_archive_event ON public.user_activity_log_archive (event);

GRANT SELECT ON public.user_activity_log_archive TO authenticated;
GRANT ALL ON public.user_activity_log_archive TO service_role;
ALTER TABLE public.user_activity_log_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_archive_admin_select" ON public.user_activity_log_archive
  FOR SELECT TO authenticated USING (public.is_admin());

-- Política de retenção (linha única)
CREATE TABLE public.log_retention_policy (
  id integer NOT NULL PRIMARY KEY DEFAULT 1,
  hot_days integer NOT NULL DEFAULT 90,
  archive_days integer NOT NULL DEFAULT 365,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT log_retention_single_row CHECK (id = 1),
  CONSTRAINT log_retention_ranges CHECK (hot_days BETWEEN 7 AND 3650 AND archive_days BETWEEN 30 AND 3650)
);

GRANT SELECT, INSERT, UPDATE ON public.log_retention_policy TO authenticated;
GRANT ALL ON public.log_retention_policy TO service_role;
ALTER TABLE public.log_retention_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retention_policy_admin_select" ON public.log_retention_policy
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "retention_policy_admin_write" ON public.log_retention_policy
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "retention_policy_admin_insert" ON public.log_retention_policy
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE TRIGGER log_retention_policy_touch BEFORE UPDATE ON public.log_retention_policy
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.log_retention_policy (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Histórico de execuções
CREATE TABLE public.log_retention_runs (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  archived_count integer NOT NULL DEFAULT 0,
  purged_count integer NOT NULL DEFAULT 0,
  hot_days integer NOT NULL,
  archive_days integer NOT NULL,
  error_message text
);
CREATE INDEX idx_retention_runs_ran_at ON public.log_retention_runs (ran_at DESC);

GRANT SELECT ON public.log_retention_runs TO authenticated;
GRANT ALL ON public.log_retention_runs TO service_role;
ALTER TABLE public.log_retention_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retention_runs_admin_select" ON public.log_retention_runs
  FOR SELECT TO authenticated USING (public.is_admin());

-- Rotina de arquivamento/expurgo
CREATE OR REPLACE FUNCTION public.apply_log_retention()
RETURNS TABLE(archived integer, purged integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p public.log_retention_policy%ROWTYPE;
  a integer := 0;
  d integer := 0;
BEGIN
  SELECT * INTO p FROM public.log_retention_policy WHERE id = 1;
  IF p.id IS NULL OR NOT p.enabled THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  WITH moved AS (
    DELETE FROM public.user_activity_log
     WHERE created_at < now() - make_interval(days => p.hot_days)
    RETURNING id, user_id, email, event, detail, ip, user_agent, created_at
  ), ins AS (
    INSERT INTO public.user_activity_log_archive (id, user_id, email, event, detail, ip, user_agent, created_at)
    SELECT id, user_id, email, event, detail, ip, user_agent, created_at FROM moved
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO a FROM ins;

  WITH gone AS (
    DELETE FROM public.user_activity_log_archive
     WHERE created_at < now() - make_interval(days => p.archive_days)
    RETURNING 1
  )
  SELECT count(*)::integer INTO d FROM gone;

  INSERT INTO public.log_retention_runs (archived_count, purged_count, hot_days, archive_days)
  VALUES (a, d, p.hot_days, p.archive_days);

  RETURN QUERY SELECT a, d;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_log_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_log_retention() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('apply-log-retention', '0 3 * * *', $$ SELECT public.apply_log_retention(); $$);