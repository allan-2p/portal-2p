CREATE TABLE public.consultores_sap (
  codigo_sap text PRIMARY KEY,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  organizacao text NOT NULL DEFAULT 'grupo',
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.consultores_sap TO authenticated;
GRANT ALL ON public.consultores_sap TO service_role;

ALTER TABLE public.consultores_sap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultores_sap_select" ON public.consultores_sap
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "consultores_sap_admin_manage" ON public.consultores_sap
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER consultores_sap_touch_updated_at
  BEFORE UPDATE ON public.consultores_sap
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();