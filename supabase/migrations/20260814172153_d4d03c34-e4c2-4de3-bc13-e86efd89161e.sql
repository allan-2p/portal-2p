CREATE TABLE public.cpo_metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ano int not null,
  mes int not null check (mes between 1 and 12),
  meta numeric(14,2) not null default 0,
  meta_bonus numeric(14,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ano, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpo_metas TO authenticated;
GRANT ALL ON public.cpo_metas TO service_role;

ALTER TABLE public.cpo_metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpo_metas_select_authenticated" ON public.cpo_metas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cpo_metas_admin_write" ON public.cpo_metas
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER cpo_metas_updated_at BEFORE UPDATE ON public.cpo_metas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();