CREATE TABLE public.cpo_proposal_conclusion_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposta_id uuid,
  numero text,
  status text,
  resultado text NOT NULL,
  origem text NOT NULL DEFAULT 'portal',
  actor_id uuid,
  actor_email text,
  actor_nome text,
  detalhe text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cpo_proposal_conclusion_log TO authenticated;
GRANT ALL ON public.cpo_proposal_conclusion_log TO service_role;

ALTER TABLE public.cpo_proposal_conclusion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conclusion log readable by authenticated"
  ON public.cpo_proposal_conclusion_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "conclusion log insert by authenticated"
  ON public.cpo_proposal_conclusion_log FOR INSERT TO authenticated
  WITH CHECK (actor_id IS NULL OR actor_id = auth.uid());

CREATE INDEX cpo_conclusion_log_created_idx ON public.cpo_proposal_conclusion_log (created_at DESC);
CREATE INDEX cpo_conclusion_log_proposta_idx ON public.cpo_proposal_conclusion_log (proposta_id);

CREATE OR REPLACE FUNCTION public.cpo_conclude_proposal(_id uuid, _status text, _origem text DEFAULT 'portal')
 RETURNS TABLE(id uuid, status text, already_concluded boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.cpo_proposals%ROWTYPE;
  _email text;
  _nome text;
BEGIN
  SELECT p.email, p.full_name INTO _email, _nome FROM public.profiles p WHERE p.id = auth.uid();

  SELECT * INTO _row FROM public.cpo_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.cpo_proposal_conclusion_log (proposta_id, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
    VALUES (_id, _status, 'erro', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome, 'Proposta não encontrada');
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  IF _row.status IS DISTINCT FROM 'Salvo' THEN
    INSERT INTO public.cpo_proposal_conclusion_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome, detalhe)
    VALUES (_id, _row.numero, _row.status, 'duplicada', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome, 'Tentativa repetida de conclusão');
    RETURN QUERY SELECT _row.id, _row.status, true;
    RETURN;
  END IF;

  UPDATE public.cpo_proposals p
     SET status = _status, updated_at = now()
   WHERE p.id = _id AND p.status = 'Salvo'
   RETURNING p.id, p.status INTO _row.id, _row.status;

  INSERT INTO public.cpo_proposal_conclusion_log (proposta_id, numero, status, resultado, origem, actor_id, actor_email, actor_nome)
  VALUES (_id, _row.numero, _status, 'concluida', COALESCE(_origem, 'portal'), auth.uid(), _email, _nome);

  RETURN QUERY SELECT _row.id, _row.status, false;
END;
$function$;