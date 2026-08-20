CREATE TABLE public.condicoes_pagamento (
  codigo text PRIMARY KEY,
  descricao text NOT NULL,
  parcelas jsonb,
  num_parcelas integer,
  parse_automatico boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.condicoes_pagamento TO authenticated;
GRANT ALL ON public.condicoes_pagamento TO service_role;

ALTER TABLE public.condicoes_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "condicoes_select_authenticated" ON public.condicoes_pagamento
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "condicoes_admin_write" ON public.condicoes_pagamento
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER condicoes_pagamento_touch
  BEFORE UPDATE ON public.condicoes_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();