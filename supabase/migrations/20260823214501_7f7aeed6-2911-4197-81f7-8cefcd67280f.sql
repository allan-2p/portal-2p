CREATE TABLE public.salesforce_field_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objeto text NOT NULL CHECK (objeto IN ('Account','Opportunity','Contact')),
  campo_portal text NOT NULL,
  sf_field text,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (objeto, campo_portal)
);

GRANT SELECT ON public.salesforce_field_map TO authenticated;
GRANT ALL ON public.salesforce_field_map TO service_role;

ALTER TABLE public.salesforce_field_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver o mapeamento"
ON public.salesforce_field_map FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gerenciam o mapeamento"
ON public.salesforce_field_map FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER salesforce_field_map_touch
BEFORE UPDATE ON public.salesforce_field_map
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();