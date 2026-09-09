-- lovable-cron-fallback-reviewed: 288 runs/day; o SAP não envia webhook de faturamento, só consulta ZNFE_OV_CONSULTAR; reconciliação por polling é a única forma de detectar a NF, e a janela exigida é de ~5 minutos.
select cron.unschedule('portal-sap-nfs') where exists (select 1 from cron.job where jobname = 'portal-sap-nfs');
select cron.schedule('portal-sap-nfs', '*/5 * * * *',
  $cron$select public.portal_cron_post('/api/public/hooks/sap-nfs', '{}'::jsonb)$cron$);