CREATE TABLE public.cpo_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  cliente_nome text,
  due_date date,
  prioridade text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'aberta',
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpo_tasks TO authenticated;
GRANT ALL ON public.cpo_tasks TO service_role;

ALTER TABLE public.cpo_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpo_tasks_select_own_or_admin" ON public.cpo_tasks
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "cpo_tasks_insert_own" ON public.cpo_tasks
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "cpo_tasks_update_own_or_admin" ON public.cpo_tasks
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "cpo_tasks_delete_own_or_admin" ON public.cpo_tasks
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin());

CREATE TRIGGER cpo_tasks_touch BEFORE UPDATE ON public.cpo_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();