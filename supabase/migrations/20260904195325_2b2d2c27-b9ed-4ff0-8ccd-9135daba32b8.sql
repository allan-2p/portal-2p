select cron.unschedule('fretefy-backfill-documentos') where exists (select 1 from cron.job where jobname = 'fretefy-backfill-documentos');
select cron.schedule(
  'fretefy-backfill-documentos',
  '15 * * * *',
  $$ select public.portal_cron_post('/api/public/hooks/fretefy-backfill', '{"limite":50}'::jsonb); $$
);