CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

GRANT ALL ON public.rate_limit_hits TO service_role;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (which bypasses RLS) may touch this table.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text,
  _limit integer,
  _window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _win timestamptz;
  _hits integer;
BEGIN
  _win := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.rate_limit_hits (bucket_key, window_start, hits)
  VALUES (_key, _win, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET hits = public.rate_limit_hits.hits + 1
  RETURNING public.rate_limit_hits.hits INTO _hits;

  DELETE FROM public.rate_limit_hits
   WHERE window_start < now() - interval '1 day';

  RETURN QUERY SELECT _hits <= _limit,
                      GREATEST(_limit - _hits, 0),
                      _win + make_interval(secs => _window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;