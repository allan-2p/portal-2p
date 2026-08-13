DROP POLICY IF EXISTS "conclusion log readable by authenticated" ON public.cpo_proposal_conclusion_log;
DROP POLICY IF EXISTS "conclusion log readable by owner or admin" ON public.cpo_proposal_conclusion_log;
CREATE POLICY "conclusion log readable by owner or admin"
ON public.cpo_proposal_conclusion_log
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR actor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.cpo_proposals p
    WHERE p.id = cpo_proposal_conclusion_log.proposta_id
      AND p.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated can read teams" ON public.salesforce_team_members;
DROP POLICY IF EXISTS "Internal staff can read teams" ON public.salesforce_team_members;
CREATE POLICY "Internal staff can read teams"
ON public.salesforce_team_members
FOR SELECT TO authenticated
USING (private.is_internal_staff());

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_internal_staff() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION private.has_instance_access(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_internal_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_instance_access(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cpo_conclude_proposal(uuid, text, text, integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cpo_conclude_proposal(uuid, text, text, integer) TO authenticated, service_role;