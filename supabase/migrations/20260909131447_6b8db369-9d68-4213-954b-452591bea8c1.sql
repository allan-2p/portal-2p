-- lovable-cron-fallback-reviewed: 144 runs/day; o SAP não envia webhook de faturamento, só consulta ZNFE_OV_CONSULTAR; reconciliação por polling é a única forma de detectar a NF, e a janela exigida é de ~10 minutos.
select cron.unschedule('portal-sap-nfs') where exists (select 1 from cron.job where jobname = 'portal-sap-nfs');
select cron.schedule('portal-sap-nfs', '*/10 * * * *',
  $cron$select public.portal_cron_post('/api/public/hooks/sap-nfs', '{}'::jsonb)$cron$);