CREATE TABLE public.contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  instancia text NOT NULL,
  organizacao text NOT NULL DEFAULT '2P Solar',
  cliente_doc text NOT NULL DEFAULT '',
  numero_sap text,
  sf_account_id text,
  sf_contact_id text,
  sf_status text,
  sf_erro text,
  tipo text NOT NULL DEFAULT 'outro',
  nome text NOT NULL DEFAULT '',
  cargo text,
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  telefones jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, tipo, nome)
);

CREATE INDEX idx_contatos_cliente ON public.contatos (cliente_id);
CREATE INDEX idx_contatos_sap ON public.contatos (numero_sap);
CREATE INDEX idx_contatos_sf_account ON public.contatos (sf_account_id);
CREATE INDEX idx_contatos_doc ON public.contatos (cliente_doc);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contatos TO authenticated;
GRANT ALL ON public.contatos TO service_role;

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem contatos"
  ON public.contatos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados criam contatos"
  ON public.contatos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados atualizam contatos"
  ON public.contatos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Somente administradores excluem contatos"
  ON public.contatos FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER contatos_touch
  BEFORE UPDATE ON public.contatos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();