CREATE OR REPLACE FUNCTION public.cpo_conclude_proposal(_id uuid, _status text)
RETURNS TABLE(id uuid, status text, already_concluded boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _row public.cpo_proposals%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.cpo_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  IF _row.status IS DISTINCT FROM 'Salvo' THEN
    RETURN QUERY SELECT _row.id, _row.status, true;
    RETURN;
  END IF;

  UPDATE public.cpo_proposals p
     SET status = _status, updated_at = now()
   WHERE p.id = _id AND p.status = 'Salvo'
   RETURNING p.id, p.status INTO _row.id, _row.status;

  RETURN QUERY SELECT _row.id, _row.status, false;
END;
$$;