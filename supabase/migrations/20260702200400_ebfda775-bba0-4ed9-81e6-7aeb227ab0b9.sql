
CREATE TABLE public.hidden_salespeople (
  sf_user_id text PRIMARY KEY,
  hidden_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hidden_salespeople TO authenticated;
GRANT ALL ON public.hidden_salespeople TO service_role;
ALTER TABLE public.hidden_salespeople ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hidden_salespeople: authenticated read" ON public.hidden_salespeople
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "hidden_salespeople: admin manage" ON public.hidden_salespeople
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
