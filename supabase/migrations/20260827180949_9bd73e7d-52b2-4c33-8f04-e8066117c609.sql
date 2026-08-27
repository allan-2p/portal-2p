DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'portal-salesforce-fila') THEN
    PERFORM cron.unschedule('portal-salesforce-fila');
  END IF;
  PERFORM cron.schedule(
    'portal-salesforce-fila',
    '*/5 * * * *',
    $cron$ SELECT public.portal_cron_post('/api/public/hooks/salesforce-fila', '{}'::jsonb); $cron$
  );
END $$;