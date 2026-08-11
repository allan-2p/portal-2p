ALTER TABLE public.user_activity_log ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS user_activity_log_event_created_idx ON public.user_activity_log (event, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_log_created_idx ON public.user_activity_log (created_at DESC);