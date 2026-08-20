CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobname) FROM cron.job
 WHERE jobname IN ('portal-estoque-sync','portal-pix-reconsulta','portal-boleto-avisos');

SELECT cron.schedule(
  'portal-estoque-sync',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'site_url') || '/api/public/hooks/estoque-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_hook_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'portal-pix-reconsulta',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'site_url') || '/api/public/hooks/pix-reconsulta',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_hook_secret')
    ),
    body := jsonb_build_object('minutos', 15)
  );
  $$
);

-- 09:00 em Sao_Paulo = 12:00 UTC
SELECT cron.schedule(
  'portal-boleto-avisos',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'site_url') || '/api/public/hooks/boleto-avisos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_hook_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);