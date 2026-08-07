CREATE TABLE public.cpo_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  nome_fantasia text,
  doc text,
  ie text,
  im text,
  contribuinte boolean NOT NULL DEFAULT false,
  regime_tributario text,
  email text,
  telefone text,
  site text,
  contato_nome text,
  contato_cargo text,
  contato_email text,
  contato_telefone text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text NOT NULL DEFAULT 'SP',
  condicao_pagamento text,
  transportadora text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpo_clientes TO authenticated;
GRANT ALL ON public.cpo_clientes TO service_role;

ALTER TABLE public.cpo_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpo_clientes_select" ON public.cpo_clientes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cpo_clientes_insert" ON public.cpo_clientes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "cpo_clientes_update" ON public.cpo_clientes
  FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.is_admin())
  WITH CHECK (auth.uid() = created_by OR public.is_admin());

CREATE POLICY "cpo_clientes_delete" ON public.cpo_clientes
  FOR DELETE TO authenticated USING (auth.uid() = created_by OR public.is_admin());

CREATE TRIGGER cpo_clientes_touch BEFORE UPDATE ON public.cpo_clientes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();