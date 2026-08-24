CREATE OR REPLACE FUNCTION public.has_feature(_user_id uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _user_id AND ur.role = 'admin'::app_role
  )
  OR EXISTS (
    SELECT 1
      FROM public.user_permission_profiles up
      JOIN public.permission_profiles pp ON pp.id = up.profile_id
     WHERE up.user_id = _user_id
       AND (
         pp.is_full_access
         OR EXISTS (
           SELECT 1 FROM public.permission_profile_features f
            WHERE f.profile_id = pp.id AND f.feature_key = _key
         )
       )
  )
  OR EXISTS (
    SELECT 1 FROM public.user_extra_features e
     WHERE e.user_id = _user_id AND e.feature_key = _key
  );
$$;

CREATE SEQUENCE IF NOT EXISTS public.credito_analises_numero_seq;

CREATE TABLE public.credito_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE DEFAULT ('AC-' || lpad(nextval('public.credito_analises_numero_seq')::text, 6, '0')),
  instancia text NOT NULL DEFAULT 'solar' CHECK (instancia IN ('solar','carregadores')),
  cliente_doc text NOT NULL,
  cliente_nome text,
  cliente_id uuid,
  status text NOT NULL DEFAULT 'Análise Solicitada'
    CHECK (status IN ('Análise Solicitada','Em Andamento','Análise Concluída','Cancelada')),
  prioridade text NOT NULL DEFAULT 'Normal' CHECK (prioridade IN ('Normal','Média','Urgente')),
  conclusao text CHECK (conclusao IN ('Liberado','Negado')),
  restricao boolean,
  condicao_solicitada text,
  condicao_aprovada text,
  credito_solicitado numeric(14,2),
  credito_aprovado numeric(14,2),
  serasa integer,
  validade date,
  observacoes_vendedor text,
  observacoes_financeiro text,
  proposta_id uuid,
  proposta_numero text,
  solicitado_por uuid NOT NULL,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  analista_id uuid,
  concluido_em timestamptz,
  sf_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credito_analises_doc_idx ON public.credito_analises (cliente_doc);
CREATE INDEX credito_analises_status_idx ON public.credito_analises (status);
CREATE INDEX credito_analises_solicitado_em_idx ON public.credito_analises (solicitado_em DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credito_analises TO authenticated;
GRANT ALL ON public.credito_analises TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.credito_analises_numero_seq TO authenticated;
GRANT ALL ON SEQUENCE public.credito_analises_numero_seq TO service_role;

ALTER TABLE public.credito_analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credito_select_autenticado" ON public.credito_analises
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "credito_insert_solicitante" ON public.credito_analises
  FOR INSERT TO authenticated WITH CHECK (solicitado_por = auth.uid());

CREATE POLICY "credito_update_financeiro" ON public.credito_analises
  FOR UPDATE TO authenticated
  USING (public.has_feature(auth.uid(), 'financeiro.credito'))
  WITH CHECK (public.has_feature(auth.uid(), 'financeiro.credito'));

CREATE POLICY "credito_update_solicitante_pendente" ON public.credito_analises
  FOR UPDATE TO authenticated
  USING (solicitado_por = auth.uid() AND status = 'Análise Solicitada')
  WITH CHECK (solicitado_por = auth.uid() AND status IN ('Análise Solicitada','Cancelada'));

CREATE POLICY "credito_delete_admin" ON public.credito_analises
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER credito_analises_touch
  BEFORE UPDATE ON public.credito_analises
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();