DROP POLICY IF EXISTS credito_select_autenticado ON public.credito_analises;
CREATE POLICY credito_select_restrito ON public.credito_analises
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_feature(auth.uid(), 'financeiro.credito')
    OR solicitado_por = auth.uid()
    OR analista_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = credito_analises.cliente_id
        AND c.created_by = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION private.can_access_credito_anexo(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'storage'
AS $$
  SELECT _user_id IS NOT NULL AND _user_id = auth.uid() AND (
    private.has_role(_user_id, 'admin'::app_role)
    OR public.has_feature(_user_id, 'financeiro.credito')
    OR EXISTS (
      SELECT 1 FROM public.credito_analises a
      WHERE regexp_replace(coalesce(a.cliente_doc, ''), '\D', '', 'g') =
            regexp_replace(coalesce((storage.foldername(_object_name))[1], ''), '\D', '', 'g')
        AND (
          a.solicitado_por = _user_id
          OR a.analista_id = _user_id
          OR EXISTS (
            SELECT 1 FROM public.clientes c
            WHERE c.id = a.cliente_id AND c.created_by = _user_id
          )
        )
    )
  )
$$;

DROP POLICY IF EXISTS credito_anexos_select ON storage.objects;
DROP POLICY IF EXISTS credito_anexos_insert ON storage.objects;
DROP POLICY IF EXISTS credito_anexos_delete ON storage.objects;

CREATE POLICY credito_anexos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'credito-anexos'
    AND (owner = auth.uid() OR private.can_access_credito_anexo(auth.uid(), name))
  );

CREATE POLICY credito_anexos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'credito-anexos'
    AND owner = auth.uid()
    AND private.is_internal_staff(auth.uid())
  );

CREATE POLICY credito_anexos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'credito-anexos'
    AND (
      owner = auth.uid()
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_feature(auth.uid(), 'financeiro.credito')
    )
  );

CREATE OR REPLACE FUNCTION private.can_read_danfe(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'storage'
AS $$
  SELECT _user_id IS NOT NULL AND _user_id = auth.uid() AND (
    private.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.propostas p
      WHERE p.id::text = (storage.foldername(_object_name))[2]
        AND public.can_access_proposta(_user_id, p.id)
    )
  )
$$;

DROP POLICY IF EXISTS condicoes_select_authenticated ON public.condicoes_pagamento;
CREATE POLICY condicoes_select_interno ON public.condicoes_pagamento
  FOR SELECT TO authenticated USING (private.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "frete_regras leitura autenticada" ON public.frete_regras_config;
CREATE POLICY frete_regras_select_interno ON public.frete_regras_config
  FOR SELECT TO authenticated USING (private.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS dedicadas_select_auth ON public.frete_transportadoras_dedicadas;
CREATE POLICY dedicadas_select_interno ON public.frete_transportadoras_dedicadas
  FOR SELECT TO authenticated USING (private.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS consultores_sap_select ON public.consultores_sap;
CREATE POLICY consultores_sap_select_interno ON public.consultores_sap
  FOR SELECT TO authenticated USING (private.is_internal_staff(auth.uid()));
