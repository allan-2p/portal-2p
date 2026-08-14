CREATE TABLE public.cpo_padrinhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  doc text,
  telefone text,
  email text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpo_padrinhos TO authenticated;
GRANT ALL ON public.cpo_padrinhos TO service_role;

ALTER TABLE public.cpo_padrinhos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Padrinhos: leitura interna" ON public.cpo_padrinhos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_external = false));

CREATE POLICY "Padrinhos: cadastro interno" ON public.cpo_padrinhos
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_external = false));

CREATE POLICY "Padrinhos: edicao dono ou admin" ON public.cpo_padrinhos
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "Padrinhos: exclusao admin" ON public.cpo_padrinhos
  FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER cpo_padrinhos_touch BEFORE UPDATE ON public.cpo_padrinhos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.cpo_proposals
  ADD COLUMN IF NOT EXISTS indicacao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS padrinho_id uuid REFERENCES public.cpo_padrinhos(id),
  ADD COLUMN IF NOT EXISTS padrinho_nome text;

ALTER TABLE public.cpo_config
  ADD COLUMN IF NOT EXISTS pct_representante numeric NOT NULL DEFAULT 0;