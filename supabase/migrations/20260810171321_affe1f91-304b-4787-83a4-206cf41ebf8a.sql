insert into public.user_feature_permissions (user_id, instance_id, feature_key, allowed)
select 'ee51fa04-5441-49d9-9c00-32bdd334fe71'::uuid, 'carregadores', k, true
from unnest(array['cpo.home','cpo.tarefas','cpo.clientes','cpo.propostas','cpo.pedidos']) as k
on conflict (user_id, instance_id, feature_key) do update set allowed = true, updated_at = now();