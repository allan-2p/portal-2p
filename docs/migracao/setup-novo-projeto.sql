-- ============================================================
-- Portal 2P — setup de infraestrutura no projeto NOVO (grupo-2p)
-- Rodar no SQL Editor do Supabase DEPOIS de aplicar as migrations
-- de supabase/migrations/ (schema, RLS, funções).
--
-- Ordem: 1) extensões  2) Vault  3) portal_cron_post  4) crons
--        5) buckets de storage
-- ============================================================

-- ------------------------------------------------------------
-- 1) Extensões necessárias
-- ------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- ------------------------------------------------------------
-- 2) Segredos do Vault
--    ATENÇÃO: troque os valores abaixo antes de executar.
--    - site_url: URL pública do app (sem barra no final)
--    - cron_hook_secret: MESMO valor da env CRON_HOOK_SECRET
-- ------------------------------------------------------------
select vault.create_secret('https://SEU-DOMINIO.com', 'site_url');
select vault.create_secret('COLE_AQUI_O_CRON_HOOK_SECRET', 'cron_hook_secret');
-- Somente se usar a fila de e-mails:
-- select vault.create_secret('sb_secret_...', 'email_queue_service_role_key');

-- Para ATUALIZAR um segredo já existente:
-- select vault.update_secret(
--   (select id from vault.secrets where name = 'site_url'),
--   'https://novo-dominio.com'
-- );

-- ------------------------------------------------------------
-- 3) Função de disparo dos hooks (lê os segredos do Vault)
-- ------------------------------------------------------------
create or replace function public.portal_cron_post(_path text, _body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'net', 'vault', 'extensions'
as $function$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_hook_secret';
  if v_url is null or v_url = '' then
    raise exception 'Vault: segredo site_url ausente';
  end if;
  if v_secret is null or v_secret = '' then
    raise exception 'Vault: segredo cron_hook_secret ausente';
  end if;
  select net.http_post(
    url := rtrim(v_url, '/') || _path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := _body,
    timeout_milliseconds := 30000
  ) into v_id;
  return v_id;
end;
$function$;

revoke all on function public.portal_cron_post(text, jsonb) from public, anon, authenticated;
grant execute on function public.portal_cron_post(text, jsonb) to service_role;

-- ------------------------------------------------------------
-- 4) Jobs agendados
-- ------------------------------------------------------------
select cron.unschedule(jobname)
  from cron.job
 where jobname in (
   'apply-log-retention',
   'portal-estoque-sync',
   'portal-pix-reconsulta',
   'portal-boleto-avisos',
   'portal-sap-nfs',
   'portal-boletos-sharepoint'
 );

-- Retenção de logs — diário 03:00 UTC
select cron.schedule('apply-log-retention', '0 3 * * *',
  $cron$ select public.apply_log_retention(); $cron$);

-- Sincronização de estoque SAP — a cada 6 horas
select cron.schedule('portal-estoque-sync', '0 */6 * * *',
  $cron$select public.portal_cron_post('/api/public/hooks/estoque-sync', '{}'::jsonb)$cron$);

-- Reconsulta de Pix pendentes — a cada 15 minutos
select cron.schedule('portal-pix-reconsulta', '*/15 * * * *',
  $cron$select public.portal_cron_post('/api/public/hooks/pix-reconsulta', jsonb_build_object('minutos', 15))$cron$);

-- Avisos de boleto — diário 12:00 UTC
select cron.schedule('portal-boleto-avisos', '0 12 * * *',
  $cron$select public.portal_cron_post('/api/public/hooks/boleto-avisos', '{}'::jsonb)$cron$);

-- Busca de notas fiscais no SAP — a cada 20 minutos
select cron.schedule('portal-sap-nfs', '*/20 * * * *',
  $cron$select public.portal_cron_post('/api/public/hooks/sap-nfs', '{}'::jsonb)$cron$);

-- Boletos a prazo no SharePoint — de hora em hora (min 05)
select cron.schedule('portal-boletos-sharepoint', '5 * * * *',
  $cron$select public.portal_cron_post('/api/public/hooks/boletos-sharepoint', '{}'::jsonb)$cron$);

-- Catálogo vendável (preço VK12 no SAP) — 4x/dia, 250 materiais por rodada
-- (prioriza quem está há mais tempo sem verificação, cobrindo o catálogo inteiro)
select cron.schedule('portal-sap-catalogo-vendaveis', '20 1,7,13,19 * * *',
  $cron$select public.portal_cron_post('/api/public/hooks/sap-catalogo-vendaveis', jsonb_build_object('limite', 250))$cron$);

-- ------------------------------------------------------------
-- 5) Buckets de storage (todos privados)
--    As policies de storage.objects vêm nas migrations do repo.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false),
       ('danfes', 'danfes', false),
       ('produtos', 'produtos', false),
       ('top20', 'top20', false)
on conflict (id) do nothing;

-- ============================================================
-- VALIDAÇÃO
-- ============================================================
-- a) jobs cadastrados e ativos
--    select jobid, jobname, schedule, active from cron.job order by jobid;
--
-- b) segredos presentes (sem expor valores)
--    select name from vault.secrets order by name;
--
-- c) disparo manual de um hook
--    select public.portal_cron_post('/api/public/hooks/estoque-sync', '{}'::jsonb);
--
-- d) resposta HTTP do disparo (esperado status 200)
--    select id, status_code, left(content, 300)
--      from net._http_response order by id desc limit 5;
--
-- e) chamada sem o header x-cron-secret deve retornar 401
--    curl -i -X POST https://SEU-DOMINIO.com/api/public/hooks/estoque-sync -d '{}'
