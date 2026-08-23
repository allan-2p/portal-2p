-- Helper: acesso amplo a propostas (admin/diretor)
CREATE OR REPLACE FUNCTION public.can_manage_all_propostas(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::app_role, 'diretor'::app_role)
  );
$$;

-- Helper: usuário pode ver a proposta
CREATE OR REPLACE FUNCTION public.can_access_proposta(_user_id uuid, _proposta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_all_propostas(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.propostas p
        WHERE p.id = _proposta_id
          AND (p.created_by = _user_id OR p.consultor_id = _user_id)
      );
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.propostas TO authenticated;
GRANT ALL ON public.propostas TO service_role;

GRANT SELECT, INSERT ON public.propostas_conclusao_log TO authenticated;
GRANT ALL ON public.propostas_conclusao_log TO service_role;

GRANT ALL ON public.rate_limit_hits TO service_role;

CREATE POLICY "Propostas visíveis para dono, consultor ou gestão"
ON public.propostas FOR SELECT TO authenticated
USING (
  public.can_manage_all_propostas(auth.uid())
  OR created_by = auth.uid()
  OR consultor_id = auth.uid()
);

CREATE POLICY "Usuários criam propostas em seu nome"
ON public.propostas FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() OR public.can_manage_all_propostas(auth.uid())
);

CREATE POLICY "Dono, consultor ou gestão atualizam propostas"
ON public.propostas FOR UPDATE TO authenticated
USING (
  public.can_manage_all_propostas(auth.uid())
  OR created_by = auth.uid()
  OR consultor_id = auth.uid()
)
WITH CHECK (
  public.can_manage_all_propostas(auth.uid())
  OR created_by = auth.uid()
  OR consultor_id = auth.uid()
);

CREATE POLICY "Somente admin exclui propostas"
ON public.propostas FOR DELETE TO authenticated
USING (public.is_admin());

CREATE POLICY "Log de conclusão segue acesso da proposta"
ON public.propostas_conclusao_log FOR SELECT TO authenticated
USING (public.can_access_proposta(auth.uid(), proposta_id));

CREATE POLICY "Usuários registram log de conclusão em seu nome"
ON public.propostas_conclusao_log FOR INSERT TO authenticated
WITH CHECK (
  (actor_id IS NULL OR actor_id = auth.uid())
  AND public.can_access_proposta(auth.uid(), proposta_id)
);