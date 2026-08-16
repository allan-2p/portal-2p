CREATE TABLE public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia text NOT NULL DEFAULT 'solar',
  account_id text NOT NULL,
  account_name text,
  notes text NOT NULL DEFAULT '',
  canvas jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instancia, account_id)
);

GRANT SELECT, INSERT, UPDATE ON public.client_notes TO authenticated;
GRANT ALL ON public.client_notes TO service_role;

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_notes_select_auth" ON public.client_notes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "client_notes_insert_auth" ON public.client_notes
  FOR INSERT TO authenticated WITH CHECK (updated_by = auth.uid());

CREATE POLICY "client_notes_update_auth" ON public.client_notes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());

CREATE POLICY "client_notes_delete_admin" ON public.client_notes
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER client_notes_touch BEFORE UPDATE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();