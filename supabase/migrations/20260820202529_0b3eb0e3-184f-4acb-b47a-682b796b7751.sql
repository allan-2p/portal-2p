create or replace function public.portal_cron_post(_path text, _body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, net, vault, extensions
as $$
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
$$;

revoke all on function public.portal_cron_post(text, jsonb) from public, anon, authenticated;

select cron.unschedule('portal-estoque-sync');
select cron.unschedule('portal-pix-reconsulta');
select cron.unschedule('portal-boleto-avisos');

select cron.schedule('portal-estoque-sync', '0 */6 * * *', $$select public.portal_cron_post('/api/public/hooks/estoque-sync', '{}'::jsonb)$$);
select cron.schedule('portal-pix-reconsulta', '*/15 * * * *', $$select public.portal_cron_post('/api/public/hooks/pix-reconsulta', jsonb_build_object('minutos', 15))$$);
select cron.schedule('portal-boleto-avisos', '0 12 * * *', $$select public.portal_cron_post('/api/public/hooks/boleto-avisos', '{}'::jsonb)$$);
