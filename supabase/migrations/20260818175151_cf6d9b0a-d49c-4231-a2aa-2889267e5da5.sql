-- 1) Tabela universal de propostas
ALTER TABLE public.cpo_proposals RENAME TO propostas;
ALTER TABLE public.propostas ADD COLUMN IF NOT EXISTS organizacao text NOT NULL DEFAULT 'carregadores';
UPDATE public.propostas SET organizacao = 'carregadores' WHERE organizacao IS NULL OR btrim(organizacao) = '';
CREATE INDEX IF NOT EXISTS propostas_organizacao_idx ON public.propostas (organizacao);

ALTER POLICY "cpo_proposals_select" ON public.propostas RENAME TO "propostas_select";
ALTER POLICY "cpo_proposals_insert" ON public.propostas RENAME TO "propostas_insert";
ALTER POLICY "cpo_proposals_update" ON public.propostas RENAME TO "propostas_update";
ALTER POLICY "cpo_proposals_delete_admin" ON public.propostas RENAME TO "propostas_delete_admin";

-- 2) Log de conclusão
ALTER TABLE public.cpo_proposal_conclusion_log RENAME TO propostas_conclusao_log;

-- 3) Demais tabelas cpo_* -> carregadores_*
ALTER TABLE public.cpo_clientes RENAME TO carregadores_clientes;
ALTER TABLE public.cpo_clientes_im_legado RENAME TO carregadores_clientes_im_legado;
ALTER TABLE public.cpo_config RENAME TO carregadores_config;
ALTER TABLE public.cpo_metas RENAME TO carregadores_metas;
ALTER TABLE public.cpo_ncm RENAME TO carregadores_ncm;
ALTER TABLE public.cpo_padrinhos RENAME TO carregadores_padrinhos;
ALTER TABLE public.cpo_products RENAME TO carregadores_produtos;
ALTER TABLE public.cpo_tasks RENAME TO carregadores_tarefas;
ALTER TABLE public.cpo_uf_rates RENAME TO carregadores_uf_rates;

ALTER POLICY "cpo_clientes_select" ON public.carregadores_clientes RENAME TO "carregadores_clientes_select";
ALTER POLICY "cpo_clientes_insert" ON public.carregadores_clientes RENAME TO "carregadores_clientes_insert";
ALTER POLICY "cpo_clientes_update" ON public.carregadores_clientes RENAME TO "carregadores_clientes_update";
ALTER POLICY "cpo_clientes_delete_admin" ON public.carregadores_clientes RENAME TO "carregadores_clientes_delete_admin";
ALTER POLICY "cpo_config_admin_write" ON public.carregadores_config RENAME TO "carregadores_config_admin_write";
ALTER POLICY "cpo_config_select_staff" ON public.carregadores_config RENAME TO "carregadores_config_select_staff";
ALTER POLICY "cpo_metas_admin_write" ON public.carregadores_metas RENAME TO "carregadores_metas_admin_write";
ALTER POLICY "cpo_metas_select_own_or_admin" ON public.carregadores_metas RENAME TO "carregadores_metas_select_own_or_admin";
ALTER POLICY "cpo_ncm_write_admin" ON public.carregadores_ncm RENAME TO "carregadores_ncm_write_admin";
ALTER POLICY "cpo_ncm_select_staff" ON public.carregadores_ncm RENAME TO "carregadores_ncm_select_staff";
ALTER POLICY "cpo_products_select" ON public.carregadores_produtos RENAME TO "carregadores_produtos_select";
ALTER POLICY "cpo_products_admin_write" ON public.carregadores_produtos RENAME TO "carregadores_produtos_admin_write";
ALTER POLICY "cpo_products_delete_admin" ON public.carregadores_produtos RENAME TO "carregadores_produtos_delete_admin";
ALTER POLICY "cpo_tasks_select_own_or_admin" ON public.carregadores_tarefas RENAME TO "carregadores_tarefas_select_own_or_admin";
ALTER POLICY "cpo_tasks_insert_own" ON public.carregadores_tarefas RENAME TO "carregadores_tarefas_insert_own";
ALTER POLICY "cpo_tasks_update_own_or_admin" ON public.carregadores_tarefas RENAME TO "carregadores_tarefas_update_own_or_admin";
ALTER POLICY "cpo_tasks_delete_admin" ON public.carregadores_tarefas RENAME TO "carregadores_tarefas_delete_admin";
ALTER POLICY "cpo_uf_rates_admin_write" ON public.carregadores_uf_rates RENAME TO "carregadores_uf_rates_admin_write";
ALTER POLICY "cpo_uf_rates_select_staff" ON public.carregadores_uf_rates RENAME TO "carregadores_uf_rates_select_staff";

