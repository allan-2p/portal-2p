ALTER TABLE public.cpo_proposals
  ADD COLUMN IF NOT EXISTS consultor_id uuid,
  ADD COLUMN IF NOT EXISTS consultor_nome text,
  ADD COLUMN IF NOT EXISTS criado_por_nome text,
  ADD COLUMN IF NOT EXISTS finalizado_por uuid,
  ADD COLUMN IF NOT EXISTS finalizado_por_nome text,
  ADD COLUMN IF NOT EXISTS finalizado_em timestamp with time zone;

CREATE OR REPLACE FUNCTION public.cpo_conclude_proposal(_id uuid, _status text, _origem text DEFAULT 'portal'::text, _etapa integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, status text, already_concluded boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.cpo_proposals%ROWTYPE;
  _email text;
  _nome text;
  _erro text;
  _item jsonb;
  _itens_count integer;
BEGIN
  SELECT p.email, p.full_name INTO _email, _nome FROM public.profiles p WHERE p.id = auth.uid();

  SELECT * INTO _row FROM public.cpo_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.cpo_proposal_conclusion_log (proposta_id, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
    VALUES (_id, _status, 'erro', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome, 'Proposta não encontrada');
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  IF _etapa IS DISTINCT FROM 4 THEN
    INSERT INTO public.cpo_proposal_conclusion_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
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
    INSERT INTO public.cpo_proposal_conclusion_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
    VALUES (_id, _row.numero, _row.status, 'bloqueada', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome, _erro);
    RAISE EXCEPTION '%', _erro;
  END IF;

  IF _row.status IS DISTINCT FROM 'Salvo' THEN
    INSERT INTO public.cpo_proposal_conclusion_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
    VALUES (_id, _row.numero, _row.status, 'duplicada', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome, 'Tentativa repetida de conclusão');
    RETURN QUERY SELECT _row.id, _row.status, true;
    RETURN;
  END IF;

  UPDATE public.cpo_proposals p
     SET status = _status,
         updated_at = now(),
         finalizado_por = auth.uid(),
         finalizado_por_nome = COALESCE(_nome, _email),
         finalizado_em = now()
   WHERE p.id = _id AND p.status = 'Salvo'
   RETURNING p.id, p.status INTO _row.id, _row.status;

  INSERT INTO public.cpo_proposal_conclusion_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome)
  VALUES (_id, _row.numero, _status, 'concluida', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome);

  RETURN QUERY SELECT _row.id, _row.status, false;
END;
$function$;