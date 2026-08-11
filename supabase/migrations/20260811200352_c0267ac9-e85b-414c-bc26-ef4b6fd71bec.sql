CREATE TABLE public.sap_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL,
  tipo text NOT NULL DEFAULT 'acessorio',
  permissao text NOT NULL DEFAULT 'Admin',
  lista_preco text,
  ativo boolean NOT NULL DEFAULT true,
  sap_raw jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sap_produtos_tipo_chk CHECK (tipo IN ('trilho','trilho_reforcado','trilho_light','juncao','grampo','smart10','carregador_veicular','acessorio')),
  CONSTRAINT sap_produtos_permissao_chk CHECK (permissao IN ('Todos','Admin'))
);

CREATE INDEX sap_produtos_tipo_idx ON public.sap_produtos (tipo);
CREATE INDEX sap_produtos_permissao_idx ON public.sap_produtos (permissao);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sap_produtos TO authenticated;
GRANT ALL ON public.sap_produtos TO service_role;

ALTER TABLE public.sap_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sap_produtos_select_auth" ON public.sap_produtos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sap_produtos_insert_admin" ON public.sap_produtos
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "sap_produtos_update_admin" ON public.sap_produtos
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "sap_produtos_delete_admin" ON public.sap_produtos
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER sap_produtos_touch
  BEFORE UPDATE ON public.sap_produtos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.sap_produtos_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  error_message text,
  triggered_by uuid,
  CONSTRAINT sap_produtos_sync_status_chk CHECK (status IN ('running','success','error'))
);

GRANT SELECT, INSERT, UPDATE ON public.sap_produtos_sync_runs TO authenticated;
GRANT ALL ON public.sap_produtos_sync_runs TO service_role;

ALTER TABLE public.sap_produtos_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sap_sync_select_auth" ON public.sap_produtos_sync_runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sap_sync_insert_admin" ON public.sap_produtos_sync_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "sap_sync_update_admin" ON public.sap_produtos_sync_runs
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());