-- 4) Sequência e funções
ALTER SEQUENCE public.cpo_proposals_sap_seq RENAME TO propostas_sap_seq;
DROP FUNCTION IF EXISTS public.cpo_next_sap_seq();
CREATE OR REPLACE FUNCTION public.proposta_next_sap_seq()
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT nextval('public.propostas_sap_seq');
$function$;

DROP FUNCTION IF EXISTS public.cpo_conclude_proposal(uuid, text, text, integer);
CREATE OR REPLACE FUNCTION public.concluir_proposta(_id uuid, _status text, _origem text DEFAULT 'portal'::text, _etapa integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, status text, already_concluded boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.propostas%ROWTYPE;
  _email text;
  _nome text;
  _erro text;
  _item jsonb;
  _itens_count integer;
BEGIN
  SELECT p.email, p.full_name INTO _email, _nome FROM public.profiles p WHERE p.id = auth.uid();

  SELECT * INTO _row FROM public.propostas p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.propostas_conclusao_log (proposta_id, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
    VALUES (_id, _status, 'erro', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome, 'Proposta não encontrada');
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  IF _etapa IS DISTINCT FROM 4 THEN
    INSERT INTO public.propostas_conclusao_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
    VALUES (_id, _row.numero, _row.status, 'bloqueada', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome,
            'Conclusão fora da etapa 4 (Finalização): etapa recebida = ' || COALESCE(_etapa::text, 'nenhuma'));
    RAISE EXCEPTION 'Conclua o pedido apenas na etapa 4 (Finalização).';
  END IF;

  IF COALESCE(btrim(_row.cliente_nome), '') = '' THEN
    _erro := 'Cliente não informado.';
  ELSIF COALESCE(btrim(_row.uf), '') = '' THEN
    _erro := 'UF de faturamento não informada.';
  ELSIF COALESCE(btrim(_row.finalidade_uso), '') = '' THEN
    _erro := 'Finalidade de uso não informada.';
  ELSIF COALESCE(btrim(_row.frete_mod), '') = '' THEN
    _erro := 'Modalidade de frete não informada.';
  ELSIF COALESCE(_row.frete_valor, 0) < 0 THEN
    _erro := 'Valor de frete inválido.';
  ELSE
    SELECT count(*) INTO _itens_count
      FROM jsonb_array_elements(COALESCE(_row.itens, '[]'::jsonb));
    IF _itens_count = 0 THEN
      _erro := 'A proposta não possui itens.';
    ELSE
      FOR _item IN SELECT * FROM jsonb_array_elements(_row.itens) LOOP
        IF COALESCE((_item->>'qtd')::numeric, 0) <= 0 THEN
          _erro := 'Existe item com quantidade inválida.';
          EXIT;
        END IF;
        IF COALESCE((_item->>'valor')::numeric, 0) <= 0 THEN
          _erro := 'Existe item sem valor unitário.';
          EXIT;
        END IF;
      END LOOP;
      IF _erro IS NULL AND COALESCE((_row.totais->>'valorTotal')::numeric, 0) <= 0 THEN
        _erro := 'Total da proposta inválido.';
      END IF;
    END IF;
  END IF;

  IF _erro IS NOT NULL THEN
    INSERT INTO public.propostas_conclusao_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
    VALUES (_id, _row.numero, _row.status, 'bloqueada', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome, _erro);
    RAISE EXCEPTION '%', _erro;
  END IF;

  IF _row.status IS DISTINCT FROM 'Salvo' THEN
    INSERT INTO public.propostas_conclusao_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
    VALUES (_id, _row.numero, _row.status, 'duplicada', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome, 'Tentativa repetida de conclusão');
    RETURN QUERY SELECT _row.id, _row.status, true;
    RETURN;
  END IF;

  UPDATE public.propostas p
     SET status = _status,
         updated_at = now(),
         finalizado_por = auth.uid(),
         finalizado_por_nome = COALESCE(_nome, _email),
         finalizado_em = now()
   WHERE p.id = _id AND p.status = 'Salvo'
   RETURNING p.id, p.status INTO _row.id, _row.status;

  INSERT INTO public.propostas_conclusao_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome)
  VALUES (_id, _row.numero, _status, 'concluida', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome);

  RETURN QUERY SELECT _row.id, _row.status, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.concluir_proposta(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_proposta(uuid, text, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.proposta_next_sap_seq() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposta_next_sap_seq() TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.propostas_sap_seq TO authenticated, service_role;

-- 5) Chaves de permissão cpo.* -> carregadores.*
UPDATE public.permission_profile_features
   SET feature_key = 'carregadores.' || split_part(feature_key, '.', 2)
 WHERE feature_key LIKE 'cpo.%';