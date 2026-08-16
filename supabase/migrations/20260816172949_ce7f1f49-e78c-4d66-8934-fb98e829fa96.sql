DROP POLICY IF EXISTS "conclusion log insert by authenticated" ON public.cpo_proposal_conclusion_log;

CREATE POLICY "conclusion log insert by proposal owner or admin"
ON public.cpo_proposal_conclusion_log
FOR INSERT
TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.cpo_proposals p
      WHERE p.id = cpo_proposal_conclusion_log.proposta_id
        AND p.created_by = auth.uid()
    )
  )
);