select cron.schedule(
  'atlas-radar-semanal',
  '0 11 * * 1',
  $$ select public.portal_cron_post('/api/public/hooks/atlas-radar', '{}'::jsonb); $$
);