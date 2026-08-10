INSERT INTO public.user_instance_access (user_id, instance_id)
SELECT '5157ed6f-ece9-4352-a807-a41f40aa6fae'::uuid, 'carregadores'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_feature_permissions (user_id, instance_id, feature_key, allowed)
SELECT '5157ed6f-ece9-4352-a807-a41f40aa6fae'::uuid, 'carregadores', k, true
FROM unnest(ARRAY['cpo.home','cpo.tarefas','cpo.clientes','cpo.propostas','cpo.pedidos']) AS k
ON CONFLICT (user_id, instance_id, feature_key) DO UPDATE SET allowed = true, updated_at = now();