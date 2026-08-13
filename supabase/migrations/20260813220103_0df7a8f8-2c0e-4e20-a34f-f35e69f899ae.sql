CREATE TABLE public.cliente_logos (
  doc text PRIMARY KEY,
  data_url text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_logos TO authenticated;
GRANT ALL ON public.cliente_logos TO service_role;
ALTER TABLE public.cliente_logos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem logos" ON public.cliente_logos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados gravam logos" ON public.cliente_logos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados atualizam logos" ON public.cliente_logos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados removem logos" ON public.cliente_logos FOR DELETE TO authenticated USING (true);