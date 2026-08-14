CREATE TABLE public.sap_catalogo_sap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL,
  unidade text,
  ncm_codigo text,
  no_catalogo boolean NOT NULL DEFAULT false,
  sap_raw jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sap_catalogo_sap TO authenticated;
GRANT ALL ON public.sap_catalogo_sap TO service_role;

ALTER TABLE public.sap_catalogo_sap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sap_catalogo_sap_select_staff" ON public.sap_catalogo_sap
FOR SELECT TO authenticated
USING (is_admin() OR private.is_internal_staff());

CREATE TRIGGER sap_catalogo_sap_touch BEFORE UPDATE ON public.sap_catalogo_sap
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX sap_catalogo_sap_descricao_idx ON public.sap_catalogo_sap (descricao);

ALTER TABLE public.sap_produtos ADD COLUMN IF NOT EXISTS ncm_codigo text;